/**
 * Deterministic, explicit Master fusion resolution.
 *
 * A pair becomes available only after both independent attacks reach rank 5.
 * Availability is a pure query in catalog order; resolution happens only when
 * the caller explicitly selects an evolution id. This keeps a player-visible
 * "Fuse now / Later" decision out of the upgrade side effect.
 */

import type {
  Catalog,
  FuseResult,
  FusionOffer,
  RuntimeState,
} from './contracts.js';
import { MASTER_RANK, type EvolutionId } from './ids.js';

function isReady(
  catalog: Catalog,
  state: RuntimeState,
  evolutionId: EvolutionId,
): boolean {
  const definition = catalog.evolutions.find((candidate) => candidate.id === evolutionId);
  if (definition === undefined) return false;
  if (state.evolutions.some((resolved) => resolved.id === evolutionId)) return false;

  const [ingredientAId, ingredientBId] = definition.ingredients;
  const ownedA = state.owned.find((owned) => owned.id === ingredientAId);
  const ownedB = state.owned.find((owned) => owned.id === ingredientBId);
  return ownedA !== undefined
    && ownedB !== undefined
    && !ownedA.disabled
    && !ownedB.disabled
    && ownedA.rank === MASTER_RANK
    && ownedB.rank === MASTER_RANK;
}

/** Return all compatible Master-pair choices in authored catalog order. */
export function availableFusions(catalog: Catalog, state: RuntimeState): FusionOffer[] {
  const offers: FusionOffer[] = [];
  for (const evolution of catalog.evolutions) {
    if (!isReady(catalog, state, evolution.id)) continue;
    offers.push({
      evolutionId: evolution.id,
      ingredients: [evolution.ingredients[0], evolution.ingredients[1]],
      freesLogicalSlot: true,
    });
  }
  return offers;
}

/**
 * Resolve exactly one requested Master fusion.
 *
 * Disabled ingredient records and visual sockets are retained deliberately,
 * but capacity calculations count the resulting evolution as one logical
 * attack. Socket reassignment keeps renderer attachment ownership truthful.
 */
export function fuseEvolution(
  catalog: Catalog,
  state: RuntimeState,
  evolutionId: EvolutionId,
): FuseResult {
  const definition = catalog.evolutions.find((candidate) => candidate.id === evolutionId);
  if (definition === undefined) {
    return { outcome: { ok: false, kind: 'unknownEvolution', evolutionId } };
  }
  if (state.evolutions.some((resolved) => resolved.id === evolutionId)) {
    return { outcome: { ok: false, kind: 'alreadyFused', evolutionId } };
  }
  if (!isReady(catalog, state, evolutionId)) {
    return { outcome: { ok: false, kind: 'notMastered', evolutionId } };
  }

  const [ingredientAId, ingredientBId] = definition.ingredients;
  const ownedA = state.owned.find((owned) => owned.id === ingredientAId)!;
  const ownedB = state.owned.find((owned) => owned.id === ingredientBId)!;

  state.evolutions.push({ id: definition.id, ingredients: [ingredientAId, ingredientBId] });
  ownedA.disabled = true;
  ownedB.disabled = true;

  for (const socket of Object.keys(state.sockets) as (keyof typeof state.sockets)[]) {
    const owner = state.sockets[socket];
    if (owner === ingredientAId || owner === ingredientBId) {
      state.sockets[socket] = definition.id;
    }
  }

  return {
    outcome: {
      ok: true,
      kind: 'fused',
      evolutionId: definition.id,
      ingredients: [ingredientAId, ingredientBId],
      logicalSlotCost: 1,
    },
  };
}
