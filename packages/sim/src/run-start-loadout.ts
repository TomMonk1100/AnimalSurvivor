/**
 * Immutable, simulation-owned boundary for permanent profile effects. Browser
 * persistence resolves its purchases into this tiny payload before a run is
 * created; the simulation never reads storage directly.
 */
import { createHashWriter } from './state-hash.js';
import { DEFAULT_RUSH_RAKE_CONFIG, GREG_RUSH_RAKE_CONTENT_VERSION } from './instincts/greg-rush-rake.js';
import { BENNY_BRACE_CONTENT_VERSION, DEFAULT_BENNY_BRACE_CONFIG } from './instincts/benny-brace.js';
import { DEFAULT_GRACIE_SCOUT_CONFIG, GRACIE_SCOUT_CONTENT_VERSION } from './instincts/gracie-scout.js';

// Version 4 makes the V1.1 hero combat identity (melee arcs, earth waves,
// projectile spit, and defensive baselines) part of the run contract. Old
// records must reject rather than silently replay with a different kit.
export const RUN_START_LOADOUT_VERSION = 4 as const;

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
    description: 'Greg commits to a broad forward claw swipe through nearby threats.',
    pattern: 'meleeArc',
    targeting: 'nearest',
    damageMultiplier: 1.26,
    cooldownMultiplier: 1.12,
    projectileSpeedMultiplier: 1,
    rangeMultiplier: 0.72,
    projectileCount: 0,
    spreadDegrees: 0,
    pierce: 0,
    arcRadians: 1.72,
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
}

export const DEFAULT_RUN_START_LOADOUT: RunStartLoadout = Object.freeze({
  version: RUN_START_LOADOUT_VERSION,
  heroId: 'greg',
  biomeId: 'forest',
  maxHpBonus: 0,
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

/** Validate and detach caller-owned data before it becomes deterministic state. */
export function normalizeRunStartLoadout(loadout: RunStartLoadout | undefined): RunStartLoadout {
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
  if (!Number.isSafeInteger(loadout.maxHpBonus) || loadout.maxHpBonus < 0) {
    throw new RangeError('run start loadout maxHpBonus must be a non-negative safe integer');
  }
  return Object.freeze({ version: RUN_START_LOADOUT_VERSION, heroId, biomeId, maxHpBonus: loadout.maxHpBonus });
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
