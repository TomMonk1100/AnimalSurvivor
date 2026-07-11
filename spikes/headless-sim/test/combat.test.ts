import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerState, SimEvents } from '../src/types.js';
import {
  applyXpThresholds,
  attractPickups,
  collectPickups,
  spawnProjectile,
  spawnProjectileWithStats,
  stepEnemies,
  stepProjectiles,
  xpRequiredForNextLevel,
} from '../src/combat.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { ENEMY_BEHAVIOR_KIND, createEnemyBehaviorState, resetEnemyBehavior } from '../src/enemy-behavior.js';
import { BruteForceGrid, createEnemyPool, createPickupPool, createProjectilePool } from './helpers-c.js';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 0,
    y: 0,
    hp: 100,
    maxHp: 100,
    speed: 0,
    radius: 1,
    pickupRadius: 10,
    xp: 0,
    level: 1,
    invulnTicks: 0,
    alive: true,
    ...overrides,
  };
}

function makeEvents(): SimEvents {
  return {
    levelUps: [], kills: 0, pickupsCollected: 0, enemiesSpawned: 0,
    enemyProjectilesFired: 0, projectilesFired: 0,
  };
}

// ---------------------------------------------------------------------------
// stepEnemies
// ---------------------------------------------------------------------------

test('stepEnemies: enemy moves toward player by speed*dt', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const slot = pool.spawn();
  pool.data.posX[slot] = 0;
  pool.data.posY[slot] = 0;
  pool.data.speed[slot] = 10;
  pool.data.radius[slot] = 1;
  pool.data.touchDamage[slot] = 0;
  pool.data.contactCooldown[slot] = 0;
  grid.insert(pool.idOf(slot), 0, 0);

  const player = makePlayer({ x: 100, y: 0 });

  stepEnemies(pool, grid, player, 1, 1000, 1000, 30, 20);

  assert.equal(pool.data.posX[slot], 10);
  assert.equal(pool.data.posY[slot], 0);
  assert.equal(pool.data.velX[slot], 10);
  assert.equal(pool.data.velY[slot], 0);
});

test('stepEnemies: clamps position at world edge', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const slot = pool.spawn();
  pool.data.posX[slot] = 90;
  pool.data.posY[slot] = 0;
  pool.data.speed[slot] = 1000;
  pool.data.radius[slot] = 1;
  pool.data.touchDamage[slot] = 0;
  pool.data.contactCooldown[slot] = 0;
  grid.insert(pool.idOf(slot), 90, 0);

  const player = makePlayer({ x: 100000, y: 0 });

  stepEnemies(pool, grid, player, 1, 100, 100, 30, 20);

  assert.equal(pool.data.posX[slot], 100, 'x clamps to worldWidth');
  assert.ok(pool.data.posY[slot]! >= 0 && pool.data.posY[slot]! <= 100);
});

test('stepEnemies: contact damage applies once, then cooldown+invuln block repeats until both expire', () => {
  const pool = createEnemyPool(2);
  const grid = new BruteForceGrid();
  const slot = pool.spawn();
  pool.data.posX[slot] = 50;
  pool.data.posY[slot] = 50;
  pool.data.speed[slot] = 0; // stays put, so dist to player stays 0 every tick
  pool.data.radius[slot] = 1;
  pool.data.touchDamage[slot] = 5;
  pool.data.contactCooldown[slot] = 0;
  grid.insert(pool.idOf(slot), 50, 50);

  const player = makePlayer({ x: 50, y: 50, hp: 100 });
  const contactCooldownTicks = 30;
  const invulnTicksOnHit = 20;
  const dt = 1;
  const ww = 1000;
  const wh = 1000;

  // First tick: immediate hit (dist 0).
  stepEnemies(pool, grid, player, dt, ww, wh, contactCooldownTicks, invulnTicksOnHit);
  assert.equal(player.hp, 95);
  assert.equal(pool.data.contactCooldown[slot], contactCooldownTicks);
  assert.equal(player.invulnTicks, invulnTicksOnHit);

  // 29 more ticks: cooldown counts down from 30 to 1 (never hits 0 in this
  // window), so no second hit regardless of invuln state. We simulate the
  // integrator decrementing player.invulnTicks each tick, as stepEnemies
  // itself does not touch it.
  for (let i = 0; i < 29; i++) {
    if (player.invulnTicks > 0) player.invulnTicks--;
    stepEnemies(pool, grid, player, dt, ww, wh, contactCooldownTicks, invulnTicksOnHit);
  }
  assert.equal(player.hp, 95, 'no second hit while cooldown has not fully expired');
  assert.equal(pool.data.contactCooldown[slot], 1);
  assert.equal(player.invulnTicks, 0, 'invuln should have naturally expired by now');

  // One more tick: cooldown 1 -> 0 inside this call, invuln already 0 -> hit lands.
  stepEnemies(pool, grid, player, dt, ww, wh, contactCooldownTicks, invulnTicksOnHit);
  assert.equal(player.hp, 90, 'second hit lands once both cooldown and invuln have expired');
  assert.equal(pool.data.contactCooldown[slot], contactCooldownTicks);
  assert.equal(player.invulnTicks, invulnTicksOnHit);
});

test('stepEnemies: player dies (alive=false) when hp reaches 0, hp never goes negative', () => {
  const pool = createEnemyPool(2);
  const grid = new BruteForceGrid();
  const slot = pool.spawn();
  pool.data.posX[slot] = 0;
  pool.data.posY[slot] = 0;
  pool.data.speed[slot] = 0;
  pool.data.radius[slot] = 1;
  pool.data.touchDamage[slot] = 999;
  pool.data.contactCooldown[slot] = 0;
  grid.insert(pool.idOf(slot), 0, 0);

  const player = makePlayer({ x: 0, y: 0, hp: 3 });

  stepEnemies(pool, grid, player, 1, 1000, 1000, 30, 20);

  assert.equal(player.hp, 0);
  assert.equal(player.alive, false);
});

test('stepEnemies: a distant runner weaves deterministically but direct-seeks when close', () => {
  const makeRunner = (distance: number) => {
    const pool = createEnemyPool(2);
    const grid = new BruteForceGrid();
    const projectiles = createProjectilePool(4);
    const events = makeEvents();
    const state = createEnemyBehaviorState(2);
    const slot = pool.spawn();
    pool.data.posX[slot] = 0;
    pool.data.posY[slot] = 500;
    pool.data.speed[slot] = 100;
    pool.data.radius[slot] = 1;
    pool.data.touchDamage[slot] = 0;
    grid.insert(pool.idOf(slot), 0, 500);
    resetEnemyBehavior(state, slot, 'runner', false, 0, 0);
    const player = makePlayer({ x: distance, y: 500 });
    stepEnemies(pool, grid, player, 1, 2_000, 2_000, 30, 20, {
      state, config: DEFAULT_CONFIG.enemyBehavior, tick: 0, projectiles, events,
    });
    return { pool, slot };
  };

  const far = makeRunner(500);
  const repeat = makeRunner(500);
  assert.ok(far.pool.data.posX[far.slot]! > 0, 'runner still closes distance');
  assert.notEqual(far.pool.data.posY[far.slot], 500, 'runner takes a deterministic lateral weave');
  assert.equal(far.pool.data.posX[far.slot], repeat.pool.data.posX[repeat.slot]);
  assert.equal(far.pool.data.posY[far.slot], repeat.pool.data.posY[repeat.slot]);

  const close = makeRunner(100);
  assert.equal(close.pool.data.posY[close.slot], 500, 'close runner stops weaving for a readable direct seek');
});

test('stepEnemies: an elite skirmishes at range and fires one hostile projectile on its authored cadence', () => {
  const pool = createEnemyPool(2);
  const grid = new BruteForceGrid();
  const projectiles = createProjectilePool(4);
  const events = makeEvents();
  const state = createEnemyBehaviorState(2);
  const slot = pool.spawn();
  pool.data.posX[slot] = 300;
  pool.data.posY[slot] = 0;
  pool.data.speed[slot] = 40;
  pool.data.radius[slot] = 4;
  pool.data.touchDamage[slot] = 0;
  grid.insert(pool.idOf(slot), 300, 0);
  resetEnemyBehavior(state, slot, 'brute', true, 0, 0);
  const player = makePlayer({ x: 0, y: 0 });
  const behavior = { state, config: DEFAULT_CONFIG.enemyBehavior, tick: 1, projectiles, events };

  stepEnemies(pool, grid, player, 1 / 60, 2_000, 2_000, 30, 20, behavior);
  assert.notEqual(pool.data.posY[slot], 0, 'in-band elite orbits instead of direct-seeking');
  assert.equal(events.enemyProjectilesFired, 1);
  assert.equal(projectiles.data.count, 1);
  const projectileSlot = projectiles.data.alive.findIndex((value) => value === 1);
  assert.equal(projectiles.data.faction[projectileSlot], 1);

  behavior.tick = 2;
  stepEnemies(pool, grid, player, 1 / 60, 2_000, 2_000, 30, 20, behavior);
  assert.equal(events.enemyProjectilesFired, 1, 'cooldown prevents an immediate second hostile shot');
  assert.equal(projectiles.data.count, 1);
});

test('stepEnemies: an elite spends its initial hostile-shot delay only while threatening Greg', () => {
  const pool = createEnemyPool(1);
  const grid = new BruteForceGrid();
  const projectiles = createProjectilePool(4);
  const events = makeEvents();
  const state = createEnemyBehaviorState(1);
  const slot = pool.spawn();
  pool.data.posX[slot] = 500;
  pool.data.posY[slot] = 0;
  pool.data.speed[slot] = 0;
  pool.data.radius[slot] = 4;
  pool.data.touchDamage[slot] = 0;
  grid.insert(pool.idOf(slot), 500, 0);
  resetEnemyBehavior(state, slot, 'brute', true, 2, 0);
  const player = makePlayer({ x: 0, y: 0 });
  const behavior = { state, config: DEFAULT_CONFIG.enemyBehavior, tick: 1, projectiles, events };

  stepEnemies(pool, grid, player, 1 / 60, 2_000, 2_000, 30, 20, behavior);
  assert.equal(state.hostileShotCooldown[slot], 2, 'approach time must not consume the first in-range delay');
  assert.equal(events.enemyProjectilesFired, 0);

  pool.data.posX[slot] = 300;
  grid.update(pool.idOf(slot), 300, 0);
  behavior.tick = 2;
  stepEnemies(pool, grid, player, 1 / 60, 2_000, 2_000, 30, 20, behavior);
  assert.equal(state.hostileShotCooldown[slot], 1);
  assert.equal(events.enemyProjectilesFired, 0);

  behavior.tick = 3;
  stepEnemies(pool, grid, player, 1 / 60, 2_000, 2_000, 30, 20, behavior);
  assert.equal(events.enemyProjectilesFired, 1);
});

test('stepEnemies: a normal-plus spitter holds range and fires its lower-damage hostile shot', () => {
  const pool = createEnemyPool(1);
  const grid = new BruteForceGrid();
  const projectiles = createProjectilePool(4);
  const events = makeEvents();
  const state = createEnemyBehaviorState(1);
  const slot = pool.spawn();
  pool.data.posX[slot] = 300;
  pool.data.posY[slot] = 0;
  pool.data.speed[slot] = 48;
  pool.data.radius[slot] = 7;
  pool.data.touchDamage[slot] = 6;
  grid.insert(pool.idOf(slot), 300, 0);
  resetEnemyBehavior(state, slot, 'spitter', false, 0, 0);
  const player = makePlayer({ x: 0, y: 0 });
  const behavior = { state, config: DEFAULT_CONFIG.enemyBehavior, tick: 1, projectiles, events };

  stepEnemies(pool, grid, player, 1 / 60, 2_000, 2_000, 30, 20, behavior);
  assert.equal(state.kind[slot], ENEMY_BEHAVIOR_KIND.spitterSkirmish);
  assert.notEqual(pool.data.posY[slot], 0, 'spitter orbits instead of directly closing in');
  assert.equal(events.enemyProjectilesFired, 1);
  const projectileSlot = projectiles.data.alive.findIndex((alive) => alive === 1);
  assert.equal(projectiles.data.faction[projectileSlot], 1);
  assert.equal(projectiles.data.damage[projectileSlot], DEFAULT_CONFIG.enemyBehavior.spitterProjectileDamage);
  assert.equal(state.hostileShotCooldown[slot], DEFAULT_CONFIG.enemyBehavior.spitterFireIntervalTicks);
});

test('resetEnemyBehavior clears hostile cooldowns before a pooled slot becomes a regular runner', () => {
  const state = createEnemyBehaviorState(1);
  resetEnemyBehavior(state, 0, 'brute', true, 72, 0);
  assert.equal(state.kind[0], ENEMY_BEHAVIOR_KIND.eliteSkirmish);
  assert.equal(state.hostileShotCooldown[0], 72);

  resetEnemyBehavior(state, 0, 'runner', false, 0, 0);
  assert.equal(state.kind[0], ENEMY_BEHAVIOR_KIND.runnerWeave);
  assert.equal(state.hostileShotCooldown[0], 0);
});

// ---------------------------------------------------------------------------
// stepProjectiles
// ---------------------------------------------------------------------------

test('stepProjectiles: moves by vel*dt', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();
  const killed: number[] = [];

  const slot = projectiles.spawn();
  projectiles.data.posX[slot] = 0;
  projectiles.data.posY[slot] = 0;
  projectiles.data.velX[slot] = 100;
  projectiles.data.velY[slot] = 0;
  projectiles.data.lifetime[slot] = 90;
  projectiles.data.hitRadius[slot] = 1;
  projectiles.data.pierce[slot] = 0;
  projectiles.data.faction[slot] = 0;
  projectiles.data.damage[slot] = 10;

  stepProjectiles(projectiles, enemies, grid, 1, 1000, 1000, 10, events, (s) => killed.push(s));

  assert.equal(projectiles.data.posX[slot], 100);
});

test('stepProjectiles: despawns when lifetime reaches 0', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();

  const slot = projectiles.spawn();
  const id = projectiles.idOf(slot);
  projectiles.data.posX[slot] = 0;
  projectiles.data.posY[slot] = 0;
  projectiles.data.velX[slot] = 0;
  projectiles.data.velY[slot] = 0;
  projectiles.data.lifetime[slot] = 1;
  projectiles.data.hitRadius[slot] = 1;
  projectiles.data.pierce[slot] = 0;
  projectiles.data.faction[slot] = 0;
  projectiles.data.damage[slot] = 10;

  stepProjectiles(projectiles, enemies, grid, 1, 1000, 1000, 10, events, () => {});

  assert.equal(projectiles.isLive(id), false);
});

test('stepProjectiles: despawns when out of bounds', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();

  const slot = projectiles.spawn();
  const id = projectiles.idOf(slot);
  projectiles.data.posX[slot] = 95;
  projectiles.data.posY[slot] = 0;
  projectiles.data.velX[slot] = 100;
  projectiles.data.velY[slot] = 0;
  projectiles.data.lifetime[slot] = 90;
  projectiles.data.hitRadius[slot] = 1;
  projectiles.data.pierce[slot] = 0;
  projectiles.data.faction[slot] = 0;
  projectiles.data.damage[slot] = 10;

  stepProjectiles(projectiles, enemies, grid, 1, 100, 100, 10, events, () => {});

  assert.equal(projectiles.isLive(id), false);
});

test('stepProjectiles: hit reduces hp and kill triggers killEnemy with the correct slot; pierce 0 despawns', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();
  const killed: number[] = [];

  const eSlot = enemies.spawn();
  enemies.data.posX[eSlot] = 10;
  enemies.data.posY[eSlot] = 0;
  enemies.data.radius[eSlot] = 2;
  enemies.data.hp[eSlot] = 5;
  const eId = enemies.idOf(eSlot);
  grid.insert(eId, 10, 0);

  const pSlot = projectiles.spawn();
  const pId = projectiles.idOf(pSlot);
  projectiles.data.posX[pSlot] = 9;
  projectiles.data.posY[pSlot] = 0;
  projectiles.data.velX[pSlot] = 0;
  projectiles.data.velY[pSlot] = 0;
  projectiles.data.lifetime[pSlot] = 90;
  projectiles.data.hitRadius[pSlot] = 2;
  projectiles.data.pierce[pSlot] = 0;
  projectiles.data.faction[pSlot] = 0;
  projectiles.data.damage[pSlot] = 10;

  stepProjectiles(projectiles, enemies, grid, 1, 1000, 1000, 2, events, (s) => killed.push(s));

  assert.equal(enemies.data.hp[eSlot], -5);
  assert.deepEqual(killed, [eSlot]);
  assert.equal(projectiles.isLive(pId), false, 'pierce 0 despawns the projectile on hit');
});

test('stepProjectiles: pierce lets the projectile continue to a second target', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();
  const killed: number[] = [];

  const e1 = enemies.spawn();
  enemies.data.posX[e1] = 0;
  enemies.data.posY[e1] = 0;
  enemies.data.radius[e1] = 1;
  enemies.data.hp[e1] = 1000;
  grid.insert(enemies.idOf(e1), 0, 0);

  const e2 = enemies.spawn();
  enemies.data.posX[e2] = 0.5;
  enemies.data.posY[e2] = 0;
  enemies.data.radius[e2] = 1;
  enemies.data.hp[e2] = 1000;
  grid.insert(enemies.idOf(e2), 0.5, 0);

  const pSlot = projectiles.spawn();
  const pId = projectiles.idOf(pSlot);
  projectiles.data.posX[pSlot] = 0;
  projectiles.data.posY[pSlot] = 0;
  projectiles.data.velX[pSlot] = 0;
  projectiles.data.velY[pSlot] = 0;
  projectiles.data.lifetime[pSlot] = 90;
  projectiles.data.hitRadius[pSlot] = 1;
  projectiles.data.pierce[pSlot] = 1;
  projectiles.data.faction[pSlot] = 0;
  projectiles.data.damage[pSlot] = 10;

  stepProjectiles(projectiles, enemies, grid, 1, 1000, 1000, 1, events, (s) => killed.push(s));

  assert.equal(enemies.data.hp[e1], 990);
  assert.equal(enemies.data.hp[e2], 990);
  assert.equal(projectiles.isLive(pId), false, 'pierce exhausted after second hit, projectile despawns');
});

test('stepProjectiles: faction 1 projectile never damages enemies', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();

  const eSlot = enemies.spawn();
  enemies.data.posX[eSlot] = 0;
  enemies.data.posY[eSlot] = 0;
  enemies.data.radius[eSlot] = 5;
  enemies.data.hp[eSlot] = 10;
  grid.insert(enemies.idOf(eSlot), 0, 0);

  const pSlot = projectiles.spawn();
  const pId = projectiles.idOf(pSlot);
  projectiles.data.posX[pSlot] = 0;
  projectiles.data.posY[pSlot] = 0;
  projectiles.data.velX[pSlot] = 0;
  projectiles.data.velY[pSlot] = 0;
  projectiles.data.lifetime[pSlot] = 90;
  projectiles.data.hitRadius[pSlot] = 5;
  projectiles.data.pierce[pSlot] = 0;
  projectiles.data.faction[pSlot] = 1;
  projectiles.data.damage[pSlot] = 10;

  stepProjectiles(projectiles, enemies, grid, 1, 1000, 1000, 5, events, () => {
    assert.fail('killEnemy should not be called for a faction 1 projectile');
  });

  assert.equal(enemies.data.hp[eSlot], 10, 'hp unchanged for faction 1 projectile');
  assert.equal(projectiles.isLive(pId), true, 'projectile survives since it never processes hits');
});

test('stepProjectiles: hostile projectile damages Greg once, respects invulnerability, and despawns', () => {
  const projectiles = createProjectilePool(4);
  const enemies = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const events = makeEvents();
  const player = makePlayer({ x: 0, y: 0, hp: 20, radius: 2 });

  assert.equal(spawnProjectileWithStats(projectiles, 0, 0, 1, 0, 1, 7, 30, 2, 0, 1), true);
  const id = projectiles.idOf(0);
  stepProjectiles(projectiles, enemies, grid, 0, 1_000, 1_000, 1, events, () => {
    assert.fail('hostile projectile must not damage enemies');
  }, player, 12);
  assert.equal(player.hp, 13);
  assert.equal(player.invulnTicks, 12);
  assert.equal(projectiles.isLive(id), false);

  assert.equal(spawnProjectileWithStats(projectiles, 0, 0, 1, 0, 1, 7, 30, 2, 0, 1), true);
  stepProjectiles(projectiles, enemies, grid, 0, 1_000, 1_000, 1, events, () => {}, player, 12);
  assert.equal(player.hp, 13, 'invulnerability blocks repeat hostile damage');
  assert.equal(projectiles.data.count, 0, 'blocked collision still consumes the projectile');
});

// ---------------------------------------------------------------------------
// collectPickups
// ---------------------------------------------------------------------------

test('collectPickups: collects in-range pickups, adds xp, fires events', () => {
  const pickups = createPickupPool(4);
  const events = makeEvents();
  const player = makePlayer({ x: 0, y: 0, pickupRadius: 10, xp: 0 });

  const inRange = pickups.spawn();
  pickups.data.posX[inRange] = 5;
  pickups.data.posY[inRange] = 0;
  pickups.data.radius[inRange] = 1;
  pickups.data.xp[inRange] = 7;
  const inRangeId = pickups.idOf(inRange);

  const outOfRange = pickups.spawn();
  pickups.data.posX[outOfRange] = 500;
  pickups.data.posY[outOfRange] = 0;
  pickups.data.radius[outOfRange] = 1;
  pickups.data.xp[outOfRange] = 3;
  const outOfRangeId = pickups.idOf(outOfRange);

  collectPickups(pickups, player, events);

  assert.equal(player.xp, 7);
  assert.equal(events.pickupsCollected, 1);
  assert.equal(pickups.isLive(inRangeId), false);
  assert.equal(pickups.isLive(outOfRangeId), true);
});

test('collectPickups: applies a truthful positive XP gain multiplier at collection time', () => {
  const pickups = createPickupPool(1);
  const events = makeEvents();
  const player = makePlayer({ x: 0, y: 0, pickupRadius: 10, xp: 0 });
  const slot = pickups.spawn();
  pickups.data.posX[slot] = 0;
  pickups.data.posY[slot] = 0;
  pickups.data.radius[slot] = 1;
  pickups.data.xp[slot] = 5;

  collectPickups(pickups, player, events, 1.24);

  assert.equal(player.xp, 6.2);
  assert.throws(() => collectPickups(pickups, player, events, 0), /multiplier/);
});

test('dead players cannot attract or collect pickups, and cannot level from stored XP', () => {
  const pickups = createPickupPool(2);
  const slot = pickups.spawn();
  pickups.data.posX[slot] = 20;
  pickups.data.posY[slot] = 0;
  pickups.data.xp[slot] = 3;
  pickups.data.radius[slot] = 1;
  const player = makePlayer({ alive: false, xp: 3, pickupRadius: 100 });
  const events = makeEvents();

  attractPickups(pickups, player, 1, 100, 100);
  collectPickups(pickups, player, events);
  applyXpThresholds(player, [1, 2, 3], events);

  assert.equal(pickups.data.posX[slot], 20, 'dead players do not pull nearby XP motes');
  assert.equal(pickups.data.count, 1, 'dead players do not consume XP motes');
  assert.equal(player.level, 1, 'stored XP cannot level a dead player');
  assert.deepEqual(events.levelUps, []);
});

test('attractPickups: pulls only in-range pickups by a bounded deterministic step', () => {
  const pickups = createPickupPool(4);
  const player = makePlayer({ x: 0, y: 0, pickupRadius: 10 });

  const near = pickups.spawn();
  pickups.data.posX[near] = 100;
  pickups.data.posY[near] = 0;
  pickups.data.radius[near] = 1;

  const far = pickups.spawn();
  pickups.data.posX[far] = 201;
  pickups.data.posY[far] = 0;
  pickups.data.radius[far] = 1;

  attractPickups(pickups, player, 0.5, 200, 80);

  assert.equal(pickups.data.posX[near], 60);
  assert.equal(pickups.data.posY[near], 0);
  assert.equal(pickups.data.posX[far], 201);
  assert.equal(pickups.data.posY[far], 0);
});

test('attractPickups: validates its deterministic inputs', () => {
  const pickups = createPickupPool(1);
  const player = makePlayer();
  assert.throws(() => attractPickups(pickups, player, -1, 10, 10), /dt/);
  assert.throws(() => attractPickups(pickups, player, 1, -1, 10), /radius/);
  assert.throws(() => attractPickups(pickups, player, 1, 10, -1), /speed/);
});

// ---------------------------------------------------------------------------
// applyXpThresholds
// ---------------------------------------------------------------------------

test('applyXpThresholds: emits a multi-level chain on a huge xp gain', () => {
  const events = makeEvents();
  const player = makePlayer({ level: 1, xp: 100 });
  const xpThresholds = [5, 15, 30, 50];

  applyXpThresholds(player, xpThresholds, events);

  assert.equal(player.level, 6);
  assert.deepEqual(events.levelUps, [2, 3, 4, 5, 6]);
});

test('applyXpThresholds: no level up when xp is below the next threshold', () => {
  const events = makeEvents();
  const player = makePlayer({ level: 1, xp: 4 });
  const xpThresholds = [5, 15, 30, 50];

  applyXpThresholds(player, xpThresholds, events);

  assert.equal(player.level, 1);
  assert.deepEqual(events.levelUps, []);
});

test('xp curve: continues deterministically after the authored opening thresholds', () => {
  const thresholds = [5, 15, 30, 50];
  assert.equal(xpRequiredForNextLevel(thresholds, 1), 5);
  assert.equal(xpRequiredForNextLevel(thresholds, 4), 50);
  assert.equal(xpRequiredForNextLevel(thresholds, 5), 78);
  assert.equal(xpRequiredForNextLevel(thresholds, 6), 114);
  assert.equal(xpRequiredForNextLevel([], 1), null);
});

test('applyXpThresholds: keeps leveling past the authored opening table', () => {
  const events = makeEvents();
  const player = makePlayer({ level: 1, xp: 200 });
  applyXpThresholds(player, [5, 15, 30, 50], events);
  assert.equal(player.level, 8);
  assert.deepEqual(events.levelUps, [2, 3, 4, 5, 6, 7, 8]);
});

// ---------------------------------------------------------------------------
// spawnProjectile
// ---------------------------------------------------------------------------

test('spawnProjectile: normalizes direction and fills fields from weapon config', () => {
  const projectiles = createProjectilePool(4);
  const weapon = DEFAULT_CONFIG.weapon;

  const ok = spawnProjectile(projectiles, 1, 2, 3, 4, weapon, 0);
  assert.equal(ok, true);

  const slot = projectiles.slotOf(projectiles.idOf(0));
  assert.equal(slot, 0);
  assert.equal(projectiles.data.posX[0], 1);
  assert.equal(projectiles.data.posY[0], 2);
  const len = Math.sqrt(3 * 3 + 4 * 4);
  assert.ok(Math.abs(projectiles.data.velX[0]! - (3 / len) * weapon.projectileSpeed) < 1e-6);
  assert.ok(Math.abs(projectiles.data.velY[0]! - (4 / len) * weapon.projectileSpeed) < 1e-6);
  assert.equal(projectiles.data.damage[0], weapon.damage);
  assert.equal(projectiles.data.lifetime[0], weapon.lifetimeTicks);
  assert.equal(projectiles.data.hitRadius[0], weapon.hitRadius);
  assert.equal(projectiles.data.pierce[0], weapon.pierce);
  assert.equal(projectiles.data.faction[0], 0);
});

test('spawnProjectile: returns false for zero-length direction', () => {
  const projectiles = createProjectilePool(4);
  const weapon = DEFAULT_CONFIG.weapon;
  const ok = spawnProjectile(projectiles, 0, 0, 0, 0, weapon, 0);
  assert.equal(ok, false);
});

test('spawnProjectile: returns false when the pool is full', () => {
  const projectiles = createProjectilePool(1);
  const weapon = DEFAULT_CONFIG.weapon;
  assert.equal(spawnProjectile(projectiles, 0, 0, 1, 0, weapon, 0), true);
  assert.equal(spawnProjectile(projectiles, 0, 0, 1, 0, weapon, 0), false);
});
