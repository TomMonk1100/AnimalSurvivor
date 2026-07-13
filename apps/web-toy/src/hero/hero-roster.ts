import { HERO_CATALOG, getHeroDefinition, type HeroId } from '@sim';

export type { HeroId };

export interface HeroVisualProfile {
  readonly id: HeroId;
  readonly displayName: string;
  readonly species: string;
  readonly epithet: string;
  readonly description: string;
  readonly characterLine: string;
  readonly statLine: string;
  readonly palette: readonly [primary: string, accent: string, highlight: string];
  readonly silhouette: string;
}

interface HeroVisualDetails {
  readonly palette: readonly [primary: string, accent: string, highlight: string];
  readonly silhouette: string;
  readonly characterLine: string;
  readonly statLine: string;
}

const VISUALS: Readonly<Record<HeroId, HeroVisualDetails>> = Object.freeze({
  greg: Object.freeze({
    characterLine: 'A proper gentleman whose Fox Swipe rewards fearless close-range footwork.',
    statLine: 'Baseline dodge · Melee Affinity · balanced health and speed',
    palette: ['#b7653d', '#f1c27d', '#253342'] as const,
    silhouette: 'long ears · brush tail',
  }),
  benny: Object.freeze({
    characterLine: 'A gentle giant whose Trample turns a clear lane into a rolling earthwave.',
    statLine: '+28 starting HP · Thick Skin armor · slower movement and cadence',
    palette: ['#6f7890', '#c3d0dc', '#d69052'] as const,
    silhouette: 'horns · broad shoulders',
  }),
  gracie: Object.freeze({
    characterLine: 'A discerning collector whose escalating Spit keeps threats at a stylish distance.',
    statLine: '+18 pickup radius · Fluffy Shield · lighter body · faster cadence',
    palette: ['#e8d7bd', '#b78c70', '#8bd8bb'] as const,
    silhouette: 'soft ears · wool crest',
  }),
});

export const HERO_VISUAL_PROFILES: readonly HeroVisualProfile[] = Object.freeze(
  HERO_CATALOG.map((definition) => Object.freeze({ ...definition, ...VISUALS[definition.id]! })),
);

export function getHeroVisualProfile(heroId: HeroId): HeroVisualProfile {
  // Resolve through the simulation catalog first so presentation cannot invent
  // a hero id that deterministic startup would reject.
  getHeroDefinition(heroId);
  return HERO_VISUAL_PROFILES.find((profile) => profile.id === heroId)!;
}
