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
  TraitRank,
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
 * Where an emitted command begins its authoritative simulation work.
 *
 * `triggerTarget` is intentionally a same-trigger handoff: the simulation
 * executor resolves the stable target selected by the preceding command from
 * the same source, then uses that coordinate for the dependent command. It
 * lets grafts leave residue or continue an arc at their payload's target
 * without making the renderer or a wall-clock callback authoritative.
 */
export type CommandAnchor = 'player' | 'triggerTarget';

export const COMMAND_ANCHORS: readonly CommandAnchor[] = [
  'player',
  'triggerTarget',
] as const;

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
  /**
   * Authoritative origin handoff for synthesized dependent commands.
   *
   * Omitted remains player-origin for compatibility with older consumers;
   * BehaviorRuntime always writes the explicit default for newly emitted work.
   */
  anchor?: CommandAnchor;

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
  /** Additional enemies a projectile may hit after its first collision. */
  pierce: number;
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
  anchor: 'player',
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
  pierce: 0,
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
  /** Omitted retains the normal player-origin behavior. */
  anchor?: CommandAnchor;
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
  /** Additional enemies a projectile may hit after its first collision. */
  pierce?: number;
  range?: number;
  amount?: number;
  /** Per-zone damage cadence, in ticks. Meaningful for spawnZone commands. */
  intervalTicks?: number;
  tag?: string;
}

/**
 * An additional existing-vocabulary command emitted by a synthesized behavior.
 *
 * A delay of zero keeps the command in the same authoritative trigger. A
 * positive delay is scheduled in deterministic runtime state, never by a
 * renderer timer. `everyCycles` counts the behavior's own trigger cycles and
 * lets a temperament express patterns such as "every fourth cast" without
 * adding a combat command kind.
 */
export interface BehaviorFollowUp {
  emit: CommandTemplate;
  delayTicks?: number;
  everyCycles?: number;
}

/** One phase of a multi-phase behavior (e.g. Thornstorm). */
export interface BehaviorPhase {
  /** Ticks this phase occupies before advancing to the next. Must be >= 1. */
  durationTicks: number;
  /** Command emitted once, at the tick the phase begins. */
  emit: CommandTemplate;
  /** Additional existing-vocabulary emissions associated with this phase. */
  followUps?: readonly BehaviorFollowUp[];
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
  /**
   * World-space distance a movementTrail payload is placed behind the current
   * movement heading. Omitted (or zero) preserves player-origin placement.
   * This is authored deterministic placement, never a renderer-only offset.
   */
  trailBehindDistance?: number;
  /** Single emit for periodic/generic/movementTrail kinds. */
  emit?: CommandTemplate;
  /**
   * Existing-vocabulary commands emitted immediately before the payload on
   * the same authoritative trigger. Synthesized undertow/lock-on grafts use
   * this when a movement trail cannot be converted into a multi-phase loop.
   */
  preludes?: readonly BehaviorFollowUp[];
  /** Additional existing-vocabulary emissions associated with `emit`. */
  followUps?: readonly BehaviorFollowUp[];
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
  /**
   * Legacy Bud/Adapted attachment definitions. Rank 1 maps to Bud and the
   * shipped renderer currently reuses Adapted art for ranks 2–5.
   */
  stages: Readonly<Record<OwnedStage, StageDefinition>>;
  /**
   * Optional authored overrides for the five-rank ladder. Missing entries are
   * deterministically derived from `stages` by rank-progression.ts, so old
   * content remains playable while every attack still has real rank 3–5 gains.
   */
  rankStages?: Readonly<Partial<Record<TraitRank, StageDefinition>>>;
}

export interface EvolutionDefinition {
  id: EvolutionId;
  /** Ordered pair of ingredient trait ids (must both reach Master rank 5). */
  ingredients: readonly [TraitId, TraitId];
  /** All visual sockets the fused form keeps occupied (ingredient union). */
  occupiedSockets: readonly SocketId[];
  behavior: BehaviorDefinition;
  /** e.g. "thornstorm-mantle:mythic". */
  visualKey: string;
}

export interface Catalog {
  traits: readonly TraitDefinition[];
  evolutions: readonly EvolutionDefinition[];
  /**
   * Optional cap on active logical attacks. A fused evolution costs one
   * logical slot even though both disabled ingredient records remain in state
   * for replay/debug and preserve their visual attachment footprint.
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

/** An owned independent attack. `disabled` once consumed by a fused evolution. */
export interface OwnedTrait {
  id: TraitId;
  /** Legacy renderer compatibility bucket derived from rank. */
  stage: OwnedStage;
  /** Authoritative upgrade rank; rank 5 is Master. */
  rank: TraitRank;
  /** True when a resolved fusion has replaced this trait's behavior loop. */
  disabled: boolean;
}

export interface ResolvedEvolution {
  id: EvolutionId;
  ingredients: readonly [TraitId, TraitId];
  /**
   * Optional persisted identity for a v4 Wild Splice or newly fused Perfect
   * Pair. Undefined preserves the byte-identical legacy authored behavior in
   * migrated v3 saves.
   */
  variant?: FusionVariant;
}

/** Stable, replay-bound identity of one synthesized fusion variant. */
export interface FusionVariant {
  seed: number;
  temperamentId: string;
  leanId: string;
}

/**
 * A first-ready Wild Splice roll. This is persisted separately from a resolved
 * evolution so inspecting or deferring an offer never changes its preview.
 */
export interface FusionPreview {
  /** Canonical `chimera:<first>+<second>` identity for the unordered pair. */
  pairId: string;
  /** Monotonic first-ready ordinal supplied to the pure variant roll. */
  ordinal: number;
  variant: FusionVariant;
  /** Deterministic Announcer flavor selected by the same pure roll. */
  flavorIndex: number;
}

/** A deterministic, player-selectable Master-pair fusion opportunity. */
export interface FusionOffer {
  evolutionId: EvolutionId;
  ingredients: readonly [TraitId, TraitId];
  /** Fusing two attacks replaces their two logical slots with one. */
  freesLogicalSlot: true;
  /** Additive player-facing preview metadata. Older consumers may omit it. */
  displayName?: string;
  rarity?: string;
  temperamentId?: string;
  leanId?: string;
  pairKind?: 'perfect' | 'wild' | 'support';
  /** Stable flavor selection captured by presentation before resolving. */
  flavorIndex?: number;
  /** Stable roll seed for renderer-only temperament accents. */
  variantSeed?: number;
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
  /** Completed behavior trigger cycles, used by deterministic temperament cadence. */
  cycles: number;
}

/** A delayed existing-vocabulary command awaiting one deterministic future tick. */
export interface PendingBehaviorEmission {
  ownerId: string;
  dueTick: number;
  emit: CommandTemplate;
}

/** Full mutable runtime state. This is the canonical serializable object. */
export interface RuntimeState {
  /** Schema version for save migration. */
  version: number;
  /** Fingerprint of the catalog this state was created against. */
  catalogFingerprint: string;
  /** Versioned synthesis identity; keeps dynamic Chimera replay/save semantics explicit. */
  chimeraFingerprint: string;
  /** Last processed simulation tick. Fresh state is -1. */
  tick: number;
  /** Immutable seed used by pure Wild Splice previews; never consumes offer RNG. */
  runSeed: number;
  /** Next first-ready ordinal for a pure Wild Splice variant roll. */
  fusionReadyCount: number;
  /** Persisted first-ready previews, so later upgrades/fusions cannot reroll a deferred pair. */
  fusionPreviews: FusionPreview[];
  owned: OwnedTrait[];
  /** socket -> owning trait id or evolution id. Absent key = free socket. */
  sockets: Partial<Record<SocketId, string>>;
  evolutions: ResolvedEvolution[];
  timers: BehaviorTimer[];
  /** Bounded deterministic delayed emissions (for example Echo temperament). */
  pendingEmissions: PendingBehaviorEmission[];
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
  | { ok: true; kind: 'created'; traitId: TraitId; stage: 'bud'; rank: 1 }
  | { ok: true; kind: 'advanced'; traitId: TraitId; stage: 'adapted'; rank: TraitRank }
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
  /**
   * Retained for source compatibility. Fusions are now explicit and this is
   * always null; use fusionReady / fuseEvolution instead.
   */
  evolved: EvolutionId | null;
  /** Compatible Master pairs available immediately after this upgrade. */
  fusionReady: readonly FusionOffer[];
}

export type FuseOutcome =
  | {
      ok: true;
      kind: 'fused';
      evolutionId: EvolutionId;
      ingredients: readonly [TraitId, TraitId];
      logicalSlotCost: 1;
    }
  | { ok: false; kind: 'unknownEvolution'; evolutionId: EvolutionId }
  | { ok: false; kind: 'alreadyFused'; evolutionId: EvolutionId }
  | { ok: false; kind: 'notMastered'; evolutionId: EvolutionId };

export interface FuseResult {
  outcome: FuseOutcome;
}

/* ────────────────────────────────────────────────────────────────────────
 * Upgrade offers
 * ──────────────────────────────────────────────────────────────────────── */

export interface UpgradeOffer {
  traitId: TraitId;
  /** Legacy visual bucket that applying this offer would produce. */
  resultStage: OwnedStage;
  /** Exact gameplay rank applying this offer would produce. */
  resultRank: TraitRank;
  /** True exactly when this offer produces Master rank 5. */
  isMaster: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * Renderer-facing visual state
 * ──────────────────────────────────────────────────────────────────────── */

export interface VisualAttachmentState {
  sourceId: TraitId | EvolutionId;
  stage: 'bud' | 'adapted' | 'mythic';
  /** Exact independent-attack rank; null for a fused evolution. */
  rank: TraitRank | null;
  /** True for rank-5 Master attacks. Always false for fused evolutions. */
  isMaster: boolean;
  /** Every independent or fused attack occupies exactly one logical slot. */
  logicalSlotCost: 1;
  sockets: readonly SocketId[];
  visualKey: string;
  enabled: boolean;
  /** True when this is a renderer-only retained parent/seam, never an attack slot. */
  visualOnly?: boolean;
  /** Ingredient pair retained by a synthesized Chimera presentation record. */
  chimeraParents?: readonly [TraitId, TraitId];
  /** Additive renderer-facing Chimera metadata. */
  displayName?: string;
  rarity?: string;
  temperamentId?: string;
  leanId?: string;
  pairKind?: 'perfect' | 'wild' | 'support';
  flavorIndex?: number;
  variantSeed?: number;
}
