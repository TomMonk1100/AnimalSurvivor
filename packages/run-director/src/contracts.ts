/**
 * LEAD-OWNED — FROZEN public + shared-internal contracts.
 *
 * This file is the single source of truth for every gameplay-affecting type in
 * the run director. It is frozen before parallel implementation. Implementation
 * agents MUST import from here and MUST NOT edit this file. If a field appears to
 * be missing, that is a contract change and returns to the lead.
 *
 * Separation of concerns (do not blur these):
 *   - Immutable DEFINITIONS   (RunDefinition & children): authored content, never mutated.
 *   - Mutable DIRECTOR STATE  (DirectorState & children): evolves per tick, serialized/hashed.
 *   - Per-tick METRICS        (RunMetrics): caller-owned world facts, never mutated.
 *   - Emitted EVENTS/INTENTS   (DirectorEvent, SpawnIntent): pure data, no callbacks.
 *   - Integration-owned world mutation: NOT in this package.
 */

import type {
  ArchetypeId,
  EventKind,
  Formation,
  RunMode,
  RunOutcome,
  RunPhaseId,
} from './ids.js';

/* ============================================================================
 * IMMUTABLE DEFINITIONS (authored content)
 * ==========================================================================*/

/**
 * One authored phase. Tick range is INCLUSIVE on both ends. Ranges must be
 * contiguous, ordered, and non-overlapping across the run (validation enforces).
 * Only an explicit endless definition may include open-ended `overtime`.
 */
export interface PhaseDefinition {
  readonly id: RunPhaseId;
  /** First tick (inclusive) this phase is active. */
  readonly startTick: number;
  /** Last tick (inclusive) this phase is active, or OPEN_END for endless overtime. */
  readonly endTick: number;
  /**
   * Soft cap on live enemies for this phase. When liveEnemies >= softCap the
   * scheduler stops issuing *discretionary* waves but authored one-shot beats
   * (elites/boss) may still fire.
   */
  readonly softCap: number;
  /**
   * Hard cap on live enemies for this phase. When liveEnemies >= hardCap NO new
   * spawn intents (including delayed drains) are released this tick; they are
   * deferred deterministically.
   */
  readonly hardCap: number;
  /**
   * Integer threat units accrued per tick while in this phase. Uses integer
   * numerator/denominator accrual (see ThreatConfig) to avoid float drift.
   */
  readonly threatPerTick: number;
}

/** Sentinel end-tick for the open-ended overtime phase. */
export const OPEN_END = Number.MAX_SAFE_INTEGER;

/**
 * A spawnable archetype. All numeric fields are finite non-negative integers;
 * `cost` and `weight` are strictly positive integers (validation enforces).
 */
export interface ArchetypeDefinition {
  readonly id: ArchetypeId;
  /** Threat units consumed to spawn ONE unit of this archetype. Positive int. */
  readonly cost: number;
  /** Selection weight for discretionary picks. Positive int. */
  readonly weight: number;
  readonly formation: Formation;
  /** Units emitted per wave of this archetype. Positive int. */
  readonly count: number;
  /** Min spawn distance from player. Non-negative int, <= maxDistance. */
  readonly minDistance: number;
  /** Max spawn distance from player. Non-negative int, >= minDistance. */
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
}

/**
 * A one-shot authored elite beat. Fires exactly once at `requestTick`, preceded
 * by a warning at `warningTick`. Must lie inside phase `phaseId`.
 */
export interface EliteBeatDefinition {
  /** Stable unique id, e.g. 'elite:pressure-1'. */
  readonly id: string;
  readonly phaseId: RunPhaseId;
  readonly warningTick: number;
  readonly requestTick: number;
  readonly archetypeId: ArchetypeId;
  readonly count: number;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
}

/**
 * Authored combat profile for the single apex encounter. This belongs to the
 * run definition rather than an integration default: it is fingerprinted,
 * emitted with the boss request, and consumed by the deterministic simulation.
 * Every number is fixed-tick or world-space gameplay content, never a
 * presentation preference.
 */
export interface BossCombatProfile {
  /** Stable authored identity for diagnostics and content review. */
  readonly id: string;
  /** Multipliers applied to the mapped simulation archetype at boss spawn. */
  readonly hpMultiplier: number;
  readonly xpMultiplier: number;
  readonly speedMultiplier: number;
  readonly touchDamageMultiplier: number;
  /** Spacing behavior outside charge and volley beats. */
  readonly preferredRange: number;
  readonly rangeBand: number;
  /** Full fixed-tick charge-to-volley cycle. */
  readonly cycleTicks: number;
  readonly chargeWindupTicks: number;
  readonly chargeDurationTicks: number;
  readonly chargeSpeedMultiplier: number;
  /** Radial hostile-volley behavior within the cycle. */
  readonly volleyTick: number;
  readonly volleyCount: number;
  readonly projectileSpeed: number;
  readonly projectileDamage: number;
  readonly projectileLifetimeTicks: number;
  readonly projectileHitRadius: number;
}

/** The single authored boss schedule. Boss requested exactly once. */
export interface BossDefinition {
  readonly warningTick: number;
  /** Must equal BOSS_ENTRANCE_TICK for the frozen first run. */
  readonly requestTick: number;
  readonly archetypeId: ArchetypeId;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
  /** Versioned combat contract for this boss, not an adapter fallback. */
  readonly profile: BossCombatProfile;
}

/** Integer-only threat accrual config (numerator/denominator, no floats). */
export interface ThreatConfig {
  /** Starting budget in integer threat units. Non-negative int. */
  readonly initialBudget: number;
  /** Upper clamp on stored budget to bound catch-up bursts. Positive int. */
  readonly maxBudget: number;
}

/**
 * Small, deterministic density response to a player's earned level. This only
 * adjusts scheduler capacity and cadence; it never creates a same-tick burst.
 */
export interface LevelPressureConfig {
  /** First player level that earns one pressure step. */
  readonly startLevel: number;
  /** Additional levels required for each subsequent step. */
  readonly levelsPerStep: number;
  /** Hard bound on the number of earned steps. */
  readonly maxSteps: number;
  /** Added to a phase soft cap per earned step. */
  readonly softCapPerStep: number;
  /** Added to a phase hard cap per earned step. */
  readonly hardCapPerStep: number;
  /** Removed from discretionary-wave interval per earned step. */
  readonly intervalTicksReductionPerStep: number;
}

/** Discretionary wave sizing per phase (data-defined, integer-only). */
export interface WaveConfig {
  /** Fallback minimum ticks between discretionary spawn attempts. Positive int. */
  readonly intervalTicks: number;
  /**
   * Optional authored cadence per phase. When supplied for the active phase it
   * replaces `intervalTicks` before bounded level-pressure reductions apply.
   * This lets normal mode visibly escalate through its phases without any
   * renderer- or wall-clock-owned spawning.
   */
  readonly phaseIntervalTicks?: Readonly<Partial<Record<RunPhaseId, number>>>;
  /** Archetype ids eligible for discretionary picks in each phase. */
  readonly phaseArchetypes: Readonly<Partial<Record<RunPhaseId, readonly ArchetypeId[]>>>;
}

/** Overtime bounded-support config. Support pressure is capped + periodic. */
export interface OvertimeConfig {
  /** Ticks between overtime support waves. Positive int. */
  readonly supportIntervalTicks: number;
  /** Archetype spawned by overtime support waves. */
  readonly archetypeId: ArchetypeId;
  readonly count: number;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
  /** Hard cap on total overtime support waves ever emitted. Positive int. */
  readonly maxSupportWaves: number;
}

/**
 * The complete authored run definition. Immutable. Callers may supply their own
 * but the default is content/greg-first-run.ts. Everything that affects gameplay
 * is covered by the content fingerprint.
 */
export interface RunDefinition {
  /** Content schema version (CONTENT_VERSION). */
  readonly contentVersion: number;
  /** Normal content ends at durationTicks; endless content opts into overtime. */
  readonly mode: RunMode;
  /** Total authored duration boundary in ticks (RUN_DURATION_TICKS). */
  readonly durationTicks: number;
  readonly phases: readonly PhaseDefinition[];
  readonly archetypes: readonly ArchetypeDefinition[];
  readonly eliteBeats: readonly EliteBeatDefinition[];
  readonly boss: BossDefinition;
  readonly threat: ThreatConfig;
  /** Optional for bespoke content; the default normal run supplies one. */
  readonly levelPressure?: LevelPressureConfig;
  readonly waves: WaveConfig;
  /** Required for endless mode and forbidden for finite normal mode. */
  readonly overtime?: OvertimeConfig;
  /** Fixed capacity of the event buffer. Must satisfy critical-event guarantees. */
  readonly eventBufferCapacity: number;
  /** Seed used for discretionary RNG unless overridden at construction. */
  readonly defaultSeed: number;
}

/* ============================================================================
 * PER-TICK METRICS (caller-owned, never mutated by the director)
 * ==========================================================================*/

export interface RunMetrics {
  /** Absolute fixed simulation tick. Monotonic non-decreasing across calls. */
  readonly tick: number;
  /** If true the director must not advance state, budgets, RNG, or sequence. */
  readonly paused: boolean;
  readonly playerAlive: boolean;
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly playerLevel: number;
  /** Number of enemies currently alive in the caller's world. Non-negative int. */
  readonly liveEnemies: number;
  readonly killsTotal: number;
  readonly bossAlive: boolean;
  /** True on the single tick the caller's world reports the boss just died. */
  readonly bossDefeatedThisTick: boolean;
}

/* ============================================================================
 * EMITTED INTENTS + EVENTS (pure data)
 * ==========================================================================*/

/** A request for the simulation to spawn enemies. No world mutation here. */
export interface SpawnIntent {
  readonly archetypeId: string;
  readonly count: number;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
  /** Present exactly for an authored boss request. */
  readonly bossProfile?: BossCombatProfile;
}

/** Fields present on every emitted event. */
export interface EventBase {
  readonly kind: EventKind;
  /** Absolute fixed tick this event was produced at. */
  readonly tick: number;
  /** Monotonic per-run sequence number. Strictly increasing. */
  readonly seq: number;
  /** Source phase id at emission time. */
  readonly phase: RunPhaseId;
}

export interface PhaseStartedEvent extends EventBase {
  readonly kind: 'phaseStarted';
  readonly phaseId: RunPhaseId;
}

export interface SpawnRequestedEvent extends EventBase {
  readonly kind: 'spawnRequested';
  readonly intent: SpawnIntent;
  /** Threat units spent for this wave (0 for free authored beats). */
  readonly cost: number;
  /** True if this wave was released from the delayed queue rather than fresh. */
  readonly delayed: boolean;
}

export interface EliteWarningEvent extends EventBase {
  readonly kind: 'eliteWarning';
  readonly beatId: string;
  readonly requestTick: number;
}

export interface EliteRequestedEvent extends EventBase {
  readonly kind: 'eliteRequested';
  readonly beatId: string;
  readonly intent: SpawnIntent;
}

export interface BossWarningEvent extends EventBase {
  readonly kind: 'bossWarning';
  readonly requestTick: number;
}

export interface BossRequestedEvent extends EventBase {
  readonly kind: 'bossRequested';
  readonly intent: SpawnIntent;
}

export interface OvertimeStartedEvent extends EventBase {
  readonly kind: 'overtimeStarted';
}

export interface VictoryEvent extends EventBase {
  readonly kind: 'victory';
}

export interface DefeatEvent extends EventBase {
  readonly kind: 'defeat';
}

export type DirectorEvent =
  | PhaseStartedEvent
  | SpawnRequestedEvent
  | EliteWarningEvent
  | EliteRequestedEvent
  | BossWarningEvent
  | BossRequestedEvent
  | OvertimeStartedEvent
  | VictoryEvent
  | DefeatEvent;

/* ============================================================================
 * EVENT BUFFER (fixed-capacity, deterministic overflow)
 * ==========================================================================*/

/**
 * Fixed-capacity ring-like buffer for emitted events. Overflow policy is
 * deterministic and documented (drop-oldest NON-critical event, increment
 * overflowDropped). Terminal events (victory/defeat) and boss/elite requests are
 * "critical" and must never be silently lost — the buffer guarantees room for
 * them by evicting non-critical events if necessary.
 */
export interface EventBuffer {
  readonly capacity: number;
  /** Number of events currently buffered. */
  readonly size: number;
  /** Diagnostic: how many events have been dropped due to overflow. */
  readonly overflowDropped: number;
  /** Diagnostic: max size ever reached (high-water mark). */
  readonly highWater: number;
}

/* ============================================================================
 * MUTABLE DIRECTOR STATE (serialized + hashed)
 * ==========================================================================*/

/** Seeded RNG state (xorshift128). All four words are uint32. */
export interface RngState {
  readonly s: readonly [number, number, number, number];
}

/** Integer threat accumulator. No floats; carry holds sub-unit remainder. */
export interface ThreatState {
  /** Spendable integer threat units. */
  budget: number;
  /** Ticks since last discretionary spawn attempt (per WaveConfig.intervalTicks). */
  ticksSinceSpawn: number;
}

/** A wave deferred because it was unaffordable or blocked by a cap. */
export interface DelayedWave {
  readonly archetypeId: ArchetypeId;
  readonly count: number;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
  readonly cost: number;
  /** Tick the wave was first deferred (for deterministic ordering). */
  readonly enqueuedTick: number;
  readonly phase: RunPhaseId;
}

/** Bounded spawn-scheduling state. */
export interface SpawnState {
  /** FIFO of deferred waves. Length is bounded by maxDelayed. */
  delayed: DelayedWave[];
  /** Bound on delayed queue length; excess deferrals increment droppedWaves. */
  readonly maxDelayed: number;
  /** Diagnostic: waves dropped because the delayed queue was full. */
  droppedWaves: number;
}

export interface BossState {
  warned: boolean;
  requested: boolean;
  alive: boolean;
  defeated: boolean;
}

export interface OvertimeState {
  active: boolean;
  /** Tick overtime began, or -1. */
  startedTick: number;
  /** Next tick an overtime support wave is scheduled, or -1 when inactive. */
  nextSupportTick: number;
  wavesEmitted: number;
}

/**
 * The complete mutable director state. EVERYTHING here is gameplay-affecting and
 * is included in serialization and the canonical state hash (hash order defined
 * in state-hash.ts). Field order below is the canonical hash order.
 */
export interface DirectorState {
  readonly version: number;
  /** Last processed tick; -1 before any step. */
  tick: number;
  outcome: RunOutcome;
  /** Next sequence number to assign. Monotonic. */
  seq: number;
  /** Current phase id as of `tick`. */
  phase: RunPhaseId;
  threat: ThreatState;
  spawn: SpawnState;
  boss: BossState;
  overtime: OvertimeState;
  rng: RngState;
  /** Sorted unique ids of elite beats already requested (one-shot guard). */
  firedBeats: string[];
  /** Sorted unique ids of fired warnings (e.g. 'boss', 'elite:pressure-1'). */
  firedWarnings: string[];
  /** Whether the terminal (victory/defeat) event has already been emitted. */
  terminalEmitted: boolean;
  /** Whether the phaseStarted event for `phase` has been emitted. */
  lastPhaseAnnounced: RunPhaseId | null;
}

/* ============================================================================
 * FUNCTION-CONTRACT TYPES (signatures the subsystems must export)
 * ==========================================================================*/

/**
 * A concrete decision to emit one spawn wave this tick. Produced by the spawn
 * scheduler, consumed by the orchestrator which stamps it into a SpawnIntent.
 */
export interface SpawnDecision {
  readonly archetypeId: ArchetypeId;
  readonly count: number;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
  readonly cost: number;
  readonly delayed: boolean;
}

/** Result of an outcome evaluation for a single tick. */
export interface OutcomeEvaluation {
  /** The outcome after evaluation. */
  readonly outcome: RunOutcome;
  /** 'victory' | 'defeat' | null — a terminal event to emit this tick, if any. */
  readonly terminalKind: 'victory' | 'defeat' | null;
}
