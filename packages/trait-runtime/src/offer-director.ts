/**
 * LEAD-OWNED.
 *
 * Deterministic upgrade-offer generation using injected seeded RNG.
 *
 * Eligibility (a trait is offerable iff applying it now would succeed and make
 * progress):
 *   - locked  -> offer Bud, but ONLY if all its sockets are currently free;
 *   - bud     -> offer Adapted (advancing needs no new sockets);
 *   - adapted -> excluded (maxed; recipes resolve automatically, not via offers);
 *   - disabled (consumed by a Mythic) -> excluded.
 *
 * Selection: gather eligible offers in catalog order, then produce up to `count`
 * of them chosen with the injected RNG. If eligible <= count, all are returned
 * in catalog order. Otherwise a seeded partial Fisher-Yates picks `count`
 * distinct offers; the returned order is the pick order (deterministic given the
 * RNG state). Never returns impossible/full/maxed choices. No ambient
 * randomness.
 */

import type { Catalog, RuntimeState, SeededRng, UpgradeOffer } from './contracts.js';
import { socketOwner, stageOf } from './build-state.js';

function eligibleOffers(catalog: Catalog, state: RuntimeState): UpgradeOffer[] {
  const offers: UpgradeOffer[] = [];
  const mayAcquireTrait = catalog.maxActiveTraits === undefined
    || state.owned.length < catalog.maxActiveTraits;
  for (const trait of catalog.traits) {
    const stage = stageOf(state, trait.id);
    if (stage === 'locked') {
      const allFree = trait.sockets.every((s) => socketOwner(state, s) === undefined);
      if (mayAcquireTrait && allFree) offers.push({ traitId: trait.id, resultStage: 'bud' });
    } else if (stage === 'bud') {
      offers.push({ traitId: trait.id, resultStage: 'adapted' });
    }
    // 'adapted' -> maxed (excluded); 'mythic' -> disabled (excluded).
  }
  return offers;
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
  const pool = eligibleOffers(catalog, state);
  if (count === 0) return [];
  if (pool.length <= count) return pool;

  // Partial Fisher-Yates: pick `count` distinct entries using the injected RNG.
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
