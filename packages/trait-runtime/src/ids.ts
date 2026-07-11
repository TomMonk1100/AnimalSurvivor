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

/** Progression stages. `locked` = not owned. */
export type TraitStage = 'locked' | 'bud' | 'adapted' | 'mythic';

/** Only these two stages are storable on an owned independent trait. */
export type OwnedStage = 'bud' | 'adapted';

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
