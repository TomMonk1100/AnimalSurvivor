import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CONFIG,
  RUN_START_LOADOUT_VERSION,
  UNIVERSAL_UPGRADE_CATALOG,
  createSimulation,
  getUniversalUpgradeCatalogForHero,
  runReplay,
  type SimConfig,
  type Simulation,
  type TraitRuntimePort,
  type TraitRuntimeUpdateContext,
} from '../src/index.js';

const QUIET_UPGRADE_CONFIG: SimConfig = {
  ...DEFAULT_CONFIG,
  waves: [],
  xpThresholds: [0],
};

/** Minimal V1.1 fixture: one ordinary card stays pending beside one free fusion. */
class FusionReadyRuntime implements TraitRuntimePort {
  private fused = false;
  private upgradeApplied = false;

  update(_context: TraitRuntimeUpdateContext) {
    return {
      length: 0,
      at(_index: number): never {
        throw new RangeError('FusionReadyRuntime emits no combat commands');
      },
    };
  }

  offers(count: number) {
    if (count < 1 || this.upgradeApplied) return [];
    return [{
      traitId: 'queued-upgrade',
      resultStage: 'bud' as const,
      resultRank: 1 as const,
    }];
  }

  applyUpgrade(traitId: string) {
    if (traitId !== 'queued-upgrade' || this.upgradeApplied) {
      return {
        outcome: { ok: false as const, kind: 'unknownTrait' as const, traitId },
        evolved: null,
      };
    }
    this.upgradeApplied = true;
    return {
      outcome: {
        ok: true as const,
        kind: 'created' as const,
        traitId,
        stage: 'bud' as const,
        rank: 1 as const,
      },
      evolved: null,
    };
  }

  availableFusions() {
    return this.fused
      ? []
      : [{
        evolutionId: 'queued-master-fusion',
        ingredients: ['first-master', 'second-master'] as const,
        freesLogicalSlot: true as const,
      }];
  }

  fuseEvolution(evolutionId: string) {
    if (evolutionId !== 'queued-master-fusion' || this.fused) {
      return { outcome: { ok: false as const, kind: 'unknownEvolution' as const, evolutionId } };
    }
    this.fused = true;
    return {
      outcome: {
        ok: true as const,
        kind: 'fused' as const,
        evolutionId,
        ingredients: ['first-master', 'second-master'] as const,
        logicalSlotCost: 1 as const,
      },
    };
  }

  visualState() { return []; }

  hash(): string {
    return `${this.fused ? '1' : '0'}${this.upgradeApplied ? '1' : '0'}`.padEnd(16, '0');
  }

  fingerprint(): string { return 'f0f0f0f0f0f0f0f0'; }
}

const CHIMERA_REPLAY_ID = 'chimera:porcupine-quills+electric-eel-coil';
const CHIMERA_REPLAY_PARENTS = ['porcupine-quills', 'electric-eel-coil'] as const;

/** Structural port fixture for a synthesized Chimera; it imports no trait runtime. */
class ChimeraReplayRuntime implements TraitRuntimePort {
  private fused = false;

  update(_context: TraitRuntimeUpdateContext) {
    return {
      length: 0,
      at(_index: number): never {
        throw new RangeError('ChimeraReplayRuntime emits no combat commands');
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

  availableFusions() {
    return this.fused
      ? []
      : [{
        evolutionId: CHIMERA_REPLAY_ID,
        ingredients: CHIMERA_REPLAY_PARENTS,
        freesLogicalSlot: true as const,
        displayName: 'Static Spines',
        rarity: 'wild',
        temperamentId: 'stormy',
        leanId: 'volley',
        pairKind: 'wild' as const,
        flavorIndex: 2,
        variantSeed: 0x1a2b3c4d,
      }];
  }

  fuseEvolution(evolutionId: string) {
    if (evolutionId !== CHIMERA_REPLAY_ID || this.fused) {
      return { outcome: { ok: false as const, kind: 'unknownEvolution' as const, evolutionId } };
    }
    this.fused = true;
    return {
      outcome: {
        ok: true as const,
        kind: 'fused' as const,
        evolutionId,
        ingredients: CHIMERA_REPLAY_PARENTS,
        logicalSlotCost: 1 as const,
      },
    };
  }

  visualState() {
    return this.fused
      ? [{
        sourceId: CHIMERA_REPLAY_ID,
        stage: 'mythic' as const,
        rank: null,
        isMaster: false,
        logicalSlotCost: 1 as const,
        sockets: ['back'] as const,
        visualKey: 'chimera-static-spines',
        enabled: true,
        visualOnly: true,
        chimeraParents: CHIMERA_REPLAY_PARENTS,
        displayName: 'Static Spines',
        rarity: 'wild',
        temperamentId: 'stormy',
        leanId: 'volley',
        pairKind: 'wild' as const,
        flavorIndex: 2,
        variantSeed: 0x1a2b3c4d,
      }]
      : [];
  }

  hash(): string {
    return `${this.fused ? '1' : '0'}000000000000000`;
  }

  fingerprint(): string { return 'c1c1c1c1c1c1c1c1'; }
}

function startUniversalRun(
  offerCount = 3,
  heroId: 'greg' | 'benny' | 'gracie' = 'greg',
): Simulation {
  const sim = createSimulation(QUIET_UPGRADE_CONFIG, 71, {
    universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
    traitOfferCount: offerCount,
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId, maxHpBonus: 0 },
  });
  sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(sim.upgradeSelectionPending, true);
  return sim;
}

function addStationaryEnemyAt(sim: Simulation, offsetX: number, offsetY: number, hp = 100): number {
  const slot = sim.enemies.spawn();
  assert.notEqual(slot, -1);
  const data = sim.enemies.data;
  data.posX[slot] = sim.player.x + offsetX;
  data.posY[slot] = sim.player.y + offsetY;
  data.hp[slot] = hp;
  data.maxHp[slot] = hp;
  data.speed[slot] = 0;
  data.radius[slot] = 6;
  data.touchDamage[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), data.posX[slot]!, data.posY[slot]!);
  return slot;
}

function addStationaryEnemy(sim: Simulation, distance = 100, hp = 100): number {
  return addStationaryEnemyAt(sim, distance, 0, hp);
}

test('a free Master fusion resolves beside a pending card and replays in same-tick order', () => {
  const sim = createSimulation(QUIET_UPGRADE_CONFIG, 72, {
    traitRuntimeFactory: () => new FusionReadyRuntime(),
    traitOfferCount: 1,
  });
  sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(sim.upgradeSelectionPending, true);
  assert.deepEqual(sim.pendingUpgradeOffers.map((offer) => offer.id), ['trait:queued-upgrade']);

  const fusion = sim.fuseEvolution('queued-master-fusion');
  assert.deepEqual(fusion, {
    tick: 1,
    kind: 'fusion',
    id: 'fusion:queued-master-fusion',
  });
  assert.equal(sim.upgradeSelectionPending, true, 'the ordinary card remains selectable after a free fusion');

  const upgrade = sim.selectUpgrade('trait:queued-upgrade');
  assert.deepEqual(upgrade, {
    tick: 1,
    kind: 'trait',
    id: 'trait:queued-upgrade',
  });

  const replay = sim.getReplay();
  const expectedSelections = [fusion, upgrade];
  assert.deepEqual(replay.upgradeSelections, expectedSelections);
  assert.deepEqual(runReplay(QUIET_UPGRADE_CONFIG, replay, {
    traitRuntimeFactory: () => new FusionReadyRuntime(),
    traitOfferCount: 1,
  }), { finalHash: sim.hash(), ticks: sim.tick });
});

test('a structural Chimera fusion ID round-trips through replay unchanged', () => {
  const sim = createSimulation(QUIET_UPGRADE_CONFIG, 73, {
    traitRuntimeFactory: () => new ChimeraReplayRuntime(),
    traitOfferCount: 1,
  });
  sim.step({ moveX: 0, moveY: 0, paused: false });

  assert.deepEqual(sim.availableFusions, [{
    evolutionId: CHIMERA_REPLAY_ID,
    ingredients: CHIMERA_REPLAY_PARENTS,
    freesLogicalSlot: true,
    displayName: 'Static Spines',
    rarity: 'wild',
    temperamentId: 'stormy',
    leanId: 'volley',
    pairKind: 'wild',
    flavorIndex: 2,
    variantSeed: 0x1a2b3c4d,
  }]);

  const fusion = sim.fuseEvolution(CHIMERA_REPLAY_ID);
  assert.deepEqual(fusion, {
    tick: 1,
    kind: 'fusion',
    id: 'fusion:chimera:porcupine-quills+electric-eel-coil',
  });
  assert.deepEqual(sim.traitVisualState(), [{
    sourceId: CHIMERA_REPLAY_ID,
    stage: 'mythic',
    rank: null,
    isMaster: false,
    logicalSlotCost: 1,
    sockets: ['back'],
    visualKey: 'chimera-static-spines',
    enabled: true,
    visualOnly: true,
    chimeraParents: CHIMERA_REPLAY_PARENTS,
    displayName: 'Static Spines',
    rarity: 'wild',
    temperamentId: 'stormy',
    leanId: 'volley',
    pairKind: 'wild',
    flavorIndex: 2,
    variantSeed: 0x1a2b3c4d,
  }]);

  const replay = sim.getReplay();
  assert.deepEqual(replay.upgradeSelections, [fusion]);
  assert.deepEqual(runReplay(QUIET_UPGRADE_CONFIG, replay, {
    traitRuntimeFactory: () => new ChimeraReplayRuntime(),
    traitOfferCount: 1,
  }), { finalHash: sim.hash(), ticks: sim.tick });
});

test('baseline drift and Mote Draw use the same authoritative attraction path', () => {
  const baseline = startUniversalRun();
  baseline.selectUpgrade('universal:sturdy-hide');
  const baselinePickupSlot = baseline.pickups.spawn();
  assert.notEqual(baselinePickupSlot, -1);
  baseline.pickups.data.posX[baselinePickupSlot] = baseline.player.x + 80;
  baseline.pickups.data.posY[baselinePickupSlot] = baseline.player.y;
  baseline.pickups.data.xp[baselinePickupSlot] = 1;
  baseline.pickups.data.radius[baselinePickupSlot] = 4;
  const baselinePickupId = baseline.pickups.idOf(baselinePickupSlot);
  for (let tick = 0; tick < 30; tick++) baseline.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(baseline.pickups.isLive(baselinePickupId), true, '80 units remains outside the 70-unit baseline');

  const magnet = startUniversalRun();
  assert.deepEqual(magnet.pendingUpgradeOffers.map((offer) => offer.id), [
    'universal:swift-paws', 'universal:xp-magnet', 'universal:sturdy-hide',
  ]);
  assert.deepEqual(magnet.selectUpgrade('universal:xp-magnet'), {
    tick: 1, kind: 'universal', id: 'universal:xp-magnet',
  });
  assert.equal(magnet.player.pickupRadius, DEFAULT_CONFIG.player.pickupRadius + 10);

  const pickupSlot = magnet.pickups.spawn();
  assert.notEqual(pickupSlot, -1);
  magnet.pickups.data.posX[pickupSlot] = magnet.player.x + 140;
  magnet.pickups.data.posY[pickupSlot] = magnet.player.y;
  magnet.pickups.data.xp[pickupSlot] = 1;
  magnet.pickups.data.radius[pickupSlot] = 4;
  const pickupId = magnet.pickups.idOf(pickupSlot);
  for (let tick = 0; tick < 30; tick++) magnet.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(magnet.pickups.isLive(pickupId), false, 'rank 1 extends pull range from 70 to 150 units');
  assert.equal(magnet.player.xp, 1);

  const hide = startUniversalRun();
  hide.selectUpgrade('universal:sturdy-hide');
  assert.equal(hide.player.maxHp, DEFAULT_CONFIG.player.maxHp + 15);
  assert.equal(hide.player.hp, DEFAULT_CONFIG.player.maxHp + 15, 'health gain is immediately usable');

  const swift = startUniversalRun();
  swift.selectUpgrade('universal:swift-paws');
  assert.equal(swift.player.speed, DEFAULT_CONFIG.player.speed * 1.08);

  const keenEye = startUniversalRun(7);
  assert.equal(UNIVERSAL_UPGRADE_CATALOG.find((definition) => definition.id === 'keen-eye')?.title, 'Keen Eye');
  keenEye.selectUpgrade('universal:keen-eye');
  assert.equal(keenEye.player.critChance, 0.08, 'Keen Eye raises the real player crit chance by 3%');
});

test('sharpened instinct changes real Spit Volley damage and universal selections replay exactly', () => {
  const gracieLoadout = { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie' as const, maxHpBonus: 0 };
  const sim = startUniversalRun(4, 'gracie');
  assert.ok(sim.pendingUpgradeOffers.some((offer) => offer.id === 'universal:sharpened-instinct'));
  sim.selectUpgrade('universal:sharpened-instinct');
  const replay = sim.getReplay();
  const replayHash = sim.hash();
  assert.equal(replay.universalUpgradeCatalogFingerprint === null, false);
  assert.deepEqual(runReplay(QUIET_UPGRADE_CONFIG, replay, {
    universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
    traitOfferCount: 4,
    runStartLoadout: gracieLoadout,
  }), { finalHash: replayHash, ticks: sim.tick });
  assert.throws(
    () => runReplay(QUIET_UPGRADE_CONFIG, replay, { runStartLoadout: gracieLoadout }),
    /universal upgrade catalog fingerprint mismatch/,
  );

  // Directly seeded test data is intentionally outside replay recording; use it
  // only for the physical projectile assertion after replay parity is proven.
  addStationaryEnemy(sim);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(sim.projectiles.data.count, 1);
  const sharpenedSpit = DEFAULT_CONFIG.weapon.damage * 0.93 * 0.9 * 1.12;
  const damage = sim.projectiles.data.damage[0]!;
  assert.ok(
    Math.abs(damage - sharpenedSpit) < 1e-5 || Math.abs(damage - sharpenedSpit * 2) < 1e-5,
    'Spit Volley uses its hero baseline and the real Sharpened Instinct multiplier',
  );
});

test('Rapid Instinct and Growth change real attack cadence and collected XP', () => {
  const rapid = startUniversalRun(6, 'gracie');
  rapid.selectUpgrade('universal:rapid-instinct');
  addStationaryEnemy(rapid, 340);
  rapid.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(rapid.projectiles.data.count, 1);
  for (let tick = 0; tick < 12; tick++) rapid.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(rapid.projectiles.data.count, 1);
  rapid.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(rapid.projectiles.data.count, 2, 'rank-one cooldown reduction lowers Gracie Spit Volley cadence to 13 ticks');

  const growth = startUniversalRun(6);
  growth.selectUpgrade('universal:growth');
  const pickupSlot = growth.pickups.spawn();
  assert.notEqual(pickupSlot, -1);
  growth.pickups.data.posX[pickupSlot] = growth.player.x;
  growth.pickups.data.posY[pickupSlot] = growth.player.y;
  growth.pickups.data.xp[pickupSlot] = 5;
  growth.pickups.data.radius[pickupSlot] = 1;
  growth.step({ moveX: 0, moveY: 0, paused: false });
  assert.ok(Math.abs(growth.player.xp - 5.6) < 1e-9);
});

test('permanent starting vitality is applied at startup and replay rejects a mismatched loadout', () => {
  const loadout = { version: RUN_START_LOADOUT_VERSION, heroId: 'greg' as const, maxHpBonus: 20 };
  const sim = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 55, { runStartLoadout: loadout });
  assert.equal(sim.player.maxHp, DEFAULT_CONFIG.player.maxHp + 20);
  assert.equal(sim.player.hp, DEFAULT_CONFIG.player.maxHp + 20);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const replay = sim.getReplay();
  assert.deepEqual(runReplay({ ...DEFAULT_CONFIG, waves: [] }, replay, { runStartLoadout: loadout }), {
    finalHash: sim.hash(), ticks: sim.tick,
  });
  assert.throws(() => runReplay({ ...DEFAULT_CONFIG, waves: [] }, replay), /run start loadout fingerprint mismatch/);
});

test('hero selection is deterministic and changes the authoritative starting profile', () => {
  const greg = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 56, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 },
  });
  const benny = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 56, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'benny', maxHpBonus: 0 },
  });
  const gracie = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 56, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie', maxHpBonus: 0 },
  });

  assert.equal(greg.player.critChance, 0.05);
  assert.equal(greg.player.critMultiplier, 2);
  assert.equal(greg.player.dodgeChance, 0.08);
  assert.equal(benny.player.maxHp, DEFAULT_CONFIG.player.maxHp + 28);
  assert.equal(benny.player.speed, DEFAULT_CONFIG.player.speed * 0.88);
  assert.equal(benny.player.armor, 20);
  assert.equal(gracie.player.maxHp, DEFAULT_CONFIG.player.maxHp - 8);
  assert.equal(gracie.player.pickupRadius, DEFAULT_CONFIG.player.pickupRadius + 18);
  assert.equal(gracie.player.shield, 34);
  assert.equal(gracie.player.shieldMax, 34);
  assert.equal(gracie.player.shieldRechargeDelayTicks, 150);
  assert.equal(gracie.player.shieldRechargePerTick, 0.22);
  assert.notEqual(benny.runStartLoadoutFingerprint, gracie.runStartLoadoutFingerprint);
  assert.notEqual(benny.hash(), gracie.hash());
});

test('hero starter attacks resolve as a Fox Swipe, earth-wave Trample, and Spit Volley', () => {
  const quietConfig = { ...DEFAULT_CONFIG, waves: [] };
  const greg = createSimulation(quietConfig, 58, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 },
  });
  const gregEnemy = addStationaryEnemy(greg, 60);
  const gregEvents = greg.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(gregEvents.projectilesFired, 0, 'Fox Swipe is not a disguised projectile');
  assert.equal(greg.projectiles.data.count, 0);
  assert.ok(greg.enemies.data.hp[gregEnemy]! < 100, 'Fox Swipe damages its close forward target');
  assert.ok(greg.traitPresentationEvents.some((event) => event.kind === 'meleeArc' && event.arc > 0));

  const benny = createSimulation(quietConfig, 58, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'benny', maxHpBonus: 0 },
  });
  const bennyEnemy = addStationaryEnemy(benny, 38);
  for (let tick = 0; tick < 10; tick++) benny.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(benny.projectiles.data.count, 0, 'Trample emits ground waves instead of bolts');
  assert.ok(benny.enemies.data.hp[bennyEnemy]! < 100, 'Trample damages along its forward wave line');

  const gracie = createSimulation(quietConfig, 58, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie', maxHpBonus: 0 },
  });
  addStationaryEnemy(gracie, 100);
  const gracieEvents = gracie.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(gracieEvents.projectilesFired, 1, 'Spit Volley begins as one visible glob');
  assert.equal(gracie.projectiles.data.count, 1);
  assert.equal(gracie.projectiles.data.pierce[0], 0);
});

test('Scout starts with a two-target opening cleave, one-hit runners, and two-hit walkers', () => {
  const quietConfig = { ...DEFAULT_CONFIG, waves: [] };
  const sim = createSimulation(quietConfig, 58, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 },
  });
  // This is an authored baseline-attack test, not a crit-roll test.
  sim.player.critChance = 0;

  // The run-director's opening arc uses 0.28-radian formation spacing. The
  // nearest first target anchors the swipe at zero radians; the 0.9-radian
  // sector can take the adjacent target but must leave the other two alive.
  const openingAngles = [0, 0.28, 0.56, 0.84];
  const openingSlots = openingAngles.map((angle, index) => {
    const distance = index === 0 ? 120 : 121;
    return addStationaryEnemyAt(sim, Math.cos(angle) * distance, Math.sin(angle) * distance, 20);
  });
  const openingIds = openingSlots.map((slot) => sim.enemies.idOf(slot));

  const first = sim.step({ moveX: 0, moveY: 0, paused: false });
  const swipe = sim.traitPresentationEvents.find((event) => event.sourceId === 'greg-fox-swipe');
  assert.ok(swipe);
  assert.equal(swipe.range, 147);
  assert.equal(swipe.arc, 0.9);
  assert.equal(first.kills, 0);
  assert.equal(
    sim.combatPresentationEvents.filter((event) => event.sourceId === 'greg-fox-swipe').length,
    2,
    'the baseline opening swipe must not automatically hit all four enemies',
  );
  assert.ok(sim.enemies.data.hp[openingSlots[0]!]! > 0);
  assert.ok(sim.enemies.data.hp[openingSlots[1]!]! > 0);
  assert.equal(sim.enemies.data.hp[openingSlots[2]!]!, 20);
  assert.equal(sim.enemies.data.hp[openingSlots[3]!]!, 20);

  let second = first;
  while (sim.tick < 28) second = sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(second.kills, 2, 'the two hit walkers die only on Scout’s second 27-tick-cadence swipe');
  assert.equal(sim.enemies.isLive(openingIds[0]!), false);
  assert.equal(sim.enemies.isLive(openingIds[1]!), false);
  assert.equal(sim.enemies.isLive(openingIds[2]!), true);
  assert.equal(sim.enemies.isLive(openingIds[3]!), true);

  const runnerSim = createSimulation(quietConfig, 58, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 },
  });
  runnerSim.player.critChance = 0;
  const runnerSlot = addStationaryEnemy(runnerSim, 120, 12);
  const runnerId = runnerSim.enemies.idOf(runnerSlot);
  const runnerHit = runnerSim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(runnerHit.kills, 1, 'a regular 12-HP runner remains a one-hit opening threat');
  assert.equal(runnerSim.enemies.isLive(runnerId), false);
});

test('rank-five Mastery stays capped and gives Greg the authored Master double-swipe', () => {
  const heroId = 'greg' as const;
  const sim = createSimulation({
    ...DEFAULT_CONFIG,
    waves: [],
    xpThresholds: [0, 1, 2, 3, 4],
    weapon: { ...DEFAULT_CONFIG.weapon, cooldownTicks: 1 },
  }, 59, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId, maxHpBonus: 0 },
    universalUpgradeCatalog: getUniversalUpgradeCatalogForHero(heroId),
    traitOfferCount: 9,
  });
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const masteryOffer = 'universal:basic-attack:greg-precision';
  for (let rank = 1; rank <= 5; rank++) {
    assert.ok(sim.pendingUpgradeOffers.some((offer) => offer.id === masteryOffer), `Mastery rank ${rank} is offered`);
    sim.selectUpgrade(masteryOffer);
    if (rank < 5) {
      sim.player.xp = rank;
      sim.step({ moveX: 0, moveY: 0, paused: false });
    }
  }
  const masteryIndex = sim.universalUpgradeCatalog?.findIndex((upgrade) => upgrade.id === 'basic-attack:greg-precision');
  assert.notEqual(masteryIndex, undefined);
  assert.equal(sim.universalUpgradeRanks[masteryIndex!], 5);

  addStationaryEnemy(sim, 60);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const masterSwipes = sim.traitPresentationEvents.filter((event) => (
    event.kind === 'meleeArc' && event.sourceId === 'greg-fox-swipe' && event.arc > 0
  ));
  assert.equal(masterSwipes.length, 2, 'Master Fox Swipe creates both authored rakes in one cast tick');
});

test('hero defensive cards alter the authoritative combat state', () => {
  const startHero = (heroId: 'greg' | 'benny' | 'gracie') => {
    const sim = createSimulation(QUIET_UPGRADE_CONFIG, 60, {
      runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId, maxHpBonus: 0 },
      universalUpgradeCatalog: getUniversalUpgradeCatalogForHero(heroId),
      traitOfferCount: 9,
    });
    sim.step({ moveX: 0, moveY: 0, paused: false });
    return sim;
  };

  const greg = startHero('greg');
  greg.selectUpgrade('universal:hero-trait:greg-clever-footwork');
  assert.equal(greg.player.dodgeChance, 0.13);

  const benny = startHero('benny');
  benny.selectUpgrade('universal:hero-trait:benny-thick-skin');
  assert.equal(benny.player.armor, 35);

  const gracie = startHero('gracie');
  gracie.selectUpgrade('universal:hero-trait:gracie-fluffy-shield');
  assert.equal(gracie.player.shieldMax, 44);
  assert.equal(gracie.player.shield, 44, 'new Fluffy Shield capacity is immediately usable');
  assert.ok(Math.abs((gracie.player.shieldRechargePerTick ?? 0) - 0.26) < 1e-12);
});

test('every founding hero preserves exact replay parity across a moving run', () => {
  for (const heroId of ['greg', 'benny', 'gracie'] as const) {
    const loadout = { version: RUN_START_LOADOUT_VERSION, heroId, maxHpBonus: 0 };
    const sim = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 57, {
      runStartLoadout: loadout,
    });
    for (let tick = 0; tick < 120; tick++) {
      sim.step({
        moveX: tick % 3 === 0 ? 1 : -0.25,
        moveY: tick % 5 === 0 ? 0.5 : 0,
        paused: false,
      });
    }

    const replay = sim.getReplay();
    assert.deepEqual(runReplay({ ...DEFAULT_CONFIG, waves: [] }, replay, {
      runStartLoadout: loadout,
    }), { finalHash: sim.hash(), ticks: sim.tick }, `${heroId} replay diverged`);
  }
});
