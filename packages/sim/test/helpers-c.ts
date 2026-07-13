/**
 * Agent C test fixtures — plain-object stand-ins for Pool<T> and SpatialGrid
 * satisfying the frozen interfaces in ../src/types.js. Deliberately NOT the
 * real pools.ts/spatial-grid.ts implementations (those belong to Agent B and
 * are being written in parallel); these are brute-force/simple test doubles.
 */
import {
  idGeneration,
  idSlot,
  makeId,
  MAX_PROJECTILE_HIT_HISTORY,
  NO_ENTITY,
  type EnemyPool,
  type EntityId,
  type PickupPool,
  type PoolBase,
  type Pool,
  type ProjectilePool,
  type Rng,
  type RngState,
  type SpatialGrid,
} from '../src/types.js';

class TestPool<P extends PoolBase> implements Pool<P> {
  readonly data: P;
  private readonly freeSlots: number[] = [];

  constructor(capacity: number, extra: Omit<P, keyof PoolBase>) {
    const base: PoolBase = {
      capacity,
      count: 0,
      highWater: 0,
      alive: new Uint8Array(capacity),
      generation: new Uint16Array(capacity),
      posX: new Float32Array(capacity),
      posY: new Float32Array(capacity),
    };
    this.data = { ...base, ...extra } as P;
    for (let i = capacity - 1; i >= 0; i--) this.freeSlots.push(i);
  }

  spawn(): number {
    const slot = this.freeSlots.pop();
    if (slot === undefined) return -1;
    this.data.alive[slot] = 1;
    this.data.count++;
    if (this.data.count > this.data.highWater) this.data.highWater = this.data.count;
    return slot;
  }

  despawn(slotIndex: number): void {
    if (this.data.alive[slotIndex] === 0) return;
    this.data.alive[slotIndex] = 0;
    this.data.generation[slotIndex] = (this.data.generation[slotIndex]! + 1) & 0xffff;
    this.data.count--;
    this.freeSlots.push(slotIndex);
  }

  idOf(slotIndex: number): EntityId {
    return makeId(slotIndex, this.data.generation[slotIndex]!);
  }

  slotOf(id: EntityId): number {
    const slot = idSlot(id);
    if (slot < 0 || slot >= this.data.capacity) return -1;
    if (this.data.alive[slot] === 0) return -1;
    if (idGeneration(id) !== this.data.generation[slot]) return -1;
    return slot;
  }

  isLive(id: EntityId): boolean {
    return this.slotOf(id) !== -1;
  }
}

export function createEnemyPool(capacity: number): Pool<EnemyPool> {
  return new TestPool<EnemyPool>(capacity, {
    velX: new Float32Array(capacity),
    velY: new Float32Array(capacity),
    hp: new Float32Array(capacity),
    maxHp: new Float32Array(capacity),
    speed: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    touchDamage: new Float32Array(capacity),
    contactCooldown: new Uint16Array(capacity),
    zoneDamageCooldown: new Uint16Array(capacity),
    archetype: new Uint8Array(capacity),
    xpDrop: new Float32Array(capacity),
    marked: new Uint8Array(capacity),
  });
}

export function createProjectilePool(capacity: number): Pool<ProjectilePool> {
  return new TestPool<ProjectilePool>(capacity, {
    velX: new Float32Array(capacity),
    velY: new Float32Array(capacity),
    damage: new Float32Array(capacity),
    lifetime: new Uint16Array(capacity),
    hitRadius: new Float32Array(capacity),
    pierce: new Uint8Array(capacity),
    hitCount: new Uint16Array(capacity),
    hitHistory: new Int32Array(capacity * MAX_PROJECTILE_HIT_HISTORY),
    faction: new Uint8Array(capacity),
    critical: new Uint8Array(capacity),
    source: new Uint8Array(capacity),
  });
}

export function createPickupPool(capacity: number): Pool<PickupPool> {
  return new TestPool<PickupPool>(capacity, {
    kind: new Uint8Array(capacity),
    xp: new Float32Array(capacity),
    radius: new Float32Array(capacity),
  });
}

/**
 * Brute-force spatial grid test double. O(n) per query, which is fine for
 * the small fixture sizes used in Agent C's unit tests. Returns ids sorted
 * ascending; ties in nearest() resolve to lowest id via ascending iteration
 * plus strict-less-than improvement.
 */
export class BruteForceGrid implements SpatialGrid {
  private readonly positions = new Map<EntityId, { x: number; y: number }>();
  queryCount = 0;

  insert(id: EntityId, x: number, y: number): void {
    this.positions.set(id, { x, y });
  }

  update(id: EntityId, x: number, y: number): void {
    this.positions.set(id, { x, y });
  }

  remove(id: EntityId): void {
    this.positions.delete(id);
  }

  clear(): void {
    this.positions.clear();
  }

  private sortedIds(): EntityId[] {
    return [...this.positions.keys()].sort((a, b) => a - b);
  }

  queryRadius(x: number, y: number, radius: number, out: EntityId[]): number {
    this.queryCount++;
    const rSq = radius * radius;
    const matches: EntityId[] = [];
    for (const id of this.sortedIds()) {
      const pos = this.positions.get(id)!;
      const dx = pos.x - x;
      const dy = pos.y - y;
      if (dx * dx + dy * dy <= rSq) matches.push(id);
    }
    out.length = 0;
    for (const id of matches) out.push(id);
    return matches.length;
  }

  nearest(x: number, y: number, maxRadius: number, exclude?: (id: EntityId) => boolean): EntityId {
    this.queryCount++;
    const rSq = maxRadius * maxRadius;
    let bestId: EntityId = NO_ENTITY;
    let bestDist = Infinity;
    for (const id of this.sortedIds()) {
      if (exclude !== undefined && exclude(id)) continue;
      const pos = this.positions.get(id)!;
      const dx = pos.x - x;
      const dy = pos.y - y;
      const d = dx * dx + dy * dy;
      if (d <= rSq && d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }
}

/**
 * Deterministic stub Rng: preload the sequence of pickWeighted() return
 * values; all other methods throw if called (unused by Agent C's systems
 * under test) except getState/setState which are harmless no-ops.
 */
export class StubRng implements Rng {
  pickWeightedCalls = 0;
  lastWeights: readonly number[] | null = null;
  private readonly pickWeightedQueue: number[];

  constructor(pickWeightedResults: readonly number[] = []) {
    this.pickWeightedQueue = [...pickWeightedResults];
  }

  nextUint32(): number {
    throw new Error('StubRng.nextUint32 not implemented');
  }

  float(): number {
    throw new Error('StubRng.float not implemented');
  }

  int(_minIncl: number, _maxExcl: number): number {
    throw new Error('StubRng.int not implemented');
  }

  chance(_p: number): boolean {
    throw new Error('StubRng.chance not implemented');
  }

  pickIndex(_length: number): number {
    throw new Error('StubRng.pickIndex not implemented');
  }

  pickWeighted(weights: readonly number[]): number {
    this.pickWeightedCalls++;
    this.lastWeights = weights;
    const next = this.pickWeightedQueue.shift();
    return next !== undefined ? next : 0;
  }

  getState(): RngState {
    return { a: 0, b: 0, c: 0, d: 0 };
  }

  setState(_state: RngState): void {
    // no-op
  }
}
