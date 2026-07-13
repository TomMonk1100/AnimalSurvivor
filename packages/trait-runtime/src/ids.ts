/**
 * LEAD-OWNED — FROZEN.
 *
 * Canonical identifier vocabulary for the trait/evolution runtime.
 * Agents must import IDs from here and must NOT redefine or invent new IDs.
 *
 * All identifiers are stable kebab-case strings. They are the only source of
 * truth for trait/evolution/socket/stage names used across the package.
 */

export type TraitId = string;
export type EvolutionId = string;

/**
 * Authoritative independent-attack progression. Rank 5 is always Master.
 *
 * The numeric form is deliberate: it serializes cleanly, is easy for the
 * simulation to compare, and does not couple progression to presentation
 * labels such as the legacy Bud/Adapted attachment art.
 */
export type TraitRank = 1 | 2 | 3 | 4 | 5;

export const TRAIT_RANKS: readonly TraitRank[] = [1, 2, 3, 4, 5] as const;
export const MASTER_RANK: TraitRank = 5;

export function isTraitRank(value: unknown): value is TraitRank {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MASTER_RANK;
}

/**
 * Legacy attachment-art buckets retained while the renderer assets are still
 * keyed as Bud/Adapted. They are presentation compatibility only; gameplay
 * progression is carried by TraitRank.
 */
export type OwnedStage = 'bud' | 'adapted';

/** Public compatibility status used by older callers that do not yet consume rank. */
export type TraitStage = 'locked' | OwnedStage | 'mythic';

/** Six stable body socket families. Renderer maps these to character bones. */
export type SocketId =
  | 'head'
  | 'back'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'tail'
  | 'bodyOrbit';

export const SOCKETS: readonly SocketId[] = [
  'head',
  'back',
  'leftShoulder',
  'rightShoulder',
  'tail',
  'bodyOrbit',
] as const;

/** Trait identifiers. Vertical-slice traits first, then remaining catalog. */
export const TRAIT_IDS = {
  porcupineQuills: 'porcupine-quills',
  pufferPouch: 'puffer-pouch',
  electricEelCoil: 'electric-eel-coil',
  fireflyColony: 'firefly-colony',
  mantisScythes: 'mantis-scythes',
  geckoPads: 'gecko-pads',
  owlPinions: 'owl-pinions',
  batEars: 'bat-ears',
  crabPincers: 'crab-pincers',
  armadilloGreaves: 'armadillo-greaves',
  skunkBrush: 'skunk-brush',
  monarchBrood: 'monarch-brood',
} as const;

/** Evolution (Mythic) identifiers. */
export const EVOLUTION_IDS = {
  thornstormMantle: 'thornstorm-mantle',
  thunderbugDynamo: 'thunderbug-dynamo',
  razorstepChimera: 'razorstep-chimera',
  midnightRadar: 'midnight-radar',
  meteorMauler: 'meteor-mauler',
  royalStinkcloud: 'royal-stinkcloud',
} as const;

export const ALL_TRAIT_IDS: readonly TraitId[] = Object.values(TRAIT_IDS);
export const ALL_EVOLUTION_IDS: readonly EvolutionId[] = Object.values(EVOLUTION_IDS);

export function isSocketId(value: unknown): value is SocketId {
  return typeof value === 'string' && (SOCKETS as readonly string[]).includes(value);
}
