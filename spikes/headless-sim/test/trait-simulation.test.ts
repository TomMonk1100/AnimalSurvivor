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
  private latestCommand: { originX: number } | null = null;

  constructor(
    private readonly presentationMetadata: Pick<TraitRuntimeCommandView, 'durationTicks' | 'tag'> = {},
  ) {}

  update(context: TraitRuntimeUpdateContext) {
    this.updates.push({ ...context });
    if (context.tick === 1) {
      const command = {
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
        ...this.presentationMetadata,
      };
      this.latestCommand = command;
      this.commands = [command];
    } else {
      this.latestCommand = null;
      this.commands = [];
    }
    return {
      length: this.commands.length,
      at: (index: number) => {
        const command = this.commands[index];
        if (command === undefined) throw new RangeError('command index out of range');
        return command;
      },
    };
  }

  overwriteLatestCommandOriginX(originX: number): void {
    if (this.latestCommand === null) throw new Error('no command was emitted');
    this.latestCommand.originX = originX;
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

class MalformedTraitRuntime extends FakeTraitRuntime {
  override update(context: TraitRuntimeUpdateContext) {
    const source = super.update(context);
    return {
      length: source.length,
      at(index: number): TraitRuntimeCommandView {
        const command = source.at(index);
        return { ...command, tick: command.tick + 1 };
      },
    };
  }
}

function makeFactory(
  log: { options?: TraitRuntimeFactoryOptions; runtime?: FakeTraitRuntime } = {},
  presentationMetadata: Pick<TraitRuntimeCommandView, 'durationTicks' | 'tag'> = {},
): TraitRuntimeFactory {
  return (options) => {
    const runtime = new FakeTraitRuntime(presentationMetadata);
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
  assert.equal(sim.traitPresentationEvents[0]!.durationTicks, 0);
  assert.equal(sim.traitPresentationEvents[0]!.tag, '');
});

test('publishes detached presentation copies for executed trait commands and clears them when paused', () => {
  const log: { options?: TraitRuntimeFactoryOptions; runtime?: FakeTraitRuntime } = {};
  const sim = createSimulation(quietConfig(), 73, {
    traitRuntimeFactory: makeFactory(log, { durationTicks: 24, tag: 'test-quills-burst' }),
  });
  const peer = createSimulation(quietConfig(), 73, { traitRuntimeFactory: makeFactory() });

  sim.step({ moveX: 1, moveY: 0, paused: false });
  peer.step({ moveX: 1, moveY: 0, paused: false });

  const event = sim.traitPresentationEvents[0];
  assert.deepEqual(event, {
    kind: 'radialProjectileBurst',
    sourceId: 'test-quills',
    tick: 1,
    targeting: 'radial',
    originX: sim.player.x,
    originY: sim.player.y,
    dirX: 0,
    dirY: 0,
    count: 4,
    damage: 2,
    speed: 8,
    radius: 0,
    strength: 0,
    durationTicks: 24,
    facing: 0,
    spread: 0,
    range: 300,
    tag: 'test-quills-burst',
  });

  log.runtime!.overwriteLatestCommandOriginX(-999);
  assert.equal(event!.originX, sim.player.x);
  assert.equal(sim.hash(), peer.hash());

  sim.step({ moveX: 0, moveY: 0, paused: true });
  assert.equal(sim.tick, 1);
  assert.deepEqual(sim.traitPresentationEvents, []);
  assert.equal(sim.hash(), peer.hash());
});

test('does not publish trait commands when the player is dead and execution is skipped', () => {
  const log: { options?: TraitRuntimeFactoryOptions; runtime?: FakeTraitRuntime } = {};
  const sim = createSimulation(quietConfig(), 73, { traitRuntimeFactory: makeFactory(log) });
  sim.player.alive = false;

  const events = sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(log.runtime!.updates.length, 1);
  assert.equal(events.projectilesFired, 0);
  assert.equal(sim.projectiles.data.count, 0);
  assert.deepEqual(sim.traitPresentationEvents, []);
});

test('clears partially captured presentation events when trait command validation fails', () => {
  const sim = createSimulation(quietConfig(), 73, {
    traitRuntimeFactory: () => new MalformedTraitRuntime(),
  });

  assert.throws(
    () => sim.step({ moveX: 0, moveY: 0, paused: false }),
    /does not match execution tick/,
  );
  assert.deepEqual(sim.traitPresentationEvents, []);
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
  assert.deepEqual(sim.pendingUpgradeOffers, [{
    kind: 'trait', id: 'trait:test-quills', traitId: 'test-quills', resultStage: 'bud',
  }]);
  assert.throws(() => sim.step({ moveX: 0, moveY: 0, paused: false }), /selection is pending/);
  assert.throws(() => sim.selectUpgrade('trait:not-offered'), /not a pending upgrade offer/);

  assert.deepEqual(sim.selectUpgrade('trait:test-quills'), { tick: 1, kind: 'trait', id: 'trait:test-quills' });
  assert.deepEqual(sim.pendingUpgradeOffers, [{
    kind: 'trait', id: 'trait:test-quills', traitId: 'test-quills', resultStage: 'adapted',
  }]);
  assert.deepEqual(sim.selectUpgrade('trait:test-quills'), { tick: 1, kind: 'trait', id: 'trait:test-quills' });
  assert.equal(sim.upgradeSelectionPending, false);
  assert.equal(sim.traitVisualState()[0]!.stage, 'adapted');
  assert.deepEqual(sim.getReplay().upgradeSelections, [
    { tick: 1, kind: 'trait', id: 'trait:test-quills' },
    { tick: 1, kind: 'trait', id: 'trait:test-quills' },
  ]);
});

test('trait state and selections round-trip through deterministic replay', () => {
  const config = quietConfig([0]);
  const sim = createSimulation(config, 101, { traitRuntimeFactory: makeFactory() });
  sim.step({ moveX: 0.25, moveY: -0.5, paused: false });
  sim.selectUpgrade('trait:test-quills');
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
