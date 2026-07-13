/**
 * Deterministic persistent damage zones.
 *
 * Zones are fixed-pool, fixed-slot-order pads. A zone can only pulse damage;
 * it intentionally has no slow, status, or movement side effects. This keeps
 * All current V1 zones are damage-only. Stinkcloud uses the same truthful
 * damage footprint until a separate status/debuff system is designed.
 */
import type { EnemyPool, EntityId, Pool, SpatialGrid, ZonePool } from './types.js';

/** Compact stable role values exposed to app-side snapshot/render integration. */
export const ZONE_TAG = Object.freeze({
  none: 0,
  geckoPad: 1,
  razorstepScythePad: 2,
  stinkCloud: 3,
  royalStink: 4,
} as const);

export type ZoneTag = (typeof ZONE_TAG)[keyof typeof ZONE_TAG];

/**
 * Translate authored command tags exactly once at command execution time.
 * `sticky-trail` remains a compatibility alias for the previously authored
 * Gecko content; new content should emit `gecko-pad` or
 * `razorstep-scythe-pad`.
 */
export function zoneTagFromCommandTag(tag: string): ZoneTag | null {
  switch (tag) {
    case 'gecko-pad':
    case 'sticky-trail':
      return ZONE_TAG.geckoPad;
    case 'razorstep-scythe-pad':
      return ZONE_TAG.razorstepScythePad;
    case 'stink-cloud':
      return ZONE_TAG.stinkCloud;
    case 'royal-stink':
      return ZONE_TAG.royalStink;
    default:
      return null;
  }
}

export interface ZoneStepContext {
  readonly enemies: Pool<EnemyPool>;
  readonly enemyGrid: SpatialGrid;
  /** Simulation-owned cleanup preserves XP drops, elite/boss state, and events. */
  readonly killEnemy: (slot: number) => void;
}

export interface ZoneStepStats {
  zonesStepped: number;
  zonesExpired: number;
  pulses: number;
  areaDamageHits: number;
  enemiesKilled: number;
}

export interface ZoneStepper {
  /** The returned stats object is reused and overwritten by the next call. */
  step(zones: Pool<ZonePool>, context: ZoneStepContext): ZoneStepStats;
}

function resetStats(stats: ZoneStepStats): void {
  stats.zonesStepped = 0;
  stats.zonesExpired = 0;
  stats.pulses = 0;
  stats.areaDamageHits = 0;
  stats.enemiesKilled = 0;
}

/**
 * Creates an allocation-stable stepper. Slots are processed in ascending
 * index order; each grid query already returns ids in ascending order. Thus
 * overlapping pads resolve hits and kills deterministically.
 */
export function createZoneStepper(): ZoneStepper {
  const scratch: EntityId[] = [];
  const stats: ZoneStepStats = {
    zonesStepped: 0,
    zonesExpired: 0,
    pulses: 0,
    areaDamageHits: 0,
    enemiesKilled: 0,
  };

  return {
    step(zones, context) {
      resetStats(stats);
      const enemyData = context.enemies.data;
      // This is deliberately outside the zone loop: a target's cooldown
      // advances once per simulation tick no matter how many pads are live.
      for (let enemySlot = 0; enemySlot < enemyData.capacity; enemySlot++) {
        if (enemyData.alive[enemySlot] === 1 && enemyData.zoneDamageCooldown[enemySlot]! > 0) {
          enemyData.zoneDamageCooldown[enemySlot] = enemyData.zoneDamageCooldown[enemySlot]! - 1;
        }
      }

      const data = zones.data;
      for (let slot = 0; slot < data.capacity; slot++) {
        if (data.alive[slot] !== 1) continue;
        stats.zonesStepped++;

        // A malformed/directly-mutated zero-lifetime zone is cleanly removed
        // without a pulse. Authored spawn validation never creates one.
        if (data.lifetime[slot] === 0) {
          zones.despawn(slot);
          stats.zonesExpired++;
          continue;
        }

        if (data.pulseCooldown[slot] === 0) {
          stats.pulses++;
          const count = context.enemyGrid.queryRadius(
            data.posX[slot]!,
            data.posY[slot]!,
            data.radius[slot]!,
            scratch,
          );
          for (let index = 0; index < count; index++) {
            const enemySlot = context.enemies.slotOf(scratch[index]!);
            if (enemySlot < 0) continue;
            // An enemy may receive one zone hit, then ignores any other
            // overlapping zone pulses until the winning pad's next authored
            // cadence interval. Slot order still makes the winner deterministic.
            if (enemyData.zoneDamageCooldown[enemySlot]! > 0) continue;
            enemyData.hp[enemySlot] = enemyData.hp[enemySlot]! - data.damage[slot]!;
            enemyData.zoneDamageCooldown[enemySlot] = data.intervalTicks[slot]!;
            stats.areaDamageHits++;
            if (enemyData.hp[enemySlot]! <= 0) {
              context.killEnemy(enemySlot);
              stats.enemiesKilled++;
            }
          }
          // `pulseCooldown` stores skipped ticks. With interval 1 it remains
          // zero and pulses every tick; otherwise the next pulse is exactly
          // intervalTicks advancing ticks later.
          data.pulseCooldown[slot] = data.intervalTicks[slot]! - 1;
        } else {
          data.pulseCooldown[slot] = data.pulseCooldown[slot]! - 1;
        }

        data.lifetime[slot] = data.lifetime[slot]! - 1;
        if (data.lifetime[slot] === 0) {
          zones.despawn(slot);
          stats.zonesExpired++;
        }
      }
      return stats;
    },
  };
}
