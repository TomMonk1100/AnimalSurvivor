/**
 * Versioned, app-owned meta-progression persistence.
 *
 * This module imports only the stable hero/loadout vocabulary. It resolves
 * browser purchases and hero selection into a detached run-start payload; the
 * authoritative simulation never reads browser storage directly.
 */
import { BIOME_IDS, HERO_IDS, RUN_START_LOADOUT_VERSION, type BiomeId, type HeroId } from '@sim';
import { PALETTE_IDS, isPaletteId, type PaletteId } from './palettes';

export const PROFILE_SCHEMA_VERSION = 6 as const;
export const PROFILE_STORAGE_KEY = 'animal-survivor.profile.v6';
const LEGACY_PROFILE_STORAGE_KEY_V5 = 'animal-survivor.profile.v5';
const LEGACY_PROFILE_STORAGE_KEY_V4 = 'animal-survivor.profile.v4';
const LEGACY_PROFILE_STORAGE_KEY_V3 = 'animal-survivor.profile.v3';
const LEGACY_PROFILE_STORAGE_KEY_V2 = 'animal-survivor.profile.v2';
const LEGACY_PROFILE_STORAGE_KEY_V1 = 'animal-survivor.profile.v1';
const LEGACY_PROFILE_SCHEMA_VERSION = 1;
const LEGACY_PROFILE_SCHEMA_VERSION_V2 = 2;
const LEGACY_PROFILE_SCHEMA_VERSION_V3 = 3;
const LEGACY_PROFILE_SCHEMA_VERSION_V4 = 4;
const LEGACY_PROFILE_SCHEMA_VERSION_V5 = 5;
// All profiles before the permanent-shop migration had exactly three
// Starting Vitality ranks at +10 maximum HP each.
const LEGACY_STARTING_VITALITY_MAX_RANK = 3;

/**
 * Which resolved effect a permanent upgrade feeds. Every value except
 * `essenceMultiplier` maps to a field on the simulation's RunStartLoadout;
 * `essenceMultiplier` is applied app-side to terminal Essence rewards and
 * never crosses the deterministic boundary.
 */
export type PermanentUpgradeField =
  | 'maxHpBonus'
  | 'damageMultiplierBonus'
  | 'speedMultiplierBonus'
  | 'pickupRadiusBonus'
  | 'xpMultiplierBonus'
  | 'cooldownReductionBonus'
  | 'armorBonus'
  | 'critChanceBonus'
  | 'critMultiplierBonus'
  | 'dodgeChanceBonus'
  | 'essenceMultiplier';

export type PermanentUpgradeDisplay = 'flat' | 'percent' | 'multiplier';

export interface PermanentUpgradeDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly field: PermanentUpgradeField;
  /** Effect added per rank (e.g. 0.06 = +6%, 12 = +12 flat). */
  readonly perRank: number;
  readonly maxRank: number;
  /** Essence cost of each rank; index r is the cost to buy rank r+1. */
  readonly costs: readonly number[];
  /** How the projected value should read in the shop. */
  readonly display: PermanentUpgradeDisplay;
}

function freezePermanentUpgrade(def: PermanentUpgradeDefinition): PermanentUpgradeDefinition {
  if (def.costs.length !== def.maxRank) {
    throw new Error(`permanent upgrade ${def.id} must define one cost per rank`);
  }
  return Object.freeze({ ...def, costs: Object.freeze([...def.costs]) });
}

/**
 * The Vampire-Survivors-style permanent shop. Vitality remains the first,
 * cheapest purchase; the rest broaden a run's power along the same stat
 * vocabulary the in-run cards already use, so permanent and per-run upgrades
 * stack predictably.
 */
export const PERMANENT_UPGRADE_CATALOG: readonly PermanentUpgradeDefinition[] = Object.freeze([
  freezePermanentUpgrade({
    // Keep the prior +10 HP value so legacy ranks retain their exact earned
    // power, while the shop can extend the cap from three ranks to five.
    id: 'vitality', title: 'Vitality', description: '+10 starting max health per rank.',
    field: 'maxHpBonus', perRank: 10, maxRank: 5, costs: [10, 20, 35, 55, 80], display: 'flat',
  }),
  freezePermanentUpgrade({
    id: 'might', title: 'Might', description: '+6% damage for every attack per rank.',
    field: 'damageMultiplierBonus', perRank: 0.06, maxRank: 5, costs: [15, 30, 50, 75, 110], display: 'percent',
  }),
  freezePermanentUpgrade({
    id: 'swiftness', title: 'Swiftness', description: '+5% movement speed per rank.',
    field: 'speedMultiplierBonus', perRank: 0.05, maxRank: 5, costs: [12, 24, 40, 62, 90], display: 'percent',
  }),
  freezePermanentUpgrade({
    id: 'magnetism', title: 'Magnetism', description: '+8 pickup radius per rank.',
    field: 'pickupRadiusBonus', perRank: 8, maxRank: 5, costs: [10, 20, 32, 48, 70], display: 'flat',
  }),
  freezePermanentUpgrade({
    id: 'growth', title: 'Growth', description: '+8% XP gained per rank.',
    field: 'xpMultiplierBonus', perRank: 0.08, maxRank: 5, costs: [15, 30, 50, 75, 110], display: 'percent',
  }),
  freezePermanentUpgrade({
    id: 'armor', title: 'Armor', description: '+1 armor per rank; reduces every hit taken.',
    field: 'armorBonus', perRank: 1, maxRank: 5, costs: [12, 24, 40, 62, 90], display: 'flat',
  }),
  freezePermanentUpgrade({
    id: 'haste', title: 'Haste', description: '-4% attack cooldown per rank.',
    field: 'cooldownReductionBonus', perRank: 0.04, maxRank: 5, costs: [18, 36, 58, 86, 120], display: 'percent',
  }),
  freezePermanentUpgrade({
    id: 'precision', title: 'Precision', description: '+2% critical-hit chance per rank.',
    field: 'critChanceBonus', perRank: 0.02, maxRank: 5, costs: [15, 30, 50, 75, 110], display: 'percent',
  }),
  freezePermanentUpgrade({
    id: 'ferocity', title: 'Ferocity', description: '+0.15x critical-hit damage per rank.',
    field: 'critMultiplierBonus', perRank: 0.15, maxRank: 4, costs: [20, 42, 70, 105], display: 'multiplier',
  }),
  freezePermanentUpgrade({
    id: 'evasion', title: 'Evasion', description: '+2% chance to dodge a hit per rank.',
    field: 'dodgeChanceBonus', perRank: 0.02, maxRank: 4, costs: [20, 42, 70, 105], display: 'percent',
  }),
  freezePermanentUpgrade({
    id: 'fortune', title: 'Fortune', description: '+10% Essence earned per rank.',
    field: 'essenceMultiplier', perRank: 0.10, maxRank: 5, costs: [20, 42, 70, 105, 150], display: 'percent',
  }),
]);

export const PERMANENT_UPGRADE_IDS = Object.freeze(
  PERMANENT_UPGRADE_CATALOG.map((upgrade) => upgrade.id),
);

const PERMANENT_UPGRADE_BY_ID: ReadonlyMap<string, PermanentUpgradeDefinition> = new Map(
  PERMANENT_UPGRADE_CATALOG.map((upgrade) => [upgrade.id, upgrade]),
);

export function getPermanentUpgradeDefinition(id: string): PermanentUpgradeDefinition {
  const def = PERMANENT_UPGRADE_BY_ID.get(id);
  if (def === undefined) throw new RangeError(`unknown permanent upgrade id: ${id}`);
  return def;
}

const VITALITY_UPGRADE = getPermanentUpgradeDefinition('vitality');

/** Back-compat aliases kept so existing Vitality call sites still resolve. */
export const STARTING_VITALITY_BONUS_PER_RANK = VITALITY_UPGRADE.perRank;
export const STARTING_VITALITY_COSTS = VITALITY_UPGRADE.costs;
export const STARTING_VITALITY_MAX_RANK = VITALITY_UPGRADE.maxRank;

export type PermanentUpgradeRanks = Readonly<Record<string, number>>;

/** Returns a full rank map defaulting every catalog upgrade to zero. */
function makeDefaultUpgradeRanks(): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (const upgrade of PERMANENT_UPGRADE_CATALOG) ranks[upgrade.id] = 0;
  return ranks;
}

/** Sanitizes an arbitrary stored rank map to known ids within each maxRank. */
function normalizeUpgradeRanks(raw: unknown): Record<string, number> {
  const ranks = makeDefaultUpgradeRanks();
  if (!isRecord(raw)) return ranks;
  for (const upgrade of PERMANENT_UPGRADE_CATALOG) {
    const value = raw[upgrade.id];
    if (isSafeInteger(value) && value >= 0 && value <= upgrade.maxRank) {
      ranks[upgrade.id] = value;
    }
  }
  return ranks;
}

const MAX_RUN_ID_LENGTH = 128;
const MAX_FIELD_GUIDE_ENTRIES = 24;
const MAX_FIELD_GUIDE_VISUALS = 24;
const MAX_DISCOVERED_RECIPES = 24;
const MAX_UNLOCKED_BIOMES = BIOME_IDS.length;
const MAX_UNLOCKED_PALETTES = PALETTE_IDS.length;
const MAX_FIELD_GUIDE_TEXT_LENGTH = 256;

/** Structural subset of browser localStorage, kept injectable for tests. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type FieldGuideVisualStage = 'bud' | 'adapted' | 'mythic';

export interface FieldGuideVisual {
  readonly sourceId: string;
  readonly stage: FieldGuideVisualStage;
  readonly visualKey: string;
}

export interface FieldGuideEntry {
  readonly id: string;
  readonly heroId: HeroId;
  readonly biomeId: BiomeId;
  readonly seed: number;
  readonly outcome: TerminalOutcome;
  readonly durationTicks: number;
  readonly kills: number;
  readonly essenceEarned: number;
  readonly buildName: string;
  readonly ecologyNote: string;
  readonly visuals: readonly FieldGuideVisual[];
  readonly universalUpgradeRanks: readonly number[];
}

/** Everything persisted in the version-six local profile. */
export interface LocalProfile {
  readonly version: typeof PROFILE_SCHEMA_VERSION;
  readonly essence: number;
  /** Kept as a mirror of `permanentUpgradeRanks.vitality` for back-compat. */
  readonly startingVitalityRank: number;
  /** Purchased rank of every permanent shop upgrade, keyed by upgrade id. */
  readonly permanentUpgradeRanks: PermanentUpgradeRanks;
  readonly selectedHeroId: HeroId;
  /** Terminal run ids that have already credited their Essence award. */
  readonly settledRunIds: readonly string[];
  /** Most recent terminal runs, retained as a compact local Field Guide. */
  readonly fieldGuide: readonly FieldGuideEntry[];
  /** Mythic recipe ids discovered from completed run silhouettes. */
  readonly discoveredRecipes: readonly string[];
  /** Biomes permanently available to the local profile. Forest is the starting biome. */
  readonly unlockedBiomeIds: readonly BiomeId[];
  /** Mythic presentation palettes permanently available to the local profile. */
  readonly unlockedPaletteIds: readonly PaletteId[];
  /** Selected presentation palette; never part of the run-start loadout/hash. */
  readonly selectedPaletteId: PaletteId;
}

/**
 * Normalized input for future run creation. `maxHpBonus` is resolved rather
 * than asking gameplay code to understand profile ranks or purchase costs.
 */
export interface RunStartLoadout {
  readonly version: typeof RUN_START_LOADOUT_VERSION;
  readonly heroId: HeroId;
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

export type TerminalOutcome = 'victory' | 'defeat';

export interface TerminalSettlement {
  /** Stable id generated when a run begins; retries must reuse this exact id. */
  readonly runId: string;
  /** Enforces that this API is used only for an actual terminal result. */
  readonly outcome: TerminalOutcome;
  /** App-owned award calculation; this module only validates and credits it. */
  readonly essenceAward: number;
}

export interface TerminalSettlementResult {
  /** False means this run id had already been credited. */
  readonly settled: boolean;
  readonly awardedEssence: number;
  readonly profile: LocalProfile;
}

export type StartingVitalityPurchaseReason = 'purchased' | 'insufficient-essence' | 'max-rank';

export interface StartingVitalityPurchaseResult {
  readonly purchased: boolean;
  readonly reason: StartingVitalityPurchaseReason;
  /** Cost of the completed or next purchase; null when already capped. */
  readonly cost: number | null;
  readonly profile: LocalProfile;
  readonly startLoadout: RunStartLoadout;
}

export type PermanentUpgradePurchaseReason =
  | 'purchased'
  | 'insufficient-essence'
  | 'max-rank'
  | 'unknown-upgrade';

export interface PermanentUpgradePurchaseResult {
  readonly purchased: boolean;
  readonly reason: PermanentUpgradePurchaseReason;
  readonly id: string;
  /** Rank after the attempt. */
  readonly rank: number;
  /** Cost of the completed purchase, or the next rank; null when capped/unknown. */
  readonly cost: number | null;
  readonly profile: LocalProfile;
  readonly startLoadout: RunStartLoadout;
}

export interface ProfileStore {
  /** Current immutable profile snapshot. */
  profile(): LocalProfile;
  /** Current immutable, normalized loadout for a new run. */
  startLoadout(): RunStartLoadout;
  /** Credit a terminal reward once per stable run id. */
  settleTerminalRun(settlement: TerminalSettlement): TerminalSettlementResult;
  /** Buy the next permanent Starting Vitality rank if possible. */
  purchaseStartingVitality(): StartingVitalityPurchaseResult;
  /** Current purchased rank of any permanent upgrade (0 if unknown id). */
  permanentUpgradeRank(id: string): number;
  /** Buy the next rank of any permanent shop upgrade if possible. */
  purchasePermanentUpgrade(id: string): PermanentUpgradePurchaseResult;
  /** Combined Essence-reward multiplier granted by the Fortune upgrade. */
  essenceMultiplier(): number;
  /** Persist the next run's selected founding hero. */
  selectHero(heroId: HeroId): LocalProfile;
  /** Persist a palette only when the local profile has unlocked it. */
  selectPalette(paletteId: PaletteId): LocalProfile;
  /** Add one terminal run to the bounded, idempotent Field Guide. */
  recordFieldGuideEntry(entry: FieldGuideEntry): LocalProfile;
  /** Export the current profile as a versioned JSON save. */
  exportProfile(): string;
  /** Validate and import a versioned JSON save without partial mutation. */
  importProfile(raw: string): LocalProfile;
  /** Replace the save with a fresh profile. */
  resetProfile(): LocalProfile;
}

interface MutableProfile {
  version: typeof PROFILE_SCHEMA_VERSION;
  essence: number;
  permanentUpgradeRanks: Record<string, number>;
  selectedHeroId: HeroId;
  settledRunIds: string[];
  fieldGuide: FieldGuideEntry[];
  discoveredRecipes: string[];
  unlockedBiomeIds: BiomeId[];
  unlockedPaletteIds: PaletteId[];
  selectedPaletteId: PaletteId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isUint32(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value <= 0xffffffff;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_FIELD_GUIDE_TEXT_LENGTH
    && value === value.trim();
}

function assertCanonicalRunId(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError('runId must be a string');
  }
  if (value !== value.trim() || value.length === 0 || value.length > MAX_RUN_ID_LENGTH) {
    throw new RangeError(`runId must be a trimmed, non-empty string of at most ${MAX_RUN_ID_LENGTH} characters`);
  }
  return value;
}

function isCanonicalRunId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_RUN_ID_LENGTH
    && value === value.trim();
}

function makeDefaultProfile(): MutableProfile {
  return {
    version: PROFILE_SCHEMA_VERSION,
    essence: 0,
    permanentUpgradeRanks: makeDefaultUpgradeRanks(),
    selectedHeroId: 'greg',
    settledRunIds: [],
    fieldGuide: [],
    discoveredRecipes: [],
    unlockedBiomeIds: ['forest'],
    unlockedPaletteIds: ['forest'],
    selectedPaletteId: 'forest',
  };
}

function freezeFieldGuideEntry(entry: FieldGuideEntry): FieldGuideEntry {
  return Object.freeze({
    id: entry.id,
    heroId: entry.heroId,
    biomeId: entry.biomeId,
    seed: entry.seed,
    outcome: entry.outcome,
    durationTicks: entry.durationTicks,
    kills: entry.kills,
    essenceEarned: entry.essenceEarned,
    buildName: entry.buildName,
    ecologyNote: entry.ecologyNote,
    visuals: Object.freeze(entry.visuals.map((visual) => Object.freeze({ ...visual }))),
    universalUpgradeRanks: Object.freeze([...entry.universalUpgradeRanks]),
  });
}

function freezeProfile(profile: MutableProfile): LocalProfile {
  const ranks = normalizeUpgradeRanks(profile.permanentUpgradeRanks);
  return Object.freeze({
    version: PROFILE_SCHEMA_VERSION,
    essence: profile.essence,
    startingVitalityRank: ranks.vitality ?? 0,
    permanentUpgradeRanks: Object.freeze({ ...ranks }),
    selectedHeroId: profile.selectedHeroId,
    settledRunIds: Object.freeze([...profile.settledRunIds]),
    fieldGuide: Object.freeze(profile.fieldGuide.map(freezeFieldGuideEntry)),
    discoveredRecipes: Object.freeze([...profile.discoveredRecipes]),
    unlockedBiomeIds: Object.freeze([...profile.unlockedBiomeIds]),
    unlockedPaletteIds: Object.freeze([...profile.unlockedPaletteIds]),
    selectedPaletteId: profile.selectedPaletteId,
  });
}

function cloneProfile(profile: LocalProfile): MutableProfile {
  return {
    version: PROFILE_SCHEMA_VERSION,
    essence: profile.essence,
    permanentUpgradeRanks: normalizeUpgradeRanks(profile.permanentUpgradeRanks),
    selectedHeroId: profile.selectedHeroId,
    settledRunIds: [...profile.settledRunIds],
    fieldGuide: profile.fieldGuide.map((entry) => ({
      ...entry,
      visuals: entry.visuals.map((visual) => ({ ...visual })),
      universalUpgradeRanks: [...entry.universalUpgradeRanks],
    })),
    discoveredRecipes: [...profile.discoveredRecipes],
    unlockedBiomeIds: [...profile.unlockedBiomeIds],
    unlockedPaletteIds: [...profile.unlockedPaletteIds],
    selectedPaletteId: profile.selectedPaletteId,
  };
}

function isHeroId(value: unknown): value is HeroId {
  return typeof value === 'string' && (HERO_IDS as readonly string[]).includes(value);
}

function isBiomeId(value: unknown): value is BiomeId {
  return typeof value === 'string' && (BIOME_IDS as readonly string[]).includes(value);
}

function isFieldGuideStage(value: unknown): value is FieldGuideVisualStage {
  return value === 'bud' || value === 'adapted' || value === 'mythic';
}

function parseFieldGuideEntry(value: unknown): FieldGuideEntry | null {
  if (!isRecord(value)
    || !isCanonicalRunId(value.id)
    || !isHeroId(value.heroId)
    || (value.biomeId !== undefined && !isBiomeId(value.biomeId))
    || !isUint32(value.seed)
    || (value.outcome !== 'victory' && value.outcome !== 'defeat')
    || !isNonNegativeSafeInteger(value.durationTicks)
    || !isNonNegativeSafeInteger(value.kills)
    || !isNonNegativeSafeInteger(value.essenceEarned)
    || !isBoundedText(value.buildName)
    || !isBoundedText(value.ecologyNote)
    || !Array.isArray(value.visuals)
    || value.visuals.length > MAX_FIELD_GUIDE_VISUALS
    || !Array.isArray(value.universalUpgradeRanks)
    || value.universalUpgradeRanks.length > 16) {
    return null;
  }
  const visuals: FieldGuideVisual[] = [];
  const seenVisuals = new Set<string>();
  for (const visual of value.visuals) {
    if (!isRecord(visual)
      || typeof visual.sourceId !== 'string'
      || visual.sourceId.length === 0
      || visual.sourceId.length > 96
      || visual.sourceId !== visual.sourceId.trim()
      || !isFieldGuideStage(visual.stage)
      || typeof visual.visualKey !== 'string'
      || visual.visualKey.length === 0
      || visual.visualKey.length > 128
      || visual.visualKey !== visual.visualKey.trim()) {
      return null;
    }
    const visualId = `${visual.sourceId}:${visual.stage}`;
    if (seenVisuals.has(visualId)) return null;
    seenVisuals.add(visualId);
    visuals.push({ sourceId: visual.sourceId, stage: visual.stage, visualKey: visual.visualKey });
  }
  const universalUpgradeRanks: number[] = [];
  for (const rank of value.universalUpgradeRanks) {
    if (!isNonNegativeSafeInteger(rank) || rank > 255) return null;
    universalUpgradeRanks.push(rank);
  }
  return freezeFieldGuideEntry({
    id: value.id,
    heroId: value.heroId,
    biomeId: value.biomeId === undefined ? 'forest' : value.biomeId,
    seed: value.seed,
    outcome: value.outcome,
    durationTicks: value.durationTicks,
    kills: value.kills,
    essenceEarned: value.essenceEarned,
    buildName: value.buildName,
    ecologyNote: value.ecologyNote,
    visuals,
    universalUpgradeRanks,
  });
}

function parseStoredProfile(raw: string): LocalProfile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)
    || (parsed.version !== PROFILE_SCHEMA_VERSION
      && parsed.version !== LEGACY_PROFILE_SCHEMA_VERSION_V5
      && parsed.version !== LEGACY_PROFILE_SCHEMA_VERSION_V4
      && parsed.version !== LEGACY_PROFILE_SCHEMA_VERSION_V3
      && parsed.version !== LEGACY_PROFILE_SCHEMA_VERSION_V2
      && parsed.version !== LEGACY_PROFILE_SCHEMA_VERSION)) {
    return null;
  }
  const essence = parsed.essence;
  // Version 6 stores the full permanent rank map; earlier records only carried
  // the single Vitality rank, which migrates into the map's `vitality` slot.
  let permanentUpgradeRanks: Record<string, number>;
  if (parsed.version === PROFILE_SCHEMA_VERSION) {
    permanentUpgradeRanks = normalizeUpgradeRanks(parsed.permanentUpgradeRanks);
  } else {
    const legacyVitality = parsed.startingVitalityRank;
    if (!isSafeInteger(legacyVitality)
      || legacyVitality < 0
      || legacyVitality > LEGACY_STARTING_VITALITY_MAX_RANK) {
      return null;
    }
    permanentUpgradeRanks = makeDefaultUpgradeRanks();
    permanentUpgradeRanks.vitality = legacyVitality;
  }
  const selectedHeroId = parsed.version === LEGACY_PROFILE_SCHEMA_VERSION ? 'greg' : parsed.selectedHeroId;
  const storedRunIds = parsed.settledRunIds;
  const storedFieldGuide = parsed.version >= LEGACY_PROFILE_SCHEMA_VERSION_V3 ? parsed.fieldGuide : [];
  const storedDiscoveredRecipes = parsed.version >= LEGACY_PROFILE_SCHEMA_VERSION_V3
    ? parsed.discoveredRecipes ?? []
    : [];
  const storedUnlockedBiomeIds = parsed.version >= LEGACY_PROFILE_SCHEMA_VERSION_V4
    ? parsed.unlockedBiomeIds ?? ['forest']
    : ['forest'];
  const selectedPaletteValue = parsed.version >= LEGACY_PROFILE_SCHEMA_VERSION_V5 ? parsed.selectedPaletteId : 'forest';
  const selectedPaletteId = isPaletteId(selectedPaletteValue) ? selectedPaletteValue : null;
  const storedUnlockedPaletteIds = parsed.version >= LEGACY_PROFILE_SCHEMA_VERSION_V5
    ? parsed.unlockedPaletteIds ?? ['forest']
    : ['forest'];
  if (!isNonNegativeSafeInteger(essence)
    || !Array.isArray(storedRunIds)
    || !Array.isArray(storedFieldGuide)
    || !Array.isArray(storedDiscoveredRecipes)
    || !Array.isArray(storedUnlockedBiomeIds)
    || !Array.isArray(storedUnlockedPaletteIds)
    || storedFieldGuide.length > MAX_FIELD_GUIDE_ENTRIES
    || storedDiscoveredRecipes.length > MAX_DISCOVERED_RECIPES
    || storedUnlockedBiomeIds.length === 0
    || storedUnlockedBiomeIds.length > MAX_UNLOCKED_BIOMES
    || storedUnlockedPaletteIds.length === 0
    || storedUnlockedPaletteIds.length > MAX_UNLOCKED_PALETTES
    || selectedPaletteId === null
    || !isHeroId(selectedHeroId)) {
    return null;
  }

  const settledRunIds: string[] = [];
  const seen = new Set<string>();
  for (const runId of storedRunIds) {
    if (!isCanonicalRunId(runId) || seen.has(runId)) return null;
    seen.add(runId);
    settledRunIds.push(runId);
  }
  const fieldGuide: FieldGuideEntry[] = [];
  const seenEntries = new Set<string>();
  for (const entry of storedFieldGuide) {
    const parsedEntry = parseFieldGuideEntry(entry);
    if (parsedEntry === null || seenEntries.has(parsedEntry.id)) return null;
    seenEntries.add(parsedEntry.id);
    fieldGuide.push(parsedEntry);
  }
  const discoveredRecipes: string[] = [];
  const seenRecipes = new Set<string>();
  for (const recipe of storedDiscoveredRecipes) {
    if (typeof recipe !== 'string' || recipe.length === 0 || recipe.length > 96 || recipe !== recipe.trim() || seenRecipes.has(recipe)) {
      return null;
    }
    seenRecipes.add(recipe);
    discoveredRecipes.push(recipe);
  }
  discoveredRecipes.sort();
  const unlockedBiomeIds: BiomeId[] = [];
  const seenBiomes = new Set<string>();
  for (const biomeId of storedUnlockedBiomeIds) {
    if (!isBiomeId(biomeId) || seenBiomes.has(biomeId)) return null;
    seenBiomes.add(biomeId);
    unlockedBiomeIds.push(biomeId);
  }
  if (!seenBiomes.has('forest')) return null;
  const unlockedPaletteIds: PaletteId[] = [];
  const seenPalettes = new Set<string>();
  for (const paletteId of storedUnlockedPaletteIds) {
    if (!isPaletteId(paletteId) || seenPalettes.has(paletteId)) return null;
    seenPalettes.add(paletteId);
    unlockedPaletteIds.push(paletteId);
  }
  if (!seenPalettes.has('forest') || !seenPalettes.has(selectedPaletteId)) return null;
  return freezeProfile({
    version: PROFILE_SCHEMA_VERSION,
    essence,
    permanentUpgradeRanks,
    selectedHeroId,
    settledRunIds,
    fieldGuide,
    discoveredRecipes,
    unlockedBiomeIds,
    unlockedPaletteIds,
    selectedPaletteId,
  });
}

function serializeProfile(profile: LocalProfile): string {
  return JSON.stringify({
    version: PROFILE_SCHEMA_VERSION,
    essence: profile.essence,
    // `startingVitalityRank` is serialized for backward-compatible readers;
    // `permanentUpgradeRanks` is the authoritative source on load.
    startingVitalityRank: profile.startingVitalityRank,
    permanentUpgradeRanks: profile.permanentUpgradeRanks,
    selectedHeroId: profile.selectedHeroId,
    settledRunIds: profile.settledRunIds,
    fieldGuide: profile.fieldGuide,
    discoveredRecipes: profile.discoveredRecipes,
    unlockedBiomeIds: profile.unlockedBiomeIds,
    unlockedPaletteIds: profile.unlockedPaletteIds,
    selectedPaletteId: profile.selectedPaletteId,
  });
}

function saveProfile(storage: ProfileStorage, storageKey: string, profile: LocalProfile): void {
  storage.setItem(storageKey, serializeProfile(profile));
}

function loadProfile(storage: ProfileStorage, storageKey: string): LocalProfile {
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey);
    if (raw === null && storageKey === PROFILE_STORAGE_KEY) {
      raw = storage.getItem(LEGACY_PROFILE_STORAGE_KEY_V5);
      if (raw === null) raw = storage.getItem(LEGACY_PROFILE_STORAGE_KEY_V4);
      if (raw === null) raw = storage.getItem(LEGACY_PROFILE_STORAGE_KEY_V3);
      if (raw === null) raw = storage.getItem(LEGACY_PROFILE_STORAGE_KEY_V2);
      if (raw === null) raw = storage.getItem(LEGACY_PROFILE_STORAGE_KEY_V1);
    }
  } catch {
    // Browser storage can be unavailable in private/security-restricted modes.
    // Keep the app usable with an in-memory default rather than leaking an
    // exception into run startup.
    return freezeProfile(makeDefaultProfile());
  }
  if (raw === null) return freezeProfile(makeDefaultProfile());

  const parsed = parseStoredProfile(raw);
  if (parsed !== null) return parsed;

  // Never trust a malformed or mismatched schema. Replace it when possible so
  // future loads do not keep retrying the corrupt payload.
  const reset = freezeProfile(makeDefaultProfile());
  try {
    saveProfile(storage, storageKey, reset);
  } catch {
    // The safe in-memory reset is still valid if writing is unavailable.
  }
  return reset;
}

function assertTerminalSettlement(settlement: TerminalSettlement): void {
  assertCanonicalRunId(settlement.runId);
  if (settlement.outcome !== 'victory' && settlement.outcome !== 'defeat') {
    throw new RangeError('terminal settlement outcome must be victory or defeat');
  }
  if (!isNonNegativeSafeInteger(settlement.essenceAward)) {
    throw new RangeError('terminal settlement essenceAward must be a non-negative safe integer');
  }
}

function assertFieldGuideEntry(entry: FieldGuideEntry): void {
  if (!isRecord(entry)) throw new TypeError('Field Guide entry must be an object');
  if (!isCanonicalRunId(entry.id)) throw new RangeError('Field Guide entry id must be canonical');
  if (!isHeroId(entry.heroId)) throw new RangeError('Field Guide entry heroId is unknown');
  if (!isBiomeId(entry.biomeId)) throw new RangeError('Field Guide entry biomeId is unknown');
  if (!isUint32(entry.seed)) throw new RangeError('Field Guide entry seed must be a uint32');
  if (entry.outcome !== 'victory' && entry.outcome !== 'defeat') throw new RangeError('Field Guide entry outcome is invalid');
  if (!isNonNegativeSafeInteger(entry.durationTicks)) throw new RangeError('Field Guide durationTicks must be non-negative');
  if (!isNonNegativeSafeInteger(entry.kills)) throw new RangeError('Field Guide kills must be non-negative');
  if (!isNonNegativeSafeInteger(entry.essenceEarned)) throw new RangeError('Field Guide essenceEarned must be non-negative');
  if (!isBoundedText(entry.buildName) || !isBoundedText(entry.ecologyNote)) {
    throw new RangeError('Field Guide text is invalid');
  }
  if (!Array.isArray(entry.visuals) || entry.visuals.length > MAX_FIELD_GUIDE_VISUALS) {
    throw new RangeError('Field Guide visuals exceed the supported limit');
  }
  if (!Array.isArray(entry.universalUpgradeRanks) || entry.universalUpgradeRanks.length > 16) {
    throw new RangeError('Field Guide universal ranks exceed the supported limit');
  }
  if (parseFieldGuideEntry(entry) === null) throw new RangeError('Field Guide entry is invalid');
}

/** Total resolved effect of one permanent upgrade (rank × per-rank value). */
function resolveUpgradeValue(ranks: PermanentUpgradeRanks, id: string): number {
  const def = getPermanentUpgradeDefinition(id);
  const rank = ranks[id] ?? 0;
  const clamped = Number.isInteger(rank) && rank >= 0 ? Math.min(rank, def.maxRank) : 0;
  return clamped * def.perRank;
}

/** Resolves a frozen profile into the permanent stat block future runs need. */
export function createRunStartLoadout(profile: LocalProfile): RunStartLoadout {
  const ranks = profile.permanentUpgradeRanks;
  return Object.freeze({
    version: RUN_START_LOADOUT_VERSION,
    heroId: profile.selectedHeroId,
    biomeId: 'forest' as const,
    // Vitality is a flat integer; round to guard against any float drift.
    maxHpBonus: Math.round(resolveUpgradeValue(ranks, 'vitality')),
    damageMultiplierBonus: resolveUpgradeValue(ranks, 'might'),
    speedMultiplierBonus: resolveUpgradeValue(ranks, 'swiftness'),
    pickupRadiusBonus: Math.round(resolveUpgradeValue(ranks, 'magnetism')),
    xpMultiplierBonus: resolveUpgradeValue(ranks, 'growth'),
    cooldownReductionBonus: resolveUpgradeValue(ranks, 'haste'),
    armorBonus: Math.round(resolveUpgradeValue(ranks, 'armor')),
    critChanceBonus: resolveUpgradeValue(ranks, 'precision'),
    critMultiplierBonus: resolveUpgradeValue(ranks, 'ferocity'),
    dodgeChanceBonus: resolveUpgradeValue(ranks, 'evasion'),
  });
}

/** Fortune multiplier applied to Essence rewards, e.g. 1.2 at rank 2. */
export function resolveEssenceMultiplier(profile: LocalProfile): number {
  return 1 + resolveUpgradeValue(profile.permanentUpgradeRanks, 'fortune');
}

/**
 * Creates an isolated local-profile store. Pass `window.localStorage` from a
 * browser integration; tests and non-browser callers can inject a small map
 * implementation instead. No persistence is attempted until a mutation or a
 * corrupt stored payload needs replacement.
 */
export function createProfileStore(
  storage: ProfileStorage,
  storageKey = PROFILE_STORAGE_KEY,
): ProfileStore {
  if (storageKey.trim().length === 0) throw new RangeError('storageKey must not be blank');
  let state = loadProfile(storage, storageKey);

  function persist(next: MutableProfile): LocalProfile {
    const frozen = freezeProfile(next);
    // Write first: a quota/security failure must not make this process claim a
    // reward or purchase that will disappear after a refresh.
    saveProfile(storage, storageKey, frozen);
    state = frozen;
    return state;
  }

  function purchasePermanent(id: string): PermanentUpgradePurchaseResult {
    const def = PERMANENT_UPGRADE_BY_ID.get(id);
    if (def === undefined) {
      return Object.freeze({
        purchased: false, reason: 'unknown-upgrade', id, rank: 0, cost: null,
        profile: state, startLoadout: createRunStartLoadout(state),
      });
    }
    const rank = state.permanentUpgradeRanks[id] ?? 0;
    if (rank >= def.maxRank) {
      return Object.freeze({
        purchased: false, reason: 'max-rank', id, rank, cost: null,
        profile: state, startLoadout: createRunStartLoadout(state),
      });
    }
    const cost = def.costs[rank]!;
    if (state.essence < cost) {
      return Object.freeze({
        purchased: false, reason: 'insufficient-essence', id, rank, cost,
        profile: state, startLoadout: createRunStartLoadout(state),
      });
    }
    const next = cloneProfile(state);
    next.essence -= cost;
    next.permanentUpgradeRanks[id] = rank + 1;
    const profile = persist(next);
    return Object.freeze({
      purchased: true, reason: 'purchased', id, rank: rank + 1, cost,
      profile, startLoadout: createRunStartLoadout(profile),
    });
  }

  return {
    profile() {
      return state;
    },
    startLoadout() {
      return createRunStartLoadout(state);
    },
    settleTerminalRun(settlement) {
      assertTerminalSettlement(settlement);
      if (state.settledRunIds.includes(settlement.runId)) {
        return Object.freeze({ settled: false, awardedEssence: 0, profile: state });
      }
      if (state.essence > Number.MAX_SAFE_INTEGER - settlement.essenceAward) {
        throw new RangeError('terminal settlement would exceed the Essence safe-integer limit');
      }
      const next = cloneProfile(state);
      next.essence += settlement.essenceAward;
      next.settledRunIds.push(settlement.runId);
      const profile = persist(next);
      return Object.freeze({ settled: true, awardedEssence: settlement.essenceAward, profile });
    },
    permanentUpgradeRank(id) {
      return state.permanentUpgradeRanks[id] ?? 0;
    },
    essenceMultiplier() {
      return resolveEssenceMultiplier(state);
    },
    purchasePermanentUpgrade(id) {
      return purchasePermanent(id);
    },
    purchaseStartingVitality() {
      const result = purchasePermanent('vitality');
      const reason: StartingVitalityPurchaseReason = result.reason === 'unknown-upgrade'
        ? 'max-rank'
        : result.reason;
      return Object.freeze({
        purchased: result.purchased,
        reason,
        cost: result.cost,
        profile: result.profile,
        startLoadout: result.startLoadout,
      });
    },
    selectHero(heroId) {
      if (!isHeroId(heroId)) throw new RangeError(`unknown hero id: ${String(heroId)}`);
      if (state.selectedHeroId === heroId) return state;
      const next = cloneProfile(state);
      next.selectedHeroId = heroId;
      return persist(next);
    },
    selectPalette(paletteId) {
      if (!isPaletteId(paletteId)) throw new RangeError(`unknown palette id: ${String(paletteId)}`);
      if (!state.unlockedPaletteIds.includes(paletteId)) {
        throw new RangeError(`palette is locked: ${paletteId}`);
      }
      if (state.selectedPaletteId === paletteId) return state;
      const next = cloneProfile(state);
      next.selectedPaletteId = paletteId;
      return persist(next);
    },
    recordFieldGuideEntry(entry) {
      assertFieldGuideEntry(entry);
      if (state.fieldGuide.some((record) => record.id === entry.id)) return state;
      const next = cloneProfile(state);
      next.fieldGuide.unshift(freezeFieldGuideEntry(entry));
      next.fieldGuide = next.fieldGuide.slice(0, MAX_FIELD_GUIDE_ENTRIES);
      const recipes = new Set(next.discoveredRecipes);
      const palettes = new Set(next.unlockedPaletteIds);
      for (const visual of entry.visuals) {
        if (visual.stage === 'mythic') {
          recipes.add(visual.sourceId);
          if (isPaletteId(visual.sourceId)) palettes.add(visual.sourceId);
        }
      }
      next.discoveredRecipes = [...recipes].sort().slice(0, MAX_DISCOVERED_RECIPES);
      next.unlockedPaletteIds = [...palettes].sort().slice(0, MAX_UNLOCKED_PALETTES) as PaletteId[];
      if (entry.outcome === 'victory' && entry.biomeId === 'forest' && !next.unlockedBiomeIds.includes('saltwind')) {
        next.unlockedBiomeIds.push('saltwind');
      }
      return persist(next);
    },
    exportProfile() {
      return serializeProfile(state);
    },
    importProfile(raw) {
      const imported = parseStoredProfile(raw);
      if (imported === null) throw new RangeError('profile import is invalid');
      return persist(cloneProfile(imported));
    },
    resetProfile() {
      return persist(makeDefaultProfile());
    },
  };
}
