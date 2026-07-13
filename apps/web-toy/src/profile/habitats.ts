import type { FieldGuideEntry } from './profile-store';

/** Presentation-only habitat postcards derived from the bounded Field Guide archive. */
export const HABITAT_IDS = Object.freeze([
  'forest-clearing',
  'saltwind-ruins',
  'foxglove-thicket',
  'sunstone-pasture',
  'woollight-meadow',
  'mythic-canopy',
] as const);

export type HabitatId = typeof HABITAT_IDS[number];

export interface FieldGuideHabitat {
  readonly id: HabitatId;
  readonly title: string;
  readonly description: string;
  readonly unlocked: boolean;
}

const HABITAT_COPY: Readonly<Record<HabitatId, Pick<FieldGuideHabitat, 'title' | 'description'>>> = Object.freeze({
  'forest-clearing': Object.freeze({
    title: 'Forest Clearing',
    description: 'The starting habitat beneath the Forest Arsenal canopy.',
  }),
  'saltwind-ruins': Object.freeze({
    title: 'Saltwind Ruins',
    description: 'Win a run in the wind-carved second biome.',
  }),
  'foxglove-thicket': Object.freeze({
    title: 'Foxglove Thicket',
    description: 'Win with Greg, the Pouncer.',
  }),
  'sunstone-pasture': Object.freeze({
    title: 'Sunstone Pasture',
    description: 'Win with Benny, the Bastion.',
  }),
  'woollight-meadow': Object.freeze({
    title: 'Woollight Meadow',
    description: 'Win with Gracie, the Surveyor.',
  }),
  'mythic-canopy': Object.freeze({
    title: 'Mythic Canopy',
    description: 'Archive a run that reaches a Mythic form.',
  }),
});

function hasVictory(entries: readonly FieldGuideEntry[], predicate: (entry: FieldGuideEntry) => boolean): boolean {
  return entries.some((entry) => entry.outcome === 'victory' && predicate(entry));
}

function hasMythic(entries: readonly FieldGuideEntry[]): boolean {
  return entries.some((entry) => entry.visuals.some((visual) => visual.stage === 'mythic'));
}

function isUnlocked(id: HabitatId, entries: readonly FieldGuideEntry[]): boolean {
  switch (id) {
    case 'forest-clearing':
      // Forest is the known starting habitat even before the first archive entry.
      return true;
    case 'saltwind-ruins':
      return hasVictory(entries, (entry) => entry.biomeId === 'saltwind');
    case 'foxglove-thicket':
      return hasVictory(entries, (entry) => entry.heroId === 'greg');
    case 'sunstone-pasture':
      return hasVictory(entries, (entry) => entry.heroId === 'benny');
    case 'woollight-meadow':
      return hasVictory(entries, (entry) => entry.heroId === 'gracie');
    case 'mythic-canopy':
      return hasMythic(entries);
  }
}

/** Projects the archive into a stable, no-currency Habitat Atlas. */
export function presentFieldGuideHabitats(entries: readonly FieldGuideEntry[]): readonly FieldGuideHabitat[] {
  return Object.freeze(HABITAT_IDS.map((id) => Object.freeze({
    id,
    ...HABITAT_COPY[id],
    unlocked: isUnlocked(id, entries),
  })));
}
