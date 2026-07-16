import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG, type SimConfig } from '../src/config.js';
import { createSimulation, runReplay } from '../src/simulation.js';
import { RUN_START_LOADOUT_VERSION } from '../src/run-start-loadout.js';
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

/** Emits a real persistent damage-pad command every advancing tick. */
class ZoneTraitRuntime implements TraitRuntimePort {
  private updates = 0;

  update(context: TraitRuntimeUpdateContext) {
    this.updates++;
    const command: TraitRuntimeCommandView = {
      kind: 'spawnZone',
      sourceId: 'gecko-pads',
      tick: context.tick,
      targeting: 'none',
      originX: context.playerX,
      originY: context.playerY,
      dirX: 0,
      dirY: 0,
      count: 0,
      damage: 0,
      speed: 0,
      radius: 60,
      strength: 0,
      durationTicks: 5,
      intervalTicks: 2,
      amount: 3,
      facing: 0,
      spread: 0,
      range: 0,
      tag: 'gecko-pad',
    };
    return {
      length: 1,
      at(index: number): TraitRuntimeCommandView {
        if (index !== 0) throw new RangeError('command index out of range');
        return command;
      },
    };
  }

  offers(_count: number) { return []; }

  applyUpgrade(traitId: string) {
    return {
      outcome: { ok: false as const, kind: 'unknownTrait' as const, traitId },
      evolved: null,
    };
  }

  visualState() { return []; }

  hash(): string {
    return this.updates.toString(16).padStart(16, '0');
  }

  fingerprint(): string { return TRAIT_FINGERPRINT; }
}

/** Emits a payload plus one target-anchored residue command for presentation parity. */
class AnchoredPresentationTraitRuntime extends ZoneTraitRuntime {
  override update(context: TraitRuntimeUpdateContext) {
    const payload: TraitRuntimeCommandView = {
      kind: 'spawnProjectileBurst',
      sourceId: 'chimera-anchor-test',
      tick: context.tick,
      targeting: 'highestHealth',
      originX: context.playerX,
      originY: context.playerY,
      dirX: 1,
      dirY: 0,
      count: 1,
      damage: 0,
      speed: 1,
      radius: 0,
      strength: 0,
      facing: 0,
      spread: 0,
      range: 200,
    };
    const residue: TraitRuntimeCommandView = {
      kind: 'spawnZone',
      sourceId: payload.sourceId,
      tick: context.tick,
      targeting: 'none',
      anchor: 'triggerTarget',
      originX: context.playerX,
      originY: context.playerY,
      dirX: 0,
      dirY: 0,
      count: 0,
      damage: 0,
      speed: 0,
      radius: 12,
      strength: 0,
      durationTicks: 30,
      intervalTicks: 10,
      amount: 1,
      facing: 0,
      spread: 0,
      range: 0,
      tag: 'sticky-trail',
    };
    return {
      length: 2,
      at(index: number): TraitRuntimeCommandView {
        if (index === 0) return payload;
        if (index === 1) return residue;
        throw new RangeError('command index out of range');
      },
    };
  }
}

/** Emits one real direct-damage chain each tick for the simulation bridge test. */
class ChainTraitRuntime implements TraitRuntimePort {
  update(context: TraitRuntimeUpdateContext) {
    const command: TraitRuntimeCommandView = {
      kind: 'chainDamage',
      sourceId: 'electric-eel-coil',
      tick: context.tick,
      targeting: 'nearest',
      originX: context.playerX,
      originY: context.playerY,
      dirX: 0,
      dirY: 0,
      count: 0,
      damage: 3,
      speed: 0,
      radius: 0,
      strength: 0,
      facing: 0,
      spread: 0,
      jumps: 1,
      range: 30,
    };
    return {
      length: 1,
      at(index: number): TraitRuntimeCommandView {
        if (index !== 0) throw new RangeError('command index out of range');
        return command;
      },
    };
  }

  offers(_count: number) { return []; }

  applyUpgrade(traitId: string) {
    return {
      outcome: { ok: false as const, kind: 'unknownTrait' as const, traitId },
      evolved: null,
    };
  }

  visualState() { return []; }

  hash(): string { return '0000000000000000'; }

  fingerprint(): string { return TRAIT_FINGERPRINT; }
}

/** Emits a directional scythe command for the presentation-resolution bridge test. */
class MeleeArcTraitRuntime implements TraitRuntimePort {
  update(context: TraitRuntimeUpdateContext) {
    const command: TraitRuntimeCommandView = {
      kind: 'meleeArc',
      sourceId: 'mantis-scythes',
      tick: context.tick,
      targeting: 'nearest',
      originX: context.playerX,
      originY: context.playerY,
      dirX: 0,
      dirY: 0,
      count: 0,
      damage: 4,
      speed: 0,
      radius: 0,
      strength: 0,
      arc: 1.2,
      facing: 0,
      spread: 0,
      range: 50,
    };
    return {
      length: 1,
      at(index: number): TraitRuntimeCommandView {
        if (index !== 0) throw new RangeError('command index out of range');
        return command;
      },
    };
  }

  offers(_count: number) { return []; }

  applyUpgrade(traitId: string) {
    return {
      outcome: { ok: false as const, kind: 'unknownTrait' as const, traitId },
      evolved: null,
    };
  }

  visualState() { return []; }

  hash(): string { return '0000000000000000'; }

  fingerprint(): string { return TRAIT_FINGERPRINT; }
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

function makeZoneFactory(): TraitRuntimeFactory {
  return () => new ZoneTraitRuntime();
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
    intervalTicks: 0,
    amount: 0,
    arc: 0,
    meleeArcResolved: false,
    facing: 0,
    spread: 0,
    jumps: 0,
    range: 300,
    tag: 'test-quills-burst',
    resolvedHitCount: 0,
    resolvedHitX: new Float32Array(8),
    resolvedHitY: new Float32Array(8),
    resolvedOrbitHitCount: 0,
    resolvedOrbitHitX: new Float32Array(16),
    resolvedOrbitHitY: new Float32Array(16),
    resolvedOrbitSourceX: new Float32Array(16),
    resolvedOrbitSourceY: new Float32Array(16),
  });

  log.runtime!.overwriteLatestCommandOriginX(-999);
  assert.equal(event!.originX, sim.player.x);
  assert.equal(sim.hash(), peer.hash());

  sim.step({ moveX: 0, moveY: 0, paused: true });
  assert.equal(sim.tick, 1);
  assert.deepEqual(sim.traitPresentationEvents, []);
  assert.equal(sim.hash(), peer.hash());
});

test('publishes a target-anchored Chimera graft at the executor-resolved coordinate', () => {
  const sim = createSimulation(quietConfig(), 73, {
    traitRuntimeFactory: () => new AnchoredPresentationTraitRuntime(),
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie' as const, maxHpBonus: 0 },
  });
  const nearby = sim.enemies.spawn();
  const payloadTarget = sim.enemies.spawn();
  assert.notEqual(nearby, -1);
  assert.notEqual(payloadTarget, -1);
  const enemies = sim.enemies.data;
  enemies.posX[nearby] = sim.player.x + 8;
  enemies.posY[nearby] = sim.player.y;
  enemies.hp[nearby] = 10;
  enemies.maxHp[nearby] = 10;
  enemies.speed[nearby] = 0;
  enemies.radius[nearby] = 1;
  enemies.touchDamage[nearby] = 0;
  enemies.archetype[nearby] = 0;
  enemies.xpDrop[nearby] = 0;
  enemies.posX[payloadTarget] = sim.player.x + 80;
  enemies.posY[payloadTarget] = sim.player.y;
  enemies.hp[payloadTarget] = 1_000;
  enemies.maxHp[payloadTarget] = 1_000;
  enemies.speed[payloadTarget] = 0;
  enemies.radius[payloadTarget] = 1;
  enemies.touchDamage[payloadTarget] = 0;
  enemies.archetype[payloadTarget] = 0;
  enemies.xpDrop[payloadTarget] = 0;
  sim.grid.insert(sim.enemies.idOf(nearby), enemies.posX[nearby]!, enemies.posY[nearby]!);
  sim.grid.insert(sim.enemies.idOf(payloadTarget), enemies.posX[payloadTarget]!, enemies.posY[payloadTarget]!);

  sim.step({ moveX: 0, moveY: 0, paused: false });

  const residue = sim.traitPresentationEvents.find((event) => event.tag === 'sticky-trail');
  assert.ok(residue !== undefined);
  assert.equal(residue.originX, sim.zones.data.posX[0]);
  assert.equal(residue.originY, sim.zones.data.posY[0]);
  assert.notEqual(residue.originX, sim.player.x, 'presentation must not fall back to Greg after combat anchors the graft');
});

test('captures actual chain endpoints before lethal cleanup for a renderer-facing event', () => {
  const options = {
    traitRuntimeFactory: () => new ChainTraitRuntime(),
    // A projectile starter leaves this direct-trait fixture intact on tick one;
    // Greg's real Fox Swipe correctly resolves before trait commands now.
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie' as const, maxHpBonus: 0 },
  };
  const sim = createSimulation(quietConfig(), 73, options);
  const first = sim.enemies.spawn();
  const second = sim.enemies.spawn();
  assert.notEqual(first, -1);
  assert.notEqual(second, -1);
  const enemies = sim.enemies.data;
  enemies.posX[first] = sim.player.x + 10;
  enemies.posY[first] = sim.player.y;
  enemies.hp[first] = 2;
  enemies.maxHp[first] = 2;
  enemies.speed[first] = 0;
  enemies.radius[first] = 1;
  enemies.touchDamage[first] = 0;
  enemies.archetype[first] = 0;
  enemies.xpDrop[first] = 1;
  enemies.posX[second] = sim.player.x + 35;
  enemies.posY[second] = sim.player.y;
  enemies.hp[second] = 10;
  enemies.maxHp[second] = 10;
  enemies.speed[second] = 0;
  enemies.radius[second] = 1;
  enemies.touchDamage[second] = 0;
  enemies.archetype[second] = 0;
  enemies.xpDrop[second] = 1;
  sim.grid.insert(sim.enemies.idOf(first), enemies.posX[first]!, enemies.posY[first]!);
  sim.grid.insert(sim.enemies.idOf(second), enemies.posX[second]!, enemies.posY[second]!);

  sim.step({ moveX: 0, moveY: 0, paused: false });

  const event = sim.traitPresentationEvents.find((candidate) => candidate.kind === 'chainDamage');
  assert.ok(event !== undefined);
  assert.equal(event.kind, 'chainDamage');
  assert.equal(event.jumps, 1);
  assert.equal(event.resolvedHitCount, 2);
  assert.deepEqual(
    Array.from(event.resolvedHitX.slice(0, event.resolvedHitCount)),
    [sim.player.x + 10, sim.player.x + 35],
  );
  assert.deepEqual(
    Array.from(event.resolvedHitY.slice(0, event.resolvedHitCount)),
    [sim.player.y, sim.player.y],
  );
  assert.equal(sim.enemies.data.count, 1, 'the lethal first target was cleaned up after its endpoint was captured');
  assert.equal(sim.grid.nearest(sim.player.x + 10, sim.player.y, 0.1), -1);
  assert.equal(sim.enemies.data.hp[second], 7);

  // Once the remaining target disappears, a later command must clear its
  // endpoints rather than replaying a ghost lightning bolt. A starter cue may
  // occupy an earlier renderer slot on one tick, so event object identity is
  // intentionally not part of this public presentation contract.
  const secondId = sim.enemies.idOf(second);
  sim.grid.remove(secondId);
  sim.enemies.despawn(second);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const nextChainEvent = sim.traitPresentationEvents.find((candidate) => candidate.kind === 'chainDamage');
  assert.ok(nextChainEvent !== undefined);
  assert.equal(nextChainEvent!.resolvedHitCount, 0);
});

test('captures a resolved melee direction on the detached presentation command without affecting hash state', () => {
  const options = {
    traitRuntimeFactory: () => new MeleeArcTraitRuntime(),
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie' as const, maxHpBonus: 0 },
  };
  const sim = createSimulation(quietConfig(), 73, options);
  const slot = sim.enemies.spawn();
  assert.notEqual(slot, -1);
  const enemy = sim.enemies.data;
  enemy.posX[slot] = sim.player.x;
  enemy.posY[slot] = sim.player.y - 20;
  enemy.hp[slot] = 10;
  enemy.maxHp[slot] = 10;
  enemy.speed[slot] = 0;
  enemy.radius[slot] = 1;
  enemy.touchDamage[slot] = 0;
  enemy.archetype[slot] = 0;
  enemy.xpDrop[slot] = 1;
  sim.grid.insert(sim.enemies.idOf(slot), enemy.posX[slot]!, enemy.posY[slot]!);

  const peer = createSimulation(quietConfig(), 73, options);
  const peerSlot = peer.enemies.spawn();
  assert.notEqual(peerSlot, -1);
  const peerEnemy = peer.enemies.data;
  peerEnemy.posX[peerSlot] = peer.player.x;
  peerEnemy.posY[peerSlot] = peer.player.y - 20;
  peerEnemy.hp[peerSlot] = 10;
  peerEnemy.maxHp[peerSlot] = 10;
  peerEnemy.speed[peerSlot] = 0;
  peerEnemy.radius[peerSlot] = 1;
  peerEnemy.touchDamage[peerSlot] = 0;
  peerEnemy.archetype[peerSlot] = 0;
  peerEnemy.xpDrop[peerSlot] = 1;
  peer.grid.insert(peer.enemies.idOf(peerSlot), peerEnemy.posX[peerSlot]!, peerEnemy.posY[peerSlot]!);

  sim.step({ moveX: 0, moveY: 0, paused: false });
  peer.step({ moveX: 0, moveY: 0, paused: false });
  const event = sim.traitPresentationEvents.find((candidate) => candidate.kind === 'meleeArc');
  assert.ok(event !== undefined);
  assert.equal(event.kind, 'meleeArc');
  assert.equal(event.arc, 1.2);
  assert.equal(event.meleeArcResolved, true);
  assert.equal(event.dirX, 0);
  assert.equal(event.dirY, -1);
  assert.equal(sim.enemies.data.hp[slot], 6);
  assert.equal(sim.hash(), peer.hash(), 'presentation-resolved aim never joins canonical state');
});

test('does not mark a targeted melee arc resolved when it has no valid target', () => {
  class TargetlessMeleeArcRuntime extends MeleeArcTraitRuntime {
    override update(context: TraitRuntimeUpdateContext) {
      const commands = super.update(context);
      const command = commands.at(0);
      return {
        length: 1,
        at(index: number): TraitRuntimeCommandView {
          if (index !== 0) throw new RangeError('command index out of range');
          return { ...command, dirX: 1, dirY: 0 };
        },
      };
    }
  }

  const sim = createSimulation(quietConfig(), 73, {
    traitRuntimeFactory: () => new TargetlessMeleeArcRuntime(),
  });

  sim.step({ moveX: 0, moveY: 0, paused: false });
  const event = sim.traitPresentationEvents[0]!;
  assert.equal(event.kind, 'meleeArc');
  assert.equal(event.dirX, 1, 'authored fallback direction remains available to the runtime');
  assert.equal(event.dirY, 0);
  assert.equal(event.meleeArcResolved, false, 'presentation must distinguish an acquisition miss');
});

test('persistent zone commands damage through simulation-owned cleanup, hash, and replay deterministically', () => {
  const config = quietConfig();
  const simA = createSimulation(config, 404, { traitRuntimeFactory: makeZoneFactory() });
  const simB = createSimulation(config, 404, { traitRuntimeFactory: makeZoneFactory() });

  // Direct test fixture: this enemy is stationary, so a Gecko pad at Greg's
  // position must kill it before the normal projectile phase runs.
  const slot = simA.enemies.spawn();
  assert.notEqual(slot, -1);
  const enemy = simA.enemies.data;
  enemy.posX[slot] = simA.player.x + 10;
  enemy.posY[slot] = simA.player.y;
  enemy.hp[slot] = 2;
  enemy.maxHp[slot] = 2;
  enemy.speed[slot] = 0;
  enemy.radius[slot] = 1;
  enemy.touchDamage[slot] = 0;
  enemy.archetype[slot] = 0;
  enemy.xpDrop[slot] = 1;
  simA.grid.insert(simA.enemies.idOf(slot), enemy.posX[slot]!, enemy.posY[slot]!);

  const first = simA.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(first.kills, 1);
  assert.equal(simA.zones.data.count, 1);
  assert.equal(simA.zones.data.tag[0], 1, 'Gecko tag is compact and snapshot-ready');
  assert.equal(simA.zones.data.intervalTicks[0], 2);
  assert.equal(simA.zones.data.pulseCooldown[0], 1);

  // A clean pair proves the authoritative zone state participates in hash;
  // the manually seeded kill fixture is intentionally not replayed.
  for (let tick = 0; tick < 4; tick++) {
    simB.step({ moveX: 0, moveY: 0, paused: false });
  }
  const replaySource = createSimulation(config, 404, { traitRuntimeFactory: makeZoneFactory() });
  for (let tick = 0; tick < 4; tick++) {
    replaySource.step({ moveX: 0, moveY: 0, paused: false });
  }
  const cleanHash = simB.hash();
  assert.equal(cleanHash, replaySource.hash());
  const zoneSlot = simB.zones.data.alive.findIndex((alive) => alive === 1);
  assert.notEqual(zoneSlot, -1);
  const generation = simB.zones.data.generation[zoneSlot]!;
  simB.zones.data.generation[zoneSlot] = (generation + 1) & 0xffff;
  assert.notEqual(simB.hash(), cleanHash, 'zone generation is canonical hashed state');
  simB.zones.data.generation[zoneSlot] = generation;
  assert.equal(simB.hash(), cleanHash);
  assert.equal(
    runReplay(config, replaySource.getReplay(), { traitRuntimeFactory: makeZoneFactory() }).finalHash,
    replaySource.hash(),
  );
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
