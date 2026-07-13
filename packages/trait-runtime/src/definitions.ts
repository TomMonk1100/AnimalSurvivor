/**
 * AGENT A — OWNED.
 *
 * Read-only lookups over the frozen CATALOG. Build indices once at module load.
 * All other modules use these accessors; they never index the catalog directly.
 */

import type {
  BehaviorDefinition,
  Catalog,
  EvolutionDefinition,
  TraitDefinition,
} from './contracts.js';
import type { EvolutionId, OwnedStage, TraitId, TraitRank } from './ids.js';
import { rankStageFor } from './rank-progression.js';
import { CATALOG } from './content/catalog.js';

/* ────────────────────────────────────────────────────────────────────────
 * Indices built once at module load.
 * ──────────────────────────────────────────────────────────────────────── */

const TRAIT_INDEX: Map<TraitId, TraitDefinition> = new Map(
  CATALOG.traits.map((trait) => [trait.id, trait]),
);

const EVOLUTION_INDEX: Map<EvolutionId, EvolutionDefinition> = new Map(
  CATALOG.evolutions.map((evolution) => [evolution.id, evolution]),
);

/** Unordered-pair key: sorted ingredient ids joined by a separator not present in kebab-case ids. */
function pairKey(a: TraitId, b: TraitId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const PAIR_INDEX: Map<string, EvolutionDefinition> = new Map();
for (const evolution of CATALOG.evolutions) {
  const key = pairKey(evolution.ingredients[0], evolution.ingredients[1]);
  if (!PAIR_INDEX.has(key)) {
    PAIR_INDEX.set(key, evolution);
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Public accessors
 * ──────────────────────────────────────────────────────────────────────── */

/** Return the full frozen catalog. */
export function getCatalog(): Catalog {
  return CATALOG;
}

/** Trait definition by id, or undefined if unknown. */
export function getTrait(_id: TraitId): TraitDefinition | undefined {
  return TRAIT_INDEX.get(_id);
}

/** Evolution definition by id, or undefined if unknown. */
export function getEvolution(_id: EvolutionId): EvolutionDefinition | undefined {
  return EVOLUTION_INDEX.get(_id);
}

/** Behavior for a trait at a given owned stage, or undefined if unknown. */
export function getStageBehavior(
  _traitId: TraitId,
  _stage: OwnedStage,
): BehaviorDefinition | undefined {
  const trait = TRAIT_INDEX.get(_traitId);
  if (!trait) {
    return undefined;
  }
  return trait.stages[_stage]?.behavior;
}

/** Behavior for an exact gameplay rank (rank 5 = Master). */
export function getRankBehavior(
  _traitId: TraitId,
  _rank: TraitRank,
): BehaviorDefinition | undefined {
  const trait = TRAIT_INDEX.get(_traitId);
  return trait === undefined ? undefined : rankStageFor(trait, _rank).behavior;
}

/** Behavior for a resolved evolution, or undefined if unknown. */
export function getEvolutionBehavior(_id: EvolutionId): BehaviorDefinition | undefined {
  return EVOLUTION_INDEX.get(_id)?.behavior;
}

/**
 * Find the evolution whose ingredient pair matches {a, b} in any order.
 * Deterministic: if multiple matched (should not happen in a valid catalog),
 * return the one earliest in catalog order.
 */
export function findEvolutionForPair(
  _a: TraitId,
  _b: TraitId,
): EvolutionDefinition | undefined {
  return PAIR_INDEX.get(pairKey(_a, _b));
}
