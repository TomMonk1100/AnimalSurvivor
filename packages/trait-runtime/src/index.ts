/**
 * LEAD-OWNED — public entry point.
 *
 * TraitRuntime ties the frozen modules into one renderer-independent authority.
 * It owns no simulation physics and no renderer state; it emits typed commands
 * and exposes read-only visual/build snapshots.
 */

import type {
  ApplyResult,
  Catalog,
  Command,
  CommandBuffer,
  FuseResult,
  FusionOffer,
  RuntimeContext,
  RuntimeState,
  UpgradeOffer,
  VisualAttachmentState,
} from './contracts.js';
import type { EvolutionId, TraitId, TraitRank, TraitStage } from './ids.js';
import { getCatalog } from './definitions.js';
import { validateCatalog } from './validation.js';
import {
  applyUpgrade as applyUpgradeState,
  activeAttackSlots,
  createInitialState,
  rankOf,
  socketOwner,
  stageOf,
  visualState,
} from './build-state.js';
import {
  availableFusions,
  fuseEvolution as fuseEvolutionState,
  refreshFusionPreviews,
} from './evolution-resolver.js';
import { ensureTimers, stepBehaviors } from './behavior-runtime.js';
import { createCommandBuffer } from './command-buffer.js';
import { generateOffers } from './offer-director.js';
import { restoreRng } from './rng.js';
import {
  deserializeState,
  LEGACY_CHIMERA_FINGERPRINT,
  serializeState,
  validateStateAgainstCatalog,
} from './serialization.js';
import { fingerprintCatalog, fingerprintRuntimeContent, hashState } from './state-hash.js';
import { rebuildSocketProjection } from './socket-projection.js';
import { resolveEvolution } from './chimera/resolved-evolution.js';

export interface TraitRuntimeOptions {
  seed?: number;
  catalog?: Catalog;
  /** Last tick already processed. Default -1; simulation injection uses 0. */
  initialTick?: number;
  /** Command buffer capacity. Default 1024. */
  commandCapacity?: number;
}

const DEFAULT_CAPACITY = 1024;

export class CatalogValidationError extends Error {
  constructor(readonly issues: ReturnType<typeof validateCatalog>['issues']) {
    super(`Invalid trait catalog: ${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'CatalogValidationError';
  }
}

function validateRuntimeContext(ctx: RuntimeContext, expectedTick: number): void {
  if (!Number.isSafeInteger(ctx.tick) || ctx.tick < 0) {
    throw new RangeError('RuntimeContext.tick must be a non-negative safe integer');
  }
  if (ctx.tick !== expectedTick) {
    throw new RangeError(`TraitRuntime expected tick ${expectedTick}, received ${ctx.tick}`);
  }
  for (const [name, value] of [
    ['playerX', ctx.playerX],
    ['playerY', ctx.playerY],
    ['moveDirX', ctx.moveDirX],
    ['moveDirY', ctx.moveDirY],
    ['distanceMovedThisTick', ctx.distanceMovedThisTick],
  ] as const) {
    if (!Number.isFinite(value)) throw new TypeError(`RuntimeContext.${name} must be finite`);
  }
  if (ctx.distanceMovedThisTick < 0) {
    throw new RangeError('RuntimeContext.distanceMovedThisTick must be non-negative');
  }
  for (const [name, value] of [
    ['weaponDamageMultiplier', ctx.weaponDamageMultiplier],
    ['weaponCooldownMultiplier', ctx.weaponCooldownMultiplier],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new RangeError(`RuntimeContext.${name} must be finite and positive when provided`);
    }
  }
}

/**
 * Narrow save-safety fallback for a content-versioned synthesized evolution.
 * A valid old dynamic pair never bricks a run: restore its two consumed Master
 * parents, remove only its unresolved loop/pending emissions, then let normal
 * strict validation reject every other malformed state shape.
 */
function recoverUnresolvableSynthesizedEvolutions(catalog: Catalog, state: RuntimeState): void {
  const retained = [];
  const recoveredIds = new Set<string>();
  for (const resolved of state.evolutions) {
    if (resolveEvolution(catalog, resolved) !== undefined) {
      retained.push(resolved);
      continue;
    }
    const parents = resolved.ingredients.map((ingredient) => state.owned.find((owned) => owned.id === ingredient));
    const recoverable = resolved.variant !== undefined
      && parents.length === 2
      && parents.every((parent) => parent !== undefined && parent.disabled && parent.rank === 5);
    if (!recoverable) {
      retained.push(resolved);
      continue;
    }
    for (const parent of parents) parent!.disabled = false;
    recoveredIds.add(resolved.id);
  }
  if (recoveredIds.size === 0) return;
  state.evolutions = retained;
  state.timers = state.timers.filter((timer) => !recoveredIds.has(timer.ownerId));
  state.pendingEmissions = state.pendingEmissions.filter((pending) => !recoveredIds.has(pending.ownerId));
  rebuildSocketProjection(catalog, state);
  ensureTimers(catalog, state);
}

export class TraitRuntime {
  private readonly catalog: Catalog;
  private state: RuntimeState;
  private readonly buffer: CommandBuffer;

  constructor(options: TraitRuntimeOptions = {}) {
    this.catalog = options.catalog ?? getCatalog();
    const validation = validateCatalog(this.catalog);
    if (!validation.ok) throw new CatalogValidationError(validation.issues);
    const initialTick = options.initialTick ?? -1;
    if (!Number.isSafeInteger(initialTick) || initialTick < -1) {
      throw new RangeError('initialTick must be a safe integer >= -1');
    }
    const fingerprint = fingerprintCatalog(this.catalog);
    this.state = createInitialState(
      options.seed ?? 0,
      fingerprint,
      initialTick,
      fingerprintRuntimeContent(this.catalog),
    );
    this.buffer = createCommandBuffer(options.commandCapacity ?? DEFAULT_CAPACITY);
  }

  /** Advance exactly one fixed tick; fills and returns the command buffer. */
  update(ctx: RuntimeContext): CommandBuffer {
    validateRuntimeContext(ctx, this.state.tick + 1);
    this.buffer.reset();
    ensureTimers(this.catalog, this.state);
    stepBehaviors(this.catalog, this.state, ctx, this.buffer);
    this.state.tick = ctx.tick;
    return this.buffer;
  }

  /** Apply a single upgrade of `traitId`. */
  applyUpgrade(traitId: TraitId): ApplyResult {
    const result = applyUpgradeState(this.catalog, this.state, traitId);
    // Keep timers consistent with newly created/advanced/consumed owners.
    ensureTimers(this.catalog, this.state);
    return result;
  }

  /** Compatible Master-pair fusions in deterministic catalog order. */
  availableFusions(): readonly FusionOffer[] {
    return availableFusions(this.catalog, this.state);
  }

  /** Explicitly resolve one player-selected Master fusion. */
  fuseEvolution(evolutionId: EvolutionId): FuseResult {
    const result = fuseEvolutionState(this.catalog, this.state, evolutionId);
    if (result.outcome.ok) {
      // Disable both ingredient loops and activate the fused loop atomically.
      ensureTimers(this.catalog, this.state);
    }
    return result;
  }

  /** Deterministic upgrade offers; advances and persists the offer RNG. */
  offers(count: number): UpgradeOffer[] {
    const rng = restoreRng(this.state.offerRngState);
    const result = generateOffers(this.catalog, this.state, rng, count);
    this.state.offerRngState = rng.state();
    return result;
  }

  stageOf(traitId: TraitId): TraitStage {
    return stageOf(this.state, traitId);
  }

  /** Exact rank for an independent active attack; null when locked/fused. */
  rankOf(traitId: TraitId): TraitRank | null {
    return rankOf(this.state, traitId);
  }

  /** Current logical attack-slot usage (a fusion costs one). */
  activeAttackSlots(): number {
    return activeAttackSlots(this.state);
  }

  socketOwner(socket: Parameters<typeof socketOwner>[1]): string | undefined {
    return socketOwner(this.state, socket);
  }

  /** Renderer-facing visual attachment snapshot. */
  visualState(): VisualAttachmentState[] {
    return visualState(this.catalog, this.state);
  }

  /** Read-only access to the current command buffer. */
  commands(): CommandBuffer {
    return this.buffer;
  }

  /** Detached state snapshot. Mutating it cannot affect this runtime. */
  getState(): RuntimeState {
    return deserializeState(serializeState(this.state));
  }

  /** Canonical state hash. */
  hash(): string {
    return hashState(this.state);
  }

  /** Content fingerprint of the active catalog. */
  fingerprint(): string {
    return fingerprintRuntimeContent(this.catalog);
  }

  /** Serialize runtime state to versioned JSON. */
  serialize(): string {
    return serializeState(this.state);
  }

  /** Restore a runtime from serialized state. */
  static deserialize(json: string, options: TraitRuntimeOptions = {}): TraitRuntime {
    const runtime = new TraitRuntime(options);
    const restored = deserializeState(json);
    if (restored.chimeraFingerprint === LEGACY_CHIMERA_FINGERPRINT) {
      restored.chimeraFingerprint = fingerprintRuntimeContent(runtime.catalog);
    }
    recoverUnresolvableSynthesizedEvolutions(runtime.catalog, restored);
    refreshFusionPreviews(runtime.catalog, restored);
    validateStateAgainstCatalog(restored, runtime.catalog);
    runtime.state = restored;
    return runtime;
  }
}

// Public re-exports.
export * from './ids.js';
export type {
  ApplyOutcome,
  ApplyResult,
  BehaviorDefinition,
  BehaviorKind,
  BehaviorPhase,
  BehaviorTimer,
  Catalog,
  Command,
  CommandBuffer,
  CommandKind,
  CommandTemplate,
  EvolutionDefinition,
  FuseOutcome,
  FuseResult,
  FusionOffer,
  FusionPreview,
  FusionVariant,
  OwnedTrait,
  ResolvedEvolution,
  RuntimeContext,
  RuntimeState,
  SeededRng,
  StageDefinition,
  TargetingPolicy,
  TraitDefinition,
  UpgradeOffer,
  ValidationIssue,
  ValidationResult,
  VisualAttachmentState,
} from './contracts.js';
export { COMMAND_KINDS, BLANK_COMMAND } from './contracts.js';
export {
  getCatalog,
  getTrait,
  getEvolution,
  findEvolutionForPair,
  getRankBehavior,
} from './definitions.js';
export { validateCatalog } from './validation.js';
export { createRng, restoreRng } from './rng.js';
export {
  serializeState,
  deserializeState,
  validateStateAgainstCatalog,
  STATE_VERSION,
  SerializationError,
} from './serialization.js';
export { fingerprintCatalog, fingerprintRuntimeContent, hashState } from './state-hash.js';
export { generateOffers } from './offer-director.js';
export {
  visualState,
  stageOf,
  rankOf,
  socketOwner,
  activeAttackSlots,
  applyUpgrade,
  fuseEvolution,
  createInitialState,
} from './build-state.js';
export { availableFusions, refreshFusionPreviews } from './evolution-resolver.js';
export {
  canonicalChimeraPair,
  chimeraPairId,
  enumerateChimeraPairs,
  parseChimeraPairId,
} from './chimera/chimera-ids.js';
export { rollVariant, splitmix32 } from './chimera/variant-roll.js';
export { synthesizeChimera } from './chimera/synthesize.js';
export { estimateBehaviorDps, chimeraTargetDps, clampChimeraBehavior } from './chimera/budget.js';
export { CHIMERA_CONTENT_VERSION, resolveEvolution } from './chimera/resolved-evolution.js';
export {
  rankStageFor,
  rankStagesFor,
  legacyStageForRank,
  isMasterRank,
} from './rank-progression.js';
export {
  describeTraitUpgradeImpact,
  type TraitUpgradeImpact,
  type TraitUpgradeImpactCategory,
} from './upgrade-impact.js';
export { ensureTimers, stepBehaviors } from './behavior-runtime.js';
export { createCommandBuffer } from './command-buffer.js';
export {
  GREG_FOREST_ARSENAL_CATALOG,
  GREG_VERTICAL_SLICE_CATALOG,
} from './content/greg-vertical-slice.js';
