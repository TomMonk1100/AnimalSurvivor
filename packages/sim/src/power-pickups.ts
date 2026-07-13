/** Deterministic non-XP world pickup rules. */
import type {
  EnemyPool,
  PlayerState,
  Pool,
  PowerPickupPool,
  PickupPool,
  SimEvents,
} from './types.js';
import type { CombatDamageResolver, ResolvedOutgoingDamage } from './combat-resolution.js';

/** XP remains in the dense dedicated pool; these occupy the sparse power pool. */
export const POWER_PICKUP_KIND = Object.freeze({
  xp: 0,
  bomb: 1,
  magnet: 2,
  food: 3,
} as const);

export type PowerPickupKind = keyof typeof POWER_PICKUP_KIND;

export const DEFAULT_POWER_PICKUP_RADIUS = 12;
export const DEFAULT_FOOD_HEAL_FRACTION = 0.25;
export const DEFAULT_BOMB_BOSS_MAX_HP_FRACTION = 0.2;
/** One dedicated integer draw per eligible normal death. */
export const POWER_PICKUP_DROP_ROLL_RANGE = 1_000;

/**
 * Sparse, tuneable default death table. Food is most common so runs gain a
 * recovery valve; Bomb remains memorable rather than a routine screen wipe.
 * The caller owns RNG isolation and capacity rejection.
 */
export function powerPickupKindForDeathRoll(
  roll: number,
  boss = false,
): Exclude<PowerPickupKind, 'xp'> | null {
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= POWER_PICKUP_DROP_ROLL_RANGE) {
    throw new RangeError(`power pickup death roll must be an integer in [0, ${POWER_PICKUP_DROP_ROLL_RANGE})`);
  }
  if (boss) return 'magnet';
  if (roll < 4) return 'bomb'; // 0.4%
  if (roll < 12) return 'magnet'; // 0.8%
  if (roll < 32) return 'food'; // 2.0%
  return null;
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function kindCode(kind: PowerPickupKind): number {
  return POWER_PICKUP_KIND[kind];
}

export function powerPickupKindFromCode(code: number): PowerPickupKind | null {
  switch (code) {
    case POWER_PICKUP_KIND.bomb: return 'bomb';
    case POWER_PICKUP_KIND.magnet: return 'magnet';
    case POWER_PICKUP_KIND.food: return 'food';
    default: return null;
  }
}

/**
 * Collection priority is gameplay-visible when several tokens overlap. Bombs
 * resolve before Magnets so a same-tick Magnet vacuums the Bomb's freshly
 * dropped XP regardless of the sparse pool slot in which either token lives.
 */
function collectionPriority(kind: PowerPickupKind | null): number {
  switch (kind) {
    case 'bomb': return 0;
    case 'magnet': return 1;
    case 'food': return 2;
    default: return 3;
  }
}

/**
 * Keep rare power tokens independent from the dense XP pool without exposing
 * a new authored config field yet. The cap is deterministic for any config
 * and sufficient for a small world-pickup spawn cadence.
 */
export function powerPickupCapacityForXpCap(xpPickupCap: number): number {
  if (!Number.isSafeInteger(xpPickupCap) || xpPickupCap < 1) {
    throw new RangeError('xp pickup cap must be a positive safe integer');
  }
  return Math.max(8, Math.min(32, Math.ceil(xpPickupCap / 16)));
}

export function spawnPowerPickup(
  pickups: Pool<PowerPickupPool>,
  kind: Exclude<PowerPickupKind, 'xp'>,
  x: number,
  y: number,
  amount = 0,
  radius = DEFAULT_POWER_PICKUP_RADIUS,
): boolean {
  finiteNonNegative('power pickup amount', amount);
  finiteNonNegative('power pickup radius', radius);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('power pickup position must be finite');
  }
  const slot = pickups.spawn();
  if (slot < 0) return false;
  const data = pickups.data;
  data.kind[slot] = kindCode(kind);
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.amount[slot] = amount;
  data.radius[slot] = radius;
  return true;
}

export interface PowerPickupCollectionContext {
  readonly powerPickups: Pool<PowerPickupPool>;
  readonly xpPickups: Pool<PickupPool>;
  readonly player: PlayerState;
  readonly enemies: Pool<EnemyPool>;
  /** Performs grid/director/pickup cleanup for a killed enemy. */
  /** `true` suppresses a fresh special drop (used for Bomb chain kills). */
  readonly killEnemy: (slot: number, suppressPowerPickupDrop?: boolean) => void;
  /** Bosses survive a bomb but take a meaningful capped max-HP hit. */
  readonly isBoss?: (slot: number) => boolean;
  readonly combat: CombatDamageResolver;
  readonly events: SimEvents;
  readonly xpMultiplier?: number;
  readonly bombBossMaxHpFraction?: number;
}

/**
 * Processes tokens by deterministic Bomb → Magnet → Food priority, then
 * fixed slot order within each kind. A Magnet consumes every XP mote once in
 * the same pass. A Bomb kills non-boss live enemies; bosses take a capped
 * max-HP percentage instead of being trivially erased.
 */
export function collectPowerPickups(context: PowerPickupCollectionContext): void {
  const {
    powerPickups,
    xpPickups,
    player,
    enemies,
    killEnemy,
    combat,
    events,
  } = context;
  const xpMultiplier = context.xpMultiplier ?? 1;
  const bossFraction = context.bombBossMaxHpFraction ?? DEFAULT_BOMB_BOSS_MAX_HP_FRACTION;
  if (!Number.isFinite(xpMultiplier) || xpMultiplier <= 0) {
    throw new RangeError('power pickup XP multiplier must be finite and positive');
  }
  if (!Number.isFinite(bossFraction) || bossFraction < 0 || bossFraction > 1) {
    throw new RangeError('bomb boss max-HP fraction must be in [0, 1]');
  }
  if (!player.alive) return;

  const power = powerPickups.data;
  for (let priority = 0; priority <= 3; priority++) {
    for (let pickupSlot = 0; pickupSlot < power.capacity; pickupSlot++) {
      if (power.alive[pickupSlot] !== 1) continue;
      const kind = powerPickupKindFromCode(power.kind[pickupSlot]!);
      if (collectionPriority(kind) !== priority) continue;
      const radius = power.radius[pickupSlot]!;
      const dx = player.x - power.posX[pickupSlot]!;
      const dy = player.y - power.posY[pickupSlot]!;
      const range = player.pickupRadius + radius;
      if (dx * dx + dy * dy > range * range) continue;

      const x = power.posX[pickupSlot]!;
      const y = power.posY[pickupSlot]!;
      const amount = power.amount[pickupSlot]!;
      powerPickups.despawn(pickupSlot);
      events.powerPickupsCollected++;

      switch (kind) {
        case 'bomb': {
          let affected = 0;
          const enemyData = enemies.data;
          for (let enemySlot = 0; enemySlot < enemyData.capacity; enemySlot++) {
            if (enemyData.alive[enemySlot] !== 1) continue;
            if (context.isBoss?.(enemySlot) === true) {
              // A Bomb is a screen-clear for the regular swarm, while a boss
              // always survives its capped hit. Keeping one health minimum
              // makes the documented boss exception true even at low health.
              const maxNonLethalDamage = Math.max(0, enemyData.hp[enemySlot]! - 1);
              const bossDamage: ResolvedOutgoingDamage = {
                amount: Math.fround(Math.min(
                  enemyData.maxHp[enemySlot]! * bossFraction,
                  maxNonLethalDamage,
                )),
                critical: false,
              };
              if (bossDamage.amount > 0) combat.damageEnemy(enemies, enemySlot, bossDamage, 'world-bomb');
              affected++;
              continue;
            }
            const lethal: ResolvedOutgoingDamage = {
              amount: Math.max(0, enemyData.hp[enemySlot]!),
              critical: false,
            };
            if (combat.damageEnemy(enemies, enemySlot, lethal, 'world-bomb')) {
              killEnemy(enemySlot, true);
            }
            affected++;
          }
          events.bombsTriggered++;
          combat.emitPickup(x, y, 'world-bomb', 'bomb', affected);
          break;
        }
        case 'magnet': {
          let collectedXp = 0;
          const xp = xpPickups.data;
          for (let xpSlot = 0; xpSlot < xp.capacity; xpSlot++) {
            if (xp.alive[xpSlot] !== 1) continue;
            const gained = xp.xp[xpSlot]! * xpMultiplier;
            player.xp += gained;
            collectedXp += gained;
            xpPickups.despawn(xpSlot);
            events.pickupsCollected++;
          }
          events.magnetsTriggered++;
          combat.emitPickup(x, y, 'world-magnet', 'magnet', collectedXp);
          break;
        }
        case 'food': {
          const intended = amount > 0 ? amount : player.maxHp * DEFAULT_FOOD_HEAL_FRACTION;
          const healed = combat.healPlayer(intended, 'world-food');
          events.foodCollected++;
          combat.emitPickup(x, y, 'world-food', 'food', healed);
          break;
        }
        default:
          // Corrupted/directly-mutated power slots are safely consumed with no
          // gameplay effect rather than accidentally becoming a hidden XP gain.
          break;
      }
    }
  }
}
