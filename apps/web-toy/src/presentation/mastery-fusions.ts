/**
 * Structural, app-local projection of the V1.1 free-fusion surface. Keeping
 * this independent of the runtime package lets an older simulation simply
 * report no offers rather than preventing the browser app from starting.
 */
export interface FusionOfferView {
  readonly evolutionId: string;
  readonly ingredients: readonly [string, string];
}

export interface FusionPresentation {
  readonly evolutionId: string;
  readonly title: string;
  readonly ingredients: string;
  readonly detail: string;
}

function titleCase(id: string): string {
  return id
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function isStringPair(value: unknown): value is readonly [string, string] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'string' && value[0].trim().length > 0
    && typeof value[1] === 'string' && value[1].trim().length > 0;
}

/** Reads a tolerant external/legacy fusion value into immutable app data. */
export function readFusionOffers(value: unknown): readonly FusionOfferView[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const offers: FusionOfferView[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.evolutionId !== 'string' || record.evolutionId.trim().length === 0 || !isStringPair(record.ingredients)) continue;
    if (seen.has(record.evolutionId)) continue;
    seen.add(record.evolutionId);
    offers.push(Object.freeze({
      evolutionId: record.evolutionId,
      ingredients: Object.freeze([record.ingredients[0], record.ingredients[1]]) as unknown as readonly [string, string],
    }));
  }
  return Object.freeze(offers);
}

/** Rank display that preserves older Bud/Adapted copy when rank data is absent. */
export function presentMasteryRank(
  rank: number | null | undefined,
  isMaster: boolean | undefined,
  fallback: string,
): string {
  if (isMaster === true || rank === 5) return 'MASTER · Rank 5/5';
  if (typeof rank === 'number' && Number.isSafeInteger(rank) && rank >= 1 && rank <= 4) return `Rank ${rank}/5`;
  return fallback;
}

export function presentFusion(offer: FusionOfferView): FusionPresentation {
  const ingredients = `${titleCase(offer.ingredients[0])} + ${titleCase(offer.ingredients[1])}`;
  return Object.freeze({
    evolutionId: offer.evolutionId,
    title: titleCase(offer.evolutionId),
    ingredients,
    detail: `Fuse two Master attacks into one logical attack slot. This fusion is free.`,
  });
}
