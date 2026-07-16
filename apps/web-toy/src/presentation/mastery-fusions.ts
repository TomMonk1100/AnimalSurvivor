import {
  presentChimeraCopy,
  readChimeraFusionOffer,
  type ChimeraPairKind,
} from './chimera-copy';

/**
 * Structural, app-local projection of the free-fusion surface. Keeping this
 * independent of the runtime package lets an older simulation simply report
 * no Chimera metadata rather than preventing the browser app from starting.
 */
export interface FusionOfferView {
  readonly evolutionId: string;
  readonly ingredients: readonly [string, string];
  readonly displayName?: string;
  readonly rarity?: string;
  readonly temperamentId?: string;
  readonly pairKind?: ChimeraPairKind;
  readonly flavorIndex?: number;
}

export interface FusionPresentation {
  readonly evolutionId: string;
  readonly title: string;
  readonly ingredients: string;
  readonly description: string;
  readonly detail: string;
  readonly rarity: string | null;
  readonly temperament: string | null;
  readonly temperamentAside: string | null;
  readonly pairKind: ChimeraPairKind | null;
  readonly usesLegacyFallback: boolean;
}

function normalizeFusionOffer(value: unknown): FusionOfferView | null {
  const offer = readChimeraFusionOffer(value);
  if (offer.evolutionId === null || offer.ingredients === null) return null;
  return Object.freeze({
    evolutionId: offer.evolutionId,
    ingredients: offer.ingredients,
    ...(offer.displayName === null ? {} : { displayName: offer.displayName }),
    ...(offer.rarity === null ? {} : { rarity: offer.rarity }),
    ...(offer.temperamentId === null ? {} : { temperamentId: offer.temperamentId }),
    ...(offer.pairKind === null ? {} : { pairKind: offer.pairKind }),
    ...(offer.flavorIndex === null ? {} : { flavorIndex: offer.flavorIndex }),
  });
}

/** Reads a tolerant external/legacy fusion value into immutable app data. */
export function readFusionOffers(value: unknown): readonly FusionOfferView[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const offers: FusionOfferView[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const offer = normalizeFusionOffer(candidate);
    if (offer === null || seen.has(offer.evolutionId)) continue;
    seen.add(offer.evolutionId);
    offers.push(offer);
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
  const copy = presentChimeraCopy(offer);
  return Object.freeze({
    evolutionId: offer.evolutionId,
    title: copy.title,
    ingredients: copy.ingredients,
    description: copy.description,
    detail: copy.detail,
    rarity: copy.rarity,
    temperament: copy.temperament,
    temperamentAside: copy.temperamentAside,
    pairKind: copy.pairKind,
    usesLegacyFallback: copy.usesLegacyFallback,
  });
}
