/**
 * Central deterministic combat resolution.
 *
 * This module owns the rules shared by every player attack and incoming hit:
 * outgoing crits, dodge, armor, rechargeable shields, healing, and the
 * renderer-facing resolved-hit stream. It deliberately has no renderer
 * dependency. The event buffer is a reusable, bounded view which is excluded
 * from hashes because it never feeds back into authoritative simulation.
 */
import type {
  EnemyPool,
  EntityId,
  PlayerState,
  Pool,
  Rng,
} from './types.js';
import { NO_ENTITY } from './types.js';

export const MAX_COMBAT_PRESENTATION_EVENTS = 192;

/** Compact projectile/zone source codes stored in typed simulation pools. */
export const COMBAT_DAMAGE_SOURCE = Object.freeze({
  unknown: 0,
  playerProjectile: 1,
  traitProjectile: 2,
  enemyProjectile: 3,
  traitZone: 4,
  traitDirect: 5,
  heroAbility: 6,
  heroSpit: 7,
} as const);

export function combatDamageSourceIdFromCode(code: number): string {
  switch (code) {
    case COMBAT_DAMAGE_SOURCE.playerProjectile: return 'player-projectile';
    case COMBAT_DAMAGE_SOURCE.traitProjectile: return 'trait-projectile';
    case COMBAT_DAMAGE_SOURCE.enemyProjectile: return 'enemy-projectile';
    case COMBAT_DAMAGE_SOURCE.traitZone: return 'trait-zone';
    case COMBAT_DAMAGE_SOURCE.traitDirect: return 'trait-direct';
    case COMBAT_DAMAGE_SOURCE.heroAbility: return 'hero-ability';
    case COMBAT_DAMAGE_SOURCE.heroSpit: return 'gracie-spit';
    default: return 'unknown';
  }
}

export const COMBAT_PRESENTATION_EVENT_KIND = Object.freeze({
  enemyHit: 'enemyHit',
  playerHit: 'playerHit',
  heal: 'heal',
  shieldAbsorb: 'shieldAbsorb',
  shieldBreak: 'shieldBreak',
  armorBlock: 'armorBlock',
  dodge: 'dodge',
  pickup: 'pickup',
} as const);

export type CombatPresentationEventKind =
  (typeof COMBAT_PRESENTATION_EVENT_KIND)[keyof typeof COMBAT_PRESENTATION_EVENT_KIND];

/**
 * Read-only event reused after every advancing tick. `targetId` is NO_ENTITY
 * for player/pickup events. `pickupKind` is empty for non-pickup events.
 */
export interface CombatPresentationEventView {
  readonly kind: CombatPresentationEventKind;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  /** Actual resolved amount after crit/armor/shield clamping. */
  readonly amount: number;
  readonly critical: boolean;
  /** Stable authored or system source id (for example `player-projectile`). */
  readonly sourceId: string;
  readonly targetId: EntityId;
  /** `xp`, `bomb`, `magnet`, or `food` for pickup events; empty otherwise. */
  readonly pickupKind: string;
}

type MutableCombatPresentationEvent = {
  -readonly [Key in keyof CombatPresentationEventView]: CombatPresentationEventView[Key];
};

export interface CombatPresentationEventBuffer {
  /** Reused live view. Consumers must copy values they retain past next step. */
  readonly events: readonly CombatPresentationEventView[];
  /** Number of events dropped after the fixed capacity was reached this tick. */
  readonly dropped: number;
  reset(): void;
  push(event: CombatPresentationEventView): void;
}

export function createCombatPresentationEventBuffer(
  capacity = MAX_COMBAT_PRESENTATION_EVENTS,
): CombatPresentationEventBuffer {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('combat presentation event capacity must be a positive safe integer');
  }
  const storage: MutableCombatPresentationEvent[] = Array.from({ length: capacity }, () => ({
    kind: COMBAT_PRESENTATION_EVENT_KIND.enemyHit,
    tick: 0,
    x: 0,
    y: 0,
    amount: 0,
    critical: false,
    sourceId: '',
    targetId: NO_ENTITY,
    pickupKind: '',
  }));
  const events: MutableCombatPresentationEvent[] = [];
  let dropped = 0;

  return {
    get events() {
      return events;
    },
    get dropped() {
      return dropped;
    },
    reset() {
      events.length = 0;
      dropped = 0;
    },
    push(event) {
      const index = events.length;
      if (index >= storage.length) {
        dropped++;
        return;
      }
      const target = storage[index]!;
      target.kind = event.kind;
      target.tick = event.tick;
      target.x = event.x;
      target.y = event.y;
      target.amount = event.amount;
      target.critical = event.critical;
      target.sourceId = event.sourceId;
      target.targetId = event.targetId;
      target.pickupKind = event.pickupKind;
      events.push(target);
    },
  };
}

export interface ResolvedOutgoingDamage {
  readonly amount: number;
  readonly critical: boolean;
}

export interface ResolvedPlayerDamage {
  readonly attempted: boolean;
  readonly dodged: boolean;
  readonly shieldAbsorbed: number;
  readonly healthDamage: number;
  readonly killed: boolean;
}

export interface CombatDamageResolver {
  /** Rolls once per authored attack emission; all pellets in that emission share it. */
  resolveOutgoingDamage(rawDamage: number, sourceId: string): ResolvedOutgoingDamage;
  /** Applies a previously resolved player attack and records its true victim/result. */
  damageEnemy(
    enemies: Pool<EnemyPool>,
    slot: number,
    damage: ResolvedOutgoingDamage,
    sourceId: string,
  ): boolean;
  /** Applies dodge -> armor -> shield -> health and records all visible results. */
  damagePlayer(rawDamage: number, sourceId: string, invulnTicksOnHit: number): ResolvedPlayerDamage;
  /** Restores real health, never above max. Returns the actual amount restored. */
  healPlayer(amount: number, sourceId: string): number;
  /** Adds rechargeable absorption, capped to shieldMax. Returns actual amount granted. */
  grantShield(amount: number, sourceId: string): number;
  /** Advances the recharge timer once per unpaused advancing simulation tick. */
  stepShieldRecharge(): number;
  /** Allows authoritative pickup systems to use the same bounded event stream. */
  emitPickup(x: number, y: number, sourceId: string, pickupKind: string, amount: number): void;
}

export interface CombatDamageResolverOptions {
  readonly player: PlayerState;
  /** Separate from wave/upgrade RNG so crit/dodge cannot perturb spawns/offers. */
  readonly rng: Rng;
  readonly eventBuffer: CombatPresentationEventBuffer;
  readonly getTick: () => number;
}

const DEFAULT_CRIT_CHANCE = 0.05;
const DEFAULT_CRIT_MULTIPLIER = 2;

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function playerNumber(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function playerNonNegative(value: number | undefined): number {
  const resolved = playerNumber(value, 0);
  return resolved < 0 ? 0 : resolved;
}

/**
 * Armor uses a diminishing-return curve: 20 armor reduces a hit by 16.7%,
 * 100 armor by 50%, and it can never reduce damage to zero by itself.
 */
export function armorDamageMultiplier(armor: number): number {
  finiteNonNegative('armor', armor);
  return 100 / (100 + armor);
}

export function createCombatDamageResolver(options: CombatDamageResolverOptions): CombatDamageResolver {
  const { player, rng, eventBuffer, getTick } = options;

  function emit(
    kind: CombatPresentationEventKind,
    x: number,
    y: number,
    amount: number,
    critical: boolean,
    sourceId: string,
    targetId = NO_ENTITY,
    pickupKind = '',
  ): void {
    eventBuffer.push({
      kind,
      tick: getTick(),
      x,
      y,
      amount: Math.fround(amount),
      critical,
      sourceId,
      targetId,
      pickupKind,
    });
  }

  return {
    resolveOutgoingDamage(rawDamage, _sourceId) {
      finiteNonNegative('outgoing damage', rawDamage);
      const critChance = clamp01(playerNumber(player.critChance, DEFAULT_CRIT_CHANCE));
      const multiplier = Math.max(1, playerNumber(player.critMultiplier, DEFAULT_CRIT_MULTIPLIER));
      const critical = rawDamage > 0 && rng.chance(critChance);
      return {
        amount: Math.fround(rawDamage * (critical ? multiplier : 1)),
        critical,
      };
    },

    damageEnemy(enemies, slot, damage, sourceId) {
      finiteNonNegative('resolved enemy damage', damage.amount);
      if (slot < 0 || slot >= enemies.data.capacity || enemies.data.alive[slot] !== 1) return false;
      const data = enemies.data;
      const targetId = enemies.idOf(slot);
      const x = data.posX[slot]!;
      const y = data.posY[slot]!;
      data.hp[slot] = Math.fround(data.hp[slot]! - damage.amount);
      if (damage.amount > 0) {
        emit(COMBAT_PRESENTATION_EVENT_KIND.enemyHit, x, y, damage.amount, damage.critical, sourceId, targetId);
      }
      return data.hp[slot]! <= 0;
    },

    damagePlayer(rawDamage, sourceId, invulnTicksOnHit) {
      finiteNonNegative('incoming damage', rawDamage);
      if (!Number.isSafeInteger(invulnTicksOnHit) || invulnTicksOnHit < 0 || invulnTicksOnHit > 0xffff) {
        throw new RangeError('invulnTicksOnHit must be an integer in [0, 65535]');
      }
      if (!player.alive || player.invulnTicks > 0) {
        return { attempted: false, dodged: false, shieldAbsorbed: 0, healthDamage: 0, killed: !player.alive };
      }

      const dodgeChance = clamp01(playerNumber(player.dodgeChance, 0));
      if (rawDamage > 0 && rng.chance(dodgeChance)) {
        emit(COMBAT_PRESENTATION_EVENT_KIND.dodge, player.x, player.y, rawDamage, false, sourceId);
        return { attempted: true, dodged: true, shieldAbsorbed: 0, healthDamage: 0, killed: false };
      }

      const armor = playerNonNegative(player.armor);
      const afterArmor = Math.fround(rawDamage * armorDamageMultiplier(armor));
      const armorBlocked = Math.max(0, Math.fround(rawDamage - afterArmor));
      if (armorBlocked > 0) {
        // Armor is a real, independently visible mitigation layer. Emit it
        // before shield/health so Benny's Thick Skin reads as more than a
        // silent change to a red damage number.
        emit(COMBAT_PRESENTATION_EVENT_KIND.armorBlock, player.x, player.y, armorBlocked, false, sourceId);
      }
      const currentShield = playerNonNegative(player.shield);
      const shieldAbsorbed = Math.min(currentShield, afterArmor);
      if (shieldAbsorbed > 0) {
        player.shield = Math.fround(currentShield - shieldAbsorbed);
        player.shieldRechargeTicksRemaining = Math.max(0, Math.floor(playerNonNegative(player.shieldRechargeDelayTicks)));
        emit(COMBAT_PRESENTATION_EVENT_KIND.shieldAbsorb, player.x, player.y, shieldAbsorbed, false, sourceId);
        if (player.shield === 0) {
          emit(COMBAT_PRESENTATION_EVENT_KIND.shieldBreak, player.x, player.y, 0, false, sourceId);
        }
      }
      const healthDamage = Math.max(0, Math.fround(afterArmor - shieldAbsorbed));
      if (healthDamage > 0) {
        player.hp = Math.max(0, Math.fround(player.hp - healthDamage));
        emit(COMBAT_PRESENTATION_EVENT_KIND.playerHit, player.x, player.y, healthDamage, false, sourceId);
      }
      if (rawDamage > 0) player.invulnTicks = invulnTicksOnHit;
      if (player.hp === 0) player.alive = false;
      return {
        attempted: true,
        dodged: false,
        shieldAbsorbed,
        healthDamage,
        killed: !player.alive,
      };
    },

    healPlayer(amount, sourceId) {
      finiteNonNegative('healing', amount);
      if (!player.alive || amount === 0) return 0;
      const healed = Math.min(amount, Math.max(0, player.maxHp - player.hp));
      if (healed > 0) {
        player.hp = Math.fround(player.hp + healed);
        emit(COMBAT_PRESENTATION_EVENT_KIND.heal, player.x, player.y, healed, false, sourceId);
      }
      return healed;
    },

    grantShield(amount, sourceId) {
      finiteNonNegative('shield grant', amount);
      if (!player.alive || amount === 0) return 0;
      let max = playerNonNegative(player.shieldMax);
      if (max === 0) {
        // A bare grantShield command remains useful for authored traits while
        // hero kits can declare a durable explicit shieldMax at startup.
        max = amount;
        player.shieldMax = Math.fround(max);
      }
      const shield = playerNonNegative(player.shield);
      const granted = Math.min(amount, Math.max(0, max - shield));
      if (granted > 0) {
        player.shield = Math.fround(shield + granted);
        emit(COMBAT_PRESENTATION_EVENT_KIND.shieldAbsorb, player.x, player.y, granted, false, sourceId);
      }
      return granted;
    },

    stepShieldRecharge() {
      if (!player.alive) return 0;
      const max = playerNonNegative(player.shieldMax);
      const shield = playerNonNegative(player.shield);
      if (max === 0 || shield >= max) return 0;
      const remaining = Math.max(0, Math.floor(playerNonNegative(player.shieldRechargeTicksRemaining)));
      if (remaining > 0) {
        player.shieldRechargeTicksRemaining = remaining - 1;
        return 0;
      }
      const rate = playerNonNegative(player.shieldRechargePerTick);
      const restored = Math.min(rate, max - shield);
      if (restored > 0) {
        player.shield = Math.fround(shield + restored);
        emit(COMBAT_PRESENTATION_EVENT_KIND.heal, player.x, player.y, restored, false, 'shield-recharge');
      }
      return restored;
    },

    emitPickup(x, y, sourceId, pickupKind, amount) {
      finiteNonNegative('pickup amount', amount);
      emit(COMBAT_PRESENTATION_EVENT_KIND.pickup, x, y, amount, false, sourceId, NO_ENTITY, pickupKind);
    },
  };
}
