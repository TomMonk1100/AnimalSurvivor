/**
 * Deterministic rank-aware upgrade offers using injected seeded RNG.
 *
 * Priority is intentional and deterministic:
 *   1. upgrades that complete the partner of an owned Master attack;
 *   2. upgrades for already-owned attacks (so a build can reach Master);
 *   3. new socket-compatible attacks, when a logical slot is free.
 *
 * Within a priority bucket, selection remains seeded partial Fisher-Yates.
 * Master fusion itself is never an automatic offer: callers surface it via
 * availableFusions()/fuseEvolution().
 */

import type { Catalog, RuntimeState, SeededRng, UpgradeOffer } from './contracts.js';
import { MASTER_RANK, type TraitRank } from './ids.js';
import { activeAttackSlots, rankOf, socketOwner, stageOf } from './build-state.js';
import { legacyStageForRank } from './rank-progression.js';

function offer(traitId: string, resultRank: TraitRank): UpgradeOffer {
  return {
    traitId,
    resultStage: legacyStageForRank(resultRank),
    resultRank,
    isMaster: resultRank === MASTER_RANK,
  };
}

function completesMasterPartner(catalog: Catalog, state: RuntimeState, traitId: string): boolean {
  for (const evolution of catalog.evolutions) {
    const [a, b] = evolution.ingredients;
    const partner = a === traitId ? b : b === traitId ? a : undefined;
    if (partner === undefined) continue;
    if (rankOf(state, partner) === MASTER_RANK) return true;
  }
  return false;
}

function eligibleBuckets(catalog: Catalog, state: RuntimeState): readonly UpgradeOffer[][] {
  const masterPartnerRanks: UpgradeOffer[] = [];
  const ownedRanks: UpgradeOffer[] = [];
  const acquisitions: UpgradeOffer[] = [];
  const mayAcquireTrait = catalog.maxActiveTraits === undefined
    || activeAttackSlots(state) < catalog.maxActiveTraits;

  for (const trait of catalog.traits) {
    const rank = rankOf(state, trait.id);
    if (rank !== null) {
      if (rank === MASTER_RANK) continue;
      const next = (rank + 1) as TraitRank;
      const target = offer(trait.id, next);
      if (completesMasterPartner(catalog, state, trait.id)) {
        masterPartnerRanks.push(target);
      } else {
        ownedRanks.push(target);
      }
      continue;
    }

    if (stageOf(state, trait.id) !== 'locked') continue;
    const allFree = trait.sockets.every((socket) => socketOwner(state, socket) === undefined);
    if (mayAcquireTrait && allFree) acquisitions.push(offer(trait.id, 1));
  }

  return [masterPartnerRanks, ownedRanks, acquisitions];
}

function pickFrom(pool: UpgradeOffer[], count: number, rng: SeededRng): UpgradeOffer[] {
  if (count <= 0 || pool.length === 0) return [];
  if (pool.length <= count) return pool;
  const picked: UpgradeOffer[] = [];
  for (let i = 0; i < count; i++) {
    const j = i + rng.nextInt(pool.length - i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
    picked.push(pool[i]!);
  }
  return picked;
}

/** Generate up to `count` deterministic offers. Advances `rng`. */
export function generateOffers(
  catalog: Catalog,
  state: RuntimeState,
  rng: SeededRng,
  count: number,
): UpgradeOffer[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`offer count must be a non-negative integer, got ${count}`);
  }
  if (count === 0) return [];

  const result: UpgradeOffer[] = [];
  for (const bucket of eligibleBuckets(catalog, state)) {
    const remaining = count - result.length;
    if (remaining <= 0) break;
    result.push(...pickFrom([...bucket], remaining, rng));
  }
  return result;
}
