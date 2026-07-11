import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_ENTITY, type EnemyPool, type EntityId, type Pool, type TargetContext } from '../src/types.js';
import { selectTarget } from '../src/targeting.js';
import { BruteForceGrid, createEnemyPool } from './helpers-c.js';

interface SpawnOpts {
  hp?: number;
  maxHp?: number;
  marked?: number;
}

function spawnEnemy(
  pool: Pool<EnemyPool>,
  grid: BruteForceGrid,
  x: number,
  y: number,
  opts: SpawnOpts = {},
): EntityId {
  const slot = pool.spawn();
  assert.notEqual(slot, -1, 'test fixture pool ran out of capacity');
  pool.data.posX[slot] = x;
  pool.data.posY[slot] = y;
  pool.data.hp[slot] = opts.hp ?? 10;
  pool.data.maxHp[slot] = opts.maxHp ?? 10;
  pool.data.marked[slot] = opts.marked ?? 0;
  pool.data.speed[slot] = 0;
  pool.data.radius[slot] = 1;
  pool.data.touchDamage[slot] = 0;
  const id = pool.idOf(slot);
  grid.insert(id, x, y);
  return id;
}

function baseCtx(overrides: Partial<TargetContext> = {}): TargetContext {
  return { originX: 0, originY: 0, range: 100, moveDirX: 0, moveDirY: 0, ...overrides };
}

test('nearest: picks minimum distance among in-range candidates', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  const near = spawnEnemy(pool, grid, 10, 0);
  spawnEnemy(pool, grid, 90, 0);

  const ctx = baseCtx({ range: 100 });
  const result = selectTarget('nearest', ctx, pool, grid, 60);
  assert.equal(result, near);
});

test('nearest: enemy exactly at range is included (inclusive boundary)', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const exactlyAtRange = spawnEnemy(pool, grid, 100, 0); // dist == range, inclusive
  const ctx = baseCtx({ range: 100 });
  const result = selectTarget('nearest', ctx, pool, grid, 60);
  assert.equal(result, exactlyAtRange, 'exact-at-range enemy must be included');
});

test('nearest: enemy just outside range is excluded entirely', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  spawnEnemy(pool, grid, 100.0001, 0);
  const ctx = baseCtx({ range: 100 });
  const result = selectTarget('nearest', ctx, pool, grid, 60);
  assert.equal(result, NO_ENTITY);
});

test('nearest: skips dead enemies even if grid still holds a stale entry', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const dead = spawnEnemy(pool, grid, 5, 0);
  const alive = spawnEnemy(pool, grid, 50, 0);
  pool.despawn(pool.slotOf(dead));
  // Deliberately do NOT remove `dead` from the grid, simulating the caller
  // not having synced the grid yet; selectTarget must treat pool as truth.
  const ctx = baseCtx();
  const result = selectTarget('nearest', ctx, pool, grid, 60);
  assert.equal(result, alive);
});

test('nearest: deterministic lowest-id tie break on constructed exact ties', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const first = spawnEnemy(pool, grid, 10, 0); // slot 0, lower id
  const second = spawnEnemy(pool, grid, 0, 10); // slot 1, same distance
  const ctx = baseCtx();
  const result = selectTarget('nearest', ctx, pool, grid, 60);
  assert.equal(result, first);
  assert.ok(first < second);
});

test('highestHealth: uses current hp, not maxHp', () => {
  const pool = createEnemyPool(4);
  const grid = new BruteForceGrid();
  const highMaxLowCurrent = spawnEnemy(pool, grid, 10, 0, { hp: 5, maxHp: 1000 });
  const lowMaxHighCurrent = spawnEnemy(pool, grid, 20, 0, { hp: 50, maxHp: 60 });
  void highMaxLowCurrent;
  const ctx = baseCtx();
  const result = selectTarget('highestHealth', ctx, pool, grid, 60);
  assert.equal(result, lowMaxHighCurrent);
});

test('densestCluster: picks the enemy with the most in-range neighbors over a loner', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  // Tight cluster of three within clusterRadius of each other.
  const c1 = spawnEnemy(pool, grid, 0, 0);
  spawnEnemy(pool, grid, 5, 0);
  spawnEnemy(pool, grid, 0, 5);
  // Loner, still within origin range, but far from the cluster.
  spawnEnemy(pool, grid, 90, 0);

  const ctx = baseCtx({ range: 100 });
  const result = selectTarget('densestCluster', ctx, pool, grid, 20);
  assert.equal(result, c1, 'lowest-id member of the densest cluster wins');
});

test('markedThenNearest: prefers lowest-id marked enemy over a nearer unmarked one', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  const nearUnmarked = spawnEnemy(pool, grid, 5, 0);
  const farMarked = spawnEnemy(pool, grid, 50, 0, { marked: 1 });
  void nearUnmarked;
  const ctx = baseCtx();
  const result = selectTarget('markedThenNearest', ctx, pool, grid, 60);
  assert.equal(result, farMarked);
});

test('markedThenNearest: falls back to nearest when nothing is marked', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  const near = spawnEnemy(pool, grid, 5, 0);
  spawnEnemy(pool, grid, 50, 0);
  const ctx = baseCtx();
  const result = selectTarget('markedThenNearest', ctx, pool, grid, 60);
  assert.equal(result, near);
});

test('rearThreat: zero movement falls back to nearest', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  const near = spawnEnemy(pool, grid, 5, 0);
  spawnEnemy(pool, grid, 50, 0);
  const ctx = baseCtx({ moveDirX: 0, moveDirY: 0 });
  const result = selectTarget('rearThreat', ctx, pool, grid, 60);
  assert.equal(result, near);
});

test('rearThreat: with no enemy strictly behind, returns NO_ENTITY', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  spawnEnemy(pool, grid, 10, 0); // directly ahead of movement direction (+x)
  const ctx = baseCtx({ moveDirX: 1, moveDirY: 0 });
  const result = selectTarget('rearThreat', ctx, pool, grid, 60);
  assert.equal(result, NO_ENTITY);
});

test('rearThreat: picks nearest enemy strictly behind the movement direction', () => {
  const pool = createEnemyPool(8);
  const grid = new BruteForceGrid();
  spawnEnemy(pool, grid, 10, 0); // ahead, moving in +x direction
  const behindFar = spawnEnemy(pool, grid, -50, 0);
  const behindNear = spawnEnemy(pool, grid, -10, 0);
  void behindFar;
  const ctx = baseCtx({ moveDirX: 1, moveDirY: 0 });
  const result = selectTarget('rearThreat', ctx, pool, grid, 60);
  assert.equal(result, behindNear);
});
