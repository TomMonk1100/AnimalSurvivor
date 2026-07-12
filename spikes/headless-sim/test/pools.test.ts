import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyPool, createProjectilePool, createPickupPool } from '../src/pools.js';

// Tiny deterministic PRNG (mulberry32), fixed seed. Not used for control
// flow correctness, only to generate varied fixture data deterministically.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('spawn returns distinct ascending slots when no despawns occur', () => {
  const pool = createEnemyPool(8);
  const slots: number[] = [];
  for (let i = 0; i < 8; i++) {
    const s = pool.spawn();
    assert.notEqual(s, -1);
    slots.push(s);
  }
  const unique = new Set(slots);
  assert.equal(unique.size, 8);
  assert.deepEqual(
    [...slots].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(pool.data.count, 8);
  assert.equal(pool.data.highWater, 8);
});

test('full pool returns -1 and count stays at capacity', () => {
  const pool = createEnemyPool(4);
  for (let i = 0; i < 4; i++) assert.notEqual(pool.spawn(), -1);
  assert.equal(pool.spawn(), -1);
  assert.equal(pool.spawn(), -1);
  assert.equal(pool.data.count, 4);
  assert.equal(pool.data.highWater, 4);
});

test('despawn then spawn reuses the freed slot', () => {
  const pool = createProjectilePool(4);
  const a = pool.spawn();
  const b = pool.spawn();
  assert.notEqual(a, -1);
  assert.notEqual(b, -1);
  pool.despawn(b);
  assert.equal(pool.data.count, 1);
  const c = pool.spawn();
  assert.equal(c, b, 'freed slot should be reused (stack order)');
  assert.equal(pool.data.count, 2);
});

test('stale id protection: old id invalid after despawn+respawn, new occupant data untouched', () => {
  const pool = createEnemyPool(4);
  const slot = pool.spawn();
  pool.data.hp[slot] = 42;
  pool.data.posX[slot] = 100;
  const oldId = pool.idOf(slot);

  pool.despawn(slot);
  assert.equal(pool.slotOf(oldId), -1);
  assert.equal(pool.isLive(oldId), false);

  const newSlot = pool.spawn();
  assert.equal(newSlot, slot, 'stack reuse should hand back the same slot');
  // Fresh slot data must be reset, not leaking the old occupant's values.
  assert.equal(pool.data.hp[newSlot], 0);
  assert.equal(pool.data.posX[newSlot], 0);

  pool.data.hp[newSlot] = 99;
  const newId = pool.idOf(newSlot);
  assert.notEqual(newId, oldId);

  // Attempting to use the stale old id must not resolve to the new occupant.
  assert.equal(pool.slotOf(oldId), -1);
  assert.equal(pool.isLive(oldId), false);
  assert.equal(pool.isLive(newId), true);
  assert.equal(pool.slotOf(newId), newSlot);
  assert.equal(pool.data.hp[newSlot], 99, 'new occupant data must be unaffected by stale-id lookups');
});

test('generation wraps safely at 0xffff', () => {
  const pool = createPickupPool(2);
  const slot = pool.spawn();
  // Force generation to the wrap boundary.
  pool.data.generation[slot] = 0xffff;
  const idBeforeWrap = pool.idOf(slot);
  assert.equal(pool.slotOf(idBeforeWrap), slot);

  pool.despawn(slot);
  assert.equal(pool.data.generation[slot], 0, 'generation must wrap from 0xffff to 0');
  assert.equal(pool.slotOf(idBeforeWrap), -1, 'pre-wrap id must now be stale');

  const newSlot = pool.spawn();
  assert.equal(newSlot, slot);
  const newId = pool.idOf(newSlot);
  assert.equal(pool.slotOf(newId), newSlot);
  assert.equal(pool.isLive(newId), true);
});

test('spawn resets component data to zero (no leakage across reuse)', () => {
  const rng = mulberry32(12345);
  const pool = createEnemyPool(4);
  const slot = pool.spawn();
  // Write junk into every component array for this slot.
  pool.data.posX[slot] = rng() * 1000;
  pool.data.posY[slot] = rng() * 1000;
  pool.data.velX[slot] = rng() * 1000;
  pool.data.velY[slot] = rng() * 1000;
  pool.data.hp[slot] = rng() * 1000;
  pool.data.maxHp[slot] = rng() * 1000;
  pool.data.speed[slot] = rng() * 1000;
  pool.data.radius[slot] = rng() * 1000;
  pool.data.touchDamage[slot] = rng() * 1000;
  pool.data.contactCooldown[slot] = 123;
  pool.data.zoneDamageCooldown[slot] = 123;
  pool.data.archetype[slot] = 2;
  pool.data.xpDrop[slot] = rng() * 1000;
  pool.data.marked[slot] = 1;

  pool.despawn(slot);
  const respawned = pool.spawn();
  assert.equal(respawned, slot);

  assert.equal(pool.data.posX[slot], 0);
  assert.equal(pool.data.posY[slot], 0);
  assert.equal(pool.data.velX[slot], 0);
  assert.equal(pool.data.velY[slot], 0);
  assert.equal(pool.data.hp[slot], 0);
  assert.equal(pool.data.maxHp[slot], 0);
  assert.equal(pool.data.speed[slot], 0);
  assert.equal(pool.data.radius[slot], 0);
  assert.equal(pool.data.touchDamage[slot], 0);
  assert.equal(pool.data.contactCooldown[slot], 0);
  assert.equal(pool.data.zoneDamageCooldown[slot], 0);
  assert.equal(pool.data.archetype[slot], 0);
  assert.equal(pool.data.xpDrop[slot], 0);
  assert.equal(pool.data.marked[slot], 0);
  assert.equal(pool.data.alive[slot], 1);
});

test('despawn of an already-dead slot is a safe no-op', () => {
  const pool = createEnemyPool(3);
  const slot = pool.spawn();
  pool.despawn(slot);
  assert.equal(pool.data.count, 0);
  // Re-despawning must not throw, must not corrupt count, must not push the
  // free slot twice (which would otherwise let two spawns return the same
  // slot simultaneously).
  assert.doesNotThrow(() => pool.despawn(slot));
  assert.equal(pool.data.count, 0);

  const a = pool.spawn();
  const b = pool.spawn();
  const c = pool.spawn();
  assert.notEqual(a, -1);
  assert.notEqual(b, -1);
  assert.notEqual(c, -1);
  assert.equal(new Set([a, b, c]).size, 3, 'double free-list push would have produced a duplicate slot');
});

test('despawn on an out-of-range slot index is a safe no-op', () => {
  const pool = createPickupPool(2);
  assert.doesNotThrow(() => pool.despawn(-1));
  assert.doesNotThrow(() => pool.despawn(999));
  assert.equal(pool.data.count, 0);
});

test('count and highWater bookkeeping across spawn/despawn churn', () => {
  const pool = createProjectilePool(5);
  const slots: number[] = [];
  for (let i = 0; i < 3; i++) slots.push(pool.spawn());
  assert.equal(pool.data.count, 3);
  assert.equal(pool.data.highWater, 3);

  pool.despawn(slots[0]!);
  pool.despawn(slots[1]!);
  assert.equal(pool.data.count, 1);
  assert.equal(pool.data.highWater, 3, 'highWater must not decrease');

  for (let i = 0; i < 4; i++) pool.spawn();
  assert.equal(pool.data.count, 5);
  assert.equal(pool.data.highWater, 5);

  assert.equal(pool.spawn(), -1);
  assert.equal(pool.data.count, 5);
  assert.equal(pool.data.highWater, 5);
});

test('slotOf/isLive are false for an id that was never spawned', () => {
  const pool = createEnemyPool(4);
  assert.equal(pool.slotOf(0), -1);
  assert.equal(pool.isLive(0), false);
  assert.equal(pool.slotOf(123456789), -1);
});

test('three pool factories each expose their pool-specific arrays', () => {
  const enemies = createEnemyPool(2);
  const projectiles = createProjectilePool(2);
  const pickups = createPickupPool(2);
  assert.ok(enemies.data.hp instanceof Float32Array);
  assert.ok(enemies.data.marked instanceof Uint8Array);
  assert.ok(projectiles.data.pierce instanceof Uint8Array);
  assert.ok(projectiles.data.lifetime instanceof Uint16Array);
  assert.ok(pickups.data.xp instanceof Float32Array);
  assert.equal(enemies.data.capacity, 2);
  assert.equal(projectiles.data.capacity, 2);
  assert.equal(pickups.data.capacity, 2);
});

test('pool factories reject capacities that violate packed-id invariants', () => {
  assert.throws(() => createEnemyPool(0), RangeError);
  assert.throws(() => createProjectilePool(0xffff), RangeError);
  assert.throws(() => createPickupPool(1.5), RangeError);
});
