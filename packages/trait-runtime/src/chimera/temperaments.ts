/** Deterministic data and weighted selection for Chimera temperaments. */

export type ChimeraRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export type TemperamentId =
  | 'steady'
  | 'twitchy'
  | 'hearty'
  | 'long-arm'
  | 'compact'
  | 'echo'
  | 'magnet-hearted'
  | 'skittish'
  | 'gilded'
  | 'doubled-down'
  | 'bulwark'
  | 'seismic'
  | 'prismatic'
  | 'colossus'
  | 'apex-whisper'
  | 'show-off';

export interface TemperamentDefinition {
  readonly id: TemperamentId;
  readonly rarity: ChimeraRarity;
  /** Display-ready all-caps adjective used before the Pair Base name. */
  readonly epithet: string;
  /** Stable presentation hook; behavior transforms remain owned by synthesis. */
  readonly accentKey: TemperamentId;
}

export const CHIMERA_RARITIES: readonly ChimeraRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'mythic',
] as const;

/** Integer basis points preserve the plan's exact 45/30/17/6.5/1.5 tier weights. */
export const TEMPERAMENT_RARITY_WEIGHTS: Readonly<Record<ChimeraRarity, number>> = Object.freeze({
  common: 4_500,
  uncommon: 3_000,
  rare: 1_700,
  epic: 650,
  mythic: 150,
});

export const TEMPERAMENT_WEIGHT_TOTAL = 10_000;

export const TEMPERAMENTS: readonly TemperamentDefinition[] = Object.freeze([
  { id: 'steady', rarity: 'common', epithet: 'STEADY', accentKey: 'steady' },
  { id: 'twitchy', rarity: 'common', epithet: 'TWITCHY', accentKey: 'twitchy' },
  { id: 'hearty', rarity: 'common', epithet: 'HEARTY', accentKey: 'hearty' },
  { id: 'long-arm', rarity: 'common', epithet: 'LONG-ARM', accentKey: 'long-arm' },
  { id: 'compact', rarity: 'common', epithet: 'COMPACT', accentKey: 'compact' },
  { id: 'echo', rarity: 'uncommon', epithet: 'ECHO', accentKey: 'echo' },
  { id: 'magnet-hearted', rarity: 'uncommon', epithet: 'MAGNET-HEARTED', accentKey: 'magnet-hearted' },
  { id: 'skittish', rarity: 'uncommon', epithet: 'SKITTISH', accentKey: 'skittish' },
  { id: 'gilded', rarity: 'uncommon', epithet: 'GILDED', accentKey: 'gilded' },
  { id: 'doubled-down', rarity: 'rare', epithet: 'DOUBLED-DOWN', accentKey: 'doubled-down' },
  { id: 'bulwark', rarity: 'rare', epithet: 'BULWARK', accentKey: 'bulwark' },
  { id: 'seismic', rarity: 'rare', epithet: 'SEISMIC', accentKey: 'seismic' },
  { id: 'prismatic', rarity: 'epic', epithet: 'PRISMATIC', accentKey: 'prismatic' },
  { id: 'colossus', rarity: 'epic', epithet: 'COLOSSUS', accentKey: 'colossus' },
  { id: 'apex-whisper', rarity: 'mythic', epithet: 'APEX WHISPER', accentKey: 'apex-whisper' },
  { id: 'show-off', rarity: 'mythic', epithet: 'SHOW-OFF', accentKey: 'show-off' },
]);

const BY_ID = new Map<TemperamentId, TemperamentDefinition>(
  TEMPERAMENTS.map((temperament) => [temperament.id, temperament]),
);

const BY_RARITY: Readonly<Record<ChimeraRarity, readonly TemperamentDefinition[]>> = Object.freeze({
  common: Object.freeze(TEMPERAMENTS.filter((temperament) => temperament.rarity === 'common')),
  uncommon: Object.freeze(TEMPERAMENTS.filter((temperament) => temperament.rarity === 'uncommon')),
  rare: Object.freeze(TEMPERAMENTS.filter((temperament) => temperament.rarity === 'rare')),
  epic: Object.freeze(TEMPERAMENTS.filter((temperament) => temperament.rarity === 'epic')),
  mythic: Object.freeze(TEMPERAMENTS.filter((temperament) => temperament.rarity === 'mythic')),
});

const U32_RANGE = 0x1_0000_0000;

function uint32(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Temperament selection requires a finite roll');
  return value >>> 0;
}

function uniformIndex(roll: number, length: number): number {
  return Math.floor((uint32(roll) * length) / U32_RANGE);
}

export function isTemperamentId(value: unknown): value is TemperamentId {
  return typeof value === 'string' && BY_ID.has(value as TemperamentId);
}

export function getTemperament(id: TemperamentId): TemperamentDefinition {
  return BY_ID.get(id)!;
}

export function temperamentsForRarity(rarity: ChimeraRarity): readonly TemperamentDefinition[] {
  return BY_RARITY[rarity];
}

/** Select a temperament from an exact [0, 10_000) weight ticket and a second roll. */
export function selectTemperamentForTicket(ticket: number, memberRoll: number): TemperamentDefinition {
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= TEMPERAMENT_WEIGHT_TOTAL) {
    throw new RangeError(`Temperament ticket must be in [0, ${TEMPERAMENT_WEIGHT_TOTAL})`);
  }

  let remaining = ticket;
  for (const rarity of CHIMERA_RARITIES) {
    const weight = TEMPERAMENT_RARITY_WEIGHTS[rarity];
    if (remaining < weight) {
      const members = BY_RARITY[rarity];
      return members[uniformIndex(memberRoll, members.length)]!;
    }
    remaining -= weight;
  }

  throw new RangeError('Temperament weights do not cover the ticket range');
}

/**
 * Weighted tier selection using two deterministic uint32 rolls. Members are
 * uniformly selected inside their chosen rarity tier.
 */
export function selectTemperament(tierRoll: number, memberRoll: number): TemperamentDefinition {
  const ticket = Math.floor((uint32(tierRoll) * TEMPERAMENT_WEIGHT_TOTAL) / U32_RANGE);
  return selectTemperamentForTicket(ticket, memberRoll);
}

export function rarityLabel(rarity: ChimeraRarity): string {
  return `${rarity[0]!.toUpperCase()}${rarity.slice(1)}`;
}
