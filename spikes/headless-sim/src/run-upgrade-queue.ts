/**
 * A deterministic level-up queue that keeps animal adaptations and universal
 * run upgrades distinct while presenting them through one player-facing choice
 * surface. It owns no simulation physics: callers apply the projected stats
 * after a successful selection.
 */
import type { TraitRuntimePort, TraitUpgradeOfferView } from './trait-runtime-port.js';
import {
  applyUniversalUpgrade,
  availableUniversalUpgradeOffers,
  createUniversalUpgradeState,
  fingerprintUniversalUpgradeCatalog,
  resolveUniversalUpgradeStats,
  type UniversalUpgradeCatalog,
  type UniversalUpgradeState,
  type UniversalUpgradeStats,
} from './universal-upgrades.js';

/**
 * A normal run can carry five distinct neutral upgrades. Further ranks in an
 * already selected passive remain legal, but a sixth passive can never crowd
 * out that build's final Essence fallback. This is a game rule owned by the
 * run chooser, not by the reusable catalog/rank-state module.
 */
export const PASSIVE_SLOT_CAPACITY = 5;

export interface TraitRunUpgradeOffer {
  readonly kind: 'trait';
  /** Stable selection key; kept distinct from universal ids. */
  readonly id: string;
  readonly traitId: string;
  readonly resultStage: TraitUpgradeOfferView['resultStage'];
}

export interface UniversalRunUpgradeOffer {
  readonly kind: 'universal';
  /** Stable selection key; kept distinct from trait ids. */
  readonly id: string;
  readonly upgradeId: string;
  readonly currentRank: number;
  readonly nextRank: number;
  readonly maxRank: number;
}

export interface EssenceRunUpgradeOffer {
  readonly kind: 'essence';
  readonly id: 'essence-cache';
  readonly amount: number;
}

export type RunUpgradeOfferView =
  | TraitRunUpgradeOffer
  | UniversalRunUpgradeOffer
  | EssenceRunUpgradeOffer;

export interface RunUpgradeSelection {
  readonly tick: number;
  readonly kind: RunUpgradeOfferView['kind'];
  readonly id: string;
}

export interface RunUpgradeQueueOptions {
  /** Number of cards shown for a level when enough legal choices exist. */
  readonly offerCount?: number;
  /** Optional per-run neutral catalog. Omit it to retain trait-only behavior. */
  readonly universalCatalog?: UniversalUpgradeCatalog;
  /** Currency amount awarded by a fallback level after all finite upgrades. */
  readonly essenceCacheAmount?: number;
}

export interface RunUpgradeQueue {
  /** Unresolved levels, including the level represented by pending offers. */
  readonly queuedLevels: number;
  /** Levels discarded only in legacy trait-only mode with no legal offers. */
  readonly drainedLevels: number;
  readonly selectionCount: number;
  readonly pendingOfferCount: number;
  readonly pendingOffers: readonly RunUpgradeOfferView[];
  readonly blocked: boolean;
  /** In-run Essence earned from fallback levels. */
  readonly essenceEarned: number;
  readonly universalCatalogFingerprint: string | null;
  readonly universalState: UniversalUpgradeState | null;
  readonly universalStats: UniversalUpgradeStats | null;
  /** Five for a neutral-enabled normal run; null in trait-only mode. */
  readonly universalSlotCapacity: number | null;
  /** Number of distinct neutral upgrades which have claimed a passive slot. */
  readonly universalSlotsUsed: number | null;
  /** Deterministic fair-rotation cursor for universal card candidates. */
  readonly universalOfferCursor: number;

  enqueueLevels(count: number): void;
  select(id: string, tick: number): RunUpgradeSelection;
}

const EMPTY_OFFERS: readonly RunUpgradeOfferView[] = Object.freeze([]);

function traitOfferId(traitId: string): string {
  return `trait:${traitId}`;
}

function universalOfferId(upgradeId: string): string {
  return `universal:${upgradeId}`;
}

function usedUniversalSlots(state: UniversalUpgradeState): number {
  let used = 0;
  for (const rank of state.ranks) {
    if (rank > 0) used++;
  }
  return used;
}

/**
 * Once five passive families have been selected, retain rank-up offers for
 * those families while filtering any untouched sixth family. This keeps a
 * slot occupied even after that passive reaches max rank, matching a
 * deliberate five-passive build rather than a rotating allowance.
 */
function availableRunUniversalOffers(
  catalog: UniversalUpgradeCatalog,
  state: UniversalUpgradeState,
) {
  const candidates = availableUniversalUpgradeOffers(catalog, state);
  if (usedUniversalSlots(state) < PASSIVE_SLOT_CAPACITY) return candidates;
  return candidates.filter((candidate) => candidate.currentRank > 0);
}

function requirePositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

class RuntimeRunUpgradeQueue implements RunUpgradeQueue {
  private queued = 0;
  private drained = 0;
  private selected = 0;
  private essence = 0;
  private offers: readonly RunUpgradeOfferView[] = EMPTY_OFFERS;
  private universal: UniversalUpgradeState | null;
  private universalCursor = 0;
  private readonly universalFingerprint: string | null;

  constructor(
    private readonly traitRuntime: TraitRuntimePort | null,
    private readonly offerCount: number,
    private readonly catalog: UniversalUpgradeCatalog | null,
    private readonly essenceCacheAmount: number,
  ) {
    this.universal = catalog === null ? null : createUniversalUpgradeState(catalog);
    this.universalFingerprint = catalog === null ? null : fingerprintUniversalUpgradeCatalog(catalog);
  }

  get queuedLevels(): number { return this.queued; }
  get drainedLevels(): number { return this.drained; }
  get selectionCount(): number { return this.selected; }
  get pendingOfferCount(): number { return this.offers.length; }
  get pendingOffers(): readonly RunUpgradeOfferView[] { return this.offers; }
  get blocked(): boolean { return this.offers.length !== 0; }
  get essenceEarned(): number { return this.essence; }
  get universalCatalogFingerprint(): string | null { return this.universalFingerprint; }
  get universalState(): UniversalUpgradeState | null { return this.universal; }
  get universalOfferCursor(): number { return this.universalCursor; }
  get universalStats(): UniversalUpgradeStats | null {
    return this.catalog === null || this.universal === null
      ? null
      : resolveUniversalUpgradeStats(this.catalog, this.universal);
  }
  get universalSlotCapacity(): number | null {
    return this.catalog === null ? null : PASSIVE_SLOT_CAPACITY;
  }
  get universalSlotsUsed(): number | null {
    return this.universal === null ? null : usedUniversalSlots(this.universal);
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

  select(id: string, tick: number): RunUpgradeSelection {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('selected upgrade id must be a non-empty string');
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('selection tick must be a non-negative safe integer');

    const offer = this.offers.find((candidate) => candidate.id === id);
    if (offer === undefined) throw new RangeError(`upgrade ${id} is not a pending upgrade offer`);

    // Apply first. Any failure leaves every queue field untouched.
    switch (offer.kind) {
      case 'trait': {
        if (this.traitRuntime === null) throw new Error('trait offer exists without a trait runtime');
        const result = this.traitRuntime.applyUpgrade(offer.traitId);
        if (!result.outcome.ok) {
          throw new Error(`offered trait ${offer.traitId} was rejected: ${result.outcome.kind}`);
        }
        break;
      }
      case 'universal': {
        if (this.catalog === null || this.universal === null) {
          throw new Error('universal offer exists without a universal catalog');
        }
        const result = applyUniversalUpgrade(this.catalog, this.universal, offer.upgradeId);
        if (!result.ok) {
          throw new Error(`offered universal upgrade ${offer.upgradeId} was rejected: ${result.reason}`);
        }
        this.universal = result.state;
        break;
      }
      case 'essence':
        if (this.essence > Number.MAX_SAFE_INTEGER - offer.amount) {
          throw new RangeError('essence reward exceeds the safe integer range');
        }
        this.essence += offer.amount;
        break;
    }

    this.queued--;
    this.selected++;
    this.offers = EMPTY_OFFERS;
    this.fillOffersOrDrain();
    return Object.freeze({ tick, kind: offer.kind, id: offer.id });
  }

  private fillOffersOrDrain(): void {
    if (this.queued === 0 || this.offers.length !== 0) return;

    const nextOffers: RunUpgradeOfferView[] = [];
    const universalCandidates = this.catalog === null || this.universal === null
      ? []
      : availableRunUniversalOffers(this.catalog, this.universal);

    // With both sources live, reserve a neutral card whenever the chooser has
    // room. Otherwise a full trait offer set would starve universally useful
    // upgrades until every animal adaptation had been exhausted. A one-card
    // chooser alternates the reservation deterministically so neither source
    // can starve the other.
    const reserveUniversalCard = this.traitRuntime !== null && universalCandidates.length > 0
      && (this.offerCount > 1 || this.selected % 2 === 0);
    const traitOfferLimit = reserveUniversalCard ? this.offerCount - 1 : this.offerCount;
    if (this.traitRuntime !== null && traitOfferLimit > 0) {
      for (const offer of this.traitRuntime.offers(traitOfferLimit)) {
        if (nextOffers.length >= traitOfferLimit) break;
        nextOffers.push(Object.freeze({
          kind: 'trait',
          id: traitOfferId(offer.traitId),
          traitId: offer.traitId,
          resultStage: offer.resultStage,
        }));
      }
    }

    if (this.catalog !== null && this.universal !== null && nextOffers.length < this.offerCount) {
      const candidateCount = Math.min(universalCandidates.length, this.offerCount - nextOffers.length);
      if (candidateCount > 0) {
        const start = this.universalCursor % universalCandidates.length;
        for (let offset = 0; offset < candidateCount; offset++) {
          const candidate = universalCandidates[(start + offset) % universalCandidates.length]!;
          nextOffers.push(Object.freeze({
            kind: 'universal',
            id: universalOfferId(candidate.id),
            upgradeId: candidate.id,
            currentRank: candidate.currentRank,
            nextRank: candidate.nextRank,
            maxRank: candidate.maxRank,
          }));
        }
        this.universalCursor += candidateCount;
      }
    }

    if (nextOffers.length === 0 && this.catalog !== null) {
      nextOffers.push(Object.freeze({
        kind: 'essence',
        id: 'essence-cache',
        amount: this.essenceCacheAmount,
      }));
    }

    if (nextOffers.length === 0) {
      this.drained += this.queued;
      this.queued = 0;
      this.offers = EMPTY_OFFERS;
      return;
    }
    this.offers = Object.freeze(nextOffers);
  }
}

/**
 * Create an offer queue. At least one source must be provided: a trait runtime,
 * a universal catalog, or both. The app uses both, while focused simulation
 * tests can keep their historical trait-only path.
 */
export function createRunUpgradeQueue(
  traitRuntime: TraitRuntimePort | null,
  options: RunUpgradeQueueOptions = {},
): RunUpgradeQueue {
  const offerCount = options.offerCount ?? 3;
  const essenceCacheAmount = options.essenceCacheAmount ?? 5;
  requirePositiveSafeInteger('offerCount', offerCount);
  requirePositiveSafeInteger('essenceCacheAmount', essenceCacheAmount);
  const catalog = options.universalCatalog ?? null;
  if (traitRuntime === null && catalog === null) {
    throw new RangeError('run upgrade queue needs a trait runtime or universal catalog');
  }
  return new RuntimeRunUpgradeQueue(traitRuntime, offerCount, catalog, essenceCacheAmount);
}
