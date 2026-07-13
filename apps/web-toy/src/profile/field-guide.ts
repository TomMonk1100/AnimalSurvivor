import type { BiomeId, HeroId } from '@sim';
import type { FieldGuideEntry, FieldGuideVisual, TerminalOutcome } from './profile-store';

export interface FieldGuideVisualInput {
  readonly sourceId: string;
  readonly stage: FieldGuideVisual['stage'];
  readonly visualKey: string;
  readonly enabled?: boolean;
}

export interface FieldGuideEntryInput {
  readonly runId: string;
  readonly heroId: HeroId;
  readonly biomeId?: BiomeId;
  readonly seed: number;
  readonly outcome: TerminalOutcome;
  readonly durationTicks: number;
  readonly kills: number;
  readonly essenceEarned: number;
  readonly visuals: readonly FieldGuideVisualInput[];
  readonly universalUpgradeRanks: readonly number[];
}

export interface FieldGuidePortrait {
  readonly key: string;
  readonly glyph: string;
  readonly accent: string;
  readonly assetUrl: string;
  readonly assetAlt: string;
  readonly title: string;
  readonly formLabel: string;
}

export interface HeroPortraitAsset {
  readonly assetUrl: string;
  readonly assetAlt: string;
}

export interface FieldGuideEvolutionStep {
  readonly label: 'Bud' | 'Adapted' | 'Mythic';
  readonly unlocked: boolean;
}

export interface FieldGuideEvolutionNode {
  readonly sourceId: string;
  readonly title: string;
  readonly ingredients: readonly string[];
  readonly steps: readonly FieldGuideEvolutionStep[];
}

export interface FieldGuideRecipe {
  readonly id: string;
  readonly title: string;
  readonly ingredients: readonly string[];
  readonly discovered: boolean;
}

const HERO_NAMES: Readonly<Record<HeroId, string>> = Object.freeze({
  greg: 'Greg',
  benny: 'Benny',
  gracie: 'Gracie',
});

const HERO_PORTRAITS: Readonly<Record<HeroId, Pick<FieldGuidePortrait, 'glyph' | 'accent'>>> = Object.freeze({
  greg: Object.freeze({ glyph: 'G', accent: '#f1c27d' }),
  benny: Object.freeze({ glyph: 'B', accent: '#d69052' }),
  gracie: Object.freeze({ glyph: 'G', accent: '#8bd8bb' }),
});

const HERO_PORTRAIT_ASSETS: Readonly<Record<HeroId, string>> = Object.freeze({
  greg: new URL('../../../../assets/ui/field-guide/greg-final-form-v1.png', import.meta.url).href,
  benny: new URL('../../../../assets/ui/field-guide/benny-final-form-v1.png', import.meta.url).href,
  gracie: new URL('../../../../assets/ui/field-guide/gracie-final-form-v1.png', import.meta.url).href,
});

export function getHeroPortraitAsset(heroId: HeroId): HeroPortraitAsset {
  const heroName = HERO_NAMES[heroId];
  return Object.freeze({
    assetUrl: HERO_PORTRAIT_ASSETS[heroId],
    assetAlt: `${heroName} founding hero portrait`,
  });
}

const MYTHIC_INGREDIENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'thornstorm-mantle': ['porcupine-quills', 'puffer-pouch'],
  'thunderbug-dynamo': ['electric-eel-coil', 'firefly-colony'],
  'razorstep-chimera': ['mantis-scythes', 'gecko-pads'],
  'midnight-radar': ['owl-pinions', 'bat-ears'],
  'meteor-mauler': ['crab-pincers', 'armadillo-greaves'],
  'royal-stinkcloud': ['skunk-brush', 'monarch-brood'],
});

const MYTHIC_RECIPE_IDS = Object.freeze([
  'thornstorm-mantle',
  'thunderbug-dynamo',
  'razorstep-chimera',
  'midnight-radar',
  'meteor-mauler',
  'royal-stinkcloud',
] as const);

const FAMILY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'porcupine-quills': 'Porcupine Quills',
  'puffer-pouch': 'Puffer Pouch',
  'thornstorm-mantle': 'Thornstorm Mantle',
  'electric-eel-coil': 'Electric Eel Coil',
  'firefly-colony': 'Firefly Colony',
  'thunderbug-dynamo': 'Thunderbug Dynamo',
  'mantis-scythes': 'Mantis Scythes',
  'gecko-pads': 'Gecko Pads',
  'razorstep-chimera': 'Razorstep Chimera',
  'owl-pinions': 'Owl Pinions',
  'bat-ears': 'Bat Ears',
  'midnight-radar': 'Midnight Radar',
  'crab-pincers': 'Crab Pincers',
  'armadillo-greaves': 'Armadillo Greaves',
  'meteor-mauler': 'Meteor Mauler',
  'skunk-brush': 'Skunk Brush',
  'monarch-brood': 'Monarch Brood',
  'royal-stinkcloud': 'Royal Stinkcloud',
});

const RUN_EPITHETS = ['Moonlit', 'Mossbound', 'Bramblebound', 'Starlit'] as const;

function familyName(sourceId: string): string {
  return FAMILY_NAMES[sourceId] ?? sourceId
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

/** Player-facing title for a discovered adaptation or Mythic recipe. */
export function presentFieldGuideSourceName(sourceId: string): string {
  return familyName(sourceId);
}

/** Presents the complete launch recipe catalog without changing profile state. */
export function presentFieldGuideRecipes(discoveredRecipes: readonly string[]): readonly FieldGuideRecipe[] {
  const discovered = new Set(discoveredRecipes);
  return Object.freeze(MYTHIC_RECIPE_IDS.map((id) => Object.freeze({
    id,
    title: familyName(id),
    ingredients: Object.freeze((MYTHIC_INGREDIENTS[id] ?? []).map(familyName)),
    discovered: discovered.has(id),
  })));
}

/**
 * Projects an archived build into a stable, renderer-friendly portrait tile.
 * This is intentionally derived from saved run state rather than being a new
 * gameplay or persistence field. The authored hero portrait is stable by hero,
 * while the form label and accent remain derived from the archived build.
 */
export function presentFieldGuidePortrait(
  entry: Pick<FieldGuideEntry, 'heroId' | 'visuals'>,
): FieldGuidePortrait {
  const finalVisual = entry.visuals.find((visual) => visual.stage === 'mythic')
    ?? entry.visuals.find((visual) => visual.stage === 'adapted')
    ?? entry.visuals[0];
  const base = HERO_PORTRAITS[entry.heroId];
  const asset = getHeroPortraitAsset(entry.heroId);
  const formLabel = finalVisual === undefined
    ? 'Founding form'
    : `${finalVisual.stage === 'mythic' ? 'Mythic' : 'Adapted'} · ${familyName(finalVisual.sourceId)}`;
  return Object.freeze({
    key: finalVisual === undefined ? `${entry.heroId}:base` : `${entry.heroId}:${finalVisual.sourceId}:${finalVisual.stage}`,
    glyph: base.glyph,
    accent: base.accent,
    assetUrl: asset.assetUrl,
    assetAlt: `${HERO_NAMES[entry.heroId]} final-form portrait`,
    title: `${HERO_NAMES[entry.heroId]} portrait`,
    formLabel,
  });
}

/**
 * Projects the visible end-state into an honest evolution tree. Locked later
 * stages are shown as locked labels, while Mythic nodes retain their authored
 * two-family recipe ingredients so the archive explains how the form happened.
 */
export function presentFieldGuideEvolutionTree(
  entry: Pick<FieldGuideEntry, 'visuals'>,
): readonly FieldGuideEvolutionNode[] {
  const seen = new Set<string>();
  const nodes: FieldGuideEvolutionNode[] = [];
  for (const visual of entry.visuals) {
    if (seen.has(visual.sourceId)) continue;
    seen.add(visual.sourceId);
    const currentIndex = visual.stage === 'bud' ? 0 : visual.stage === 'adapted' ? 1 : 2;
    nodes.push(Object.freeze({
      sourceId: visual.sourceId,
      title: familyName(visual.sourceId),
      ingredients: Object.freeze([...(MYTHIC_INGREDIENTS[visual.sourceId] ?? [])].map(familyName)),
      steps: Object.freeze((['Bud', 'Adapted', 'Mythic'] as const).map((label, index) => Object.freeze({
        label,
        unlocked: index <= currentIndex,
      }))),
    }));
  }
  return Object.freeze(nodes);
}

function distinctFamilyNames(visuals: readonly FieldGuideVisualInput[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const visual of visuals) {
    if (visual.enabled === false || seen.has(visual.sourceId)) continue;
    seen.add(visual.sourceId);
    names.push(familyName(visual.sourceId));
  }
  return names;
}

function buildName(input: FieldGuideEntryInput, names: readonly string[]): string {
  const epithet = RUN_EPITHETS[input.seed % RUN_EPITHETS.length]!;
  const mythic = input.visuals.some((visual) => visual.enabled !== false && visual.stage === 'mythic');
  if (names.length === 0) return `${epithet} ${HERO_NAMES[input.heroId]} First Forage`;
  const ingredients = names.slice(0, 2).join(' + ');
  return mythic
    ? `${epithet} ${HERO_NAMES[input.heroId]} Mythic Hunt: ${ingredients}`
    : `${epithet} ${HERO_NAMES[input.heroId]} Build: ${ingredients}`;
}

function ecologyNote(input: FieldGuideEntryInput, names: readonly string[]): string {
  const outcome = input.outcome === 'victory' ? 'The final threat fell' : 'The colony was overrun';
  if (names.length === 0) return `${outcome} before any adaptation took hold.`;
  const mythic = input.visuals.some((visual) => visual.enabled !== false && visual.stage === 'mythic');
  const adaptation = mythic ? 'a Mythic transformation' : `${names.length} adaptation${names.length === 1 ? '' : 's'}`;
  return `${outcome} after ${adaptation} shaped the run's ecology.`;
}

export function createFieldGuideEntry(input: FieldGuideEntryInput): FieldGuideEntry {
  const names = distinctFamilyNames(input.visuals);
  return {
    id: input.runId,
    heroId: input.heroId,
    biomeId: input.biomeId ?? 'forest',
    seed: input.seed >>> 0,
    outcome: input.outcome,
    durationTicks: input.durationTicks,
    kills: input.kills,
    essenceEarned: input.essenceEarned,
    buildName: buildName(input, names),
    ecologyNote: ecologyNote(input, names),
    visuals: input.visuals
      .filter((visual) => visual.enabled !== false)
      .map((visual) => ({
        sourceId: visual.sourceId,
        stage: visual.stage,
        visualKey: visual.visualKey,
      })),
    universalUpgradeRanks: [...input.universalUpgradeRanks],
  };
}
