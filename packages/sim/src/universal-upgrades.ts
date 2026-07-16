/**
 * Deterministic, catalog-driven per-run upgrades that are not tied to an
 * animal body socket. This module deliberately owns only immutable content,
 * rank state, and stat projection; simulation wiring, offer RNG, persistence,
 * and UI remain outside this first slice.
 *
 * A "repeatable" upgrade may be selected once per rank until `maxRank`.
 * These authored upgrades are deliberately rank-capped rather than infinite
 * fallback rewards. A future Essence/coin fallback can use a separate,
 * explicitly unbounded content type without changing these semantics.
 */
import { createHashWriter } from './state-hash.js';
import type { HeroId } from './run-start-loadout.js';

/** Bump when the canonical catalog/state fingerprint layout changes. */
export const UNIVERSAL_UPGRADE_CATALOG_VERSION = 2;

export const UNIVERSAL_UPGRADE_IDS = Object.freeze([
  'swift-paws',
  'xp-magnet',
  'sturdy-hide',
  'sharpened-instinct',
  'rapid-instinct',
  'growth',
  'keen-eye',
] as const);

/**
 * Open string type intentionally permits future shared-animal catalog entries;
 * the built-in ids above remain the currently authored playable vocabulary.
 */
export type UniversalUpgradeId = string;

export type UniversalUpgradeEffect =
  | {
      readonly kind: 'speedMultiplier';
      /** Added to the base 1x movement multiplier once per rank. */
      readonly bonusPerRank: number;
    }
  | {
      readonly kind: 'xpMagnet';
      /** Added to the existing collection radius once per rank. */
      readonly pickupRadiusBonusPerRank: number;
      /** Range in which live XP motes should begin moving toward the player. */
      readonly attractionRadiusBonusPerRank: number;
      /** Pull speed in simulation world units per second. */
      readonly attractionSpeedBonusPerRank: number;
    }
  | {
      readonly kind: 'maxHp';
      /** Added to maximum player health once per rank. */
      readonly bonusPerRank: number;
    }
  | {
      readonly kind: 'weaponDamageMultiplier';
      /** Added to the base 1x weapon-damage multiplier once per rank. */
      readonly bonusPerRank: number;
    }
  | {
      readonly kind: 'weaponCooldownMultiplier';
      /** Subtracted from the base 1x cooldown multiplier once per rank. */
      readonly reductionPerRank: number;
    }
  | {
      readonly kind: 'xpMultiplier';
      /** Added to the base 1x XP gain multiplier once per rank. */
      readonly bonusPerRank: number;
    }
  | {
      /** Raises the shared base critical-hit chance. */
      readonly kind: 'critChance';
      readonly bonusPerRank: number;
    }
  | {
      /** Fox-only avoidance path. */
      readonly kind: 'heroDodge';
      readonly heroId: HeroId;
      readonly bonusPerRank: number;
    }
  | {
      /** Bull-only armor path. */
      readonly kind: 'heroArmor';
      readonly heroId: HeroId;
      readonly bonusPerRank: number;
    }
  | {
      /** Alpaca-only shield size and recharge path. */
      readonly kind: 'heroShield';
      readonly heroId: HeroId;
      readonly shieldBonusPerRank: number;
      readonly rechargeBonusPerRank: number;
    }
  | {
      readonly kind: 'basicAttack';
      readonly heroId: HeroId;
      /** Added to the selected hero's authored starter damage per rank. */
      readonly damageBonusPerRank: number;
      /** Subtracted from the selected hero's authored starter cooldown per rank. */
      readonly cooldownReductionPerRank: number;
      /** Adds this many starter projectiles when the rank is reached. */
      readonly projectileCountAtRank?: number;
      /** Adds this much starter pierce when the rank is reached. */
      readonly pierceAtRank?: number;
      /** Adds this much starter range per rank. */
      readonly rangeBonusPerRank?: number;
    };

export interface UniversalUpgradeDefinition {
  readonly id: UniversalUpgradeId;
  readonly title: string;
  /** Player-facing copy that describes the actual projected gameplay stat. */
  readonly description: string;
  /** Every built-in upgrade may be picked again until this exact rank. */
  readonly repeatable: true;
  readonly maxRank: number;
  readonly effect: UniversalUpgradeEffect;
}

export type UniversalUpgradeCatalog = readonly UniversalUpgradeDefinition[];

/**
 * Player-facing classification of an authored upgrade's primary outcome.
 * This is content metadata derived from the same immutable effect definition
 * that `resolveUniversalUpgradeStats` projects into the simulation; it is not
 * a browser-side combat rule.
 */
export type UniversalUpgradeImpactCategory =
  | 'Direct damage'
  | 'Crowd control'
  | 'Targeting'
  | 'Defense'
  | 'Economy / utility';

/**
 * Exact before/after wording for one offered universal rank. The aggregate
 * numbers are expressed relative to the run baseline, while `delta` names the
 * one newly selected rank. `directDamage` intentionally stays false for
 * movement, pickup, survival, and XP cards even when those can indirectly
 * improve a successful run.
 */
export interface UniversalUpgradeImpact {
  readonly category: UniversalUpgradeImpactCategory;
  readonly directDamage: boolean;
  readonly currentRank: number;
  readonly nextRank: number;
  readonly rankTransition: string;
  readonly summary: string;
  readonly delta: string;
}

/**
 * Rank storage is positional in canonical catalog order. The fingerprint
 * prevents a state from being accidentally interpreted against different
 * authored content or a reordered catalog.
 */
export interface UniversalUpgradeState {
  readonly catalogFingerprint: string;
  readonly ranks: readonly number[];
}

/** A deterministic future-offer candidate; no random selection happens here. */
export interface UniversalUpgradeOffer {
  readonly id: UniversalUpgradeId;
  readonly currentRank: number;
  readonly nextRank: number;
  readonly maxRank: number;
}

export type UniversalUpgradeApplyResult =
  | {
      readonly ok: true;
      readonly state: UniversalUpgradeState;
      readonly id: UniversalUpgradeId;
      readonly previousRank: number;
      readonly rank: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'unknownUpgrade' | 'maxed';
      readonly state: UniversalUpgradeState;
      readonly id: UniversalUpgradeId;
      readonly rank: number | null;
    };

/**
 * The aggregate stat deltas an eventual simulation integration must apply.
 * `xpMagnet` intentionally exposes both a pickup-radius improvement and the
 * attraction fields necessary to make motes visibly travel toward the player.
 */
export interface UniversalUpgradeStats {
  readonly speedMultiplier: number;
  readonly pickupRadiusBonus: number;
  readonly pickupAttractionRadius: number;
  readonly pickupAttractionSpeed: number;
  readonly maxHpBonus: number;
  readonly weaponDamageMultiplier: number;
  readonly weaponCooldownMultiplier: number;
  readonly xpMultiplier: number;
  readonly critChanceBonus: number;
  readonly dodgeChanceBonus: number;
  readonly armorBonus: number;
  readonly shieldMaxBonus: number;
  readonly shieldRechargePerTickBonus: number;
  readonly basicAttackDamageMultiplier: number;
  readonly basicAttackCooldownMultiplier: number;
  readonly basicAttackProjectileCountBonus: number;
  readonly basicAttackPierceBonus: number;
  readonly basicAttackRangeBonus: number;
  /** Exact selected-starter rank, allowing hero casts to change shape at Master. */
  readonly basicAttackMasteryRank: number;
}

function frozenDefinition(definition: UniversalUpgradeDefinition): UniversalUpgradeDefinition {
  return Object.freeze({ ...definition, effect: Object.freeze({ ...definition.effect }) as UniversalUpgradeEffect });
}

export const SWIFT_PAWS: UniversalUpgradeDefinition = frozenDefinition({
  id: 'swift-paws',
  title: 'Swift Paws',
  description: '+8% movement speed per rank.',
  repeatable: true,
  maxRank: 5,
  effect: { kind: 'speedMultiplier', bonusPerRank: 0.08 },
});

export const XP_MAGNET: UniversalUpgradeDefinition = frozenDefinition({
  id: 'xp-magnet',
  title: 'Mote Draw',
  description: '+10 collection radius, then pull XP motes from +80 range at +120 speed per rank.',
  repeatable: true,
  maxRank: 5,
  effect: {
    kind: 'xpMagnet',
    pickupRadiusBonusPerRank: 10,
    attractionRadiusBonusPerRank: 80,
    attractionSpeedBonusPerRank: 120,
  },
});

export const STURDY_HIDE: UniversalUpgradeDefinition = frozenDefinition({
  id: 'sturdy-hide',
  title: 'Sturdy Hide',
  description: '+15 maximum health and restore 15 health per rank.',
  repeatable: true,
  maxRank: 5,
  effect: { kind: 'maxHp', bonusPerRank: 15 },
});

export const SHARPENED_INSTINCT: UniversalUpgradeDefinition = frozenDefinition({
  id: 'sharpened-instinct',
  title: 'Sharpened Instinct',
  description: '+12% damage for every attack per rank.',
  repeatable: true,
  maxRank: 5,
  effect: { kind: 'weaponDamageMultiplier', bonusPerRank: 0.12 },
});

export const RAPID_INSTINCT: UniversalUpgradeDefinition = frozenDefinition({
  id: 'rapid-instinct',
  title: 'Rapid Instinct',
  description: 'Reduces every attack cooldown by 8% per rank.',
  repeatable: true,
  maxRank: 5,
  effect: { kind: 'weaponCooldownMultiplier', reductionPerRank: 0.08 },
});

export const GROWTH: UniversalUpgradeDefinition = frozenDefinition({
  id: 'growth',
  title: 'Growth',
  description: '+12% XP gained per rank.',
  repeatable: true,
  maxRank: 5,
  effect: { kind: 'xpMultiplier', bonusPerRank: 0.12 },
});

export const KEEN_EYE: UniversalUpgradeDefinition = frozenDefinition({
  id: 'keen-eye',
  title: 'Keen Eye',
  description: '+3% critical-hit chance per rank.',
  repeatable: true,
  maxRank: 5,
  effect: { kind: 'critChance', bonusPerRank: 0.03 },
});

export const HERO_BASIC_ATTACK_UPGRADES: readonly UniversalUpgradeDefinition[] = Object.freeze([
  frozenDefinition({
    id: 'basic-attack:greg-precision',
    title: "Pouncer's Precision",
    description: 'Fox Swipe gains reach, a wider rake, and a Master double-swipe.',
    repeatable: true,
    maxRank: 5,
    effect: {
      kind: 'basicAttack',
      heroId: 'greg',
      damageBonusPerRank: 0.11,
      cooldownReductionPerRank: 0.04,
      rangeBonusPerRank: 5,
    },
  }),
  frozenDefinition({
    id: 'basic-attack:benny-brace-burst',
    title: 'Trample Mastery',
    description: 'Trample gains heavier, wider earth waves and a Master aftershock.',
    repeatable: true,
    maxRank: 5,
    effect: {
      kind: 'basicAttack',
      heroId: 'benny',
      damageBonusPerRank: 0.1,
      cooldownReductionPerRank: 0.035,
      rangeBonusPerRank: 7,
    },
  }),
  frozenDefinition({
    id: 'basic-attack:gracie-keen-dart',
    title: 'Spit Spiral',
    description: 'Spit Volley gains speed, extra globs, pierce, and a Master fan.',
    repeatable: true,
    maxRank: 5,
    effect: {
      kind: 'basicAttack',
      heroId: 'gracie',
      damageBonusPerRank: 0.08,
      cooldownReductionPerRank: 0.045,
      projectileCountAtRank: 3,
      pierceAtRank: 4,
      rangeBonusPerRank: 8,
    },
  }),
]);

export const HERO_DEFENSIVE_UPGRADES: readonly UniversalUpgradeDefinition[] = Object.freeze([
  frozenDefinition({
    id: 'hero-trait:greg-clever-footwork',
    title: 'Clever Footwork',
    description: '+5% dodge chance per rank (capped at 35%).',
    repeatable: true,
    maxRank: 5,
    effect: { kind: 'heroDodge', heroId: 'greg', bonusPerRank: 0.05 },
  }),
  frozenDefinition({
    id: 'hero-trait:benny-thick-skin',
    title: 'Thick Skin',
    description: '+15 armor per rank; armor reduces incoming damage.',
    repeatable: true,
    maxRank: 5,
    effect: { kind: 'heroArmor', heroId: 'benny', bonusPerRank: 15 },
  }),
  frozenDefinition({
    id: 'hero-trait:gracie-fluffy-shield',
    title: 'Fluffier Shield',
    description: '+10 Fluffy Shield and faster recharge per rank.',
    repeatable: true,
    maxRank: 5,
    effect: { kind: 'heroShield', heroId: 'gracie', shieldBonusPerRank: 10, rechargeBonusPerRank: 0.04 },
  }),
]);

export const UNIVERSAL_UPGRADE_CATALOG: UniversalUpgradeCatalog = Object.freeze([
  SWIFT_PAWS,
  XP_MAGNET,
  STURDY_HIDE,
  SHARPENED_INSTINCT,
  RAPID_INSTINCT,
  GROWTH,
  KEEN_EYE,
]);

/** App-facing catalog: shared neutral choices plus the hero's mastery and defense. */
export function getUniversalUpgradeCatalogForHero(
  heroId: HeroId,
  baseCatalog: UniversalUpgradeCatalog = UNIVERSAL_UPGRADE_CATALOG,
): UniversalUpgradeCatalog {
  const upgrade = HERO_BASIC_ATTACK_UPGRADES.find((candidate) => candidate.effect.kind === 'basicAttack' && candidate.effect.heroId === heroId);
  const defense = HERO_DEFENSIVE_UPGRADES.find((candidate) => (
    (candidate.effect.kind === 'heroDodge'
      || candidate.effect.kind === 'heroArmor'
      || candidate.effect.kind === 'heroShield')
    && candidate.effect.heroId === heroId
 ));
  if (upgrade === undefined || defense === undefined) throw new Error(`No V1.1 hero upgrade authored for hero ${heroId}`);
  const sharedCatalog = baseCatalog.filter((candidate) => candidate.effect.kind !== 'basicAttack');
  return Object.freeze([...sharedCatalog, upgrade, defense]);
}

function requireFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive (received ${value})`);
  }
}

function requireNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function validateEffect(effect: UniversalUpgradeEffect, label: string): void {
  if (typeof effect !== 'object' || effect === null) {
    throw new TypeError(`${label}.effect must be an object`);
  }
  switch (effect.kind) {
    case 'speedMultiplier':
    case 'weaponDamageMultiplier':
    case 'maxHp':
    case 'xpMultiplier':
    case 'critChance':
      requireFinitePositive(`${label}.effect.bonusPerRank`, effect.bonusPerRank);
      return;
    case 'heroDodge':
    case 'heroArmor':
      requireNonEmptyString(`${label}.effect.heroId`, effect.heroId);
      requireFinitePositive(`${label}.effect.bonusPerRank`, effect.bonusPerRank);
      return;
    case 'heroShield':
      requireNonEmptyString(`${label}.effect.heroId`, effect.heroId);
      requireFinitePositive(`${label}.effect.shieldBonusPerRank`, effect.shieldBonusPerRank);
      requireFinitePositive(`${label}.effect.rechargeBonusPerRank`, effect.rechargeBonusPerRank);
      return;
    case 'weaponCooldownMultiplier':
      requireFinitePositive(`${label}.effect.reductionPerRank`, effect.reductionPerRank);
      return;
    case 'xpMagnet':
      requireFinitePositive(`${label}.effect.pickupRadiusBonusPerRank`, effect.pickupRadiusBonusPerRank);
      requireFinitePositive(`${label}.effect.attractionRadiusBonusPerRank`, effect.attractionRadiusBonusPerRank);
      requireFinitePositive(`${label}.effect.attractionSpeedBonusPerRank`, effect.attractionSpeedBonusPerRank);
      return;
    case 'basicAttack':
      requireNonEmptyString(`${label}.effect.heroId`, effect.heroId);
      requireFinitePositive(`${label}.effect.damageBonusPerRank`, effect.damageBonusPerRank);
      requireFinitePositive(`${label}.effect.cooldownReductionPerRank`, effect.cooldownReductionPerRank);
      if (effect.projectileCountAtRank !== undefined && (!Number.isSafeInteger(effect.projectileCountAtRank) || effect.projectileCountAtRank < 1)) {
        throw new RangeError(`${label}.effect.projectileCountAtRank must be a positive safe integer`);
      }
      if (effect.pierceAtRank !== undefined && (!Number.isSafeInteger(effect.pierceAtRank) || effect.pierceAtRank < 1)) {
        throw new RangeError(`${label}.effect.pierceAtRank must be a positive safe integer`);
      }
      if (effect.rangeBonusPerRank !== undefined) requireFinitePositive(`${label}.effect.rangeBonusPerRank`, effect.rangeBonusPerRank);
      return;
    default:
      throw new TypeError(`unknown universal upgrade effect ${(effect as { kind?: unknown }).kind as string}`);
  }
}

/** Validate catalog content before it can contribute to deterministic state. */
export function validateUniversalUpgradeCatalog(catalog: UniversalUpgradeCatalog): void {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new RangeError('universal upgrade catalog must contain at least one definition');
  }
  const ids = new Set<string>();
  for (let index = 0; index < catalog.length; index++) {
    const definition = catalog[index];
    if (definition === undefined || typeof definition !== 'object') {
      throw new TypeError(`catalog[${index}] must be a definition object`);
    }
    const label = `catalog[${index}]`;
    requireNonEmptyString(`${label}.id`, definition.id);
    requireNonEmptyString(`${label}.title`, definition.title);
    requireNonEmptyString(`${label}.description`, definition.description);
    if (ids.has(definition.id)) throw new RangeError(`universal upgrade catalog contains duplicate id "${definition.id}"`);
    ids.add(definition.id);
    if (definition.repeatable !== true) {
      throw new RangeError(`${label}.repeatable must be true for a rank-capped universal upgrade`);
    }
    if (!Number.isSafeInteger(definition.maxRank) || definition.maxRank < 1) {
      throw new RangeError(`${label}.maxRank must be a positive safe integer`);
    }
    validateEffect(definition.effect, label);
    if (
      definition.effect.kind === 'weaponCooldownMultiplier' &&
      definition.effect.reductionPerRank * definition.maxRank >= 1
    ) {
      throw new RangeError(`${label}.effect reduction would make weapon cooldown non-positive at max rank`);
    }
    if (definition.effect.kind === 'basicAttack') {
      if (definition.effect.cooldownReductionPerRank * definition.maxRank >= 1) {
        throw new RangeError(`${label}.effect reduction would make basic attack cooldown non-positive at max rank`);
      }
      if (definition.effect.projectileCountAtRank !== undefined && definition.effect.projectileCountAtRank > definition.maxRank) {
        throw new RangeError(`${label}.effect.projectileCountAtRank cannot exceed maxRank`);
      }
      if (definition.effect.pierceAtRank !== undefined && definition.effect.pierceAtRank > definition.maxRank) {
        throw new RangeError(`${label}.effect.pierceAtRank cannot exceed maxRank`);
      }
    }
  }
}

/** Stable identity for authored universal-upgrade content and ordering. */
export function fingerprintUniversalUpgradeCatalog(catalog: UniversalUpgradeCatalog = UNIVERSAL_UPGRADE_CATALOG): string {
  validateUniversalUpgradeCatalog(catalog);
  const writer = createHashWriter();
  writer.u32(UNIVERSAL_UPGRADE_CATALOG_VERSION);
  writer.u32(catalog.length);
  for (const definition of catalog) {
    writer.str(definition.id);
    writer.str(definition.title);
    writer.str(definition.description);
    writer.u8(definition.repeatable ? 1 : 0);
    // `maxRank` is validated as a safe integer, so f64 preserves its exact
    // value while avoiding a silent collision above the u32 range.
    writer.f64(definition.maxRank);
    writer.str(definition.effect.kind);
    switch (definition.effect.kind) {
      case 'speedMultiplier':
      case 'weaponDamageMultiplier':
      case 'maxHp':
      case 'xpMultiplier':
      case 'critChance':
        writer.f64(definition.effect.bonusPerRank);
        break;
      case 'heroDodge':
      case 'heroArmor':
        writer.str(definition.effect.heroId);
        writer.f64(definition.effect.bonusPerRank);
        break;
      case 'heroShield':
        writer.str(definition.effect.heroId);
        writer.f64(definition.effect.shieldBonusPerRank);
        writer.f64(definition.effect.rechargeBonusPerRank);
        break;
      case 'weaponCooldownMultiplier':
        writer.f64(definition.effect.reductionPerRank);
        break;
      case 'xpMagnet':
        writer.f64(definition.effect.pickupRadiusBonusPerRank);
        writer.f64(definition.effect.attractionRadiusBonusPerRank);
        writer.f64(definition.effect.attractionSpeedBonusPerRank);
        break;
      case 'basicAttack':
        writer.str(definition.effect.heroId);
        writer.f64(definition.effect.damageBonusPerRank);
        writer.f64(definition.effect.cooldownReductionPerRank);
        writer.f64(definition.effect.projectileCountAtRank ?? 0);
        writer.f64(definition.effect.pierceAtRank ?? 0);
        writer.f64(definition.effect.rangeBonusPerRank ?? 0);
        break;
    }
  }
  return writer.digestHex();
}

function stateFromRanks(catalog: UniversalUpgradeCatalog, ranks: readonly number[]): UniversalUpgradeState {
  return Object.freeze({
    catalogFingerprint: fingerprintUniversalUpgradeCatalog(catalog),
    ranks: Object.freeze([...ranks]),
  });
}

/** Create fresh all-zero immutable rank state for a catalog. */
export function createUniversalUpgradeState(
  catalog: UniversalUpgradeCatalog = UNIVERSAL_UPGRADE_CATALOG,
): UniversalUpgradeState {
  validateUniversalUpgradeCatalog(catalog);
  return stateFromRanks(catalog, catalog.map(() => 0));
}

/** Throw when an externally supplied state cannot safely pair with this catalog. */
export function validateUniversalUpgradeState(
  catalog: UniversalUpgradeCatalog,
  state: UniversalUpgradeState,
): void {
  validateUniversalUpgradeCatalog(catalog);
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('universal upgrade state must be an object');
  }
  const expectedFingerprint = fingerprintUniversalUpgradeCatalog(catalog);
  if (state.catalogFingerprint !== expectedFingerprint) {
    throw new Error('universal upgrade state catalog fingerprint mismatch');
  }
  if (!Array.isArray(state.ranks) || state.ranks.length !== catalog.length) {
    throw new RangeError('universal upgrade state ranks must align with catalog length');
  }
  for (let index = 0; index < catalog.length; index++) {
    const rank = state.ranks[index];
    const definition = catalog[index]!;
    if (!Number.isSafeInteger(rank) || rank === undefined || rank < 0 || rank > definition.maxRank) {
      throw new RangeError(`universal upgrade state rank for ${definition.id} is out of range`);
    }
  }
}

function indexOf(catalog: UniversalUpgradeCatalog, id: UniversalUpgradeId): number {
  for (let index = 0; index < catalog.length; index++) {
    if (catalog[index]!.id === id) return index;
  }
  return -1;
}

/** Return a definition by stable id, or undefined for unknown future content. */
export function getUniversalUpgrade(
  id: UniversalUpgradeId,
  catalog: UniversalUpgradeCatalog = UNIVERSAL_UPGRADE_CATALOG,
): UniversalUpgradeDefinition | undefined {
  validateUniversalUpgradeCatalog(catalog);
  const index = indexOf(catalog, id);
  return index < 0 ? undefined : catalog[index];
}

function formatPercent(value: number): string {
  const percent = Math.round(value * 10_000) / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function rankTransition(currentRank: number, nextRank: number): string {
  return `Rank ${currentRank} → ${nextRank}`;
}

function assertImpactRanks(definition: UniversalUpgradeDefinition, currentRank: number, nextRank: number): void {
  if (!Number.isSafeInteger(currentRank) || currentRank < 0 || currentRank >= definition.maxRank) {
    throw new RangeError(`currentRank for ${definition.id} must be a safe integer in [0, ${definition.maxRank - 1}]`);
  }
  if (nextRank !== currentRank + 1 || nextRank > definition.maxRank) {
    throw new RangeError(`nextRank for ${definition.id} must advance exactly one rank within its cap`);
  }
}

/**
 * Describe one rank offer from immutable simulation content. Presentation may
 * display this record, but it must not use it to apply or infer gameplay.
 */
export function describeUniversalUpgradeImpact(
  definition: UniversalUpgradeDefinition,
  currentRank: number,
  nextRank = currentRank + 1,
): UniversalUpgradeImpact {
  assertImpactRanks(definition, currentRank, nextRank);
  const transition = rankTransition(currentRank, nextRank);
  const effect = definition.effect;
  switch (effect.kind) {
    case 'speedMultiplier': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Economy / utility',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `Movement speed +${formatPercent(before)} → +${formatPercent(after)}.`,
        delta: `+${formatPercent(effect.bonusPerRank)} movement speed.`,
      });
    }
    case 'xpMagnet': {
      const pickupBefore = effect.pickupRadiusBonusPerRank * currentRank;
      const pickupAfter = effect.pickupRadiusBonusPerRank * nextRank;
      const radiusBefore = effect.attractionRadiusBonusPerRank * currentRank;
      const radiusAfter = effect.attractionRadiusBonusPerRank * nextRank;
      const speedBefore = effect.attractionSpeedBonusPerRank * currentRank;
      const speedAfter = effect.attractionSpeedBonusPerRank * nextRank;
      return Object.freeze({
        category: 'Economy / utility',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `Pickup radius +${formatNumber(pickupBefore)} → +${formatNumber(pickupAfter)}; XP pull range ${formatNumber(radiusBefore)} → ${formatNumber(radiusAfter)} at ${formatNumber(speedBefore)} → ${formatNumber(speedAfter)}/sec.`,
        delta: `+${formatNumber(effect.pickupRadiusBonusPerRank)} pickup radius, +${formatNumber(effect.attractionRadiusBonusPerRank)} pull range, +${formatNumber(effect.attractionSpeedBonusPerRank)}/sec pull speed.`,
      });
    }
    case 'maxHp': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Defense',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `Maximum health +${formatNumber(before)} → +${formatNumber(after)}; restores ${formatNumber(effect.bonusPerRank)} health on this pick.`,
        delta: `+${formatNumber(effect.bonusPerRank)} maximum health and restore ${formatNumber(effect.bonusPerRank)} health.`,
      });
    }
    case 'weaponDamageMultiplier': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Direct damage',
        directDamage: true,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `All attack damage +${formatPercent(before)} → +${formatPercent(after)}.`,
        delta: `+${formatPercent(effect.bonusPerRank)} all attack damage.`,
      });
    }
    case 'weaponCooldownMultiplier': {
      const before = effect.reductionPerRank * currentRank;
      const after = effect.reductionPerRank * nextRank;
      return Object.freeze({
        category: 'Direct damage',
        directDamage: true,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `All attack cooldown −${formatPercent(before)} → −${formatPercent(after)}.`,
        delta: `−${formatPercent(effect.reductionPerRank)} all attack cooldown.`,
      });
    }
    case 'xpMultiplier': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Economy / utility',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `XP gained +${formatPercent(before)} → +${formatPercent(after)}.`,
        delta: `+${formatPercent(effect.bonusPerRank)} XP gained.`,
      });
    }
    case 'critChance': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Direct damage',
        directDamage: true,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `Critical-hit chance +${formatPercent(before)} → +${formatPercent(after)}.`,
        delta: `+${formatPercent(effect.bonusPerRank)} critical-hit chance.`,
      });
    }
    case 'heroDodge': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Defense',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `${effect.heroId} dodge chance +${formatPercent(before)} → +${formatPercent(after)} (combat cap still applies).`,
        delta: `+${formatPercent(effect.bonusPerRank)} dodge chance.`,
      });
    }
    case 'heroArmor': {
      const before = effect.bonusPerRank * currentRank;
      const after = effect.bonusPerRank * nextRank;
      return Object.freeze({
        category: 'Defense',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `${effect.heroId} armor +${formatNumber(before)} → +${formatNumber(after)}.`,
        delta: `+${formatNumber(effect.bonusPerRank)} armor.`,
      });
    }
    case 'heroShield': {
      const shieldBefore = effect.shieldBonusPerRank * currentRank;
      const shieldAfter = effect.shieldBonusPerRank * nextRank;
      const rechargeBefore = effect.rechargeBonusPerRank * currentRank;
      const rechargeAfter = effect.rechargeBonusPerRank * nextRank;
      return Object.freeze({
        category: 'Defense',
        directDamage: false,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `${effect.heroId} shield +${formatNumber(shieldBefore)} → +${formatNumber(shieldAfter)}; recharge +${formatNumber(rechargeBefore)} → +${formatNumber(rechargeAfter)}/tick.`,
        delta: `+${formatNumber(effect.shieldBonusPerRank)} shield and +${formatNumber(effect.rechargeBonusPerRank)}/tick recharge.`,
      });
    }
    case 'basicAttack': {
      const damageBefore = effect.damageBonusPerRank * currentRank;
      const damageAfter = effect.damageBonusPerRank * nextRank;
      const cooldownBefore = effect.cooldownReductionPerRank * currentRank;
      const cooldownAfter = effect.cooldownReductionPerRank * nextRank;
      const rangeBefore = (effect.rangeBonusPerRank ?? 0) * currentRank;
      const rangeAfter = (effect.rangeBonusPerRank ?? 0) * nextRank;
      const unlocked: string[] = [];
      if (effect.projectileCountAtRank !== undefined && currentRank < effect.projectileCountAtRank && nextRank >= effect.projectileCountAtRank) {
        unlocked.push('extra starter projectile unlocked');
      }
      if (effect.pierceAtRank !== undefined && currentRank < effect.pierceAtRank && nextRank >= effect.pierceAtRank) {
        unlocked.push('starter pierce unlocked');
      }
      if (nextRank === definition.maxRank) unlocked.push('Master payoff unlocked');
      const rangeSummary = effect.rangeBonusPerRank === undefined
        ? ''
        : `; range +${formatNumber(rangeBefore)} → +${formatNumber(rangeAfter)}`;
      return Object.freeze({
        category: 'Direct damage',
        directDamage: true,
        currentRank,
        nextRank,
        rankTransition: transition,
        summary: `${effect.heroId} starter damage +${formatPercent(damageBefore)} → +${formatPercent(damageAfter)}; cooldown −${formatPercent(cooldownBefore)} → −${formatPercent(cooldownAfter)}${rangeSummary}${unlocked.length === 0 ? '.' : `; ${unlocked.join(', ')}.`}`,
        delta: `+${formatPercent(effect.damageBonusPerRank)} starter damage and −${formatPercent(effect.cooldownReductionPerRank)} starter cooldown${effect.rangeBonusPerRank === undefined ? '' : `; +${formatNumber(effect.rangeBonusPerRank)} reach`}${unlocked.length === 0 ? '.' : `; ${unlocked.join(', ')}.`}`,
      });
    }
  }
}

/** Return the current rank of a known upgrade. */
export function universalUpgradeRank(
  catalog: UniversalUpgradeCatalog,
  state: UniversalUpgradeState,
  id: UniversalUpgradeId,
): number {
  validateUniversalUpgradeState(catalog, state);
  const index = indexOf(catalog, id);
  if (index < 0) throw new RangeError(`unknown universal upgrade "${id}"`);
  return state.ranks[index]!;
}

/** List all choices that can still gain exactly one rank. Catalog order is stable. */
export function availableUniversalUpgradeOffers(
  catalog: UniversalUpgradeCatalog,
  state: UniversalUpgradeState,
): readonly UniversalUpgradeOffer[] {
  validateUniversalUpgradeState(catalog, state);
  const offers: UniversalUpgradeOffer[] = [];
  for (let index = 0; index < catalog.length; index++) {
    const definition = catalog[index]!;
    const currentRank = state.ranks[index]!;
    if (currentRank >= definition.maxRank) continue;
    offers.push(Object.freeze({
      id: definition.id,
      currentRank,
      nextRank: currentRank + 1,
      maxRank: definition.maxRank,
    }));
  }
  return Object.freeze(offers);
}

/**
 * Apply one rank without mutating the input state. At cap, the exact original
 * state is returned so callers can keep selection handling atomic.
 */
export function applyUniversalUpgrade(
  catalog: UniversalUpgradeCatalog,
  state: UniversalUpgradeState,
  id: UniversalUpgradeId,
): UniversalUpgradeApplyResult {
  validateUniversalUpgradeState(catalog, state);
  const index = indexOf(catalog, id);
  if (index < 0) {
    return Object.freeze({ ok: false, reason: 'unknownUpgrade', state, id, rank: null });
  }
  const definition = catalog[index]!;
  const previousRank = state.ranks[index]!;
  if (previousRank >= definition.maxRank) {
    return Object.freeze({ ok: false, reason: 'maxed', state, id, rank: previousRank });
  }
  const ranks = [...state.ranks];
  const rank = previousRank + 1;
  ranks[index] = rank;
  return Object.freeze({
    ok: true,
    state: stateFromRanks(catalog, ranks),
    id,
    previousRank,
    rank,
  });
}

/**
 * Project all ranks into concrete gameplay values. Integration must use these
 * values directly: in particular, XP Magnet is not truthful until pickup
 * motion uses both attraction fields in addition to collection radius.
 */
export function resolveUniversalUpgradeStats(
  catalog: UniversalUpgradeCatalog,
  state: UniversalUpgradeState,
): UniversalUpgradeStats {
  validateUniversalUpgradeState(catalog, state);
  let speedMultiplier = 1;
  let pickupRadiusBonus = 0;
  let pickupAttractionRadius = 0;
  let pickupAttractionSpeed = 0;
  let maxHpBonus = 0;
  let weaponDamageMultiplier = 1;
  let weaponCooldownMultiplier = 1;
  let xpMultiplier = 1;
  let critChanceBonus = 0;
  let dodgeChanceBonus = 0;
  let armorBonus = 0;
  let shieldMaxBonus = 0;
  let shieldRechargePerTickBonus = 0;
  let basicAttackDamageMultiplier = 1;
  let basicAttackCooldownMultiplier = 1;
  let basicAttackProjectileCountBonus = 0;
  let basicAttackPierceBonus = 0;
  let basicAttackRangeBonus = 0;
  let basicAttackMasteryRank = 0;

  for (let index = 0; index < catalog.length; index++) {
    const rank = state.ranks[index]!;
    if (rank === 0) continue;
    const effect = catalog[index]!.effect;
    switch (effect.kind) {
      case 'speedMultiplier':
        speedMultiplier += effect.bonusPerRank * rank;
        break;
      case 'xpMagnet':
        pickupRadiusBonus += effect.pickupRadiusBonusPerRank * rank;
        pickupAttractionRadius += effect.attractionRadiusBonusPerRank * rank;
        pickupAttractionSpeed += effect.attractionSpeedBonusPerRank * rank;
        break;
      case 'maxHp':
        maxHpBonus += effect.bonusPerRank * rank;
        break;
      case 'weaponDamageMultiplier':
        weaponDamageMultiplier += effect.bonusPerRank * rank;
        break;
      case 'weaponCooldownMultiplier':
        weaponCooldownMultiplier -= effect.reductionPerRank * rank;
        break;
      case 'xpMultiplier':
        xpMultiplier += effect.bonusPerRank * rank;
        break;
      case 'critChance':
        critChanceBonus += effect.bonusPerRank * rank;
        break;
      case 'heroDodge':
        dodgeChanceBonus += effect.bonusPerRank * rank;
        break;
      case 'heroArmor':
        armorBonus += effect.bonusPerRank * rank;
        break;
      case 'heroShield':
        shieldMaxBonus += effect.shieldBonusPerRank * rank;
        shieldRechargePerTickBonus += effect.rechargeBonusPerRank * rank;
        break;
      case 'basicAttack':
        basicAttackDamageMultiplier += effect.damageBonusPerRank * rank;
        basicAttackCooldownMultiplier -= effect.cooldownReductionPerRank * rank;
        if (effect.projectileCountAtRank !== undefined && rank >= effect.projectileCountAtRank) {
          basicAttackProjectileCountBonus += 1;
        }
        if (effect.pierceAtRank !== undefined && rank >= effect.pierceAtRank) {
          basicAttackPierceBonus += 1;
        }
        basicAttackRangeBonus += (effect.rangeBonusPerRank ?? 0) * rank;
        basicAttackMasteryRank = Math.max(basicAttackMasteryRank, rank);
        break;
    }
  }

  return Object.freeze({
    speedMultiplier,
    pickupRadiusBonus,
    pickupAttractionRadius,
    pickupAttractionSpeed,
    maxHpBonus,
    weaponDamageMultiplier,
    weaponCooldownMultiplier,
    xpMultiplier,
    critChanceBonus,
    dodgeChanceBonus,
    armorBonus,
    shieldMaxBonus,
    shieldRechargePerTickBonus,
    basicAttackDamageMultiplier,
    basicAttackCooldownMultiplier,
    basicAttackProjectileCountBonus,
    basicAttackPierceBonus,
    basicAttackRangeBonus,
    basicAttackMasteryRank,
  });
}
