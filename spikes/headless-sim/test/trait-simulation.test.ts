import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG, type SimConfig } from '../src/config.js';
import { createSimulation, runReplay } from '../src/simulation.js';
import type {
  TraitRuntimeCommandView,
  TraitRuntimeFactory,
  TraitRuntimeFactoryOptions,
  TraitRuntimePort,
  TraitRuntimeUpdateContext,
} from '../src/trait-runtime-port.js';

const TRAIT_FINGERPRINT = '1111111111111111';

class FakeTraitRuntime implements TraitRuntimePort {
  readonly updates: TraitRuntimeUpdateContext[] = [];
  private stage = 0;
  private commands: TraitRuntimeCommandView[] = [];

  update(context: TraitRuntimeUpdateContext) {
    this.updates.push({ ...context });
    this.commands = context.tick === 1
      ? [{
          kind: 'radialProjectileBurst',
          sourceId: 'test-quills',
          tick: context.tick,
          targeting: 'radial',
          originX: context.playerX,
          originY: context.playerY,
          dirX: 0,
          dirY: 0,
          count: 4,
          damage: 2,
          speed: 8,
          radius: 0,
          strength: 0,
          facing: 0,
          spread: 0,
          range: 300,
        }]
      : [];
    return {
      length: this.commands.length,
      at: (index: number) => {
        const command = this.commands[index];
        if (command === undefined) throw new RangeError('command index out of range');
        return command;
      },
    };
  }

  offers(count: number) {
    if (count < 1 || this.stage >= 2) return [];
    return [{ traitId: 'test-quills', resultStage: this.stage === 0 ? 'bud' as const : 'adapted' as const }];
  }

  applyUpgrade(traitId: string) {
    if (traitId !== 'test-quills') {
      return {
        outcome: { ok: false as const, kind: 'unknownTrait' as const, traitId },
        evolved: null,
      };
    }
    if (this.stage === 0) {
      this.stage = 1;
      return {
        outcome: { ok: true as const, kind: 'created' as const, traitId, stage: 'bud' as const },
        evolved: null,
      };
    }
    this.stage = 2;
    return {
      outcome: { ok: true as const, kind: 'advanced' as const, traitId, stage: 'adapted' as const },
      evolved: null,
    };
  }

  visualState() {
    if (this.stage === 0) return [];
    return [{
      sourceId: 'test-quills',
      stage: this.stage === 1 ? 'bud' as const : 'adapted' as const,
      sockets: ['back'],
      visualKey: `test-quills-${this.stage}`,
      enabled: true,
    }];
  }

  hash(): string {
    return (this.updates.length * 4 + this.stage).toString(16).padStart(16, '0');
  }

  fingerprint(): string {
    return TRAIT_FINGERPRINT;
  }
}

function makeFactory(log: { options?: TraitRuntimeFactoryOptions; runtime?: FakeTraitRuntime } = {}): TraitRuntimeFactory {
  return (options) => {
    const runtime = new FakeTraitRuntime();
    log.options = options;
    log.runtime = runtime;
    return runtime;
  };
}

function quietConfig(xpThresholds: readonly number[] = []): SimConfig {
  return { ...DEFAULT_CONFIG, waves: [], xpThresholds };
}

test('injects the trait runtime at tick zero and executes one update per advancing tick', () => {
  const log: { options?: TraitRuntimeFactoryOptions; runtime?: FakeTraitRuntime } = {};
  const sim = createSimulation(quietConfig(), 73, { traitRuntimeFactory: makeFactory(log) });

  assert.deepEqual(log.options, { seed: 73, initialTick: 0 });
  sim.step({ moveX: 1, moveY: 0, paused: true });
  assert.equal(log.runtime!.updates.length, 0);

  const events = sim.step({ moveX: 1, moveY: 0, paused: false });
  assert.equal(log.runtime!.updates.length, 1);
  assert.equal(log.runtime!.updates[0]!.tick, 1);
  assert.ok(log.runtime!.updates[0]!.distanceMovedThisTick > 0);
  assert.equal(events.projectilesFired, 4);
  assert.equal(sim.projectiles.data.count, 4);
});

test('blocks advancement for queued upgrades and applies multiple gained levels in order', () => {
  const sim = createSimulation(quietConfig([1, 2]), 9, { traitRuntimeFactory: makeFactory() });
  const slot = sim.pickups.spawn();
  assert.notEqual(slot, -1);
  sim.pickups.data.posX[slot] = sim.player.x;
  sim.pickups.data.posY[slot] = sim.player.y;
  sim.pickups.data.xp[slot] = 2;
  sim.pickups.data.radius[slot] = 1;

  const events = sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.deepEqual(events.levelUps, [2, 3]);
  assert.equal(sim.upgradeSelectionPending, true);
  assert.deepEqual(sim.pendingUpgradeOffers, [{ traitId: 'test-quills', resultStage: 'bud' }]);
  assert.throws(() => sim.step({ moveX: 0, moveY: 0, paused: false }), /selection is pending/);
  assert.throws(() => sim.selectUpgrade('not-offered'), /not a pending upgrade offer/);

  assert.deepEqual(sim.selectUpgrade('test-quills'), { tick: 1, traitId: 'test-quills' });
  assert.deepEqual(sim.pendingUpgradeOffers, [{ traitId: 'test-quills', resultStage: 'adapted' }]);
  assert.deepEqual(sim.selectUpgrade('test-quills'), { tick: 1, traitId: 'test-quills' });
  assert.equal(sim.upgradeSelectionPending, false);
  assert.equal(sim.traitVisualState()[0]!.stage, 'adapted');
  assert.deepEqual(sim.getReplay().upgradeSelections, [
    { tick: 1, traitId: 'test-quills' },
    { tick: 1, traitId: 'test-quills' },
  ]);
});

test('trait state and selections round-trip through deterministic replay', () => {
  const config = quietConfig([0]);
  const sim = createSimulation(config, 101, { traitRuntimeFactory: makeFactory() });
  sim.step({ moveX: 0.25, moveY: -0.5, paused: false });
  sim.selectUpgrade('test-quills');
  sim.step({ moveX: 0, moveY: 0, paused: false });

  const replay = sim.getReplay();
  assert.equal(replay.traitCatalogFingerprint, TRAIT_FINGERPRINT);
  const result = runReplay(config, replay, { traitRuntimeFactory: makeFactory() });
  assert.equal(result.finalHash, sim.hash());
  assert.equal(result.ticks, sim.tick);
  assert.throws(() => runReplay(config, replay), /trait catalog fingerprint mismatch/);
});

test('trait runtime participates in the canonical state hash without changing the legacy path', () => {
  const config = quietConfig();
  const legacyA = createSimulation(config, 5);
  const legacyB = createSimulation(config, 5);
  legacyA.step({ moveX: 0, moveY: 0, paused: false });
  legacyB.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(legacyA.hash(), legacyB.hash());

  const traitA = createSimulation(config, 5, { traitRuntimeFactory: makeFactory() });
  const traitB = createSimulation(config, 5, { traitRuntimeFactory: makeFactory() });
  traitA.step({ moveX: 0, moveY: 0, paused: false });
  traitB.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(traitA.hash(), traitB.hash());
  assert.notEqual(traitA.hash(), legacyA.hash());
});
