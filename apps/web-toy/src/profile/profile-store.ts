/**
 * Versioned, app-owned meta-progression persistence.
 *
 * This module deliberately does not import simulation, director, or UI code.
 * A future run bootstrap can read the normalized `RunStartLoadout` here and
 * pass it into an authoritative run-start boundary without making browser
 * storage part of deterministic simulation state.
 */

export const PROFILE_SCHEMA_VERSION = 1 as const;
export const PROFILE_STORAGE_KEY = 'animal-survivor.profile.v1';

/** A deliberately small first permanent purchase: +10 maximum health per rank. */
export const STARTING_VITALITY_BONUS_PER_RANK = 10;
export const STARTING_VITALITY_COSTS = Object.freeze([10, 20, 30] as const);
export const STARTING_VITALITY_MAX_RANK = STARTING_VITALITY_COSTS.length;

const MAX_RUN_ID_LENGTH = 128;

/** Structural subset of browser localStorage, kept injectable for tests. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Everything persisted in the version-one local profile. */
export interface LocalProfile {
  readonly version: typeof PROFILE_SCHEMA_VERSION;
  readonly essence: number;
  readonly startingVitalityRank: number;
  /** Terminal run ids that have already credited their Essence award. */
  readonly settledRunIds: readonly string[];
}

/**
 * Normalized input for future run creation. `maxHpBonus` is resolved rather
 * than asking gameplay code to understand profile ranks or purchase costs.
 */
export interface RunStartLoadout {
  readonly version: typeof PROFILE_SCHEMA_VERSION;
  readonly maxHpBonus: number;
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

export interface ProfileStore {
  /** Current immutable profile snapshot. */
  profile(): LocalProfile;
  /** Current immutable, normalized loadout for a new run. */
  startLoadout(): RunStartLoadout;
  /** Credit a terminal reward once per stable run id. */
  settleTerminalRun(settlement: TerminalSettlement): TerminalSettlementResult;
  /** Buy the next permanent Starting Vitality rank if possible. */
  purchaseStartingVitality(): StartingVitalityPurchaseResult;
}

interface MutableProfile {
  version: typeof PROFILE_SCHEMA_VERSION;
  essence: number;
  startingVitalityRank: number;
  settledRunIds: string[];
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
    startingVitalityRank: 0,
    settledRunIds: [],
  };
}

function freezeProfile(profile: MutableProfile): LocalProfile {
  return Object.freeze({
    version: PROFILE_SCHEMA_VERSION,
    essence: profile.essence,
    startingVitalityRank: profile.startingVitalityRank,
    settledRunIds: Object.freeze([...profile.settledRunIds]),
  });
}

function cloneProfile(profile: LocalProfile): MutableProfile {
  return {
    version: PROFILE_SCHEMA_VERSION,
    essence: profile.essence,
    startingVitalityRank: profile.startingVitalityRank,
    settledRunIds: [...profile.settledRunIds],
  };
}

function parseStoredProfile(raw: string): LocalProfile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== PROFILE_SCHEMA_VERSION) {
    return null;
  }
  const essence = parsed.essence;
  const startingVitalityRank = parsed.startingVitalityRank;
  const storedRunIds = parsed.settledRunIds;
  if (!isNonNegativeSafeInteger(essence)
    || !isSafeInteger(startingVitalityRank)
    || startingVitalityRank < 0
    || startingVitalityRank > STARTING_VITALITY_MAX_RANK
    || !Array.isArray(storedRunIds)) {
    return null;
  }

  const settledRunIds: string[] = [];
  const seen = new Set<string>();
  for (const runId of storedRunIds) {
    if (!isCanonicalRunId(runId) || seen.has(runId)) return null;
    seen.add(runId);
    settledRunIds.push(runId);
  }
  return freezeProfile({
    version: PROFILE_SCHEMA_VERSION,
    essence,
    startingVitalityRank,
    settledRunIds,
  });
}

function serializeProfile(profile: LocalProfile): string {
  return JSON.stringify({
    version: PROFILE_SCHEMA_VERSION,
    essence: profile.essence,
    startingVitalityRank: profile.startingVitalityRank,
    settledRunIds: profile.settledRunIds,
  });
}

function saveProfile(storage: ProfileStorage, storageKey: string, profile: LocalProfile): void {
  storage.setItem(storageKey, serializeProfile(profile));
}

function loadProfile(storage: ProfileStorage, storageKey: string): LocalProfile {
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey);
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

/** Resolves a frozen profile into the only permanent stat future runs need. */
export function createRunStartLoadout(profile: LocalProfile): RunStartLoadout {
  const rank = profile.startingVitalityRank;
  if (!Number.isInteger(rank) || rank < 0 || rank > STARTING_VITALITY_MAX_RANK) {
    throw new RangeError('profile startingVitalityRank is outside the supported range');
  }
  return Object.freeze({
    version: PROFILE_SCHEMA_VERSION,
    maxHpBonus: rank * STARTING_VITALITY_BONUS_PER_RANK,
  });
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
    purchaseStartingVitality() {
      const rank = state.startingVitalityRank;
      if (rank >= STARTING_VITALITY_MAX_RANK) {
        return Object.freeze({
          purchased: false,
          reason: 'max-rank',
          cost: null,
          profile: state,
          startLoadout: createRunStartLoadout(state),
        });
      }
      const cost = STARTING_VITALITY_COSTS[rank]!;
      if (state.essence < cost) {
        return Object.freeze({
          purchased: false,
          reason: 'insufficient-essence',
          cost,
          profile: state,
          startLoadout: createRunStartLoadout(state),
        });
      }
      const next = cloneProfile(state);
      next.essence -= cost;
      next.startingVitalityRank += 1;
      const profile = persist(next);
      return Object.freeze({
        purchased: true,
        reason: 'purchased',
        cost,
        profile,
        startLoadout: createRunStartLoadout(profile),
      });
    },
  };
}
