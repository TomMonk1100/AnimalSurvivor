/** Authored Pair Base names and deterministic pair classification. */

import type { Catalog } from '../contracts.js';
import type { TraitId } from '../ids.js';
import {
  canonicalChimeraPair,
  parseChimeraPairId,
  type ChimeraPairId,
} from './chimera-ids.js';
import { getTemperament, rarityLabel, type TemperamentId } from './temperaments.js';

export type ChimeraPairKind = 'perfect' | 'wild' | 'support';

export interface PairBaseNameEntry {
  readonly ingredients: readonly [TraitId, TraitId];
  readonly name: string;
}

/** The complete 66-entry Pair Base table from the Wild Splice plan. */
export const PAIR_BASE_NAME_ENTRIES: readonly PairBaseNameEntry[] = Object.freeze([
  { ingredients: ['porcupine-quills', 'puffer-pouch'], name: 'Thornstorm Mantle' },
  { ingredients: ['porcupine-quills', 'electric-eel-coil'], name: 'Static Acupuncture' },
  { ingredients: ['porcupine-quills', 'firefly-colony'], name: 'Glowneedle Halo' },
  { ingredients: ['porcupine-quills', 'mantis-scythes'], name: 'Quillotine Sweep' },
  { ingredients: ['porcupine-quills', 'gecko-pads'], name: 'Caltrop Confetti' },
  { ingredients: ['porcupine-quills', 'owl-pinions'], name: 'Quillnado' },
  { ingredients: ['porcupine-quills', 'bat-ears'], name: 'Homing Pincushion' },
  { ingredients: ['porcupine-quills', 'crab-pincers'], name: 'Jackhammer Quills' },
  { ingredients: ['porcupine-quills', 'armadillo-greaves'], name: 'Porcupine Mosh Pit' },
  { ingredients: ['porcupine-quills', 'skunk-brush'], name: 'Eau de Ouch' },
  { ingredients: ['porcupine-quills', 'monarch-brood'], name: 'Monarch Lancers' },
  { ingredients: ['puffer-pouch', 'electric-eel-coil'], name: 'Riptide Circuit' },
  { ingredients: ['puffer-pouch', 'firefly-colony'], name: 'Lantern Whirlpool' },
  { ingredients: ['puffer-pouch', 'mantis-scythes'], name: 'Salad Spinner Supreme' },
  { ingredients: ['puffer-pouch', 'gecko-pads'], name: 'Flypaper Fiesta' },
  { ingredients: ['puffer-pouch', 'owl-pinions'], name: 'Feathered Undertow' },
  { ingredients: ['puffer-pouch', 'bat-ears'], name: 'The Polite Kidnapping' },
  { ingredients: ['puffer-pouch', 'crab-pincers'], name: 'Compactor Hug' },
  { ingredients: ['puffer-pouch', 'armadillo-greaves'], name: 'The Bouncy Castle' },
  { ingredients: ['puffer-pouch', 'skunk-brush'], name: 'Aromatherapy Trap' },
  { ingredients: ['puffer-pouch', 'monarch-brood'], name: 'Butterfly Net' },
  { ingredients: ['electric-eel-coil', 'firefly-colony'], name: 'Thunderbug Dynamo' },
  { ingredients: ['electric-eel-coil', 'mantis-scythes'], name: 'Lightning Scissors' },
  { ingredients: ['electric-eel-coil', 'gecko-pads'], name: 'Static Stepping Stones' },
  { ingredients: ['electric-eel-coil', 'owl-pinions'], name: 'Thunderbird Volley' },
  { ingredients: ['electric-eel-coil', 'bat-ears'], name: 'Lightning Rodeo' },
  { ingredients: ['electric-eel-coil', 'crab-pincers'], name: 'Circuit Breaker' },
  { ingredients: ['electric-eel-coil', 'armadillo-greaves'], name: 'Repulsor Coil' },
  { ingredients: ['electric-eel-coil', 'skunk-brush'], name: 'Ozone Funk' },
  { ingredients: ['electric-eel-coil', 'monarch-brood'], name: 'Tesla Butterflies' },
  { ingredients: ['firefly-colony', 'mantis-scythes'], name: 'Firefly Fencing' },
  { ingredients: ['firefly-colony', 'gecko-pads'], name: 'Nightlight Minefield' },
  { ingredients: ['firefly-colony', 'owl-pinions'], name: 'Constellation Cannon' },
  { ingredients: ['firefly-colony', 'bat-ears'], name: 'Paparazzi Swarm' },
  { ingredients: ['firefly-colony', 'crab-pincers'], name: 'Crab Rave Lightshow' },
  { ingredients: ['firefly-colony', 'armadillo-greaves'], name: 'Bug Zapper Bouncer' },
  { ingredients: ['firefly-colony', 'skunk-brush'], name: 'Lava Lamp of Regret' },
  { ingredients: ['firefly-colony', 'monarch-brood'], name: 'Pocket Solar System' },
  { ingredients: ['mantis-scythes', 'gecko-pads'], name: 'Razorstep Chimera' },
  { ingredients: ['mantis-scythes', 'owl-pinions'], name: 'Razor Fan Dance' },
  { ingredients: ['mantis-scythes', 'bat-ears'], name: 'The Scheduled Haircut' },
  { ingredients: ['mantis-scythes', 'crab-pincers'], name: 'Nutcracker Suite' },
  { ingredients: ['mantis-scythes', 'armadillo-greaves'], name: 'Personal Space Enforcer' },
  { ingredients: ['mantis-scythes', 'skunk-brush'], name: 'Compost Cyclone' },
  { ingredients: ['mantis-scythes', 'monarch-brood'], name: 'Royal Fencing Club' },
  { ingredients: ['gecko-pads', 'owl-pinions'], name: 'Tar & Feathers' },
  { ingredients: ['gecko-pads', 'bat-ears'], name: 'Ambush Welcome Mats' },
  { ingredients: ['gecko-pads', 'crab-pincers'], name: 'Landmine Lily Pads' },
  { ingredients: ['gecko-pads', 'armadillo-greaves'], name: 'Trampoline Traps' },
  { ingredients: ['gecko-pads', 'skunk-brush'], name: 'The Unwelcome Carpet' },
  { ingredients: ['gecko-pads', 'monarch-brood'], name: 'Flowerbed Minefield' },
  { ingredients: ['owl-pinions', 'bat-ears'], name: 'Midnight Radar' },
  { ingredients: ['owl-pinions', 'crab-pincers'], name: 'Feather Flak' },
  { ingredients: ['owl-pinions', 'armadillo-greaves'], name: 'Gale-Force Manners' },
  { ingredients: ['owl-pinions', 'skunk-brush'], name: 'Fowl Odor' },
  { ingredients: ['owl-pinions', 'monarch-brood'], name: 'Air Traffic Control' },
  { ingredients: ['bat-ears', 'crab-pincers'], name: 'Precision Pinch' },
  { ingredients: ['bat-ears', 'armadillo-greaves'], name: 'Restraining Order' },
  { ingredients: ['bat-ears', 'skunk-brush'], name: 'Certified Stink Mail' },
  { ingredients: ['bat-ears', 'monarch-brood'], name: 'Butterfly Bounty Hunters' },
  { ingredients: ['crab-pincers', 'armadillo-greaves'], name: 'Meteor Mauler' },
  { ingredients: ['crab-pincers', 'skunk-brush'], name: 'Swamp Thump' },
  { ingredients: ['crab-pincers', 'monarch-brood'], name: 'Piñata Patrol' },
  { ingredients: ['armadillo-greaves', 'skunk-brush'], name: 'The No-Fly Zone' },
  { ingredients: ['armadillo-greaves', 'monarch-brood'], name: 'Velvet Rope Security' },
  { ingredients: ['skunk-brush', 'monarch-brood'], name: 'Royal Stinkcloud' },
]);

/** Lexical key keeps static authored metadata independent from a custom catalog order. */
export function unorderedPairKey(traitA: string, traitB: string): string {
  return traitA < traitB ? `${traitA}|${traitB}` : `${traitB}|${traitA}`;
}

const PAIR_BASE_NAMES_BY_KEY: ReadonlyMap<string, string> = new Map(
  PAIR_BASE_NAME_ENTRIES.map((entry) => [
    unorderedPairKey(entry.ingredients[0], entry.ingredients[1]),
    entry.name,
  ]),
);

const PERFECT_PAIR_KEYS = new Set<string>([
  unorderedPairKey('porcupine-quills', 'puffer-pouch'),
  unorderedPairKey('electric-eel-coil', 'firefly-colony'),
  unorderedPairKey('mantis-scythes', 'gecko-pads'),
  unorderedPairKey('owl-pinions', 'bat-ears'),
  unorderedPairKey('crab-pincers', 'armadillo-greaves'),
  unorderedPairKey('skunk-brush', 'monarch-brood'),
]);

const SUPPORT_PAIR_KEYS = new Set<string>([
  unorderedPairKey('puffer-pouch', 'bat-ears'),
  unorderedPairKey('puffer-pouch', 'armadillo-greaves'),
  unorderedPairKey('puffer-pouch', 'monarch-brood'),
  unorderedPairKey('bat-ears', 'armadillo-greaves'),
  unorderedPairKey('bat-ears', 'monarch-brood'),
  unorderedPairKey('armadillo-greaves', 'monarch-brood'),
]);

/** All 66 authored names, keyed by unordered trait identity. */
export const PAIR_BASE_NAMES: ReadonlyMap<string, string> = PAIR_BASE_NAMES_BY_KEY;

export function pairBaseName(catalog: Catalog, traitA: string, traitB: string): string | undefined {
  const pair = canonicalChimeraPair(catalog, traitA, traitB);
  return pair === undefined ? undefined : PAIR_BASE_NAMES_BY_KEY.get(unorderedPairKey(pair.first, pair.second));
}

export function pairBaseNameForId(catalog: Catalog, pairId: ChimeraPairId | string): string | undefined {
  const pair = parseChimeraPairId(catalog, pairId);
  return pair === undefined ? undefined : PAIR_BASE_NAMES_BY_KEY.get(unorderedPairKey(pair.first, pair.second));
}

export function classifyChimeraPair(catalog: Catalog, traitA: string, traitB: string): ChimeraPairKind | undefined {
  const pair = canonicalChimeraPair(catalog, traitA, traitB);
  if (pair === undefined) return undefined;
  const key = unorderedPairKey(pair.first, pair.second);
  if (PERFECT_PAIR_KEYS.has(key)) return 'perfect';
  return SUPPORT_PAIR_KEYS.has(key) ? 'support' : 'wild';
}

/** Display form specified by the plan: TEMPERAMENT + Pair Base + rarity tag. */
export function displayChimeraName(baseName: string, temperamentId: TemperamentId): string {
  const temperament = getTemperament(temperamentId);
  return `${temperament.epithet} ${baseName} (${rarityLabel(temperament.rarity)})`;
}

export function displayChimeraNameForPair(
  catalog: Catalog,
  traitA: string,
  traitB: string,
  temperamentId: TemperamentId,
): string | undefined {
  const baseName = pairBaseName(catalog, traitA, traitB);
  return baseName === undefined ? undefined : displayChimeraName(baseName, temperamentId);
}
