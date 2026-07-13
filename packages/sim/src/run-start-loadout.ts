/**
 * Immutable, simulation-owned boundary for permanent profile effects. Browser
 * persistence resolves its purchases into this tiny payload before a run is
 * created; the simulation never reads storage directly.
 */
import { createHashWriter } from './state-hash.js';
import { DEFAULT_RUSH_RAKE_CONFIG, GREG_RUSH_RAKE_CONTENT_VERSION } from './instincts/greg-rush-rake.js';
import { BENNY_BRACE_CONTENT_VERSION, DEFAULT_BENNY_BRACE_CONFIG } from './instincts/benny-brace.js';
import { DEFAULT_GRACIE_SCOUT_CONFIG, GRACIE_SCOUT_CONTENT_VERSION } from './instincts/gracie-scout.js';

// Version 3 makes the selected hero's authored basic attack part of the run
// contract. Old records must reject rather than silently replay with a new
// attack pattern or upgrade path.
export const RUN_START_LOADOUT_VERSION = 3 as const;

export const HERO_IDS = Object.freeze(['greg', 'benny', 'gracie'] as const);
export type HeroId = (typeof HERO_IDS)[number];
export const BIOME_IDS = Object.freeze(['forest', 'saltwind'] as const);
export type BiomeId = (typeof BIOME_IDS)[number];

export type HeroBasicAttackPattern = 'single' | 'spread';
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
}

const HERO_BASIC_ATTACK_CATALOG_INTERNAL: readonly HeroBasicAttackDefinition[] = Object.freeze([
  Object.freeze({
    id: 'greg-auto-fire',
    title: "Greg's Auto-Fire",
    description: 'A measured single shot seeks the nearest threat.',
    pattern: 'single',
    targeting: 'nearest',
    damageMultiplier: 1,
    cooldownMultiplier: 1,
    projectileSpeedMultiplier: 1,
    rangeMultiplier: 1,
    projectileCount: 1,
    spreadDegrees: 0,
    pierce: 0,
  }),
  Object.freeze({
    id: 'benny-brace-burst',
    title: 'Benny’s Brace Burst',
    description: 'A heavy two-bolt guard burst trades cadence for coverage.',
    pattern: 'spread',
    targeting: 'nearest',
    damageMultiplier: 1.12,
    cooldownMultiplier: 1.35,
    projectileSpeedMultiplier: 0.92,
    rangeMultiplier: 0.9,
    projectileCount: 2,
    spreadDegrees: 12,
    pierce: 0,
  }),
  Object.freeze({
    id: 'gracie-keen-dart',
    title: 'Gracie’s Keen Dart',
    description: 'A quick survey dart seeks the highest-health threat.',
    pattern: 'single',
    targeting: 'highestHealth',
    damageMultiplier: 0.82,
    cooldownMultiplier: 0.72,
    projectileSpeedMultiplier: 1.15,
    rangeMultiplier: 1.1,
    projectileCount: 1,
    spreadDegrees: 0,
    pierce: 0,
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
    description: 'A precise all-rounder with the cleanest movement response.',
    maxHpBonus: 0,
    speedMultiplier: 1,
    pickupRadiusBonus: 0,
    weaponDamageMultiplier: 1,
    weaponCooldownMultiplier: 1,
    basicAttackId: 'greg-auto-fire',
  },
  {
    id: 'benny',
    displayName: 'Benny',
    species: 'Bull',
    epithet: 'The Bastion',
    description: 'A sturdy, deliberate bruiser who gives up speed for staying power.',
    maxHpBonus: 28,
    speedMultiplier: 0.88,
    pickupRadiusBonus: -4,
    weaponDamageMultiplier: 0.96,
    weaponCooldownMultiplier: 1.04,
    basicAttackId: 'benny-brace-burst',
  },
  {
    id: 'gracie',
    displayName: 'Gracie',
    species: 'Alpaca',
    epithet: 'The Surveyor',
    description: 'A watchful collector with a generous pickup field and faster cadence.',
    maxHpBonus: -8,
    speedMultiplier: 0.97,
    pickupRadiusBonus: 18,
    weaponDamageMultiplier: 0.93,
    weaponCooldownMultiplier: 0.92,
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
