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
  RuntimeContext,
  RuntimeState,
  UpgradeOffer,
  VisualAttachmentState,
} from './contracts.js';
import type { TraitId, TraitStage } from './ids.js';
import { getCatalog } from './definitions.js';
import { validateCatalog } from './validation.js';
import {
  applyUpgrade as applyUpgradeState,
  createInitialState,
  socketOwner,
  stageOf,
  visualState,
} from './build-state.js';
import { ensureTimers, stepBehaviors } from './behavior-runtime.js';
import { createCommandBuffer } from './command-buffer.js';
import { generateOffers } from './offer-director.js';
import { restoreRng } from './rng.js';
import {
  deserializeState,
  serializeState,
  validateStateAgainstCatalog,
} from './serialization.js';
import { fingerprintCatalog, hashState } from './state-hash.js';

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
    this.state = createInitialState(options.seed ?? 0, fingerprint, initialTick);
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
    return fingerprintCatalog(this.catalog);
  }

  /** Serialize runtime state to versioned JSON. */
  serialize(): string {
    return serializeState(this.state);
  }

  /** Restore a runtime from serialized state. */
  static deserialize(json: string, options: TraitRuntimeOptions = {}): TraitRuntime {
    const runtime = new TraitRuntime(options);
    const restored = deserializeState(json);
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
export { getCatalog, getTrait, getEvolution, findEvolutionForPair } from './definitions.js';
export { validateCatalog } from './validation.js';
export { createRng, restoreRng } from './rng.js';
export {
  serializeState,
  deserializeState,
  validateStateAgainstCatalog,
  STATE_VERSION,
  SerializationError,
} from './serialization.js';
export { fingerprintCatalog, hashState } from './state-hash.js';
export { generateOffers } from './offer-director.js';
export { visualState, stageOf, socketOwner, applyUpgrade, createInitialState } from './build-state.js';
export { ensureTimers, stepBehaviors } from './behavior-runtime.js';
export { createCommandBuffer } from './command-buffer.js';
export {
  GREG_FOREST_ARSENAL_CATALOG,
  GREG_VERTICAL_SLICE_CATALOG,
} from './content/greg-vertical-slice.js';
