/** Shared dynamic behavior/metadata resolver for authored and synthesized evolutions. */

import type { Catalog, EvolutionDefinition, ResolvedEvolution } from '../contracts.js';
import { isChimeraPairId, parseChimeraPairId } from './chimera-ids.js';
import { synthesizeChimera, type SynthesizedChimera } from './synthesize.js';

/** Bump whenever generated behavior semantics change; replay identity consumes this. */
export const CHIMERA_CONTENT_VERSION = 'wild-splice-v5' as const;

function authoredFor(catalog: Catalog, resolved: ResolvedEvolution): EvolutionDefinition | undefined {
  return catalog.evolutions.find((definition) => (
    definition.id === resolved.id
    && definition.ingredients[0] === resolved.ingredients[0]
    && definition.ingredients[1] === resolved.ingredients[1]
  ));
}

/**
 * Resolve one active evolution. Legacy authored records have no variant and
 * retain their original behavior exactly; all new variants synthesize from the
 * persisted pair and variant fields, including Perfect Pairs.
 */
export function resolveEvolution(
  catalog: Catalog,
  resolved: ResolvedEvolution,
): EvolutionDefinition | undefined {
  if (resolved.variant === undefined) return authoredFor(catalog, resolved);
  const synthesized = resolveSynthesizedEvolution(catalog, resolved);
  return synthesized?.definition;
}

/** Same resolution with presentation/budget metadata when the evolution is synthesized. */
export function resolveSynthesizedEvolution(
  catalog: Catalog,
  resolved: ResolvedEvolution,
): SynthesizedChimera | undefined {
  if (resolved.variant === undefined) return undefined;
  const [first, second] = resolved.ingredients;
  if (isChimeraPairId(resolved.id)) {
    const parsed = parseChimeraPairId(catalog, resolved.id);
    if (parsed === undefined || parsed.first !== first || parsed.second !== second) return undefined;
  } else if (authoredFor(catalog, resolved) === undefined) {
    // A non-Chimera id may only be a newly tempered authored Perfect Pair.
    return undefined;
  }
  try {
    return synthesizeChimera(catalog, first, second, resolved.variant);
  } catch {
    return undefined;
  }
}

export function isResolvableEvolution(catalog: Catalog, resolved: ResolvedEvolution): boolean {
  return resolveEvolution(catalog, resolved) !== undefined;
}
