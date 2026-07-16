import { presentChimeraCopy, readChimeraFusionOffer } from './chimera-copy';

export const FUSION_ANNOUNCEMENT_HEADING = 'FUSION COMPLETE.';

/** Authored family-clean pool from the Wild Splice plan; never randomly sampled in presentation. */
export const FUSION_ANNOUNCER_FLAVOR_LINES = Object.freeze([
  'Two attacks entered the chamber. One attack left. Math has been notified.',
  'This model comes with a lifetime warranty. Estimates of that lifetime vary.',
  'It is fully house-trained. It is not, however, house-broken. Different thing.',
  'Please do not taunt the new attachment. It remembers.',
  'Handcrafted by unlicensed science. No refunds, no exchanges, no regrets.',
  'The committee reviewed your loadout and screamed with joy. Mostly joy.',
  'Contains absolutely zero onions. We checked twice.',
  'Spicy. Dangerously, deliciously spicy. The jalapeño of fusions.',
  'Some assembly was required. We did the assembly. You do the stomping.',
  'Legally, this is still one attack. Physically, it is a situation.',
]);

export interface FusionAnnouncementCopy {
  readonly heading: typeof FUSION_ANNOUNCEMENT_HEADING;
  readonly name: string;
  readonly detail: string;
  readonly flavor: string;
  readonly flavorIndex: number;
}

/**
 * Converts the simulation-authored flavor index into the bounded authored
 * pool. Invalid or legacy values consistently select the first line.
 */
export function resolveFusionFlavorIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return 0;
  return ((value % FUSION_ANNOUNCER_FLAVOR_LINES.length) + FUSION_ANNOUNCER_FLAVOR_LINES.length)
    % FUSION_ANNOUNCER_FLAVOR_LINES.length;
}

/** Returns a deterministic flavor line without drawing presentation randomness. */
export function getFusionAnnouncerFlavor(value: unknown): string {
  const index = resolveFusionFlavorIndex(value);
  return FUSION_ANNOUNCER_FLAVOR_LINES[index] ?? FUSION_ANNOUNCER_FLAVOR_LINES[0] ?? '';
}

/** Pure toast-ready announcement copy for a fusion event or offer. */
export function presentFusionAnnouncement(value: unknown): FusionAnnouncementCopy {
  const fusion = presentChimeraCopy(value);
  const flavorIndex = resolveFusionFlavorIndex(readChimeraFusionOffer(value).flavorIndex);
  return Object.freeze({
    heading: FUSION_ANNOUNCEMENT_HEADING,
    name: fusion.title,
    detail: `${fusion.title} has joined your body's growing committee of opinions.`,
    flavor: getFusionAnnouncerFlavor(flavorIndex),
    flavorIndex,
  });
}
