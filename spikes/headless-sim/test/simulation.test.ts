import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EnemyArchetype, TickInput, WaveSegment } from '../src/types.js';
import type { SimConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSimulation } from '../src/simulation.js';

function circleInput(t: number): TickInput {
  return { moveX: Math.cos(t * 0.05), moveY: Math.sin(t * 0.05), paused: false };
}

// A "hotter" config than DEFAULT_CONFIG: smaller world, tighter weapon range
// (so the spawn perimeter is close enough to reach in a few hundred ticks),
// faster spawns and a faster weapon cooldown. Spread from DEFAULT_CONFIG per
// the frozen shape; config.ts itself is never modified.
const HOT_WAVES: readonly WaveSegment[] = [
  { startTick: 0, endTick: 100_000, spawnIntervalTicks: 5, archetypeWeights: [1, 0, 0, 0], maxAlive: 30 },
];

const HOT_CONFIG: SimConfig = {
  ...DEFAULT_CONFIG,
  worldWidth: 600,
  worldHeight: 600,
  enemyCap: 50,
  projectileCap: 50,
  pickupCap: 50,
  player: { ...DEFAULT_CONFIG.player, startX: 300, startY: 300 },
  weapon: { ...DEFAULT_CONFIG.weapon, range: 100, cooldownTicks: 5 },
  waves: HOT_WAVES,
};

test('sim runs 600 ticks under a hot config without throwing; enemies spawn, projectiles fire, at least one kill and pickup collection happen', () => {
  const sim = createSimulation(HOT_CONFIG, 12345);

  let sawEnemies = false;
  let totalProjectilesFired = 0;
  let totalKills = 0;
  let totalPickups = 0;

  assert.doesNotThrow(() => {
    for (let t = 0; t < 600; t++) {
      const events = sim.step(circleInput(t));
      if (sim.enemies.data.count > 0) sawEnemies = true;
      totalProjectilesFired += events.projectilesFired;
      totalKills += events.kills;
      totalPickups += events.pickupsCollected;
    }
  });

  assert.equal(sim.tick, 600);
  assert.ok(sawEnemies, 'expected enemies.data.count > 0 at some point');
  assert.ok(totalProjectilesFired > 0, 'expected at least one projectile fired');
  assert.ok(totalKills > 0, 'expected at least one kill by tick 600');
  assert.ok(totalPickups > 0, 'expected at least one pickup collection by tick 600');
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
