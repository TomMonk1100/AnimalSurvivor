import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialGrid } from '../src/spatial-grid.js';
import { NO_ENTITY, type EntityId } from '../src/types.js';

// Tiny deterministic PRNG (mulberry32), fixed seed. No Math.random anywhere.
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

interface Ent {
  id: EntityId;
  x: number;
  y: number;
}

function bruteRadius(live: Ent[], qx: number, qy: number, r: number): EntityId[] {
  const rSq = r * r;
  const out: EntityId[] = [];
  for (const e of live) {
    const dx = e.x - qx;
    const dy = e.y - qy;
    if (dx * dx + dy * dy <= rSq) out.push(e.id);
  }
  out.sort((a, b) => a - b);
  return out;
}

function bruteNearest(
  live: Ent[],
  qx: number,
  qy: number,
  maxR: number,
  exclude?: (id: EntityId) => boolean,
): EntityId {
  const maxRSq = maxR * maxR;
  let bestId: EntityId = NO_ENTITY;
  let bestDistSq = Infinity;
  for (const e of live) {
    if (exclude && exclude(e.id)) continue;
    const dx = e.x - qx;
    const dy = e.y - qy;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxRSq) continue;
    if (distSq < bestDistSq || (distSq === bestDistSq && e.id < bestId)) {
      bestDistSq = distSq;
      bestId = e.id;
    }
  }
  return bestId;
}

const WORLD_W = 1000;
const WORLD_H = 1000;
const CELL_SIZE = 37; // deliberately not a divisor of world size
const MAX_ENTITIES = 500;

function buildFixture(): { grid: ReturnType<typeof createSpatialGrid>; entities: Ent[] } {
  const rng = mulberry32(0xc0ffee);
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  const entities: Ent[] = [];

  // 300 entities at PRNG positions, deliberately ranging beyond world bounds
  // in both directions (roughly [-200, 1200) on each axis).
  for (let i = 0; i < 300; i++) {
    const x = rng() * (WORLD_W * 1.4) - WORLD_W * 0.2;
    const y = rng() * (WORLD_H * 1.4) - WORLD_H * 0.2;
    entities.push({ id: i, x, y });
  }

  // Exact-boundary cases, appended with fixed ids so they're reproducible.
  entities.push({ id: 300, x: 555, y: 444 }); // duplicate position pair
  entities.push({ id: 301, x: 555, y: 444 }); // duplicate position pair
  entities.push({ id: 302, x: 600, y: 500 }); // exactly r=100 from (500,500)
  entities.push({ id: 303, x: 660, y: 650 }); // exactly dist=10 from (650,650)
  entities.push({ id: 304, x: 650, y: 660 }); // exactly dist=10 from (650,650) -- tie with 303, lower id wins

  for (const e of entities) grid.insert(e.id, e.x, e.y);
  return { grid, entities };
}

test('queryRadius matches brute force over ~300 entities and 100 query circles (membership + order)', () => {
  const { grid, entities } = buildFixture();
  const rng = mulberry32(0x1234);

  const queries: Array<{ qx: number; qy: number; r: number }> = [
    // Fixed boundary case: id 302 sits exactly at distance 100.
    { qx: 500, qy: 500, r: 100 },
    // Fixed boundary case: radius 0 should hit only exact-position entities.
    { qx: 555, qy: 444, r: 0 },
  ];
  for (let i = 0; i < 100; i++) {
    queries.push({
      qx: rng() * (WORLD_W * 1.4) - WORLD_W * 0.2,
      qy: rng() * (WORLD_H * 1.4) - WORLD_H * 0.2,
      r: rng() * 250 + 5,
    });
  }

  const out: EntityId[] = [];
  for (const q of queries) {
    const expected = bruteRadius(entities, q.qx, q.qy, q.r);
    const count = grid.queryRadius(q.qx, q.qy, q.r, out);
    assert.equal(count, expected.length, `count mismatch at q=${JSON.stringify(q)}`);
    assert.equal(out.length, expected.length);
    assert.deepEqual(out, expected, `membership/order mismatch at q=${JSON.stringify(q)}`);
  }
});

test('radius 0 hits only exact-position entities (including duplicate-position pair)', () => {
  const { grid } = buildFixture();
  const out: EntityId[] = [];
  const count = grid.queryRadius(555, 444, 0, out);
  assert.equal(count, 2);
  assert.deepEqual(out, [300, 301]);

  const outNone = grid.queryRadius(555.0001, 444, 0, []);
  assert.equal(outNone, 0);
});

test('nearest matches brute force over 100 random queries, including a deliberate exact tie', () => {
  const { grid, entities } = buildFixture();

  // Deliberate exact tie: ids 303 and 304 are both exactly distance 10 from
  // (650,650). Lowest id (303) must win.
  assert.equal(grid.nearest(650, 650, 50), 303);
  // Excluding the tie-winner must fall through to the other tied candidate.
  assert.equal(
    grid.nearest(650, 650, 50, (id) => id === 303),
    304,
  );

  const rng = mulberry32(0x9999);
  for (let i = 0; i < 100; i++) {
    const qx = rng() * (WORLD_W * 1.4) - WORLD_W * 0.2;
    const qy = rng() * (WORLD_H * 1.4) - WORLD_H * 0.2;
    const maxR = rng() * 200 + 1;
    const useExclude = rng() < 0.3;
    const exclude = useExclude ? (id: EntityId): boolean => id % 7 === 0 : undefined;

    const expected = exclude
      ? bruteNearest(entities, qx, qy, maxR, exclude)
      : bruteNearest(entities, qx, qy, maxR);
    const actual = exclude ? grid.nearest(qx, qy, maxR, exclude) : grid.nearest(qx, qy, maxR);
    assert.equal(actual, expected, `mismatch at qx=${qx} qy=${qy} maxR=${maxR} exclude=${useExclude}`);
  }
});

test('empty grid: nearest returns NO_ENTITY, queryRadius returns 0', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  assert.equal(grid.nearest(500, 500, 1000), NO_ENTITY);
  const out: EntityId[] = [1, 2, 3]; // pre-populated to confirm it gets trimmed to 0
  const count = grid.queryRadius(500, 500, 1000, out);
  assert.equal(count, 0);
  assert.equal(out.length, 0);
});

test('update moves an entity between cells; queries before/after reflect the move', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  grid.insert(1, 50, 50);
  grid.insert(2, 900, 900);

  let out: EntityId[] = [];
  assert.equal(grid.queryRadius(50, 50, 5, out), 1);
  assert.deepEqual(out, [1]);
  assert.equal(grid.queryRadius(900, 900, 5, out), 1);
  assert.deepEqual(out, [2]);

  grid.update(1, 900, 900);

  assert.equal(grid.queryRadius(50, 50, 5, out), 0);
  assert.equal(grid.queryRadius(900, 900, 5, out), 2);
  assert.deepEqual(out.sort((a, b) => a - b), [1, 2]);

  assert.equal(grid.nearest(900, 900, 10), 1);
});

test('update handles a same-cell move cheaply and correctly', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  grid.insert(1, 10, 10);
  grid.update(1, 12, 11); // still well within the same cell (cellSize=37)

  const out: EntityId[] = [];
  assert.equal(grid.queryRadius(12, 11, 1, out), 1);
  assert.deepEqual(out, [1]);
  assert.equal(grid.queryRadius(10, 10, 1, out), 0, 'entity must no longer be at its old position');
});

test('remove works: removed id disappears from queries', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  grid.insert(1, 100, 100);
  grid.insert(2, 100, 100);

  let out: EntityId[] = [];
  assert.equal(grid.queryRadius(100, 100, 1, out), 2);

  grid.remove(1);
  assert.equal(grid.queryRadius(100, 100, 1, out), 1);
  assert.deepEqual(out, [2]);
  assert.equal(grid.nearest(100, 100, 5, undefined), 2);
});

test('duplicate insert throws', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  grid.insert(1, 0, 0);
  assert.throws(() => grid.insert(1, 5, 5));
});

test('remove of an unknown id throws (documented policy)', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  assert.throws(() => grid.remove(42));
});

test('update of an unknown id throws (documented policy)', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  assert.throws(() => grid.update(42, 1, 1));
});

test('insert beyond maxEntities capacity throws', () => {
  const grid = createSpatialGrid(100, 100, 10, 2);
  grid.insert(1, 0, 0);
  grid.insert(2, 0, 0);
  assert.throws(() => grid.insert(3, 0, 0));
});

test('out-of-bounds coordinates clamp to edge cells but keep exact stored position', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  grid.insert(1, -500, -500); // far outside world bounds, top-left
  grid.insert(2, 5000, 5000); // far outside world bounds, bottom-right

  // Querying near the actual (out-of-bounds) position must still find it,
  // since the exact distance check uses the raw stored position.
  const out: EntityId[] = [];
  assert.equal(grid.queryRadius(-500, -500, 1, out), 1);
  assert.deepEqual(out, [1]);
  assert.equal(grid.queryRadius(5000, 5000, 1, out), 1);
  assert.deepEqual(out, [2]);

  // Querying near the clamped edge cell but far from the true position must
  // not spuriously match (exact distance still applies).
  assert.equal(grid.queryRadius(0, 0, 1, out), 0);
});

test('clear removes all entities', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  grid.insert(1, 10, 10);
  grid.insert(2, 20, 20);
  grid.clear();
  const out: EntityId[] = [];
  assert.equal(grid.queryRadius(10, 10, 100, out), 0);
  assert.equal(grid.nearest(10, 10, 100), NO_ENTITY);
  // Re-insert after clear must work (slots/ids fully released).
  grid.insert(1, 10, 10);
  assert.equal(grid.queryRadius(10, 10, 1, out), 1);
});

test('queryCount increments once per queryRadius/nearest call', () => {
  const grid = createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, MAX_ENTITIES);
  const before = grid.queryCount;
  grid.queryRadius(0, 0, 10, []);
  grid.nearest(0, 0, 10);
  assert.equal(grid.queryCount, before + 2);
});

test('constructor rejects invalid geometry and capacity', () => {
  assert.throws(() => createSpatialGrid(0, WORLD_H, CELL_SIZE, MAX_ENTITIES), RangeError);
  assert.throws(() => createSpatialGrid(WORLD_W, WORLD_H, 0, MAX_ENTITIES), RangeError);
  assert.throws(() => createSpatialGrid(WORLD_W, WORLD_H, CELL_SIZE, 0xffff), RangeError);
});
