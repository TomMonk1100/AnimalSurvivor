import type { TraitRuntimePort, TraitUpgradeOfferView } from './trait-runtime-port.js';

export interface TraitUpgradeSelection {
  readonly tick: number;
  readonly traitId: string;
}

export interface TraitUpgradeQueueOptions {
  /** Number of choices requested for each gained level. Default 3. */
  readonly offerCount?: number;
}

export interface TraitUpgradeQueue {
  /** Unresolved levels, including the level represented by pendingOffers. */
  readonly queuedLevels: number;
  /** Levels discarded because the runtime had no eligible offers. */
  readonly drainedLevels: number;
  /** Successful selections made through this queue. */
  readonly selectionCount: number;
  readonly pendingOfferCount: number;
  readonly pendingOffers: readonly TraitUpgradeOfferView[];
  /** True while simulation advancement must wait for a selection. */
  readonly blocked: boolean;

  enqueueLevels(count: number): void;
  select(traitId: string, tick: number): TraitUpgradeSelection;
}

const EMPTY_OFFERS: readonly TraitUpgradeOfferView[] = Object.freeze([]);

class RuntimeTraitUpgradeQueue implements TraitUpgradeQueue {
  private queued = 0;
  private drained = 0;
  private selected = 0;
  private offers: readonly TraitUpgradeOfferView[] = EMPTY_OFFERS;

  constructor(
    private readonly runtime: TraitRuntimePort,
    private readonly offerCount: number,
  ) {}

  get queuedLevels(): number {
    return this.queued;
  }

  get drainedLevels(): number {
    return this.drained;
  }

  get selectionCount(): number {
    return this.selected;
  }

  get pendingOfferCount(): number {
    return this.offers.length;
  }

  get pendingOffers(): readonly TraitUpgradeOfferView[] {
    return this.offers;
  }

  get blocked(): boolean {
    return this.offers.length !== 0;
  }

  enqueueLevels(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError('gained level count must be a non-negative safe integer');
    }
    if (count === 0) return;
    if (this.queued > Number.MAX_SAFE_INTEGER - count) {
      throw new RangeError('queued level count exceeds the safe integer range');
    }

    this.queued += count;
    this.fillOffersOrDrain();
  }

  select(traitId: string, tick: number): TraitUpgradeSelection {
    if (typeof traitId !== 'string' || traitId.length === 0) {
      throw new TypeError('selected traitId must be a non-empty string');
    }
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new RangeError('selection tick must be a non-negative safe integer');
    }

    let offered = false;
    for (let index = 0; index < this.offers.length; index++) {
      if (this.offers[index]!.traitId === traitId) {
        offered = true;
        break;
      }
    }
    if (!offered) {
      throw new RangeError(`trait ${traitId} is not a pending upgrade offer`);
    }

    // Apply first: thrown or rejected upgrades leave every queue field intact.
    const result = this.runtime.applyUpgrade(traitId);
    if (!result.outcome.ok) {
      throw new Error(`offered trait ${traitId} was rejected: ${result.outcome.kind}`);
    }

    this.queued--;
    this.selected++;
    this.offers = EMPTY_OFFERS;
    this.fillOffersOrDrain();
    return { tick, traitId };
  }

  private fillOffersOrDrain(): void {
    if (this.queued === 0 || this.offers.length !== 0) return;

    const nextOffers = this.runtime.offers(this.offerCount);
    if (nextOffers.length === 0) {
      this.drained += this.queued;
      this.queued = 0;
      this.offers = EMPTY_OFFERS;
      return;
    }
    // The runtime returns a fresh array. Freeze it in place so exposing the
    // ordered view cannot let UI code perturb deterministic queue state.
    this.offers = Object.freeze(nextOffers);
  }
}

export function createTraitUpgradeQueue(
  runtime: TraitRuntimePort,
  options: TraitUpgradeQueueOptions = {},
): TraitUpgradeQueue {
  const offerCount = options.offerCount ?? 3;
  if (!Number.isSafeInteger(offerCount) || offerCount < 1) {
    throw new RangeError('offerCount must be a positive safe integer');
  }
  return new RuntimeTraitUpgradeQueue(runtime, offerCount);
}
