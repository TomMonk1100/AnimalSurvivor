/**
 * LEAD-OWNED — FROZEN identifiers and simple unions.
 *
 * These are the atomic naming primitives for the run director. They are frozen
 * before parallel implementation and MUST NOT be revised by implementation
 * agents. Proposed changes return to the lead.
 */

/** Authored phase identifiers for the first Greg run, in chronological order. */
export type RunPhaseId =
  | 'opening'
  | 'pressure'
  | 'adaptation'
  | 'mutation'
  | 'boss'
  | 'overtime';

/** Ordered list of the phase ids, chronological. Frozen. */
export const RUN_PHASE_ORDER: readonly RunPhaseId[] = [
  'opening',
  'pressure',
  'adaptation',
  'mutation',
  'boss',
  'overtime',
] as const;

/** Terminal + non-terminal encounter outcomes. */
export type RunOutcome = 'running' | 'victory' | 'defeat';

/** Generic gameplay archetype ids. Visual content may change later. */
export type ArchetypeId =
  | 'enemy:fodder'
  | 'enemy:runner'
  | 'enemy:brute'
  | 'enemy:elite'
  | 'enemy:boss';

export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  'enemy:fodder',
  'enemy:runner',
  'enemy:brute',
  'enemy:elite',
  'enemy:boss',
] as const;

/** Spawn formation shapes. Purely a hint for the integration/simulation layer. */
export type Formation = 'ring' | 'arc' | 'lane' | 'cluster';

export const FORMATIONS: readonly Formation[] = ['ring', 'arc', 'lane', 'cluster'] as const;

/** Discriminated-union event kinds emitted by the director. */
export type EventKind =
  | 'phaseStarted'
  | 'spawnRequested'
  | 'eliteWarning'
  | 'eliteRequested'
  | 'bossWarning'
  | 'bossRequested'
  | 'overtimeStarted'
  | 'victory'
  | 'defeat';

/**
 * Frozen serialization + hashing version. Bump ONLY through the lead. Deserialize
 * rejects any other version.
 */
export const STATE_VERSION = 1 as const;

/**
 * Frozen content-schema version, independent of runtime state version. Included
 * in the content fingerprint.
 */
export const CONTENT_VERSION = 1 as const;

/** Frozen run timing constants. Tests lock these exactly. */
export const TICKS_PER_SECOND = 60 as const;
/** 12 minutes @ 60Hz. Authored run duration boundary. */
export const RUN_DURATION_TICKS = 43_200 as const;
/** 11 minutes @ 60Hz. Boss entrance tick. */
export const BOSS_ENTRANCE_TICK = 39_600 as const;
