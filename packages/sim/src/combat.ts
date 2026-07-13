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
import { MAX_PROJECTILE_HIT_HISTORY } from './types.js';
import type { EnemyBehaviorConfig, WeaponConfig } from './config.js';
import { ENEMY_BEHAVIOR_KIND, type EnemyBehaviorState } from './enemy-behavior.js';
import {
  COMBAT_DAMAGE_SOURCE,
  combatDamageSourceIdFromCode,
  type CombatDamageResolver,
} from './combat-resolution.js';

// Module-level scratch array reused across calls (allocation-light hot path).
const hitScratch: EntityId[] = [];

function projectileHasHit(projectiles: ProjectilePool, slot: number, enemyId: EntityId): boolean {
  const start = slot * MAX_PROJECTILE_HIT_HISTORY;
  const count = projectiles.hitCount[slot]!;
  for (let index = 0; index < count; index++) {
    if (projectiles.hitHistory[start + index] === enemyId) return true;
  }
  return false;
}

function recordProjectileHit(projectiles: ProjectilePool, slot: number, enemyId: EntityId): void {
  const count = projectiles.hitCount[slot]!;
  if (count >= MAX_PROJECTILE_HIT_HISTORY) return;
  projectiles.hitHistory[slot * MAX_PROJECTILE_HIT_HISTORY + count] = enemyId;
  projectiles.hitCount[slot] = count + 1;
}

/** Optional deterministic behavior layer for the active enemy slice. */
export interface EnemyBehaviorStepOptions {
  readonly state: EnemyBehaviorState;
  readonly config: EnemyBehaviorConfig;
  /** Current fixed simulation tick, never wall-clock time. */
  readonly tick: number;
  readonly projectiles: Pool<ProjectilePool>;
  readonly events: SimEvents;
  /** Authored biome variant for the bespoke apex encounter. */
  readonly bossVariant?: 'forest' | 'saltwind';
  /** Presentation-only cue for a boss attack; never feeds back into combat. */
  readonly onBossCue?: (
    tag: string,
    tick: number,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    radius: number,
    durationTicks: number,
  ) => void;
  /** Presentation-only cue for a support healing pulse. */
  readonly onSupportCue?: (
    tick: number,
    originX: number,
    originY: number,
    radius: number,
    healedCount: number,
  ) => void;
}

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
  behavior?: EnemyBehaviorStepOptions,
  damageResolver?: CombatDamageResolver,
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
      let moveDirX = dirX;
      let moveDirY = dirY;
      let moveSpeedMultiplier = 1;

      if (behavior !== undefined) {
        const kind = behavior.state.kind[slot]!;
        const config = behavior.config;
        const stableSign = (enemies.idOf(slot) & 1) === 0
          ? -1
          : 1;
        const runnerSign = ((Math.floor(behavior.tick / config.runnerWeavePeriodTicks) & 1) === 0)
          ? stableSign
          : -stableSign;
        if (kind === ENEMY_BEHAVIOR_KIND.runnerWeave && dist > config.runnerDirectSeekRange) {
          // A deterministic, bounded zig-zag reads less like a straight-line
          // blob while still converging toward the player.
          const lateral = config.runnerWeaveStrength * runnerSign;
          moveDirX = dirX - dirY * lateral;
          moveDirY = dirY + dirX * lateral;
        } else if (kind === ENEMY_BEHAVIOR_KIND.chargerBurst) {
          const phase = (behavior.tick + (enemies.idOf(slot) & 31)) % 180;
          if (phase < 24) {
            // A brief wind-up followed by a deterministic lunge makes the
            // charger readable as a threat rather than another runner.
            moveDirX = 0;
            moveDirY = 0;
          } else if (phase < 60) {
            moveDirX = dirX * 2.2;
            moveDirY = dirY * 2.2;
            moveSpeedMultiplier = 2.2;
          }
        } else if (kind === ENEMY_BEHAVIOR_KIND.bossApex) {
          const patternTick = behavior.state.bossPatternTick[slot]!;
          const chargeEnd = config.bossChargeWindupTicks + config.bossChargeDurationTicks;
          const saltwind = behavior.bossVariant === 'saltwind';
          if (patternTick === 0) {
            behavior.onBossCue?.(
              saltwind ? 'saltwind-charge' : 'boss-charge',
              behavior.tick,
              x,
              y,
              dirX,
              dirY,
              config.bossPreferredRange,
              config.bossChargeWindupTicks,
            );
          }
          if (patternTick < config.bossChargeWindupTicks) {
            // The stationary wind-up is the boss's readable response interval.
            moveDirX = 0;
            moveDirY = 0;
          } else if (patternTick < chargeEnd) {
            moveDirX = dirX;
            moveDirY = dirY;
            moveSpeedMultiplier = config.bossChargeSpeedMultiplier;
          } else if (patternTick === config.bossVolleyTick) {
            behavior.onBossCue?.(
              saltwind ? 'saltwind-sandstorm' : 'boss-volley',
              behavior.tick,
              x,
              y,
              dirX,
              dirY,
              config.bossPreferredRange + config.bossRangeBand,
              24,
            );
            const volleyCount = saltwind ? Math.max(4, config.bossVolleyCount - 2) : config.bossVolleyCount;
            const angleOffset = saltwind ? Math.PI / volleyCount : 0;
            for (let projectileIndex = 0; projectileIndex < volleyCount; projectileIndex++) {
              const angle = (Math.PI * 2 * projectileIndex) / volleyCount + angleOffset;
              if (spawnProjectileWithStats(
                behavior.projectiles,
                x,
                y,
                Math.cos(angle),
                Math.sin(angle),
                config.bossProjectileSpeed,
                config.bossProjectileDamage,
                config.bossProjectileLifetimeTicks,
                config.bossProjectileHitRadius,
                0,
                1,
              )) {
                behavior.events.enemyProjectilesFired++;
              }
            }
            // Hold position for the volley beat so the radial read has a
            // clean silhouette before the boss returns to spacing behavior.
            moveDirX = 0;
            moveDirY = 0;
          } else {
            const innerRange = Math.max(0, config.bossPreferredRange - config.bossRangeBand);
            const outerRange = config.bossPreferredRange + config.bossRangeBand;
            const bossSign = (enemies.idOf(slot) & 1) === 0 ? -1 : 1;
            if (dist < innerRange) {
              moveDirX = -dirX;
              moveDirY = -dirY;
            } else if (dist <= outerRange) {
              moveDirX = -dirY * bossSign * config.eliteOrbitStrength;
              moveDirY = dirX * bossSign * config.eliteOrbitStrength;
            }
          }
          behavior.state.bossPatternTick[slot] = (patternTick + 1) % config.bossCycleTicks;
        } else if (kind === ENEMY_BEHAVIOR_KIND.flankerOrbit) {
          const flankSign = (enemies.idOf(slot) & 1) === 0 ? -1 : 1;
          if (dist > config.flankerPreferredRange) {
            moveDirX = dirX - dirY * flankSign * config.flankerOrbitStrength;
            moveDirY = dirY + dirX * flankSign * config.flankerOrbitStrength;
          } else {
            moveDirX = -dirY * flankSign;
            moveDirY = dirX * flankSign;
          }
        } else if (kind === ENEMY_BEHAVIOR_KIND.supportPulse) {
          let supportCooldown = behavior.state.hostileShotCooldown[slot]!;
          if (supportCooldown > 0) supportCooldown--;
          if (supportCooldown === 0) {
            let healedCount = 0;
            for (let allySlot = 0; allySlot < data.capacity; allySlot++) {
              if (data.alive[allySlot] === 0) continue;
              const allyDx = data.posX[allySlot]! - x;
              const allyDy = data.posY[allySlot]! - y;
              if (allyDx * allyDx + allyDy * allyDy > config.supportHealRadius * config.supportHealRadius) continue;
              const nextHp = Math.min(data.maxHp[allySlot]!, data.hp[allySlot]! + config.supportHealAmount);
              if (nextHp > data.hp[allySlot]!) {
                data.hp[allySlot] = nextHp;
                healedCount++;
              }
            }
            if (healedCount > 0) {
              behavior.onSupportCue?.(behavior.tick, x, y, config.supportHealRadius, healedCount);
            }
            supportCooldown = config.supportHealIntervalTicks;
          }
          behavior.state.hostileShotCooldown[slot] = supportCooldown;
          const innerRange = Math.max(0, config.supportPreferredRange - config.supportRangeBand);
          const outerRange = config.supportPreferredRange + config.supportRangeBand;
          const supportSign = (enemies.idOf(slot) & 1) === 0 ? -1 : 1;
          if (dist < innerRange) {
            moveDirX = -dirX;
            moveDirY = -dirY;
          } else if (dist <= outerRange) {
            moveDirX = -dirY * supportSign * config.eliteOrbitStrength;
            moveDirY = dirX * supportSign * config.eliteOrbitStrength;
          }
        } else if (
          kind === ENEMY_BEHAVIOR_KIND.eliteSkirmish
          || kind === ENEMY_BEHAVIOR_KIND.spitterSkirmish
        ) {
          const eliteSkirmisher = kind === ENEMY_BEHAVIOR_KIND.eliteSkirmish;
          const innerRange = Math.max(0, config.elitePreferredRange - config.eliteRangeBand);
          const outerRange = config.elitePreferredRange + config.eliteRangeBand;
          if (dist < innerRange) {
            moveDirX = -dirX;
            moveDirY = -dirY;
          } else if (dist <= outerRange) {
            // In-band ranged enemies circle rather than walking straight into Greg.
            moveDirX = -dirY * stableSign * config.eliteOrbitStrength;
            moveDirY = dirX * stableSign * config.eliteOrbitStrength;
          }

          let shotCooldown = behavior.state.hostileShotCooldown[slot]!;
          // The first-shot delay is gameplay time spent threatening Greg, not
          // travel time spent approaching from the off-screen perimeter.
          if (dist <= outerRange) {
            if (shotCooldown > 0) shotCooldown--;
            if (shotCooldown === 0 && player.alive) {
              const fired = spawnProjectileWithStats(
                behavior.projectiles,
                x,
                y,
                dx,
                dy,
                config.eliteProjectileSpeed,
                eliteSkirmisher ? config.eliteProjectileDamage : config.spitterProjectileDamage,
                config.eliteProjectileLifetimeTicks,
                config.eliteProjectileHitRadius,
                0,
                1,
              );
              if (fired) {
                behavior.events.enemyProjectilesFired++;
                shotCooldown = eliteSkirmisher
                  ? config.eliteFireIntervalTicks
                  : config.spitterFireIntervalTicks;
              }
            }
          }
          behavior.state.hostileShotCooldown[slot] = shotCooldown;
        }

        const moveLength = Math.sqrt(moveDirX * moveDirX + moveDirY * moveDirY);
        if (moveLength >= 1e-6) {
          moveDirX /= moveLength;
          moveDirY /= moveLength;
        } else {
          moveDirX = 0;
          moveDirY = 0;
        }
      }

      velX = moveDirX * data.speed[slot]! * moveSpeedMultiplier;
      velY = moveDirY * data.speed[slot]! * moveSpeedMultiplier;
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
      if (damageResolver === undefined) {
        player.hp = Math.max(0, player.hp - data.touchDamage[slot]!);
        player.invulnTicks = invulnTicksOnHit;
        if (player.hp === 0) {
          player.alive = false;
        }
      } else {
        damageResolver.damagePlayer(data.touchDamage[slot]!, 'enemy-contact', invulnTicksOnHit);
      }
      data.contactCooldown[slot] = contactCooldownTicks;
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
  player?: PlayerState,
  invulnTicksOnHit = 0,
  damageResolver?: CombatDamageResolver,
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

    if (pdata.faction[slot] === 1) {
      if (player === undefined) continue;
      const rSum = pdata.hitRadius[slot]! + player.radius;
      if (player.alive && distSq(x, y, player.x, player.y) <= rSum * rSum) {
        if (damageResolver !== undefined) {
          damageResolver.damagePlayer(
            pdata.damage[slot]!,
            combatDamageSourceIdFromCode(pdata.source[slot]!),
            invulnTicksOnHit,
          );
        } else if (player.invulnTicks === 0) {
          player.hp = Math.max(0, player.hp - pdata.damage[slot]!);
          player.invulnTicks = invulnTicksOnHit;
          if (player.hp === 0) player.alive = false;
        }
        projectiles.despawn(slot);
      }
      continue;
    }

    // Only faction 0 (player) projectiles hit enemies. Unknown factions are
    // intentionally inert rather than mutating either combat side.
    if (pdata.faction[slot] !== 0) continue;

    const queryRadius = pdata.hitRadius[slot]! + maxEnemyRadius;
    const count = enemyGrid.queryRadius(x, y, queryRadius, hitScratch);
    for (let i = 0; i < count; i++) {
      const id = hitScratch[i]!;
      const eSlot = enemies.slotOf(id);
      if (eSlot < 0) continue;
      if (projectileHasHit(pdata, slot, id)) continue;

      const rSum = pdata.hitRadius[slot]! + edata.radius[eSlot]!;
      if (distSq(x, y, edata.posX[eSlot]!, edata.posY[eSlot]!) > rSum * rSum) continue;

      recordProjectileHit(pdata, slot, id);
      let killed: boolean;
      if (damageResolver === undefined) {
        edata.hp[eSlot] = edata.hp[eSlot]! - pdata.damage[slot]!;
        killed = edata.hp[eSlot]! <= 0;
      } else {
        killed = damageResolver.damageEnemy(
          enemies,
          eSlot,
          { amount: pdata.damage[slot]!, critical: pdata.critical[slot] === 1 },
          combatDamageSourceIdFromCode(pdata.source[slot]!),
        );
      }
      if (killed) {
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
export function collectPickups(
  pickups: Pool<PickupPool>,
  player: PlayerState,
  events: SimEvents,
  xpMultiplier = 1,
): void {
  if (!Number.isFinite(xpMultiplier) || xpMultiplier <= 0) {
    throw new RangeError('pickup XP multiplier must be finite and positive');
  }
  // A corpse is not a valid pickup target. Keeping this guard in the helper
  // protects direct headless consumers as well as the main simulation loop.
  if (!player.alive) return;
  const data = pickups.data;
  // Linear scan: pickup cap is small in this simulation, so a spatial grid for
  // pickups is not worth the complexity/allocation tradeoff.
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;
    const maxDist = player.pickupRadius + data.radius[slot]!;
    if (distSq(player.x, player.y, data.posX[slot]!, data.posY[slot]!) <= maxDist * maxDist) {
      player.xp += data.xp[slot]! * xpMultiplier;
      pickups.despawn(slot);
      events.pickupsCollected++;
    }
  }
}

/**
 * Moves XP pickups toward the player without consuming them. Attraction is
 * deliberately a separate deterministic pass from collection: callers can
 * give a build a real magnet effect while the existing pickup-radius rule
 * remains the single authority for awarding XP.
 */
export function attractPickups(
  pickups: Pool<PickupPool>,
  player: PlayerState,
  dt: number,
  attractionRadius: number,
  attractionSpeed: number,
): void {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('pickup attraction dt must be finite and non-negative');
  if (!Number.isFinite(attractionRadius) || attractionRadius < 0) {
    throw new RangeError('pickup attraction radius must be finite and non-negative');
  }
  if (!Number.isFinite(attractionSpeed) || attractionSpeed < 0) {
    throw new RangeError('pickup attraction speed must be finite and non-negative');
  }
  if (!player.alive || dt === 0 || attractionRadius === 0 || attractionSpeed === 0) return;

  const data = pickups.data;
  const maxStep = attractionSpeed * dt;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;

    const dx = player.x - data.posX[slot]!;
    const dy = player.y - data.posY[slot]!;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq === 0 || distanceSq > attractionRadius * attractionRadius) continue;

    const distance = Math.sqrt(distanceSq);
    const step = Math.min(maxStep, distance);
    data.posX[slot] = data.posX[slot]! + (dx / distance) * step;
    data.posY[slot] = data.posY[slot]! + (dy / distance) * step;
  }
}

/**
 * Cumulative XP needed to advance from `currentLevel` to the next level.
 * Authored thresholds preserve the hand-tuned early run. Once those are
 * consumed, a quadratic-tail curve continues forever instead of exposing a
 * player-visible level cap. An empty table intentionally disables leveling
 * for small deterministic test configurations.
 */
export function xpRequiredForNextLevel(
  xpThresholds: readonly number[],
  currentLevel: number,
): number | null {
  if (!Number.isSafeInteger(currentLevel) || currentLevel < 1) {
    throw new RangeError('current level must be a positive safe integer');
  }
  if (xpThresholds.length === 0) return null;
  if (currentLevel <= xpThresholds.length) return xpThresholds[currentLevel - 1]!;

  const authoredCount = xpThresholds.length;
  const finalThreshold = xpThresholds[authoredCount - 1]!;
  const lastIncrement = authoredCount === 1
    ? finalThreshold
    : finalThreshold - xpThresholds[authoredCount - 2]!;
  // `tailLevel` starts at 1 for the first threshold after the authored table.
  // The 8-XP triangular increase keeps later levels meaningful without the
  // sudden wall that a pure exponential curve creates in a long survival run.
  const tailLevel = currentLevel - authoredCount;
  return finalThreshold
    + tailLevel * lastIncrement
    + (8 * tailLevel * (tailLevel + 1)) / 2;
}

export function applyXpThresholds(player: PlayerState, xpThresholds: readonly number[], events: SimEvents): void {
  if (!player.alive) return;
  let nextThreshold = xpRequiredForNextLevel(xpThresholds, player.level);
  while (nextThreshold !== null && player.xp >= nextThreshold) {
    player.level++;
    events.levelUps.push(player.level);
    nextThreshold = xpRequiredForNextLevel(xpThresholds, player.level);
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
  critical = false,
  source: number = faction === 1 ? COMBAT_DAMAGE_SOURCE.enemyProjectile : COMBAT_DAMAGE_SOURCE.playerProjectile,
  damage = weapon.damage,
): boolean {
  return spawnProjectileWithStats(
    projectiles,
    x,
    y,
    dirX,
    dirY,
    weapon.projectileSpeed,
    damage,
    weapon.lifetimeTicks,
    weapon.hitRadius,
    weapon.pierce,
    faction,
    critical,
    source,
  );
}

/** Spawn one faction-owned projectile from fully authored scalar stats. */
export function spawnProjectileWithStats(
  projectiles: Pool<ProjectilePool>,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  speed: number,
  damage: number,
  lifetimeTicks: number,
  hitRadius: number,
  pierce: number,
  faction: number,
  critical = false,
  source: number = faction === 1 ? COMBAT_DAMAGE_SOURCE.enemyProjectile : COMBAT_DAMAGE_SOURCE.playerProjectile,
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
  data.velX[slot] = nx * speed;
  data.velY[slot] = ny * speed;
  data.damage[slot] = damage;
  data.lifetime[slot] = lifetimeTicks;
  data.hitRadius[slot] = hitRadius;
  data.pierce[slot] = pierce;
  data.faction[slot] = faction;
  data.critical[slot] = critical ? 1 : 0;
  data.source[slot] = source;
  return true;
}
