/**
 * FROZEN PUBLIC CONTRACTS — LEAD-OWNED.
 * Swarm agents implement against these interfaces and MUST NOT modify this file.
 * All simulation code is renderer-free, allocation-light, and deterministic.
 */

/**
 * Packed entity id: (generation << 16) | slotIndex, in 32-bit signed space.
 * NOTE: for generation >= 0x8000 the packed value is NEGATIVE under JS bitwise
 * semantics — never assume ids are non-negative; compare only via ===/slotOf.
 * NO_ENTITY (-1) cannot collide with a real id as long as pool capacity is
 * < 65536 (slot 0xffff is never allocated). All configured caps are far below.
 */
export type EntityId = number;
export const NO_ENTITY: EntityId = -1;
/** Fixed history budget for a projectile's unique enemy collisions. */
export const MAX_PROJECTILE_HIT_HISTORY = 256;

export function makeId(slotIndex: number, generation: number): EntityId {
  return ((generation & 0xffff) << 16) | (slotIndex & 0xffff);
}
export function idSlot(id: EntityId): number {
  return id & 0xffff;
}
export function idGeneration(id: EntityId): number {
  return (id >>> 16) & 0xffff;
}

// ---------------------------------------------------------------------------
// RNG (Agent A)
// ---------------------------------------------------------------------------

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface Rng {
  /** Uniform uint32. */
  nextUint32(): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** Uniform integer in [minIncl, maxExcl). */
  int(minIncl: number, maxExcl: number): number;
  /** True with probability p (clamped to [0,1]). */
  chance(p: number): boolean;
  /** Uniform index in [0, length). */
  pickIndex(length: number): number;
  /** Deterministic weighted index selection. Weights >= 0; at least one > 0. */
  pickWeighted(weights: readonly number[]): number;
  getState(): RngState;
  setState(state: RngState): void;
}

// ---------------------------------------------------------------------------
// Clock (Agent A)
// ---------------------------------------------------------------------------

export interface Clock {
  /** Current tick, starts at 0. */
  readonly tick: number;
  /** Fixed seconds per tick = 1 / hz. */
  readonly dt: number;
  /** Advance exactly one tick. Never called while the sim is paused. */
  advance(): void;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Pools (Agent B) — Structure-of-Arrays, no per-entity objects in hot loop.
// ---------------------------------------------------------------------------

export interface PoolBase {
  readonly capacity: number;
  /** Number of live entities. */
  count: number;
  /** Peak simultaneous live entities (diagnostic; excluded from state hash). */
  highWater: number;
  /** 1 = slot live, 0 = free. */
  readonly alive: Uint8Array;
  /** Generation counter per slot; bumped on despawn to invalidate stale ids. */
  readonly generation: Uint16Array;
  readonly posX: Float32Array;
  readonly posY: Float32Array;
}

export interface EnemyPool extends PoolBase {
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  readonly speed: Float32Array;
  readonly radius: Float32Array;
  readonly touchDamage: Float32Array;
  /** Ticks remaining until this enemy may deal contact damage again. */
  readonly contactCooldown: Uint16Array;
  /** Ticks remaining until a player-authored damage zone may hurt this enemy again. */
  readonly zoneDamageCooldown: Uint16Array;
  readonly archetype: Uint8Array;
  readonly xpDrop: Float32Array;
  /** 1 = marked target (for markedThenNearest policy). */
  readonly marked: Uint8Array;
}

export interface ProjectilePool extends PoolBase {
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly damage: Float32Array;
  /** Remaining lifetime in ticks. */
  readonly lifetime: Uint16Array;
  readonly hitRadius: Float32Array;
  /** Remaining pierce count. 0 = despawn on next hit. */
  readonly pierce: Uint8Array;
  /** Number of unique enemy ids already struck by this projectile. */
  readonly hitCount: Uint16Array;
  /** Flat per-slot history; only the first hitCount entries are meaningful. */
  readonly hitHistory: Int32Array;
  /** 0 = player faction, 1 = enemy faction. */
  readonly faction: Uint8Array;
  /** 1 when this projectile's authored emission rolled critical. */
  readonly critical: Uint8Array;
  /** Stable compact damage-source role; see combat-resolution.ts. */
  readonly source: Uint8Array;
}

export interface PickupPool extends PoolBase {
  /** Stable compact pickup kind; XP is always 0 for this XP-only pool. */
  readonly kind: Uint8Array;
  readonly xp: Float32Array;
  readonly radius: Float32Array;
}

/**
 * Bounded non-XP world pickup pool. Keeping these separate from XP motes
 * ensures a rare Bomb, Magnet, or Food token can never be dropped because a
 * dense kill wave temporarily filled the XP pool.
 */
export interface PowerPickupPool extends PoolBase {
  /** Stable compact pickup kind; see POWER_PICKUP_KIND in pickups.ts. */
  readonly kind: Uint8Array;
  /** Authored effect amount; zero selects the deterministic kind default. */
  readonly amount: Float32Array;
  readonly radius: Float32Array;
}

/**
 * Persistent player-authored damage zone. Zones are deliberately compact and
 * renderer-agnostic: tag is a stable numeric role rather than a string so the
 * fixed pool can be hashed and projected without per-tick allocation.
 *
 * This first slice supports damaging pads only. It has no slow, mark, or
 * debuff component, so enemy movement remains wholly owned by combat/behavior.
 */
export interface ZonePool extends PoolBase {
  readonly radius: Float32Array;
  /** Damage dealt on each scheduled pulse. */
  readonly damage: Float32Array;
  /** Remaining active simulation ticks. */
  readonly lifetime: Uint16Array;
  /** Fixed number of ticks between two pulses. */
  readonly intervalTicks: Uint16Array;
  /** Number of skipped ticks before the next pulse; zero means pulse now. */
  readonly pulseCooldown: Uint16Array;
  /** Stable numeric visual/gameplay role; see ZONE_TAG in zones.ts. */
  readonly tag: Uint8Array;
  /** 1 when this zone's placement emission rolled critical. */
  readonly critical: Uint8Array;
  /** Stable compact damage-source role; see combat-resolution.ts. */
  readonly source: Uint8Array;
}

/**
 * Pool handle. spawn() returns a slot index (NOT an id) or -1 when full.
 * Callers write component data to the slot, then use idOf(slot) for stable refs.
 */
export interface Pool<P extends PoolBase> {
  readonly data: P;
  spawn(): number;
  despawn(slotIndex: number): void;
  idOf(slotIndex: number): EntityId;
  /** Slot for a live id, or -1 if the id is stale or dead. */
  slotOf(id: EntityId): number;
  isLive(id: EntityId): boolean;
}

// ---------------------------------------------------------------------------
// Spatial grid (Agent B) — 2D uniform grid over world bounds.
// ---------------------------------------------------------------------------

export interface SpatialGrid {
  insert(id: EntityId, x: number, y: number): void;
  /** Move an inserted id. Positions outside world bounds are clamped to edge cells. */
  update(id: EntityId, x: number, y: number): void;
  remove(id: EntityId): void;
  clear(): void;
  /**
   * Fill `out` with ids whose stored position is within `radius` of (x, y),
   * sorted ascending by id. Returns the count. `out.length` is set to count.
   */
  queryRadius(x: number, y: number, radius: number, out: EntityId[]): number;
  /**
   * Nearest id within maxRadius, ties broken by lowest id. NO_ENTITY if none.
   * `exclude` (if given) returning true skips that id.
   */
  nearest(x: number, y: number, maxRadius: number, exclude?: (id: EntityId) => boolean): EntityId;
  /** Total queries served (diagnostic; excluded from state hash). */
  readonly queryCount: number;
}

// ---------------------------------------------------------------------------
// Targeting (Agent C) — pure functions, deterministic ties (lowest id wins).
// ---------------------------------------------------------------------------

export const TARGETING_POLICIES = [
  'nearest',
  'highestHealth',
  'densestCluster',
  'markedThenNearest',
  'rearThreat',
] as const;
export type TargetingPolicy = (typeof TARGETING_POLICIES)[number];

export interface TargetContext {
  originX: number;
  originY: number;
  range: number;
  /** Player movement direction; may be (0,0) when standing still. */
  moveDirX: number;
  moveDirY: number;
}

/**
 * Returns a live enemy EntityId or NO_ENTITY. Must only consider enemies that
 * are alive, within ctx.range of origin, and must break all ties by lowest id.
 * 'rearThreat' with zero movement falls back to 'nearest'.
 * 'markedThenNearest' prefers the lowest-id marked enemy in range, else nearest.
 * 'densestCluster' picks the in-range enemy with the most in-range neighbors
 * within config.weapon.clusterRadius of it (count via grid), ties by lowest id.
 */
export type SelectTarget = (
  policy: TargetingPolicy,
  ctx: TargetContext,
  enemies: Pool<EnemyPool>,
  grid: SpatialGrid,
  clusterRadius: number,
) => EntityId;

// ---------------------------------------------------------------------------
// Waves (Agent C)
// ---------------------------------------------------------------------------

export interface EnemyArchetype {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  touchDamage: number;
  xpDrop: number;
}

export interface EliteEvent {
  /** Absolute tick at which the elite spawns (deterministic). */
  tick: number;
  /** Index into config.archetypes. */
  archetype: number;
  hpMultiplier: number;
}

export interface WaveSegment {
  startTick: number;
  /** Exclusive. */
  endTick: number;
  spawnIntervalTicks: number;
  /** Index-aligned with config.archetypes. */
  archetypeWeights: readonly number[];
  /** Director must not push live enemy count above this. */
  maxAlive: number;
  elites?: readonly EliteEvent[];
}

/**
 * spawnFn places one enemy of the given archetype (hp scaled by hpMultiplier)
 * at a deterministic position derived from rng; returns false when the pool is
 * full. The director MUST skip safely on false — never corrupt state or throw.
 */
export interface WaveDirector {
  step(tick: number, rng: Rng, aliveEnemies: number, spawnFn: (archetype: number, hpMultiplier: number) => boolean): void;
  /** Diagnostics; excluded from state hash. */
  readonly spawnAttempts: number;
  readonly spawnRejections: number;
}

// ---------------------------------------------------------------------------
// Player, events, simulation (Agent D / lead)
// ---------------------------------------------------------------------------

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  pickupRadius: number;
  xp: number;
  level: number;
  /** Ticks of contact-damage immunity remaining. */
  invulnTicks: number;
  alive: boolean;
  /** Base chance in [0, 1] that a player-authored attack crits. */
  critChance?: number;
  /** Critical damage multiplier; defaults to 2 when absent for old callers. */
  critMultiplier?: number;
  /** Incoming-hit avoidance chance in [0, 1]. */
  dodgeChance?: number;
  /** Non-negative armor rating; resolver converts it to diminishing reduction. */
  armor?: number;
  /** Current rechargeable shield health. */
  shield?: number;
  /** Maximum rechargeable shield health. */
  shieldMax?: number;
  /** Ticks after shield damage before regeneration may resume. */
  shieldRechargeDelayTicks?: number;
  /** Mutable remaining recharge delay. */
  shieldRechargeTicksRemaining?: number;
  /** Shield restored each advancing simulation tick after the delay. */
  shieldRechargePerTick?: number;
}

/** Per-tick gameplay events, reset each step. */
export interface SimEvents {
  /** Levels reached this tick, in order (e.g. [2] or [2,3]). */
  levelUps: number[];
  kills: number;
  pickupsCollected: number;
  enemiesSpawned: number;
  /** Hostile projectiles emitted by enemy behavior this tick. */
  enemyProjectilesFired: number;
  /** Player and trait projectiles emitted this tick. */
  projectilesFired: number;
  /** Non-XP world pickups consumed this tick. */
  powerPickupsCollected: number;
  /** Screen-clearing Bomb pickups resolved this tick. */
  bombsTriggered: number;
  /** Map-wide Magnet pickups resolved this tick. */
  magnetsTriggered: number;
  /** Food pickups consumed this tick. */
  foodCollected: number;
}

export interface TickInput {
  /** Movement intent, each in [-1, 1]; normalized internally if length > 1. */
  moveX: number;
  moveY: number;
  paused: boolean;
}

// ---------------------------------------------------------------------------
// Replay (Agent A)
// ---------------------------------------------------------------------------

export interface UpgradeSelection {
  /** Simulation tick at which this typed run upgrade or free fusion was selected. */
  tick: number;
  kind: 'trait' | 'universal' | 'essence' | 'fusion';
  /** Stable prefixed key, for example `trait:porcupine-quills` or `fusion:thornstorm-mantle`. */
  id: string;
}

export interface ReplayRecord {
  seed: number;
  configVersion: number;
  /** Canonical fingerprint of every gameplay-affecting configuration value. */
  configFingerprint: string;
  /** Canonical trait-catalog fingerprint, or null when traits are disabled. */
  traitCatalogFingerprint: string | null;
  /** Canonical universal-upgrade catalog fingerprint, or null when disabled. */
  universalUpgradeCatalogFingerprint: string | null;
  /** Canonical authored run fingerprint, or null when the run director is disabled. */
  runContentFingerprint: string | null;
  /** Canonical permanent loadout fingerprint used to start this run. */
  runStartLoadoutFingerprint: string;
  inputs: TickInput[];
  /** Typed choices in selection order; ticks must be nondecreasing. */
  upgradeSelections: UpgradeSelection[];
}

// ---------------------------------------------------------------------------
// State hashing (Agent A) — canonical byte-stream writer, order fixed by caller.
// ---------------------------------------------------------------------------

export interface HashWriter {
  u8(v: number): void;
  u16(v: number): void;
  u32(v: number): void;
  i32(v: number): void;
  /** Hashes the exact IEEE-754 float32 bit pattern. */
  f32(v: number): void;
  f64(v: number): void;
  str(s: string): void;
  /** 16-hex-char digest. Callable once; writer is spent afterwards. */
  digestHex(): string;
}
