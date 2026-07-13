/**
 * Structural boundary for injecting a trait runtime into the simulation package.
 *
 * These views intentionally duplicate only the public data the simulation
 * consumes. The trait-runtime package satisfies them structurally, while this
 * package remains independently buildable and has no cross-package dependency.
 */

export interface TraitRuntimeUpdateContext {
  readonly tick: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly moveDirX: number;
  readonly moveDirY: number;
  readonly distanceMovedThisTick: number;
  /** Neutral attack damage multiplier projected by the simulation. */
  readonly weaponDamageMultiplier?: number;
  /** Neutral attack cooldown multiplier projected by the simulation. */
  readonly weaponCooldownMultiplier?: number;
}

export interface TraitRuntimeCommandView {
  readonly kind: string;
  readonly sourceId: string;
  readonly tick: number;
  readonly targeting: string;
  readonly originX: number;
  readonly originY: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly count: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly strength: number;
  /** Optional for compatibility with minimal runtime fixtures. */
  readonly durationTicks?: number;
  /** Optional for compatibility while authored runtimes adopt zone cadence. */
  readonly intervalTicks?: number;
  /** Optional for compatibility while authored runtimes adopt zone damage. */
  readonly amount?: number;
  readonly facing: number;
  readonly spread: number;
  /** Optional while lightweight runtime fixtures adopt directional melee arcs. */
  readonly arc?: number;
  /** Optional while lightweight runtime fixtures adopt chain-lightning hops. */
  readonly jumps?: number;
  /** Optional while lightweight runtime fixtures adopt piercing volleys. */
  readonly pierce?: number;
  readonly range: number;
  /** Optional for compatibility with minimal runtime fixtures. */
  readonly tag?: string;
}

export interface TraitRuntimeCommandSource {
  readonly length: number;
  at(index: number): TraitRuntimeCommandView;
}

export type TraitUpgradeStage = 'bud' | 'adapted';

export interface TraitUpgradeOfferView {
  readonly traitId: string;
  readonly resultStage: TraitUpgradeStage;
}

export type TraitUpgradeOutcomeView =
  | { readonly ok: true; readonly kind: 'created'; readonly traitId: string; readonly stage: 'bud' }
  | { readonly ok: true; readonly kind: 'advanced'; readonly traitId: string; readonly stage: 'adapted' }
  | { readonly ok: false; readonly kind: 'unknownTrait'; readonly traitId: string }
  | { readonly ok: false; readonly kind: 'maxed'; readonly traitId: string }
  | { readonly ok: false; readonly kind: 'alreadyMythic'; readonly traitId: string }
  | { readonly ok: false; readonly kind: 'loadoutFull'; readonly traitId: string; readonly capacity: number }
  | {
      readonly ok: false;
      readonly kind: 'socketConflict';
      readonly traitId: string;
      readonly sockets: readonly string[];
      readonly heldBy: readonly string[];
    };

export interface TraitUpgradeApplyResultView {
  readonly outcome: TraitUpgradeOutcomeView;
  readonly evolved: string | null;
}

export interface TraitVisualAttachmentView {
  readonly sourceId: string;
  readonly stage: 'bud' | 'adapted' | 'mythic';
  readonly sockets: readonly string[];
  readonly visualKey: string;
  readonly enabled: boolean;
}

export interface TraitRuntimePort {
  update(context: TraitRuntimeUpdateContext): TraitRuntimeCommandSource;
  offers(count: number): TraitUpgradeOfferView[];
  applyUpgrade(traitId: string): TraitUpgradeApplyResultView;
  visualState(): TraitVisualAttachmentView[];
  hash(): string;
  fingerprint(): string;
}

export interface TraitRuntimeFactoryOptions {
  readonly seed: number;
  /** Last simulation tick already processed by the runtime. */
  readonly initialTick: number;
}

export type TraitRuntimeFactory = (options: TraitRuntimeFactoryOptions) => TraitRuntimePort;

const REQUIRED_METHODS = [
  'update',
  'offers',
  'applyUpgrade',
  'visualState',
  'hash',
  'fingerprint',
] as const;

/** Fail at injection time instead of producing a delayed hot-loop error. */
export function assertTraitRuntimePort(value: unknown): asserts value is TraitRuntimePort {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('trait runtime factory must return an object');
  }
  const candidate = value as Record<string, unknown>;
  for (const method of REQUIRED_METHODS) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`trait runtime port.${method} must be a function`);
    }
  }
}

/** Validate deterministic construction inputs and the factory result. */
export function createTraitRuntimePort(
  factory: TraitRuntimeFactory,
  options: TraitRuntimeFactoryOptions,
): TraitRuntimePort {
  if (typeof factory !== 'function') {
    throw new TypeError('trait runtime factory must be a function');
  }
  if (!Number.isFinite(options.seed)) {
    throw new RangeError('trait runtime seed must be finite');
  }
  if (!Number.isSafeInteger(options.initialTick) || options.initialTick < -1) {
    throw new RangeError('trait runtime initialTick must be a safe integer >= -1');
  }
  const runtime = factory(options);
  assertTraitRuntimePort(runtime);
  return runtime;
}
