/**
 * Agent A — produces app-owned RenderSnapshot objects (see ../contracts.ts)
 * from live simulation state. Snapshots are flat, preallocated, read-only
 * copies: nothing here ever writes to the simulation's live typed arrays.
 */
import type { CategorySnapshot, RenderSnapshot, ViewCategory } from '../contracts';
import { powerPickupCapacityForXpCap } from '@sim';
import type {
  PickupPool,
  Pool,
  PowerPickupPool,
  ProjectilePool,
  SimConfig,
  Simulation,
  ZonePool,
} from '@sim';

/** Projectiles have no radius field in the sim pool; used only for the view. */
const PROJECTILE_VIEW_RADIUS = 3;

function createCategorySnapshot(category: ViewCategory, capacity: number): CategorySnapshot {
  return {
    category,
    count: 0,
    id: new Int32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    hp: new Float32Array(capacity),
    maxHp: new Float32Array(capacity),
    archetype: new Uint8Array(capacity),
    role: new Uint8Array(capacity),
    marked: new Uint8Array(capacity),
  };
}

/**
 * Allocates a RenderSnapshot with each CategorySnapshot buffer preallocated
 * to the matching pool capacity. Buffers are reused every tick thereafter —
 * never resized in the steady-state loop.
 */
export function createSnapshot(config: SimConfig): RenderSnapshot {
  return {
    tick: 0,
    playerX: 0,
    playerY: 0,
    playerRadius: 0,
    playerPickupRadius: config.player.pickupRadius,
    playerHp: 0,
    playerMaxHp: 0,
    playerXp: 0,
    playerLevel: 1,
    playerAlive: false,
    enemies: createCategorySnapshot('enemy', config.enemyCap),
    projectiles: createCategorySnapshot('projectile', config.projectileCap),
    pickups: createCategorySnapshot('pickup', config.pickupCap),
    powerPickups: createCategorySnapshot('powerPickup', powerPickupCapacityForXpCap(config.pickupCap)),
    zones: createCategorySnapshot('zone', config.zoneCap),
  };
}

function captureEnemies(out: CategorySnapshot, sim: Simulation): void {
  const pool = sim.enemies;
  const data = pool.data;
  let n = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] !== 1) continue;
    out.id[n] = pool.idOf(slot);
    out.x[n] = data.posX[slot]!;
    out.y[n] = data.posY[slot]!;
    out.radius[n] = data.radius[slot]!;
    out.hp[n] = data.hp[slot]!;
    out.maxHp[n] = data.maxHp[slot]!;
    out.archetype[n] = data.archetype[slot]!;
    out.role[n] = sim.enemyPresentationRole(out.id[n]!);
    out.marked[n] = data.marked[slot]!;
    n++;
  }
  out.count = n;
}

function captureProjectiles(out: CategorySnapshot, pool: Pool<ProjectilePool>): void {
  const data = pool.data;
  let n = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] !== 1) continue;
    out.id[n] = pool.idOf(slot);
    out.x[n] = data.posX[slot]!;
    out.y[n] = data.posY[slot]!;
    out.radius[n] = PROJECTILE_VIEW_RADIUS;
    out.hp[n] = 0;
    out.maxHp[n] = 0;
    out.archetype[n] = 0;
    out.role[n] = data.faction[slot]!;
    out.marked[n] = 0;
    n++;
  }
  out.count = n;
}

function capturePickups(out: CategorySnapshot, pool: Pool<PickupPool>): void {
  const data = pool.data;
  let n = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] !== 1) continue;
    out.id[n] = pool.idOf(slot);
    out.x[n] = data.posX[slot]!;
    out.y[n] = data.posY[slot]!;
    out.radius[n] = data.radius[slot]!;
    out.hp[n] = 0;
    out.maxHp[n] = 0;
    out.archetype[n] = 0;
    out.role[n] = 0;
    out.marked[n] = 0;
    n++;
  }
  out.count = n;
}

/**
 * Copies rare in-world token positions and their compact authoritative kind.
 * This is a one-way presentation copy: the renderer never sees a writable
 * pool or a callback that could change token collection, drops, or RNG.
 */
function capturePowerPickups(out: CategorySnapshot, pool: Pool<PowerPickupPool>): void {
  const data = pool.data;
  let n = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] !== 1) continue;
    out.id[n] = pool.idOf(slot);
    out.x[n] = data.posX[slot]!;
    out.y[n] = data.posY[slot]!;
    out.radius[n] = data.radius[slot]!;
    out.hp[n] = 0;
    out.maxHp[n] = 0;
    out.archetype[n] = 0;
    out.role[n] = data.kind[slot]!;
    out.marked[n] = 0;
    n++;
  }
  out.count = n;
}

/** Copies only authoritative live pads, including their compact renderer role. */
function captureZones(out: CategorySnapshot, pool: Pool<ZonePool>): void {
  const data = pool.data;
  let n = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] !== 1) continue;
    out.id[n] = pool.idOf(slot);
    out.x[n] = data.posX[slot]!;
    out.y[n] = data.posY[slot]!;
    out.radius[n] = data.radius[slot]!;
    out.hp[n] = 0;
    out.maxHp[n] = 0;
    out.archetype[n] = 0;
    out.role[n] = data.tag[slot]!;
    out.marked[n] = 0;
    n++;
  }
  out.count = n;
}

/**
 * Fills `out` IN PLACE from the simulation's current state. Read-only with
 * respect to `sim` — never writes to any sim array. Allocation-free: reuses
 * `out`'s existing typed-array buffers.
 */
export function captureSnapshot(out: RenderSnapshot, sim: Simulation): void {
  out.tick = sim.tick;
  out.playerX = sim.player.x;
  out.playerY = sim.player.y;
  out.playerRadius = sim.player.radius;
  out.playerPickupRadius = sim.player.pickupRadius;
  out.playerHp = sim.player.hp;
  out.playerMaxHp = sim.player.maxHp;
  out.playerXp = sim.player.xp;
  out.playerLevel = sim.player.level;
  out.playerAlive = sim.player.alive;

  captureEnemies(out.enemies, sim);
  captureProjectiles(out.projectiles, sim.projectiles);
  capturePickups(out.pickups, sim.pickups);
  capturePowerPickups(out.powerPickups, sim.powerPickups);
  captureZones(out.zones, sim.zones);
}
