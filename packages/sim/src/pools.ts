/**
 * Agent B — Structure-of-Arrays entity pools.
 *
 * All three pool kinds (enemy/projectile/pickup) share one generic
 * implementation. Typed arrays are allocated once at construction time;
 * spawn()/despawn() never allocate.
 *
 * Free-slot bookkeeping: a preallocated Int32Array used as a LIFO stack,
 * seeded so the first `capacity` spawns (with no despawns in between) hand
 * out slots 0,1,2,... in ascending order. After despawns, slot reuse follows
 * plain stack order (most-recently-freed slot is reused first) — this is
 * fully deterministic for a given call sequence, which is the only
 * requirement placed on it.
 *
 * Despawn-of-a-dead-slot policy (documented + tested in test/pools.test.ts):
 * despawn() on an already-dead slot (or an out-of-range slot index) is a
 * SAFE NO-OP. It does not throw, does not touch the free list twice, and
 * does not double-decrement `count`. Rationale: despawn is called from hot
 * per-tick cleanup paths (e.g. "despawn every enemy with hp <= 0 or out of
 * bounds") where re-despawning something already removed this tick is a
 * plausible, harmless occurrence — throwing would force every call site to
 * pre-check aliveness for no real benefit.
 */
import type {
  EnemyPool,
  PickupPool,
  Pool,
  PoolBase,
  PowerPickupPool,
  ProjectilePool,
  ZonePool,
} from './types.js';
import { makeId, idSlot, idGeneration, MAX_PROJECTILE_HIT_HISTORY } from './types.js';

type TypedNumArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array
  | Uint8ClampedArray;

function isTypedNumArray(v: unknown): v is TypedNumArray {
  return (
    v instanceof Uint8Array ||
    v instanceof Uint16Array ||
    v instanceof Uint32Array ||
    v instanceof Int8Array ||
    v instanceof Int16Array ||
    v instanceof Int32Array ||
    v instanceof Float32Array ||
    v instanceof Float64Array ||
    v instanceof Uint8ClampedArray
  );
}

/**
 * Generic pool implementation shared by all three factories. `data` must
 * already contain fully-allocated typed arrays for every field of P
 * (including the PoolBase fields: alive, generation, posX, posY).
 */
function createPool<P extends PoolBase>(capacity: number, data: P): Pool<P> {
  // Free list stack: freeList[0..freeTop) holds free slots, top of stack at
  // index freeTop-1. Seeded so popping in order yields 0,1,2,...
  const freeList = new Int32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    freeList[i] = capacity - 1 - i;
  }
  let freeTop = capacity;

  // Every typed array on `data` except alive/generation holds "component
  // data" that must be zeroed on spawn. Computed once; no allocation later.
  const resetArrays: TypedNumArray[] = [];
  for (const value of Object.values(data)) {
    if (!isTypedNumArray(value)) continue;
    if ((value as unknown) === (data.alive as unknown)) continue;
    if ((value as unknown) === (data.generation as unknown)) continue;
    resetArrays.push(value);
  }

  function spawn(): number {
    if (freeTop === 0) return -1;
    freeTop--;
    const slot = freeList[freeTop]!;
    for (const arr of resetArrays) {
      arr[slot] = 0;
    }
    data.alive[slot] = 1;
    data.count++;
    if (data.count > data.highWater) data.highWater = data.count;
    return slot;
  }

  function despawn(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= capacity) return; // safe no-op, see file header
    if (data.alive[slotIndex] === 0) return; // safe no-op, see file header
    data.alive[slotIndex] = 0;
    data.generation[slotIndex] = (data.generation[slotIndex]! + 1) & 0xffff;
    freeList[freeTop] = slotIndex;
    freeTop++;
    data.count--;
  }

  function idOf(slotIndex: number): number {
    return makeId(slotIndex, data.generation[slotIndex] ?? 0);
  }

  function slotOf(id: number): number {
    const slot = idSlot(id);
    if (slot < 0 || slot >= capacity) return -1;
    if (data.alive[slot] === 0) return -1;
    if (data.generation[slot] !== idGeneration(id)) return -1;
    return slot;
  }

  function isLive(id: number): boolean {
    return slotOf(id) !== -1;
  }

  return {
    data,
    spawn,
    despawn,
    idOf,
    slotOf,
    isLive,
  };
}

function assertPoolCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity >= 0xffff) {
    throw new RangeError(
      `pool capacity must be an integer in [1, 65534] for packed entity ids (received ${capacity})`,
    );
  }
}

export function createEnemyPool(capacity: number): Pool<EnemyPool> {
  assertPoolCapacity(capacity);
  const data: EnemyPool = {
    capacity,
    count: 0,
    highWater: 0,
    alive: new Uint8Array(capacity),
    generation: new Uint16Array(capacity),
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
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
  };
  return createPool(capacity, data);
}

export function createProjectilePool(capacity: number): Pool<ProjectilePool> {
  assertPoolCapacity(capacity);
  const data: ProjectilePool = {
    capacity,
    count: 0,
    highWater: 0,
    alive: new Uint8Array(capacity),
    generation: new Uint16Array(capacity),
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
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
  };
  return createPool(capacity, data);
}

export function createPickupPool(capacity: number): Pool<PickupPool> {
  assertPoolCapacity(capacity);
  const data: PickupPool = {
    capacity,
    count: 0,
    highWater: 0,
    alive: new Uint8Array(capacity),
    generation: new Uint16Array(capacity),
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    kind: new Uint8Array(capacity),
    xp: new Float32Array(capacity),
    radius: new Float32Array(capacity),
  };
  return createPool(capacity, data);
}

export function createPowerPickupPool(capacity: number): Pool<PowerPickupPool> {
  assertPoolCapacity(capacity);
  const data: PowerPickupPool = {
    capacity,
    count: 0,
    highWater: 0,
    alive: new Uint8Array(capacity),
    generation: new Uint16Array(capacity),
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    kind: new Uint8Array(capacity),
    amount: new Float32Array(capacity),
    radius: new Float32Array(capacity),
  };
  return createPool(capacity, data);
}

/**
 * Bounded persistent-zone pool. The generic pool's deterministic LIFO free
 * list reuses the most recently freed slot; callers reject a newly requested
 * zone when all live slots are occupied rather than evicting an existing pad.
 */
export function createZonePool(capacity: number): Pool<ZonePool> {
  assertPoolCapacity(capacity);
  const data: ZonePool = {
    capacity,
    count: 0,
    highWater: 0,
    alive: new Uint8Array(capacity),
    generation: new Uint16Array(capacity),
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    damage: new Float32Array(capacity),
    lifetime: new Uint16Array(capacity),
    intervalTicks: new Uint16Array(capacity),
    pulseCooldown: new Uint16Array(capacity),
    tag: new Uint8Array(capacity),
    critical: new Uint8Array(capacity),
    source: new Uint8Array(capacity),
  };
  return createPool(capacity, data);
}
