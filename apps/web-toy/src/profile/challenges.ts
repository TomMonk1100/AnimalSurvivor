import type { BiomeId, HeroId } from '@sim';
import type { FieldGuideEntry } from './profile-store';

export const CHALLENGE_IDS = Object.freeze([
  'first-victory',
  'forest-clearer',
  'saltwind-survivor',
  'mythic-maker',
  'roster-scout',
] as const);

export type ChallengeId = typeof CHALLENGE_IDS[number];

export interface FieldGuideChallenge {
  readonly id: ChallengeId;
  readonly title: string;
  readonly description: string;
  readonly unlocked: boolean;
}

const HERO_IDS: readonly HeroId[] = ['greg', 'benny', 'gracie'];

const CHALLENGE_COPY: Readonly<Record<ChallengeId, Pick<FieldGuideChallenge, 'title' | 'description'>>> = Object.freeze({
  'first-victory': Object.freeze({ title: 'First Light', description: 'Win any normal run.' }),
  'forest-clearer': Object.freeze({ title: 'Forest Clearer', description: 'Win in Forest Arsenal.' }),
  'saltwind-survivor': Object.freeze({ title: 'Saltwind Survivor', description: 'Win in Saltwind Ruins.' }),
  'mythic-maker': Object.freeze({ title: 'Mythic Maker', description: 'Archive a run that reaches a Mythic form.' }),
  'roster-scout': Object.freeze({ title: 'Roster Scout', description: 'Win with Scout, Benny, and Gracie.' }),
});

function isVictory(entry: FieldGuideEntry): boolean {
  return entry.outcome === 'victory';
}

function hasVictoryIn(entries: readonly FieldGuideEntry[], biomeId: BiomeId): boolean {
  return entries.some((entry) => isVictory(entry) && entry.biomeId === biomeId);
}

function hasMythic(entries: readonly FieldGuideEntry[]): boolean {
  return entries.some((entry) => entry.visuals.some((visual) => visual.stage === 'mythic'));
}

function hasRosterVictory(entries: readonly FieldGuideEntry[]): boolean {
  const heroes = new Set(entries.filter(isVictory).map((entry) => entry.heroId));
  return HERO_IDS.every((heroId) => heroes.has(heroId));
}

function isUnlocked(id: ChallengeId, entries: readonly FieldGuideEntry[]): boolean {
  switch (id) {
    case 'first-victory': return entries.some(isVictory);
    case 'forest-clearer': return hasVictoryIn(entries, 'forest');
    case 'saltwind-survivor': return hasVictoryIn(entries, 'saltwind');
    case 'mythic-maker': return hasMythic(entries);
    case 'roster-scout': return hasRosterVictory(entries);
  }
}

/** Derives horizontal, no-currency challenge badges from the bounded archive. */
export function presentFieldGuideChallenges(entries: readonly FieldGuideEntry[]): readonly FieldGuideChallenge[] {
  return Object.freeze(CHALLENGE_IDS.map((id) => Object.freeze({
    id,
    ...CHALLENGE_COPY[id],
    unlocked: isUnlocked(id, entries),
  })));
}
