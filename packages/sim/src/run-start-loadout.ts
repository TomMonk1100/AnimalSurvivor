/**
 * Immutable, simulation-owned boundary for permanent profile effects. Browser
 * persistence resolves its purchases into this tiny payload before a run is
 * created; the simulation never reads storage directly.
 */
import { createHashWriter } from './state-hash.js';
import { DEFAULT_RUSH_RAKE_CONFIG, GREG_RUSH_RAKE_CONTENT_VERSION } from './instincts/greg-rush-rake.js';
import { BENNY_BRACE_CONTENT_VERSION, DEFAULT_BENNY_BRACE_CONFIG } from './instincts/benny-brace.js';
import { DEFAULT_GRACIE_SCOUT_CONFIG, GRACIE_SCOUT_CONTENT_VERSION } from './instincts/gracie-scout.js';

// Version 5 adds the permanent meta-progression stat block (Might, Swiftness,
// Magnet, Growth, Armor, Haste, Precision, Ferocity, Evasion) alongside the
// existing Vitality bonus. Old records must reject rather than silently replay
// with a different permanent loadout.
export const RUN_START_LOADOUT_VERSION = 5 as const;

/**
 * Ceilings for each permanent bonus. These bound the resolved values a browser
 * profile may inject so a corrupt or hostile save cannot smuggle an absurd
 * stat past the deterministic boundary. They are generous relative to the
 * authored shop (which resolves well within these limits) but finite.
 */
export const RUN_START_BONUS_LIMITS = Object.freeze({
  maxHpBonus: 4096,
  damageMultiplierBonus: 8,
  speedMultiplierBonus: 4,
  pickupRadiusBonus: 4096,
  xpMultiplierBonus: 8,
  cooldownReductionBonus: 0.8,
  armorBonus: 4096,
  critChanceBonus: 0.9,
  critMultiplierBonus: 8,
  dodgeChanceBonus: 0.9,
} as const);

export const HERO_IDS = Object.freeze(['greg', 'benny', 'gracie'] as const);
export type HeroId = (typeof HERO_IDS)[number];
export const BIOME_IDS = Object.freeze(['forest', 'saltwind'] as const);
export type BiomeId = (typeof BIOME_IDS)[number];

export type HeroBasicAttackPattern = 'meleeArc' | 'groundWave' | 'projectile';
export type HeroBasicAttackTargeting = 'nearest' | 'highestHealth';

export interface HeroBasicAttackDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly pattern: HeroBasicAttackPattern;
  readonly targeting: HeroBasicAttackTargeting;
  readonly damageMultiplier: number;
  readonly cooldownMultiplier: number;
  readonly projectileSpeedMultiplier: number;
  readonly rangeMultiplier: number;
  readonly projectileCount: number;
  readonly spreadDegrees: number;
  readonly pierce: number;
  /** Forward sector width for a melee sweep, in radians. */
  readonly arcRadians: number;
  /** Sequential ground-wave impacts emitted per Trample cast. */
  readonly groundWaveCount: number;
  /** Fixed ticks between Trample impacts. */
  readonly groundWaveSpacingTicks: number;
  /** World-space radius of one ground-wave impact. */
  readonly groundWaveRadius: number;
  /** Distance in front of the hero for the first ground-wave impact. */
  readonly groundWaveStartDistance: number;
  /** Additional forward distance for each following ground-wave impact. */
  readonly groundWaveStride: number;
}

const HERO_BASIC_ATTACK_CATALOG_INTERNAL: readonly HeroBasicAttackDefinition[] = Object.freeze([
  Object.freeze({
    id: 'greg-auto-fire',
    title: 'Fox Swipe',
    description: 'Greg commits to a tight forward claw swipe through nearby threats.',
    pattern: 'meleeArc',
    targeting: 'nearest',
    damageMultiplier: 1.32,
    cooldownMultiplier: 1.35,
    projectileSpeedMultiplier: 1,
    rangeMultiplier: 0.42,
    projectileCount: 0,
    spreadDegrees: 0,
    pierce: 0,
    arcRadians: 0.9,
    groundWaveCount: 0,
    groundWaveSpacingTicks: 0,
    groundWaveRadius: 0,
    groundWaveStartDistance: 0,
    groundWaveStride: 0,
  }),
  Object.freeze({
    id: 'benny-brace-burst',
    title: 'Trample',
    description: 'Benny stamps out a forward line of crushing earth waves.',
    pattern: 'groundWave',
    targeting: 'nearest',
    damageMultiplier: 1.08,
    cooldownMultiplier: 1.28,
    projectileSpeedMultiplier: 1,
    rangeMultiplier: 1,
    projectileCount: 0,
    spreadDegrees: 0,
    pierce: 0,
    arcRadians: 0,
    groundWaveCount: 2,
    groundWaveSpacingTicks: 7,
    groundWaveRadius: 34,
    groundWaveStartDistance: 38,
    groundWaveStride: 44,
  }),
  Object.freeze({
    id: 'gracie-keen-dart',
    title: 'Spit Volley',
    description: 'Gracie spits a bright, fast glob that escalates into a wild volley.',
    pattern: 'projectile',
    targeting: 'highestHealth',
    damageMultiplier: 0.9,
    cooldownMultiplier: 0.78,
    projectileSpeedMultiplier: 1.2,
    rangeMultiplier: 1.1,
    projectileCount: 1,
    spreadDegrees: 0,
    pierce: 0,
    arcRadians: 0,
    groundWaveCount: 0,
    groundWaveSpacingTicks: 0,
    groundWaveRadius: 0,
    groundWaveStartDistance: 0,
    groundWaveStride: 0,
  }),
]);

export const HERO_BASIC_ATTACK_CATALOG = HERO_BASIC_ATTACK_CATALOG_INTERNAL;

export interface HeroDefinition {
  readonly id: HeroId;
  readonly displayName: string;
  readonly species: string;
  readonly epithet: string;
  readonly description: string;
  /** Alpha starting values; balance still requires human playtest evidence. */
  readonly maxHpBonus: number;
  readonly speedMultiplier: number;
  readonly pickupRadiusBonus: number;
  readonly weaponDamageMultiplier: number;
  readonly weaponCooldownMultiplier: number;
  /** All heroes start with this readable baseline crit chance. */
  readonly critChance: number;
  readonly critMultiplier: number;
  /** Greg's innate avoidance; other heroes begin at zero. */
  readonly dodgeChance: number;
  /** Benny's Thick Skin baseline. */
  readonly armor: number;
  /** Gracie's rechargeable Fluffy Shield baseline. */
  readonly shieldMax: number;
  readonly shieldRechargeDelayTicks: number;
  readonly shieldRechargePerTick: number;
  /** Multiplier applied only to tagged/close-range melee pickups. */
  readonly meleeDamageMultiplier: number;
  readonly basicAttackId: string;
}

/**
 * Each hero owns a distinct starter attack. The trait catalog remains shared,
 * while the starter mastery path is selected from the same hero contract.
 */
export const HERO_CATALOG: readonly HeroDefinition[] = Object.freeze([
  {
    id: 'greg',
    displayName: 'Greg',
    species: 'Fox',
    epithet: 'The Pouncer',
    description: 'A nimble melee duelist whose Fox Swipe and near-misses reward brave positioning.',
    maxHpBonus: 0,
    speedMultiplier: 1,
    pickupRadiusBonus: 0,
    weaponDamageMultiplier: 1,
    weaponCooldownMultiplier: 1,
    critChance: 0.05,
    critMultiplier: 2,
    dodgeChance: 0.08,
    armor: 0,
    shieldMax: 0,
    shieldRechargeDelayTicks: 0,
    shieldRechargePerTick: 0,
    meleeDamageMultiplier: 1.22,
    basicAttackId: 'greg-auto-fire',
  },
  {
    id: 'benny',
    displayName: 'Benny',
    species: 'Bull',
    epithet: 'The Bastion',
    description: 'A sturdy bruiser who tramples lanes flat and turns Thick Skin into staying power.',
    maxHpBonus: 28,
    speedMultiplier: 0.88,
    pickupRadiusBonus: -4,
    weaponDamageMultiplier: 0.96,
    weaponCooldownMultiplier: 1.04,
    critChance: 0.05,
    critMultiplier: 2,
    dodgeChance: 0,
    armor: 20,
    shieldMax: 0,
    shieldRechargeDelayTicks: 0,
    shieldRechargePerTick: 0,
    meleeDamageMultiplier: 1,
    basicAttackId: 'benny-brace-burst',
  },
  {
    id: 'gracie',
    displayName: 'Gracie',
    species: 'Alpaca',
    epithet: 'The Surveyor',
    description: 'A watchful collector whose escalating spit is protected by a rechargeable Fluffy Shield.',
    maxHpBonus: -8,
    speedMultiplier: 0.97,
    pickupRadiusBonus: 18,
    weaponDamageMultiplier: 0.93,
    weaponCooldownMultiplier: 0.92,
    critChance: 0.05,
    critMultiplier: 2,
    dodgeChance: 0,
    armor: 0,
    shieldMax: 34,
    shieldRechargeDelayTicks: 150,
    shieldRechargePerTick: 0.22,
    meleeDamageMultiplier: 1,
    basicAttackId: 'gracie-keen-dart',
  },
]);

export interface RunStartLoadout {
  readonly version: typeof RUN_START_LOADOUT_VERSION;
  /** Selected founding hero; omitted by legacy callers and normalized to Greg. */
  readonly heroId?: HeroId;
  /** Selected authored biome; legacy callers normalize to Forest Arsenal. */
  readonly biomeId?: BiomeId;
  /** Permanent bonus maximum health applied before any per-run cards. */
  readonly maxHpBonus: number;
  /** Permanent weapon-damage bonus, added to the base 1x multiplier (Might). */
  readonly damageMultiplierBonus?: number;
  /** Permanent movement bonus, added to the base 1x multiplier (Swiftness). */
  readonly speedMultiplierBonus?: number;
  /** Permanent flat pickup-radius bonus (Magnet). */
  readonly pickupRadiusBonus?: number;
  /** Permanent XP-gain bonus, added to the base 1x multiplier (Growth). */
  readonly xpMultiplierBonus?: number;
  /** Permanent cooldown reduction, subtracted from the base 1x multiplier (Haste). */
  readonly cooldownReductionBonus?: number;
  /** Permanent flat armor bonus (Armor). */
  readonly armorBonus?: number;
  /** Permanent flat critical-chance bonus (Precision). */
  readonly critChanceBonus?: number;
  /** Permanent flat critical-damage multiplier bonus (Ferocity). */
  readonly critMultiplierBonus?: number;
  /** Permanent flat dodge-chance bonus (Evasion). */
  readonly dodgeChanceBonus?: number;
}

/**
 * The permanent stat block after normalization: every field is present and
 * numeric so the simulation never branches on optionality when applying it.
 */
export interface NormalizedRunStartBonuses {
  readonly maxHpBonus: number;
  readonly damageMultiplierBonus: number;
  readonly speedMultiplierBonus: number;
  readonly pickupRadiusBonus: number;
  readonly xpMultiplierBonus: number;
  readonly cooldownReductionBonus: number;
  readonly armorBonus: number;
  readonly critChanceBonus: number;
  readonly critMultiplierBonus: number;
  readonly dodgeChanceBonus: number;
}

export interface NormalizedRunStartLoadout extends NormalizedRunStartBonuses {
  readonly version: typeof RUN_START_LOADOUT_VERSION;
  readonly heroId: HeroId;
  readonly biomeId: BiomeId;
}

export const DEFAULT_RUN_START_LOADOUT: NormalizedRunStartLoadout = Object.freeze({
  version: RUN_START_LOADOUT_VERSION,
  heroId: 'greg',
  biomeId: 'forest',
  maxHpBonus: 0,
  damageMultiplierBonus: 0,
  speedMultiplierBonus: 0,
  pickupRadiusBonus: 0,
  xpMultiplierBonus: 0,
  cooldownReductionBonus: 0,
  armorBonus: 0,
  critChanceBonus: 0,
  critMultiplierBonus: 0,
  dodgeChanceBonus: 0,
});

export function getHeroDefinition(heroId: HeroId): HeroDefinition {
  const definition = HERO_CATALOG.find((candidate) => candidate.id === heroId);
  if (definition === undefined) throw new Error(`Unknown hero id: ${heroId}`);
  return definition;
}

export function getHeroBasicAttackDefinition(basicAttackId: string): HeroBasicAttackDefinition {
  const definition = HERO_BASIC_ATTACK_CATALOG_INTERNAL.find((candidate) => candidate.id === basicAttackId);
  if (definition === undefined) throw new Error(`Unknown hero basic attack id: ${basicAttackId}`);
  return definition;
}

function isHeroId(value: unknown): value is HeroId {
  return typeof value === 'string' && (HERO_IDS as readonly string[]).includes(value);
}

function isBiomeId(value: unknown): value is BiomeId {
  return typeof value === 'string' && (BIOME_IDS as readonly string[]).includes(value);
}

/** Validate a non-negative integer bonus with an explicit upper bound. */
function normalizeIntegerBonus(value: unknown, limit: number, field: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > limit) {
    throw new RangeError(`run start loadout ${field} must be an integer in [0, ${limit}]`);
  }
  return value;
}

/** Validate a non-negative fractional bonus with an explicit upper bound. */
function normalizeFractionBonus(value: unknown, limit: number, field: string): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
    throw new RangeError(`run start loadout ${field} must be a finite number in [0, ${limit}]`);
  }
  return value;
}

/** Validate and detach caller-owned data before it becomes deterministic state. */
export function normalizeRunStartLoadout(loadout: RunStartLoadout | undefined): NormalizedRunStartLoadout {
  if (loadout === undefined) return DEFAULT_RUN_START_LOADOUT;
  if (typeof loadout !== 'object' || loadout === null) {
    throw new TypeError('run start loadout must be an object');
  }
  if (loadout.version !== RUN_START_LOADOUT_VERSION) {
    throw new RangeError(`run start loadout version must be ${RUN_START_LOADOUT_VERSION}`);
  }
  const heroId = loadout.heroId === undefined ? 'greg' : loadout.heroId;
  if (!isHeroId(heroId)) throw new RangeError(`run start loadout heroId is unknown: ${String(heroId)}`);
  const biomeId = loadout.biomeId === undefined ? 'forest' : loadout.biomeId;
  if (!isBiomeId(biomeId)) throw new RangeError(`run start loadout biomeId is unknown: ${String(biomeId)}`);
  return Object.freeze({
    version: RUN_START_LOADOUT_VERSION,
    heroId,
    biomeId,
    maxHpBonus: normalizeIntegerBonus(loadout.maxHpBonus, RUN_START_BONUS_LIMITS.maxHpBonus, 'maxHpBonus'),
    damageMultiplierBonus: normalizeFractionBonus(
      loadout.damageMultiplierBonus, RUN_START_BONUS_LIMITS.damageMultiplierBonus, 'damageMultiplierBonus'),
    speedMultiplierBonus: normalizeFractionBonus(
      loadout.speedMultiplierBonus, RUN_START_BONUS_LIMITS.speedMultiplierBonus, 'speedMultiplierBonus'),
    pickupRadiusBonus: normalizeIntegerBonus(
      loadout.pickupRadiusBonus, RUN_START_BONUS_LIMITS.pickupRadiusBonus, 'pickupRadiusBonus'),
    xpMultiplierBonus: normalizeFractionBonus(
      loadout.xpMultiplierBonus, RUN_START_BONUS_LIMITS.xpMultiplierBonus, 'xpMultiplierBonus'),
    cooldownReductionBonus: normalizeFractionBonus(
      loadout.cooldownReductionBonus, RUN_START_BONUS_LIMITS.cooldownReductionBonus, 'cooldownReductionBonus'),
    armorBonus: normalizeIntegerBonus(loadout.armorBonus, RUN_START_BONUS_LIMITS.armorBonus, 'armorBonus'),
    critChanceBonus: normalizeFractionBonus(
      loadout.critChanceBonus, RUN_START_BONUS_LIMITS.critChanceBonus, 'critChanceBonus'),
    critMultiplierBonus: normalizeFractionBonus(
      loadout.critMultiplierBonus, RUN_START_BONUS_LIMITS.critMultiplierBonus, 'critMultiplierBonus'),
    dodgeChanceBonus: normalizeFractionBonus(
      loadout.dodgeChanceBonus, RUN_START_BONUS_LIMITS.dodgeChanceBonus, 'dodgeChanceBonus'),
  });
}

/** Stable replay identity for exactly the permanent effects a run receives. */
export function fingerprintRunStartLoadout(loadout: RunStartLoadout | undefined): string {
  const normalized = normalizeRunStartLoadout(loadout);
  const writer = createHashWriter();
  writer.u32(RUN_START_LOADOUT_VERSION);
  const heroId = normalized.heroId ?? 'greg';
  const biomeId = normalized.biomeId ?? 'forest';
  const hero = getHeroDefinition(heroId);
  const basicAttack = getHeroBasicAttackDefinition(hero.basicAttackId);
  writer.str(heroId);
  writer.str(biomeId);
  writer.f64(normalized.maxHpBonus);
  writer.f64(normalized.damageMultiplierBonus);
  writer.f64(normalized.speedMultiplierBonus);
  writer.f64(normalized.pickupRadiusBonus);
  writer.f64(normalized.xpMultiplierBonus);
  writer.f64(normalized.cooldownReductionBonus);
  writer.f64(normalized.armorBonus);
  writer.f64(normalized.critChanceBonus);
  writer.f64(normalized.critMultiplierBonus);
  writer.f64(normalized.dodgeChanceBonus);
  writer.str(basicAttack.id);
  writer.str(basicAttack.pattern);
  writer.str(basicAttack.targeting);
  writer.f64(basicAttack.damageMultiplier);
  writer.f64(basicAttack.cooldownMultiplier);
  writer.f64(basicAttack.projectileSpeedMultiplier);
  writer.f64(basicAttack.rangeMultiplier);
  writer.f64(basicAttack.projectileCount);
  writer.f64(basicAttack.spreadDegrees);
  writer.f64(basicAttack.pierce);
  writer.f64(basicAttack.arcRadians);
  writer.f64(basicAttack.groundWaveCount);
  writer.f64(basicAttack.groundWaveSpacingTicks);
  writer.f64(basicAttack.groundWaveRadius);
  writer.f64(basicAttack.groundWaveStartDistance);
  writer.f64(basicAttack.groundWaveStride);
  writer.f64(hero.critChance);
  writer.f64(hero.critMultiplier);
  writer.f64(hero.dodgeChance);
  writer.f64(hero.armor);
  writer.f64(hero.shieldMax);
  writer.f64(hero.shieldRechargeDelayTicks);
  writer.f64(hero.shieldRechargePerTick);
  writer.f64(hero.meleeDamageMultiplier);
  if (heroId === 'greg') {
    writer.str('greg-rush-rake');
    writer.u32(GREG_RUSH_RAKE_CONTENT_VERSION);
    writer.f64(DEFAULT_RUSH_RAKE_CONFIG.chargeDistanceMilliunits);
    writer.f64(DEFAULT_RUSH_RAKE_CONFIG.nearMissBonusMilliunits);
    writer.f64(DEFAULT_RUSH_RAKE_CONFIG.waveSpacingTicks);
    writer.f64(DEFAULT_RUSH_RAKE_CONFIG.targetRangeSquared);
  } else if (heroId === 'benny') {
    writer.str('benny-brace');
    writer.u32(BENNY_BRACE_CONTENT_VERSION);
    writer.f64(DEFAULT_BENNY_BRACE_CONFIG.hitsToPulse);
    writer.f64(DEFAULT_BENNY_BRACE_CONFIG.cooldownTicks);
    writer.f64(DEFAULT_BENNY_BRACE_CONFIG.pulseRadius);
    writer.f64(DEFAULT_BENNY_BRACE_CONFIG.pulseDamage);
    writer.f64(DEFAULT_BENNY_BRACE_CONFIG.knockbackStrength);
  } else {
    writer.str('gracie-scout');
    writer.u32(GRACIE_SCOUT_CONTENT_VERSION);
    writer.f64(DEFAULT_GRACIE_SCOUT_CONFIG.cooldownTicks);
    writer.f64(DEFAULT_GRACIE_SCOUT_CONFIG.markCount);
    writer.f64(DEFAULT_GRACIE_SCOUT_CONFIG.targetRangeSquared);
  }
  return writer.digestHex();
}
