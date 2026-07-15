import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EnemyArchetype, TickInput, WaveSegment } from '../src/types.js';
import type { SimConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSimulation } from '../src/simulation.js';
import { UNIVERSAL_UPGRADE_CATALOG } from '../src/universal-upgrades.js';
import { RUN_START_LOADOUT_VERSION } from '../src/run-start-loadout.js';

function circleInput(t: number): TickInput {
  return { moveX: Math.cos(t * 0.05), moveY: Math.sin(t * 0.05), paused: false };
}

function spawnStationaryEnemy(sim: ReturnType<typeof createSimulation>, x: number, y: number, hp = 500): number {
  const slot = sim.enemies.spawn();
  assert.ok(slot >= 0);
  const data = sim.enemies.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.velX[slot] = 0;
  data.velY[slot] = 0;
  data.hp[slot] = hp;
  data.maxHp[slot] = hp;
  data.speed[slot] = 0;
  data.radius[slot] = 8;
  data.touchDamage[slot] = 1;
  data.contactCooldown[slot] = 0;
  data.zoneDamageCooldown[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 1;
  data.marked[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), x, y);
  return slot;
}

// A "hotter" config than DEFAULT_CONFIG: smaller world, tighter weapon range
// (so the spawn perimeter is close enough to reach in a few hundred ticks),
// faster spawns and a faster weapon cooldown. Spread from DEFAULT_CONFIG per
// the frozen shape; config.ts itself is never modified.
const HOT_WAVES: readonly WaveSegment[] = [
  { startTick: 0, endTick: 100_000, spawnIntervalTicks: 5, archetypeWeights: [1, 0, 0, 0, 0, 0, 0, 0], maxAlive: 30 },
];

const HOT_CONFIG: SimConfig = {
  ...DEFAULT_CONFIG,
  worldWidth: 600,
  worldHeight: 600,
  enemyCap: 50,
  projectileCap: 50,
  pickupCap: 50,
  player: { ...DEFAULT_CONFIG.player, startX: 300, startY: 300, pickupRadius: 1_000 },
  weapon: { ...DEFAULT_CONFIG.weapon, range: 100, cooldownTicks: 5 },
  waves: HOT_WAVES,
};

test('sim runs 600 ticks under a hot config without throwing; enemies spawn, Fox Swipe lands, and kills/pickups resolve', () => {
  const sim = createSimulation(HOT_CONFIG, 12345);

  let sawEnemies = false;
  let totalFoxSwipes = 0;
  let totalKills = 0;
  let totalPickups = 0;

  assert.doesNotThrow(() => {
    for (let t = 0; t < 600; t++) {
      const events = sim.step(circleInput(t));
      if (sim.enemies.data.count > 0) sawEnemies = true;
      totalFoxSwipes += sim.traitPresentationEvents.filter((event) => event.sourceId === 'greg-fox-swipe').length;
      totalKills += events.kills;
      totalPickups += events.pickupsCollected;
    }
  });

  assert.equal(sim.tick, 600);
  assert.ok(sawEnemies, 'expected enemies.data.count > 0 at some point');
  assert.ok(totalFoxSwipes > 0, 'expected at least one real Fox Swipe');
  assert.ok(totalKills > 0, 'expected at least one kill by tick 600');
  assert.ok(totalPickups > 0, 'expected at least one pickup collection by tick 600');
});

test('Greg Rush Rake charges from movement and emits three deterministic melee waves', () => {
  const config: SimConfig = {
    ...DEFAULT_CONFIG,
    worldWidth: 2_000_000,
    worldHeight: 2_000_000,
    player: { ...DEFAULT_CONFIG.player, startX: 100, startY: 100, speed: 720_000 },
    waves: [],
  };
  const sim = createSimulation(config, 8080);
  const waveTicks: number[] = [];

  for (let step = 0; step < 26; step++) {
    sim.step({ moveX: step === 0 ? 1 : 0, moveY: 0, paused: false });
    if (sim.traitPresentationEvents.some((event) => event.sourceId === 'greg-rush-rake')) waveTicks.push(sim.tick);
    if (sim.traitPresentationEvents.some((event) => event.sourceId === 'greg-rush-rake')) {
      assert.equal(sim.traitPresentationEvents.filter((event) => event.sourceId === 'greg-rush-rake').length, 1);
    }
  }

  assert.deepEqual(waveTicks, [1, 13, 25]);
  assert.equal(sim.projectiles.data.count, 0, 'Rush Rake is no longer a disguised projectile weapon');

  const replay = sim.getReplay();
  const control = createSimulation(config, 8080);
  for (const input of replay.inputs) control.step(input);
  assert.equal(control.hash(), sim.hash(), 'Rush Rake must preserve deterministic replay parity');
});

test('Greg Rush Rake stays an earned movement combo at normal speed instead of firing every walking beat', () => {
  const config: SimConfig = {
    ...DEFAULT_CONFIG,
    worldWidth: 10_000,
    worldHeight: 10_000,
    player: { ...DEFAULT_CONFIG.player, startX: 1_000, startY: 1_000 },
    waves: [],
  };
  const sim = createSimulation(config, 8081);
  const waveTicks: number[] = [];

  for (let step = 0; step < 180; step++) {
    sim.step({ moveX: 1, moveY: 0, paused: false });
    if (sim.traitPresentationEvents.some((event) => event.sourceId === 'greg-rush-rake')) {
      waveTicks.push(sim.tick);
    }
  }

  assert.deepEqual(waveTicks, [75, 87, 99, 150, 162, 174]);
  assert.ok(
    waveTicks.every((tick, index) => index === 0 || tick - waveTicks[index - 1]! >= 12),
    'separate rake waves remain visually readable instead of collapsing into a walking stream',
  );
});

test('Benny Brace Bloom reacts to contact and pushes threats through authoritative state', () => {
  const config: SimConfig = { ...DEFAULT_CONFIG, waves: [] };
  const sim = createSimulation(config, 9090, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'benny', maxHpBonus: 0 },
  });
  const enemySlot = spawnStationaryEnemy(sim, sim.player.x + 1, sim.player.y);
  const startX = sim.enemies.data.posX[enemySlot]!;
  let pulseCount = 0;
  for (let tick = 0; tick < 40; tick++) {
    sim.step({ moveX: 0, moveY: 0, paused: false });
    if (sim.traitPresentationEvents.some((event) => event.sourceId === 'benny-brace')) pulseCount++;
  }
  assert.ok(pulseCount >= 1, 'expected Brace Bloom after two contact hits');
  assert.ok(sim.enemies.data.posX[enemySlot]! > startX, 'expected the brace pulse to create defensive space');
});

test('Gracie Scout marks forward targets and preserves replay parity', () => {
  const config: SimConfig = { ...DEFAULT_CONFIG, waves: [] };
  const loadout = { version: RUN_START_LOADOUT_VERSION, heroId: 'gracie' as const, maxHpBonus: 0 };
  const sim = createSimulation(config, 9191, { runStartLoadout: loadout });
  const enemySlot = spawnStationaryEnemy(sim, sim.player.x + 80, sim.player.y);
  sim.step({ moveX: 1, moveY: 0, paused: false });
  assert.equal(sim.enemies.data.marked[enemySlot], 1);
  assert.ok(sim.traitPresentationEvents.some((event) => event.sourceId === 'gracie-scout'));

  const replay = sim.getReplay();
  const control = createSimulation(config, 9191, { runStartLoadout: loadout });
  // Recreate the same external enemy setup before replaying the recorded input.
  spawnStationaryEnemy(control, control.player.x + 80, control.player.y);
  for (const input of replay.inputs) control.step(input);
  assert.equal(control.hash(), sim.hash());
});

test('marked prey redirects every founding hero starter attack', () => {
  const config: SimConfig = { ...DEFAULT_CONFIG, waves: [] };
  for (const heroId of ['greg', 'benny', 'gracie'] as const) {
    const sim = createSimulation(config, 10_001, {
      runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId, maxHpBonus: 0 },
    });
    const markedSlot = spawnStationaryEnemy(sim, sim.player.x - 96, sim.player.y);
    sim.enemies.data.marked[markedSlot] = 1;
    spawnStationaryEnemy(sim, sim.player.x + 32, sim.player.y);

    const markedId = sim.enemies.idOf(markedSlot);
    const events = sim.step({ moveX: 0, moveY: 0, paused: false });
    if (heroId === 'greg') {
      assert.ok(
        sim.combatPresentationEvents.some((event) => event.sourceId === 'greg-fox-swipe' && event.targetId === markedId),
        'Greg should cleave the farther marked target before the closer threat',
      );
    } else if (heroId === 'benny') {
      assert.ok(events.projectilesFired === 0, 'Benny starter attacks are physical earth waves, not projectiles');
      assert.ok(
        sim.traitPresentationEvents.some((event) => event.sourceId === 'benny-trample' && event.dirX < 0),
        'Benny should aim his first Trample wave toward the farther marked target',
      );
    } else {
      assert.ok(events.projectilesFired > 0, 'Gracie should fire her projectile starter attack');
      assert.ok(
        sim.projectiles.data.velX[0]! < 0,
        'Gracie should prioritize the farther marked target over the closer unmarked threat',
      );
    }
  }
});

test('xp thresholds: forced pickups fire levelUps in order with the right count', () => {
  const config: SimConfig = {
    ...DEFAULT_CONFIG,
    xpThresholds: [2, 4, 6],
    waves: [], // no enemy spawns, isolate the xp/threshold behavior
  };
  const sim = createSimulation(config, 1);

  // Spawn a pickup directly into the pool at the player's position, worth
  // enough xp to cross all three thresholds in a single collection.
  const slot = sim.pickups.spawn();
  assert.ok(slot >= 0);
  sim.pickups.data.posX[slot] = sim.player.x;
  sim.pickups.data.posY[slot] = sim.player.y;
  sim.pickups.data.xp[slot] = 6;
  sim.pickups.data.radius[slot] = 1;

  const events = sim.step({ moveX: 0, moveY: 0, paused: false });

  assert.equal(events.pickupsCollected, 1);
  assert.deepEqual(events.levelUps, [2, 3, 4]);
  assert.equal(sim.player.level, 4);
  assert.equal(sim.player.xp, 6);
});

test('a dead player cannot collect XP or create an upgrade choice', () => {
  const config: SimConfig = { ...DEFAULT_CONFIG, waves: [], xpThresholds: [1] };
  const sim = createSimulation(config, 2, { universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG });
  sim.player.hp = 0;
  sim.player.alive = false;

  const slot = sim.pickups.spawn();
  assert.ok(slot >= 0);
  sim.pickups.data.posX[slot] = sim.player.x;
  sim.pickups.data.posY[slot] = sim.player.y;
  sim.pickups.data.xp[slot] = 1;
  sim.pickups.data.radius[slot] = 1;

  const events = sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(events.pickupsCollected, 0);
  assert.deepEqual(events.levelUps, []);
  assert.equal(sim.pickups.data.count, 1, 'the corpse leaves the XP mote untouched');
  assert.equal(sim.player.xp, 0);
  assert.equal(sim.player.level, 1);
  assert.equal(sim.upgradeSelectionPending, false);
  assert.doesNotThrow(() => sim.step({ moveX: 0, moveY: 0, paused: false }));
});

test('pause: paused ticks never change the hash or tick; resume matches a control run with no pauses', () => {
  const config = DEFAULT_CONFIG;
  const seed = 777;

  function inputAt(t: number): TickInput {
    return { moveX: Math.sin(t * 0.037), moveY: Math.cos(t * 0.029), paused: false };
  }

  const sim = createSimulation(config, seed);
  for (let t = 0; t < 100; t++) sim.step(inputAt(t));

  const hashBeforePause = sim.hash();
  const tickBeforePause = sim.tick;

  for (let i = 0; i < 50; i++) {
    // Movement values are irrelevant while paused=true; they must be ignored.
    sim.step({ moveX: 1, moveY: 1, paused: true });
  }

  assert.equal(sim.hash(), hashBeforePause, 'hash must be unchanged after paused ticks');
  assert.equal(sim.tick, tickBeforePause, 'tick must not advance while paused');

  const resumeTicks = 50;
  for (let i = 0; i < resumeTicks; i++) sim.step(inputAt(100 + i));
  const resumedHash = sim.hash();

  const control = createSimulation(config, seed);
  for (let t = 0; t < 100; t++) control.step(inputAt(t));
  for (let i = 0; i < resumeTicks; i++) control.step(inputAt(100 + i));

  assert.equal(resumedHash, control.hash(), 'pausing must not affect the eventual simulation outcome');
  assert.equal(sim.tick, control.tick);
});

test('full-pool safety: enemy count never exceeds a tiny cap; spawnRejections fires; no throw over 200 ticks', () => {
  const archetypes: readonly EnemyArchetype[] = [
    { name: 'walker', hp: 20, speed: 55, radius: 6, touchDamage: 5, xpDrop: 1 },
  ];
  const waves: readonly WaveSegment[] = [
    { startTick: 0, endTick: 100_000, spawnIntervalTicks: 1, archetypeWeights: [1], maxAlive: 100 },
  ];
  const config: SimConfig = {
    ...DEFAULT_CONFIG,
    enemyCap: 4,
    archetypes,
    waves,
  };
  const sim = createSimulation(config, 42);

  assert.doesNotThrow(() => {
    for (let t = 0; t < 200; t++) {
      sim.step({ moveX: 0, moveY: 0, paused: false });
      assert.ok(sim.enemies.data.count <= 4, `enemy count ${sim.enemies.data.count} exceeded cap of 4`);
    }
  });

  assert.ok(sim.waveDirector.spawnRejections > 0, 'expected the director to hit the enemy pool cap and reject spawns');
});

test('a permanent damage multiplier bonus deals strictly more real Fox Swipe damage than an identical run without it', () => {
  const config: SimConfig = { ...DEFAULT_CONFIG, waves: [] };
  const withoutBonus = createSimulation(config, 4242, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 },
  });
  const withBonus = createSimulation(config, 4242, {
    runStartLoadout: {
      version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0, damageMultiplierBonus: 0.5,
    },
  });

  const enemyWithout = spawnStationaryEnemy(withoutBonus, withoutBonus.player.x + 60, withoutBonus.player.y, 500);
  const enemyWith = spawnStationaryEnemy(withBonus, withBonus.player.x + 60, withBonus.player.y, 500);

  withoutBonus.step({ moveX: 0, moveY: 0, paused: false });
  withBonus.step({ moveX: 0, moveY: 0, paused: false });

  const hpWithout = withoutBonus.enemies.data.hp[enemyWithout]!;
  const hpWith = withBonus.enemies.data.hp[enemyWith]!;
  assert.ok(
    hpWithout < 500 && hpWith < 500,
    'expected Fox Swipe to land on the stationary target in both runs',
  );
  assert.ok(hpWith < hpWithout, 'a 50% permanent damage bonus should deal strictly more Fox Swipe damage');
  assert.notEqual(
    withoutBonus.runStartLoadoutFingerprint,
    withBonus.runStartLoadoutFingerprint,
    'differing permanent bonuses must fingerprint differently for replay safety',
  );
});

test('permanent flat bonuses (armor, dodge, pickup radius) change the authoritative starting player state', () => {
  const config: SimConfig = { ...DEFAULT_CONFIG, waves: [] };
  const baseline = createSimulation(config, 5150, {
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 },
  });
  const boosted = createSimulation(config, 5150, {
    runStartLoadout: {
      version: RUN_START_LOADOUT_VERSION,
      heroId: 'greg',
      maxHpBonus: 0,
      armorBonus: 5,
      dodgeChanceBonus: 0.1,
      pickupRadiusBonus: 40,
    },
  });

  assert.equal(boosted.player.armor, (baseline.player.armor ?? 0) + 5);
  assert.ok(Math.abs((boosted.player.dodgeChance ?? 0) - ((baseline.player.dodgeChance ?? 0) + 0.1)) < 1e-9);
  assert.equal(boosted.player.pickupRadius, baseline.player.pickupRadius + 40);
});

test('player death: hp reaches 0 and stays there; sim keeps stepping without throwing', () => {
  const archetypes: readonly EnemyArchetype[] = [
    { name: 'killer', hp: 20, speed: 300, radius: 6, touchDamage: 9999, xpDrop: 1 },
  ];
  const waves: readonly WaveSegment[] = [
    { startTick: 0, endTick: 100_000, spawnIntervalTicks: 1, archetypeWeights: [1], maxAlive: 50 },
  ];
  const config: SimConfig = {
    ...DEFAULT_CONFIG,
    player: { ...DEFAULT_CONFIG.player, maxHp: 1 },
    weapon: { ...DEFAULT_CONFIG.weapon, range: 50 },
    archetypes,
    waves,
  };
  const sim = createSimulation(config, 9);

  let diedAt = -1;
  assert.doesNotThrow(() => {
    for (let t = 0; t < 300; t++) {
      sim.step({ moveX: 0, moveY: 0, paused: false });
      if (!sim.player.alive && diedAt === -1) diedAt = t;
    }
  });

  assert.notEqual(diedAt, -1, 'expected the player to die within 300 ticks');
  assert.equal(sim.player.alive, false);
  assert.equal(sim.player.hp, 0);

  // Continue stepping past death: must remain stable at hp 0, alive false.
  assert.doesNotThrow(() => {
    for (let t = 0; t < 50; t++) sim.step({ moveX: 1, moveY: 1, paused: false });
  });
  assert.equal(sim.player.hp, 0);
  assert.equal(sim.player.alive, false);
});
