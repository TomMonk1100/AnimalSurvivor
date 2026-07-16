/**
 * Canonical identifiers for synthesized two-trait Chimeras.
 *
 * The authored catalog remains immutable. These helpers derive a stable pair
 * identifier from the caller-provided catalog order so custom catalogs keep
 * their own deterministic ordering.
 */

import type { Catalog } from '../contracts.js';
import type { TraitId } from '../ids.js';

export const CHIMERA_PAIR_PREFIX = 'chimera:' as const;

export type ChimeraPairId = `${typeof CHIMERA_PAIR_PREFIX}${string}+${string}`;

export interface ChimeraTraitPair {
  readonly first: TraitId;
  readonly second: TraitId;
  readonly id: ChimeraPairId;
}

function traitIndex(catalog: Catalog, traitId: string): number {
  return catalog.traits.findIndex((trait) => trait.id === traitId);
}

/**
 * Canonicalize a two-trait pair using the supplied catalog's trait order.
 * Returns undefined for an unknown trait or a self-pair.
 */
export function canonicalChimeraPair(
  catalog: Catalog,
  traitA: string,
  traitB: string,
): ChimeraTraitPair | undefined {
  if (traitA === traitB) return undefined;

  const indexA = traitIndex(catalog, traitA);
  const indexB = traitIndex(catalog, traitB);
  if (indexA < 0 || indexB < 0) return undefined;

  const first = indexA < indexB ? traitA : traitB;
  const second = indexA < indexB ? traitB : traitA;
  return {
    first,
    second,
    id: `${CHIMERA_PAIR_PREFIX}${first}+${second}`,
  };
}

/** Return a canonical pair id, or undefined when the inputs are not a valid pair. */
export function tryChimeraPairId(
  catalog: Catalog,
  traitA: string,
  traitB: string,
): ChimeraPairId | undefined {
  return canonicalChimeraPair(catalog, traitA, traitB)?.id;
}

/**
 * Return a canonical pair id for two known distinct traits.
 *
 * Use tryChimeraPairId or parseChimeraPairId for untrusted input.
 */
export function chimeraPairId(catalog: Catalog, traitA: string, traitB: string): ChimeraPairId {
  const id = tryChimeraPairId(catalog, traitA, traitB);
  if (id === undefined) {
    throw new RangeError(`Chimera pairs require two distinct catalog traits: ${traitA}, ${traitB}`);
  }
  return id;
}

/** Grammar-only guard. Parse against a catalog before treating an id as valid state. */
export function isChimeraPairId(value: unknown): value is ChimeraPairId {
  if (typeof value !== 'string' || !value.startsWith(CHIMERA_PAIR_PREFIX)) return false;
  const body = value.slice(CHIMERA_PAIR_PREFIX.length);
  const separator = body.indexOf('+');
  return separator > 0 && separator === body.lastIndexOf('+') && separator < body.length - 1;
}

/**
 * Parse only a canonical id for this catalog. Reversed, self, and unknown
 * pairs are deliberately rejected rather than silently normalized.
 */
export function parseChimeraPairId(catalog: Catalog, value: unknown): ChimeraTraitPair | undefined {
  if (!isChimeraPairId(value)) return undefined;
  const body = value.slice(CHIMERA_PAIR_PREFIX.length);
  const separator = body.indexOf('+');
  const traitA = body.slice(0, separator);
  const traitB = body.slice(separator + 1);
  const pair = canonicalChimeraPair(catalog, traitA, traitB);
  return pair?.id === value ? pair : undefined;
}

/** Enumerate every unordered catalog pair in canonical catalog order. */
export function enumerateChimeraPairs(catalog: Catalog): ChimeraTraitPair[] {
  const pairs: ChimeraTraitPair[] = [];
  for (let firstIndex = 0; firstIndex < catalog.traits.length; firstIndex++) {
    const first = catalog.traits[firstIndex];
    if (first === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < catalog.traits.length; secondIndex++) {
      const second = catalog.traits[secondIndex];
      if (second === undefined) continue;
      pairs.push({
        first: first.id,
        second: second.id,
        id: `${CHIMERA_PAIR_PREFIX}${first.id}+${second.id}`,
      });
    }
  }
  return pairs;
}
