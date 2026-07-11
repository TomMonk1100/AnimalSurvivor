/**
 * Agent C — combat systems: enemy movement/contact damage, projectile
 * movement/collision, pickup collection, xp thresholds, projectile spawning.
 * Pure functions against the frozen interfaces in ./types.js.
 */
import type {
  EnemyPool,
  EntityId,
  PickupPool,
  PlayerState,
  Pool,
  ProjectilePool,
  SimEvents,
  SpatialGrid,
} from './types.js';
import type { WeaponConfig } from './config.js';

// Module-level scratch array reused across calls (allocation-light hot path).
const hitScratch: EntityId[] = [];

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function stepEnemies(
  enemies: Pool<EnemyPool>,
  grid: SpatialGrid,
  player: PlayerState,
  dt: number,
  worldWidth: number,
  worldHeight: number,
  contactCooldownTicks: number,
  invulnTicksOnHit: number,
): void {
  const data = enemies.data;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;

    if (data.contactCooldown[slot]! > 0) {
      data.contactCooldown[slot]!--;
    }

    let x = data.posX[slot]!;
    let y = data.posY[slot]!;
    const dx = player.x - x;
    const dy = player.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let velX = 0;
    let velY = 0;
    if (dist >= 1e-6) {
      const invDist = 1 / dist;
      const dirX = dx * invDist;
      const dirY = dy * invDist;
      velX = dirX * data.speed[slot]!;
      velY = dirY * data.speed[slot]!;
      x += velX * dt;
      y += velY * dt;
    }
    if (x < 0) x = 0;
    else if (x > worldWidth) x = worldWidth;
    if (y < 0) y = 0;
    else if (y > worldHeight) y = worldHeight;

    data.posX[slot] = x;
    data.posY[slot] = y;
    data.velX[slot] = velX;
    data.velY[slot] = velY;

    const id = enemies.idOf(slot);
    grid.update(id, x, y);

    if (
      player.alive &&
      distSqLE(x, y, player.x, player.y, data.radius[slot]! + player.radius) &&
      data.contactCooldown[slot] === 0 &&
      player.invulnTicks === 0
    ) {
      player.hp = Math.max(0, player.hp - data.touchDamage[slot]!);
      data.contactCooldown[slot] = contactCooldownTicks;
      player.invulnTicks = invulnTicksOnHit;
      if (player.hp === 0) {
        player.alive = false;
      }
    }
  }
}

function distSqLE(ax: number, ay: number, bx: number, by: number, maxDist: number): boolean {
  return distSq(ax, ay, bx, by) <= maxDist * maxDist;
}

export function stepProjectiles(
  projectiles: Pool<ProjectilePool>,
  enemies: Pool<EnemyPool>,
  enemyGrid: SpatialGrid,
  dt: number,
  worldWidth: number,
  worldHeight: number,
  maxEnemyRadius: number,
  events: SimEvents,
  killEnemy: (enemySlot: number) => void,
): void {
  const pdata = projectiles.data;
  const edata = enemies.data;
  for (let slot = 0; slot < pdata.capacity; slot++) {
    if (pdata.alive[slot] === 0) continue;

    const x = pdata.posX[slot]! + pdata.velX[slot]! * dt;
    const y = pdata.posY[slot]! + pdata.velY[slot]! * dt;
    pdata.posX[slot] = x;
    pdata.posY[slot] = y;

    pdata.lifetime[slot] = pdata.lifetime[slot]! - 1;

    const expired = pdata.lifetime[slot]! <= 0;
    const outOfBounds = x < 0 || x > worldWidth || y < 0 || y > worldHeight;
    if (expired || outOfBounds) {
      projectiles.despawn(slot);
      continue;
    }

    // Only faction 0 (player) projectiles hit enemies; faction 1 is a hook
    // reserved for future enemy projectiles.
    if (pdata.faction[slot] !== 0) continue;

    const queryRadius = pdata.hitRadius[slot]! + maxEnemyRadius;
    const count = enemyGrid.queryRadius(x, y, queryRadius, hitScratch);
    for (let i = 0; i < count; i++) {
      const id = hitScratch[i]!;
      const eSlot = enemies.slotOf(id);
      if (eSlot < 0) continue;

      const rSum = pdata.hitRadius[slot]! + edata.radius[eSlot]!;
      if (distSq(x, y, edata.posX[eSlot]!, edata.posY[eSlot]!) > rSum * rSum) continue;

      edata.hp[eSlot] = edata.hp[eSlot]! - pdata.damage[slot]!;
      if (edata.hp[eSlot]! <= 0) {
        killEnemy(eSlot);
      }

      if (pdata.pierce[slot]! > 0) {
        pdata.pierce[slot] = pdata.pierce[slot]! - 1;
        continue;
      } else {
        projectiles.despawn(slot);
        break;
      }
    }
  }
}
// KNOWN LIMITATION: a surviving pierced enemy can be re-hit by the same
// projectile on a later tick since we keep no per-projectile hit list in
// this spike. Acceptable for a headless simulation prototype.

export function collectPickups(pickups: Pool<PickupPool>, player: PlayerState, events: SimEvents): void {
  const data = pickups.data;
  // Linear scan: pickup cap is small in this spike, so a spatial grid for
  // pickups is not worth the complexity/allocation tradeoff.
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;
    const maxDist = player.pickupRadius + data.radius[slot]!;
    if (distSq(player.x, player.y, data.posX[slot]!, data.posY[slot]!) <= maxDist * maxDist) {
      player.xp += data.xp[slot]!;
      pickups.despawn(slot);
      events.pickupsCollected++;
    }
  }
}

export function applyXpThresholds(player: PlayerState, xpThresholds: readonly number[], events: SimEvents): void {
  while (player.level - 1 < xpThresholds.length && player.xp >= xpThresholds[player.level - 1]!) {
    player.level++;
    events.levelUps.push(player.level);
  }
}

export function spawnProjectile(
  projectiles: Pool<ProjectilePool>,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  weapon: WeaponConfig,
  faction: number,
): boolean {
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (len < 1e-6) return false;
  const invLen = 1 / len;
  const nx = dirX * invLen;
  const ny = dirY * invLen;

  const slot = projectiles.spawn();
  if (slot < 0) return false;

  const data = projectiles.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.velX[slot] = nx * weapon.projectileSpeed;
  data.velY[slot] = ny * weapon.projectileSpeed;
  data.damage[slot] = weapon.damage;
  data.lifetime[slot] = weapon.lifetimeTicks;
  data.hitRadius[slot] = weapon.hitRadius;
  data.pierce[slot] = weapon.pierce;
  data.faction[slot] = faction;
  return true;
}
