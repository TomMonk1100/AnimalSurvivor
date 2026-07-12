/**
 * LEAD-OWNED — FROZEN PUBLIC CONTRACTS.
 *
 * Every agent implements against the types in this file. Do not change a shape
 * here without lead sign-off; downstream modules and serialization depend on
 * exact field names and semantics.
 *
 * Separation of concerns (kept deliberately distinct):
 *   - Definitions      : immutable authored content (traits, evolutions).
 *   - RuntimeState      : mutable build state (owned stages, sockets, timers).
 *   - RuntimeContext    : per-tick simulation inputs.
 *   - Command           : emitted combat intents (renderer/sim execute later).
 *   - VisualAttachmentState : renderer-facing read-only snapshot.
 */

import type {
  EvolutionId,
  OwnedStage,
  SocketId,
  TraitId,
} from './ids.js';

/* ────────────────────────────────────────────────────────────────────────
 * Seeded RNG
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Deterministic, serializable RNG. No ambient randomness anywhere in the
 * package flows through anything but this interface.
 */
export interface SeededRng {
  /** Unsigned 32-bit integer in [0, 2^32). Advances state. */
  nextU32(): number;
  /** Float in [0, 1). Advances state. */
  nextFloat(): number;
  /** Integer in [0, maxExclusive). Advances state. maxExclusive must be > 0. */
  nextInt(maxExclusive: number): number;
  /** Current internal state as a single uint32 (for serialization). */
  state(): number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Command vocabulary
 * ──────────────────────────────────────────────────────────────────────── */

export type CommandKind =
  | 'spawnProjectileBurst'
  | 'radialProjectileBurst'
  | 'orbitingDamage'
  | 'areaGather'
  | 'areaKnockback'
  | 'applyAreaDamage'
  | 'spawnZone'
  | 'markTargets'
  | 'chainDamage'
  | 'meleeArc'
  | 'grantShield'
  | 'telegraph'
  | 'playTraitCue';

export const COMMAND_KINDS: readonly CommandKind[] = [
  'spawnProjectileBurst',
  'radialProjectileBurst',
  'orbitingDamage',
  'areaGather',
  'areaKnockback',
  'applyAreaDamage',
  'spawnZone',
  'markTargets',
  'chainDamage',
  'meleeArc',
  'grantShield',
  'telegraph',
  'playTraitCue',
] as const;

/** Targeting policies the runtime may request. It never searches renderer objects. */
export type TargetingPolicy =
  | 'none'
  | 'nearest'
  | 'highestHealth'
  | 'densestCluster'
  | 'marked'
  | 'rearThreat';

/**
 * A single emitted command.
 *
 * This is a deliberately WIDE, flat struct (not a per-kind object) so the
 * command buffer can pre-allocate and reuse instances with zero steady-state
 * allocation. Only the fields relevant to `kind` are meaningful; all others
 * are reset to 0 / '' / 'none'. Field meaning per kind is documented in
 * behavior-runtime and command-buffer.
 *
 * Every command carries its `sourceId` (trait or evolution) and the simulation
 * `tick` it was emitted on, for deterministic replay.
 */
export interface Command {
  kind: CommandKind;
  sourceId: TraitId | EvolutionId;
  tick: number;
  targeting: TargetingPolicy;

  originX: number;
  originY: number;
  dirX: number;
  dirY: number;

  /** projectile / mark count, chain jumps use `jumps` */
  count: number;
  damage: number;
  speed: number;
  radius: number;
  strength: number;
  durationTicks: number;
  arc: number; // radians
  facing: number; // radians
  spread: number; // radians
  jumps: number;
  range: number;
  amount: number; // shield amount / damage-per-tick for zones
  /** Per-zone damage cadence, in ticks. Meaningful for spawnZone commands. */
  intervalTicks: number;

  /** Discriminating string payload: zone kind, telegraph kind, or cue key. */
  tag: string;
}

/** Field values a fresh/blank Command carries. */
export const BLANK_COMMAND: Readonly<Command> = {
  kind: 'playTraitCue',
  sourceId: '',
  tick: 0,
  targeting: 'none',
  originX: 0,
  originY: 0,
  dirX: 0,
  dirY: 0,
  count: 0,
  damage: 0,
  speed: 0,
  radius: 0,
  strength: 0,
  durationTicks: 0,
  arc: 0,
  facing: 0,
  spread: 0,
  jumps: 0,
  range: 0,
  amount: 0,
  intervalTicks: 0,
  tag: '',
};

/**
 * Reusable command sink with a documented overflow policy.
 *
 * Overflow policy: when the buffer is at capacity, `acquire()` returns `null`,
 * the write is dropped, and `overflowCount` is incremented. Callers must
 * tolerate a null return. No exception is thrown so the update loop stays
 * allocation- and branch-stable.
 */
export interface CommandBuffer {
  readonly capacity: number;
  readonly length: number;
  readonly overflowCount: number;
  /** Returns a zeroed, reusable Command to fill in place, or null if full. */
  acquire(): Command | null;
  /** Read command at index [0, length). */
  at(index: number): Command;
  /** Clear length and overflow count; retains allocated slots. */
  reset(): void;
  /** Per-kind counts over current contents (allocates a small record). */
  countsByKind(): Record<CommandKind, number>;
}

/* ────────────────────────────────────────────────────────────────────────
 * Behavior definition schema (authored content)
 * ──────────────────────────────────────────────────────────────────────── */

export type BehaviorKind =
  | 'periodicBurst'
  | 'periodicPulse'
  | 'multiPhase'
  | 'generic'
  /** Emits a zone after the player has traveled a fixed authored distance. */
  | 'movementTrail';

/**
 * A parameterized command template. Only numeric fields set here are applied;
 * omitted fields default to the BLANK_COMMAND value. The behavior runtime
 * stamps `sourceId` and `tick` at emit time.
 */
export interface CommandTemplate {
  kind: CommandKind;
  targeting?: TargetingPolicy;
  originX?: number;
  originY?: number;
  dirX?: number;
  dirY?: number;
  count?: number;
  damage?: number;
  speed?: number;
  radius?: number;
  strength?: number;
  durationTicks?: number;
  arc?: number;
  facing?: number;
  spread?: number;
  jumps?: number;
  range?: number;
  amount?: number;
  /** Per-zone damage cadence, in ticks. Meaningful for spawnZone commands. */
  intervalTicks?: number;
  tag?: string;
}

/** One phase of a multi-phase behavior (e.g. Thornstorm). */
export interface BehaviorPhase {
  /** Ticks this phase occupies before advancing to the next. Must be >= 1. */
  durationTicks: number;
  /** Command emitted once, at the tick the phase begins. */
  emit: CommandTemplate;
}

/**
 * How a stage or evolution behaves over fixed ticks.
 *
 *  - periodicBurst / periodicPulse: emit `emit` every `periodTicks` ticks.
 *  - multiPhase: cycle through `phases`; each phase emits its command at phase
 *    start, then waits `durationTicks`. `periodTicks` is ignored.
 *  - generic: placeholder loop; emits `emit` every `periodTicks` ticks if set,
 *    otherwise a `playTraitCue` heartbeat. Used for non-slice catalog traits.
 *  - movementTrail: accumulates player movement in fixed milliunits and emits
 *    its spawnZone once per positive-movement tick after crossing
 *    `distanceMilliunits`. `periodTicks` is ignored for this behavior.
 */
export interface BehaviorDefinition {
  kind: BehaviorKind;
  /** Cooldown period for periodic/generic kinds. Ignored for multiPhase/movementTrail. */
  periodTicks: number;
  /** Distance threshold in thousandths of a world unit; required by movementTrail. */
  distanceMilliunits?: number;
  /** Single emit for periodic/generic/movementTrail kinds. */
  emit?: CommandTemplate;
  /** Ordered phases for multiPhase kind. */
  phases?: readonly BehaviorPhase[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Content definitions (immutable)
 * ──────────────────────────────────────────────────────────────────────── */

export interface StageDefinition {
  /** e.g. "porcupine-quills:bud". Renderer-facing key. */
  visualKey: string;
  behavior: BehaviorDefinition;
}

export interface TraitDefinition {
  id: TraitId;
  sockets: readonly SocketId[];
  tags: readonly string[];
  stages: Readonly<Record<OwnedStage, StageDefinition>>;
}

export interface EvolutionDefinition {
  id: EvolutionId;
  /** Ordered pair of ingredient trait ids (must both reach Adapted). */
  ingredients: readonly [TraitId, TraitId];
  /** All sockets the Mythic keeps occupied (union of ingredient sockets). */
  occupiedSockets: readonly SocketId[];
  behavior: BehaviorDefinition;
  /** e.g. "thornstorm-mantle:mythic". */
  visualKey: string;
}

export interface Catalog {
  traits: readonly TraitDefinition[];
  evolutions: readonly EvolutionDefinition[];
  /**
   * Optional cap on independently acquired traits. Disabled Mythic
   * ingredients remain in state and continue counting, so an evolution never
   * creates a free active-attack slot.
   */
  maxActiveTraits?: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Validation
 * ──────────────────────────────────────────────────────────────────────── */

export interface ValidationIssue {
  code: string;
  message: string;
  subjectId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: readonly ValidationIssue[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Runtime state (mutable, serializable)
 * ──────────────────────────────────────────────────────────────────────── */

/** An owned independent trait. `disabled` once consumed by a Mythic. */
export interface OwnedTrait {
  id: TraitId;
  stage: OwnedStage;
  /** True when a resolved evolution has replaced this trait's behavior loop. */
  disabled: boolean;
}

export interface ResolvedEvolution {
  id: EvolutionId;
  ingredients: readonly [TraitId, TraitId];
}

/**
 * Per-behavior scheduling state. One timer per active behavior loop
 * (independent trait OR resolved evolution). Fields are generic but fixed so
 * the state serializes deterministically.
 */
export interface BehaviorTimer {
  /** Trait id or evolution id that owns this loop. */
  ownerId: string;
  active: boolean;
  /** Current phase index (multiPhase) or 0 for periodic kinds. */
  phase: number;
  /** Ticks elapsed within the current phase / since last periodic emit. */
  phaseTicks: number;
  /** Remaining cooldown for periodic kinds (counts down to 0). */
  cooldown: number;
  /** Accumulated charges (reserved for future charge-based behaviors). */
  charges: number;
}

/** Full mutable runtime state. This is the canonical serializable object. */
export interface RuntimeState {
  /** Schema version for save migration. */
  version: number;
  /** Fingerprint of the catalog this state was created against. */
  catalogFingerprint: string;
  /** Last processed simulation tick. Fresh state is -1. */
  tick: number;
  owned: OwnedTrait[];
  /** socket -> owning trait id or evolution id. Absent key = free socket. */
  sockets: Partial<Record<SocketId, string>>;
  evolutions: ResolvedEvolution[];
  timers: BehaviorTimer[];
  /** Serialized RNG state for the offer director. */
  offerRngState: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Per-tick simulation inputs
 * ──────────────────────────────────────────────────────────────────────── */

export interface RuntimeContext {
  tick: number;
  playerX: number;
  playerY: number;
  moveDirX: number;
  moveDirY: number;
  distanceMovedThisTick: number;
  /** Optional run-wide neutral multiplier; omitted retains 1x behavior. */
  weaponDamageMultiplier?: number;
  /** Optional run-wide attack cadence multiplier; omitted retains 1x behavior. */
  weaponCooldownMultiplier?: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * Upgrade application results (typed, deterministic)
 * ──────────────────────────────────────────────────────────────────────── */

export type ApplyOutcome =
  | { ok: true; kind: 'created'; traitId: TraitId; stage: 'bud' }
  | { ok: true; kind: 'advanced'; traitId: TraitId; stage: 'adapted' }
  | { ok: false; kind: 'unknownTrait'; traitId: TraitId }
  | { ok: false; kind: 'maxed'; traitId: TraitId }
  | { ok: false; kind: 'alreadyMythic'; traitId: TraitId }
  | { ok: false; kind: 'loadoutFull'; traitId: TraitId; capacity: number }
  | {
      ok: false;
      kind: 'socketConflict';
      traitId: TraitId;
      sockets: readonly SocketId[];
      heldBy: readonly string[];
    };

export interface ApplyResult {
  outcome: ApplyOutcome;
  /** Set to the evolution id if this apply triggered exactly one resolution. */
  evolved: EvolutionId | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Upgrade offers
 * ──────────────────────────────────────────────────────────────────────── */

export interface UpgradeOffer {
  traitId: TraitId;
  /** Stage that applying this offer would produce. */
  resultStage: OwnedStage;
}

/* ────────────────────────────────────────────────────────────────────────
 * Renderer-facing visual state
 * ──────────────────────────────────────────────────────────────────────── */

export interface VisualAttachmentState {
  sourceId: TraitId | EvolutionId;
  stage: 'bud' | 'adapted' | 'mythic';
  sockets: readonly SocketId[];
  visualKey: string;
  enabled: boolean;
}
