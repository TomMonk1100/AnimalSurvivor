/**
 * Deterministic explicit Wild Splice resolution.
 *
 * Every unordered pair of active Master traits is eligible. Authored recipes
 * remain first-class Perfect Pairs; all other pairs receive a canonical dynamic
 * `chimera:<a>+<b>` id. Preview rolls derive only from immutable run identity
 * and pair identity, so reopening an offer never consumes or perturbs offer RNG.
 */

import type {
  Catalog,
  FuseResult,
  FusionOffer,
  FusionPreview,
  RuntimeState,
} from './contracts.js';
import { MASTER_RANK, type EvolutionId, type TraitId } from './ids.js';
import { canonicalChimeraPair, isChimeraPairId, parseChimeraPairId } from './chimera/chimera-ids.js';
import { classifyChimeraPair } from './chimera/naming.js';
import { rollVariant } from './chimera/variant-roll.js';
import { synthesizeChimera } from './chimera/synthesize.js';
import { rebuildSocketProjection } from './socket-projection.js';

interface ReadyPair {
  readonly first: TraitId;
  readonly second: TraitId;
  readonly evolutionId: EvolutionId;
  readonly pairKind: NonNullable<ReturnType<typeof classifyChimeraPair>>;
}

function authoredEvolutionId(catalog: Catalog, first: TraitId, second: TraitId): EvolutionId | undefined {
  return catalog.evolutions.find((evolution) => (
    (evolution.ingredients[0] === first && evolution.ingredients[1] === second)
    || (evolution.ingredients[0] === second && evolution.ingredients[1] === first)
  ))?.id;
}

function hasSupportChimera(state: RuntimeState, catalog: Catalog): boolean {
  return state.evolutions.some((resolved) => (
    classifyChimeraPair(catalog, resolved.ingredients[0], resolved.ingredients[1]) === 'support'
  ));
}

function readyPairs(
  catalog: Catalog,
  state: RuntimeState,
  includeSupportPairsAfterCap = false,
): ReadyPair[] {
  const masters = catalog.traits
    .map((trait) => state.owned.find((owned) => owned.id === trait.id))
    .filter((owned): owned is NonNullable<typeof owned> => (
      owned !== undefined && !owned.disabled && owned.rank === MASTER_RANK
    ));
  const supportAlreadyFused = hasSupportChimera(state, catalog);
  const pairs: ReadyPair[] = [];
  for (let firstIndex = 0; firstIndex < masters.length; firstIndex++) {
    const first = masters[firstIndex];
    if (first === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < masters.length; secondIndex++) {
      const second = masters[secondIndex];
      if (second === undefined) continue;
      const pair = canonicalChimeraPair(catalog, first.id, second.id);
      if (pair === undefined) continue;
      const pairKind = classifyChimeraPair(catalog, pair.first, pair.second);
      if (pairKind === undefined) continue;
      if (pairKind === 'support' && supportAlreadyFused && !includeSupportPairsAfterCap) continue;
      const evolutionId = authoredEvolutionId(catalog, pair.first, pair.second) ?? pair.id;
      pairs.push({ first: pair.first, second: pair.second, evolutionId, pairKind });
    }
  }
  return pairs.sort((a, b) => {
    const rank = (kind: ReadyPair['pairKind']): number => kind === 'perfect' ? 0 : kind === 'wild' ? 1 : 2;
    const kindOrder = rank(a.pairKind) - rank(b.pairKind);
    if (kindOrder !== 0) return kindOrder;
    return a.evolutionId < b.evolutionId ? -1 : a.evolutionId > b.evolutionId ? 1 : 0;
  });
}

function previewForPair(state: RuntimeState, pairId: string): FusionPreview | undefined {
  return state.fusionPreviews.find((preview) => preview.pairId === pairId);
}

/**
 * Capture rolls at the deterministic transition where a pair first becomes
 * Master-ready. `availableFusions` remains a pure read, so browser polling
 * cannot alter replay/hash state; later unrelated fusions therefore cannot
 * reroll a player-deferred offer.
 */
export function refreshFusionPreviews(catalog: Catalog, state: RuntimeState): void {
  const knownPairIds = new Set(state.fusionPreviews.map((preview) => preview.pairId));
  for (const pair of readyPairs(catalog, state, true)) {
    const pairId = canonicalChimeraPair(catalog, pair.first, pair.second)!.id;
    if (knownPairIds.has(pairId)) continue;
    const ordinal = state.fusionReadyCount;
    const roll = rollVariant(state.runSeed, pairId, ordinal);
    state.fusionPreviews.push({
      pairId,
      ordinal,
      variant: {
        seed: roll.seed,
        temperamentId: roll.temperamentId,
        leanId: roll.leanId,
      },
      flavorIndex: roll.flavorIndex,
    });
    state.fusionReadyCount += 1;
    knownPairIds.add(pairId);
  }
}

function previewOffer(catalog: Catalog, state: RuntimeState, pair: ReadyPair): FusionOffer {
  const pairId = canonicalChimeraPair(catalog, pair.first, pair.second)!.id;
  // A normal runtime records this at the Master-ready transition. The fallback
  // only supports narrow direct-state tooling that predates that transition.
  const preview = previewForPair(state, pairId);
  const roll = preview === undefined
    ? rollVariant(state.runSeed, pairId, state.fusionReadyCount)
    : {
      seed: preview.variant.seed,
      temperamentId: preview.variant.temperamentId,
      leanId: preview.variant.leanId,
      flavorIndex: preview.flavorIndex,
    };
  const synthesized = synthesizeChimera(catalog, pair.first, pair.second, roll);
  return {
    evolutionId: pair.evolutionId,
    ingredients: [pair.first, pair.second],
    freesLogicalSlot: true,
    displayName: synthesized.displayName,
    rarity: synthesized.rarity,
    temperamentId: synthesized.temperamentId,
    leanId: synthesized.leanId,
    pairKind: synthesized.pairKind,
    flavorIndex: roll.flavorIndex,
    variantSeed: roll.seed,
  };
}

/** Return every active Master-pair choice: Perfect Pairs first, then catalog order. */
export function availableFusions(catalog: Catalog, state: RuntimeState): FusionOffer[] {
  return readyPairs(catalog, state).map((pair) => previewOffer(catalog, state, pair));
}

function isKnownFusionId(catalog: Catalog, evolutionId: string): boolean {
  if (catalog.evolutions.some((evolution) => evolution.id === evolutionId)) return true;
  return isChimeraPairId(evolutionId) && parseChimeraPairId(catalog, evolutionId) !== undefined;
}

/** Resolve exactly one player-selected Wild Splice / Perfect Pair. */
export function fuseEvolution(
  catalog: Catalog,
  state: RuntimeState,
  evolutionId: EvolutionId,
): FuseResult {
  if (state.evolutions.some((resolved) => resolved.id === evolutionId)) {
    return { outcome: { ok: false, kind: 'alreadyFused', evolutionId } };
  }
  refreshFusionPreviews(catalog, state);
  const offer = availableFusions(catalog, state).find((candidate) => candidate.evolutionId === evolutionId);
  if (offer === undefined) {
    return {
      outcome: {
        ok: false,
        kind: isKnownFusionId(catalog, evolutionId) ? 'notMastered' : 'unknownEvolution',
        evolutionId,
      },
    };
  }
  const [ingredientAId, ingredientBId] = offer.ingredients;
  const pair = canonicalChimeraPair(catalog, ingredientAId, ingredientBId)!;
  const preview = previewForPair(state, pair.id);
  const roll = preview === undefined
    ? rollVariant(state.runSeed, pair.id, state.fusionReadyCount)
    : {
      seed: preview.variant.seed,
      temperamentId: preview.variant.temperamentId,
      leanId: preview.variant.leanId,
    };
  const ownedA = state.owned.find((owned) => owned.id === ingredientAId)!;
  const ownedB = state.owned.find((owned) => owned.id === ingredientBId)!;
  state.evolutions.push({
    id: evolutionId,
    ingredients: [ingredientAId, ingredientBId],
    variant: { seed: roll.seed, temperamentId: roll.temperamentId, leanId: roll.leanId },
  });
  ownedA.disabled = true;
  ownedB.disabled = true;
  rebuildSocketProjection(catalog, state);

  return {
    outcome: {
      ok: true,
      kind: 'fused',
      evolutionId,
      ingredients: [ingredientAId, ingredientBId],
      logicalSlotCost: 1,
    },
  };
}
