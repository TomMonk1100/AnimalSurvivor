import type { TraitVisualAttachmentView } from '@sim';
import { describeTraitUpgradeImpact } from '@traits';

/** Plain-language HUD content for the Forest Arsenal launch pool. */
export type ActiveAdaptationImpactCategory =
  | 'Direct damage'
  | 'Crowd control'
  | 'Targeting'
  | 'Defense'
  | 'Economy / utility';

interface ActiveAdaptationCardBase {
  readonly id: string;
  readonly title: string;
  readonly stageLabel: string;
  readonly effect: string;
  readonly cadence: string;
}

export interface ActiveAdaptationCard extends ActiveAdaptationCardBase {
  /** Read-only explanation derived from the executable trait rank content. */
  readonly impactCategory: ActiveAdaptationImpactCategory;
  readonly impact: string;
}

type GregAdaptationId =
  | 'porcupine-quills:bud'
  | 'porcupine-quills:adapted'
  | 'puffer-pouch:bud'
  | 'puffer-pouch:adapted'
  | 'thornstorm-mantle:mythic'
  | 'electric-eel-coil:bud'
  | 'electric-eel-coil:adapted'
  | 'firefly-colony:bud'
  | 'firefly-colony:adapted'
  | 'mantis-scythes:bud'
  | 'mantis-scythes:adapted'
  | 'gecko-pads:bud'
  | 'gecko-pads:adapted'
  | 'thunderbug-dynamo:mythic'
  | 'razorstep-chimera:mythic'
  | 'owl-pinions:bud'
  | 'owl-pinions:adapted'
  | 'bat-ears:bud'
  | 'bat-ears:adapted'
  | 'midnight-radar:mythic'
  | 'crab-pincers:bud'
  | 'crab-pincers:adapted'
  | 'armadillo-greaves:bud'
  | 'armadillo-greaves:adapted'
  | 'meteor-mauler:mythic'
  | 'skunk-brush:bud'
  | 'skunk-brush:adapted'
  | 'monarch-brood:bud'
  | 'monarch-brood:adapted'
  | 'royal-stinkcloud:mythic';

export interface AdaptationPresentationDefinition {
  readonly card: ActiveAdaptationCardBase;
  readonly sourceId: string;
  readonly stage: TraitVisualAttachmentView['stage'];
}

function definition(
  id: GregAdaptationId,
  sourceId: string,
  stage: TraitVisualAttachmentView['stage'],
  title: string,
  stageLabel: string,
  effect: string,
  cadence: string,
): AdaptationPresentationDefinition {
  return Object.freeze({
    card: Object.freeze({ id, title, stageLabel, effect, cadence }),
    sourceId,
    stage,
  });
}

const DEFINITIONS: Readonly<Record<GregAdaptationId, AdaptationPresentationDefinition>> = Object.freeze({
  'porcupine-quills:bud': definition(
    'porcupine-quills:bud',
    'porcupine-quills',
    'bud',
    'Porcupine Quills',
    'Bud',
    'Fires three forward quills that pierce through one extra enemy each.',
    'Every 1.5 seconds',
  ),
  'porcupine-quills:adapted': definition(
    'porcupine-quills:adapted',
    'porcupine-quills',
    'adapted',
    'Porcupine Quills',
    'Adapted',
    'Fires five wider quills that pierce through two extra enemies each.',
    'Every second',
  ),
  'puffer-pouch:bud': definition(
    'puffer-pouch:bud',
    'puffer-pouch',
    'bud',
    'Puffer Pouch',
    'Bud',
    'Pulls nearby enemies toward you with an inhale pulse.',
    'Every 1.7 seconds',
  ),
  'puffer-pouch:adapted': definition(
    'puffer-pouch:adapted',
    'puffer-pouch',
    'adapted',
    'Puffer Pouch',
    'Adapted',
    'Pushes nearby enemies away with a wider pulse.',
    'Every 1.3 seconds',
  ),
  'thornstorm-mantle:mythic': definition(
    'thornstorm-mantle:mythic',
    'thornstorm-mantle',
    'mythic',
    'Thornstorm Mantle',
    'Mythic',
    'Draws enemies in, then releases a radial quill storm.',
    'Cycles every 1.5 seconds: telegraph → gather → radial quill storm',
  ),
  'electric-eel-coil:bud': definition(
    'electric-eel-coil:bud',
    'electric-eel-coil',
    'bud',
    'Electric Eel Coil',
    'Bud',
    'Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.',
    'Every 1.3 seconds',
  ),
  'electric-eel-coil:adapted': definition(
    'electric-eel-coil:adapted',
    'electric-eel-coil',
    'adapted',
    'Electric Eel Coil',
    'Adapted',
    'Instantly strikes the nearest enemy, then chains to 3 nearby unhit foes.',
    'Every 0.9 seconds',
  ),
  'firefly-colony:bud': definition(
    'firefly-colony:bud',
    'firefly-colony',
    'bud',
    'Firefly Colony',
    'Bud',
    'Two fireflies orbit you and zap the nearest enemy they touch.',
    'Every 0.5 seconds',
  ),
  'firefly-colony:adapted': definition(
    'firefly-colony:adapted',
    'firefly-colony',
    'adapted',
    'Firefly Colony',
    'Adapted',
    'Four fireflies orbit wider and zap nearby enemies on contact.',
    'Every 0.4 seconds',
  ),
  'thunderbug-dynamo:mythic': definition(
    'thunderbug-dynamo:mythic',
    'thunderbug-dynamo',
    'mythic',
    'Thunderbug Dynamo',
    'Mythic',
    'Telegraphs, then releases a larger chain discharge across nearby enemies.',
    'Cycles: telegraph → larger chain discharge',
  ),
  'mantis-scythes:bud': definition(
    'mantis-scythes:bud',
    'mantis-scythes',
    'bud',
    'Mantis Scythes',
    'Bud',
    'Auto-aims a narrow scythe sweep through nearby enemies.',
    'Every 0.75 seconds',
  ),
  'mantis-scythes:adapted': definition(
    'mantis-scythes:adapted',
    'mantis-scythes',
    'adapted',
    'Mantis Scythes',
    'Adapted',
    'Auto-aims a wider, stronger scythe sweep through nearby enemies.',
    'Every 0.5 seconds',
  ),
  'gecko-pads:bud': definition(
    'gecko-pads:bud',
    'gecko-pads',
    'bud',
    'Gecko Pads',
    'Bud',
    'After moving, leaves a damaging pad behind you.',
    'Placement: after travelling 150 units',
  ),
  'gecko-pads:adapted': definition(
    'gecko-pads:adapted',
    'gecko-pads',
    'adapted',
    'Gecko Pads',
    'Adapted',
    'After moving, leaves larger, stronger damaging pads behind you.',
    'Placement: after travelling 110 units',
  ),
  'razorstep-chimera:mythic': definition(
    'razorstep-chimera:mythic',
    'razorstep-chimera',
    'mythic',
    'Razorstep Chimera',
    'Mythic',
    'Movement leaves stronger scythe pads behind you.',
    'Placement: after travelling 90 units',
  ),
  'owl-pinions:bud': definition('owl-pinions:bud', 'owl-pinions', 'bud', 'Owl Pinions', 'Bud', 'Fires a four-feather spread at the nearest threat.', 'Every 1.6 seconds'),
  'owl-pinions:adapted': definition('owl-pinions:adapted', 'owl-pinions', 'adapted', 'Owl Pinions', 'Adapted', 'Fires a wider seven-feather spread.', 'Every 1.2 seconds'),
  'bat-ears:bud': definition('bat-ears:bud', 'bat-ears', 'bud', 'Bat Ears', 'Bud', 'Echo-marks a nearby cluster; every automatic attack prioritizes the marked prey.', 'Every 2 seconds'),
  'bat-ears:adapted': definition('bat-ears:adapted', 'bat-ears', 'adapted', 'Bat Ears', 'Adapted', 'Echo-marks a larger cluster so every automatic attack hunts marked prey first.', 'Every 1.5 seconds'),
  'midnight-radar:mythic': definition('midnight-radar:mythic', 'midnight-radar', 'mythic', 'Midnight Radar', 'Mythic', 'Marks a wide threat cluster and keeps your aim on the marked hunt.', 'Every 1.7 seconds'),
  'crab-pincers:bud': definition('crab-pincers:bud', 'crab-pincers', 'bud', 'Crab Pincers', 'Bud', 'Crushes nearby enemies with a compact area strike.', 'Every 1.7 seconds'),
  'crab-pincers:adapted': definition('crab-pincers:adapted', 'crab-pincers', 'adapted', 'Crab Pincers', 'Adapted', 'Crushes a wider area for heavier damage.', 'Every 1.25 seconds'),
  'armadillo-greaves:bud': definition('armadillo-greaves:bud', 'armadillo-greaves', 'bud', 'Armadillo Greaves', 'Bud', 'Shoves nearby threats away from your body.', 'Every 2.3 seconds'),
  'armadillo-greaves:adapted': definition('armadillo-greaves:adapted', 'armadillo-greaves', 'adapted', 'Armadillo Greaves', 'Adapted', 'Creates a stronger defensive shove around you.', 'Every 1.7 seconds'),
  'meteor-mauler:mythic': definition('meteor-mauler:mythic', 'meteor-mauler', 'mythic', 'Meteor Mauler', 'Mythic', 'A heavy close-range impact crushes the nearest crowd.', 'Every 1.5 seconds'),
  'skunk-brush:bud': definition('skunk-brush:bud', 'skunk-brush', 'bud', 'Skunk Brush', 'Bud', 'Places a damaging stink cloud on an enemy cluster ahead.', 'Every 2.7 seconds'),
  'skunk-brush:adapted': definition('skunk-brush:adapted', 'skunk-brush', 'adapted', 'Skunk Brush', 'Adapted', 'Places a larger, stronger stink cloud on an enemy cluster ahead.', 'Every 2 seconds'),
  'monarch-brood:bud': definition('monarch-brood:bud', 'monarch-brood', 'bud', 'Monarch Brood', 'Bud', 'Two monarchs orbit you and sting nearby enemies on contact.', 'Every second'),
  'monarch-brood:adapted': definition('monarch-brood:adapted', 'monarch-brood', 'adapted', 'Monarch Brood', 'Adapted', 'Three monarchs orbit wider and sting nearby enemies more often.', 'Every 0.75 seconds'),
  'royal-stinkcloud:mythic': definition('royal-stinkcloud:mythic', 'royal-stinkcloud', 'mythic', 'Royal Stinkcloud', 'Mythic', 'Places a monarch-crowned stink cloud on an enemy cluster ahead.', 'Every 2.3 seconds'),
});

type AttackSourceId =
  | 'porcupine-quills'
  | 'puffer-pouch'
  | 'electric-eel-coil'
  | 'firefly-colony'
  | 'mantis-scythes'
  | 'gecko-pads'
  | 'owl-pinions'
  | 'bat-ears'
  | 'crab-pincers'
  | 'armadillo-greaves'
  | 'skunk-brush'
  | 'monarch-brood';

interface RankPresentation {
  readonly effect: string;
  readonly cadence: string;
}

type FiveRankPresentation = readonly [
  RankPresentation,
  RankPresentation,
  RankPresentation,
  RankPresentation,
  RankPresentation,
];

/**
 * Rank 1 and 2 preserve the authored Bud/Adapted copy. Ranks 3–5 describe
 * the deterministic behavior progression supplied by trait-runtime while the
 * renderer continues to reuse the established Adapted visual key.
 */
const RANK_PRESENTATIONS: Readonly<Record<AttackSourceId, FiveRankPresentation>> = Object.freeze({
  'porcupine-quills': [
    { effect: 'Fires three forward quills that pierce through one extra enemy each.', cadence: 'Every 1.5 seconds' },
    { effect: 'Fires five wider quills that pierce through two extra enemies each.', cadence: 'Every second' },
    { effect: 'Fires six harder quills across a wider lane with deeper pierce.', cadence: 'Every 0.9 seconds' },
    { effect: 'Fires seven heavy quills that cut through a broad crowd lane.', cadence: 'Every 0.8 seconds' },
    { effect: 'Unleashes eight Master quills with the widest lane and deepest pierce.', cadence: 'Every 0.6 seconds' },
  ],
  'puffer-pouch': [
    { effect: 'Pulls nearby enemies toward you with an inhale pulse.', cadence: 'Every 1.7 seconds' },
    { effect: 'Pushes nearby enemies away with a wider pulse.', cadence: 'Every 1.3 seconds' },
    { effect: 'Sends a farther pulse that shoves enemies away more forcefully.', cadence: 'Every 1.2 seconds' },
    { effect: 'Controls a wide ring with a heavy defensive shock pulse.', cadence: 'Every second' },
    { effect: 'Releases a Master shock pulse that clears the broadest close-range space.', cadence: 'Every 0.9 seconds' },
  ],
  'electric-eel-coil': [
    { effect: 'Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.', cadence: 'Every 1.3 seconds' },
    { effect: 'Instantly strikes the nearest enemy, then chains through a larger nearby cluster.', cadence: 'Every 0.9 seconds' },
    { effect: 'Chains harder lightning through more nearby enemies at longer reach.', cadence: 'Every 0.8 seconds' },
    { effect: 'Surges through a broad cluster with faster, stronger lightning hops.', cadence: 'Every 0.7 seconds' },
    { effect: 'Discharges a Master chain that tears through the largest nearby cluster.', cadence: 'Every 0.6 seconds' },
  ],
  'firefly-colony': [
    { effect: 'Two fireflies orbit you and zap the nearest enemy they touch.', cadence: 'Every 0.5 seconds' },
    { effect: 'Four fireflies orbit wider and zap nearby enemies on contact.', cadence: 'Every 0.4 seconds' },
    { effect: 'Five fireflies orbit faster and reach farther on contact.', cadence: 'Every 0.35 seconds' },
    { effect: 'Six bright fireflies form a wider, faster contact ring.', cadence: 'Every 0.3 seconds' },
    { effect: 'Seven Master fireflies create the largest, fastest contact swarm.', cadence: 'Every 0.25 seconds' },
  ],
  'mantis-scythes': [
    { effect: 'Auto-aims a narrow scythe sweep through nearby enemies.', cadence: 'Every 0.75 seconds' },
    { effect: 'Auto-aims a wider, stronger scythe sweep through nearby enemies.', cadence: 'Every 0.5 seconds' },
    { effect: 'Cuts a broader scythe arc with heavier close-range damage.', cadence: 'Every 0.43 seconds' },
    { effect: 'Rapidly cleaves a wide crescent through the nearest crowd.', cadence: 'Every 0.38 seconds' },
    { effect: 'Carves a Master scythe crescent with the widest, fastest cleave.', cadence: 'Every 0.32 seconds' },
  ],
  'gecko-pads': [
    { effect: 'After moving, leaves a damaging pad behind you.', cadence: 'Placement: after travelling 150 units' },
    { effect: 'After moving, leaves larger, stronger damaging pads behind you.', cadence: 'Placement: after travelling 110 units' },
    { effect: 'Leaves stronger pads behind you more often as you move.', cadence: 'Placement: after travelling 97 units' },
    { effect: 'Lays broad, punishing pads behind you on a shorter movement rhythm.', cadence: 'Placement: after travelling 84 units' },
    { effect: 'Leaves Master scythe pads behind you almost continuously while moving.', cadence: 'Placement: after travelling 70 units' },
  ],
  'owl-pinions': [
    { effect: 'Fires a four-feather spread at the nearest threat.', cadence: 'Every 1.6 seconds' },
    { effect: 'Fires a wider seven-feather spread.', cadence: 'Every 1.2 seconds' },
    { effect: 'Fires an eight-feather volley with more punch and reach.', cadence: 'Every second' },
    { effect: 'Launches a dense nine-feather storm through the target lane.', cadence: 'Every 0.9 seconds' },
    { effect: 'Unleashes a Master ten-feather barrage at maximum spread.', cadence: 'Every 0.75 seconds' },
  ],
  'bat-ears': [
    { effect: 'Echo-marks a nearby cluster; every automatic attack prioritizes the marked prey.', cadence: 'Every 2 seconds' },
    { effect: 'Echo-marks a larger cluster so every automatic attack hunts marked prey first.', cadence: 'Every 1.5 seconds' },
    { effect: 'Tags a wider hunt cluster more often for stronger focus fire.', cadence: 'Every 1.3 seconds' },
    { effect: 'Spreads rapid echo marks across a broad threat pack.', cadence: 'Every 1.1 seconds' },
    { effect: 'Master radar locks the widest cluster for relentless priority fire.', cadence: 'Every second' },
  ],
  'crab-pincers': [
    { effect: 'Crushes nearby enemies with a compact area strike.', cadence: 'Every 1.7 seconds' },
    { effect: 'Crushes a wider area for heavier damage.', cadence: 'Every 1.25 seconds' },
    { effect: 'Smashes a broader ring with a stronger crowd-crushing blow.', cadence: 'Every 1.1 seconds' },
    { effect: 'Delivers rapid heavy pincers across a wide close-range area.', cadence: 'Every second' },
    { effect: 'Drops a Master crush that devastates the widest nearby crowd.', cadence: 'Every 0.8 seconds' },
  ],
  'armadillo-greaves': [
    { effect: 'Shoves nearby threats away from your body.', cadence: 'Every 2.3 seconds' },
    { effect: 'Creates a stronger defensive shove around you.', cadence: 'Every 1.7 seconds' },
    { effect: 'Blasts a farther ring of threats away with heavier force.', cadence: 'Every 1.5 seconds' },
    { effect: 'Creates a broad defensive shock that throws enemies back.', cadence: 'Every 1.3 seconds' },
    { effect: 'Unleashes a Master repel wave that clears the largest safety ring.', cadence: 'Every 1.1 seconds' },
  ],
  'skunk-brush': [
    { effect: 'Places a damaging stink cloud on an enemy cluster ahead.', cadence: 'Every 2.7 seconds' },
    { effect: 'Places a larger, stronger stink cloud on an enemy cluster ahead.', cadence: 'Every 2 seconds' },
    { effect: 'Places a wider toxic cloud on an enemy cluster ahead more often.', cadence: 'Every 1.8 seconds' },
    { effect: 'Blankets an enemy cluster ahead with a dense, damaging stink zone.', cadence: 'Every 1.5 seconds' },
    { effect: 'Creates a Master stink cloud over the widest enemy cluster ahead.', cadence: 'Every 1.3 seconds' },
  ],
  'monarch-brood': [
    { effect: 'Two monarchs orbit you and sting nearby enemies on contact.', cadence: 'Every second' },
    { effect: 'Three monarchs orbit wider and sting nearby enemies more often.', cadence: 'Every 0.75 seconds' },
    { effect: 'Four monarchs form a faster, wider contact ring.', cadence: 'Every 0.67 seconds' },
    { effect: 'Five monarchs swarm a broad orbit with rapid stings.', cadence: 'Every 0.57 seconds' },
    { effect: 'Six Master monarchs create the largest, fastest sting swarm.', cadence: 'Every 0.48 seconds' },
  ],
});

const INGREDIENTS: readonly (readonly [GregAdaptationId, GregAdaptationId])[] = Object.freeze([
  ['porcupine-quills:adapted', 'porcupine-quills:bud'],
  ['puffer-pouch:adapted', 'puffer-pouch:bud'],
  ['electric-eel-coil:adapted', 'electric-eel-coil:bud'],
  ['firefly-colony:adapted', 'firefly-colony:bud'],
  ['mantis-scythes:adapted', 'mantis-scythes:bud'],
  ['gecko-pads:adapted', 'gecko-pads:bud'],
  ['owl-pinions:adapted', 'owl-pinions:bud'],
  ['bat-ears:adapted', 'bat-ears:bud'],
  ['crab-pincers:adapted', 'crab-pincers:bud'],
  ['armadillo-greaves:adapted', 'armadillo-greaves:bud'],
  ['skunk-brush:adapted', 'skunk-brush:bud'],
  ['monarch-brood:adapted', 'monarch-brood:bud'],
]);

const MYTHICS = Object.freeze([
  Object.freeze({
    id: 'thornstorm-mantle:mythic' as const,
    ingredients: Object.freeze(['porcupine-quills', 'puffer-pouch']),
  }),
  Object.freeze({
    id: 'thunderbug-dynamo:mythic' as const,
    ingredients: Object.freeze(['electric-eel-coil', 'firefly-colony']),
  }),
  Object.freeze({
    id: 'razorstep-chimera:mythic' as const,
    ingredients: Object.freeze(['mantis-scythes', 'gecko-pads']),
  }),
  Object.freeze({
    id: 'midnight-radar:mythic' as const,
    ingredients: Object.freeze(['owl-pinions', 'bat-ears']),
  }),
  Object.freeze({
    id: 'meteor-mauler:mythic' as const,
    ingredients: Object.freeze(['crab-pincers', 'armadillo-greaves']),
  }),
  Object.freeze({
    id: 'royal-stinkcloud:mythic' as const,
    ingredients: Object.freeze(['skunk-brush', 'monarch-brood']),
  }),
]);

function visualRank(visual: TraitVisualAttachmentView): number {
  if (visual.isMaster === true) return 5;
  return typeof visual.rank === 'number' && visual.rank >= 1 && visual.rank <= 5
    ? visual.rank
    : 0;
}

function activeVisual(
  visuals: readonly TraitVisualAttachmentView[],
  definition: AdaptationPresentationDefinition,
): TraitVisualAttachmentView | undefined {
  let selected: TraitVisualAttachmentView | undefined;
  for (const visual of visuals) {
    if (
      !visual.enabled
      || visual.sourceId !== definition.sourceId
      || visual.stage !== definition.stage
      || visual.visualKey !== definition.card.id
    ) {
      continue;
    }
    if (selected === undefined || visualRank(visual) > visualRank(selected)) selected = visual;
  }
  return selected;
}

const MYTHIC_IMPACT_CATEGORIES: Readonly<Record<string, ActiveAdaptationImpactCategory>> = Object.freeze({
  'thornstorm-mantle': 'Direct damage',
  'thunderbug-dynamo': 'Direct damage',
  'razorstep-chimera': 'Direct damage',
  'midnight-radar': 'Targeting',
  'meteor-mauler': 'Direct damage',
  'royal-stinkcloud': 'Direct damage',
});

function activeImpact(
  definition: AdaptationPresentationDefinition,
  visual: TraitVisualAttachmentView,
): Pick<ActiveAdaptationCard, 'impactCategory' | 'impact'> {
  if (definition.stage === 'mythic') {
    const category = MYTHIC_IMPACT_CATEGORIES[definition.sourceId] ?? 'Economy / utility';
    return Object.freeze({
      impactCategory: category,
      impact: category === 'Direct damage'
        ? 'Fused attack: direct-damage outcome resolves in the authoritative simulation.'
        : `Fused attack: ${category}; no direct damage is claimed.`,
    });
  }
  const rank = visualRank(visual) || (definition.stage === 'bud' ? 1 : 2);
  const authored = describeTraitUpgradeImpact(definition.sourceId, rank);
  if (authored !== undefined) {
    return Object.freeze({ impactCategory: authored.category, impact: authored.summary });
  }
  return Object.freeze({
    impactCategory: 'Economy / utility',
    impact: 'Authored impact data is unavailable; no direct damage is claimed.',
  });
}

function presentCard(
  definition: AdaptationPresentationDefinition,
  visual: TraitVisualAttachmentView,
): ActiveAdaptationCard {
  const base = definition.card;
  const impact = activeImpact(definition, visual);
  if (definition.stage === 'mythic') {
    return Object.freeze({
      ...base,
      stageLabel: 'Fused · 1 slot',
      effect: `${base.effect} Fused form; occupies one slot.`,
      cadence: `${base.cadence} · One slot`,
      ...impact,
    });
  }

  const rank = visualRank(visual);
  if (rank === 0) return Object.freeze({ ...base, ...impact });
  const rankCopy = RANK_PRESENTATIONS[definition.sourceId as AttackSourceId]?.[rank - 1];
  if (rankCopy === undefined) return Object.freeze({ ...base, ...impact });
  return Object.freeze({
    ...base,
    stageLabel: rank === 5 ? 'MASTER · Rank 5' : `Rank ${rank}`,
    effect: rankCopy.effect,
    cadence: rankCopy.cadence,
    ...impact,
  });
}

/** Complete pause/HUD manifest used by the release content validator. */
export function getAdaptationPresentationDefinitions(): readonly AdaptationPresentationDefinition[] {
  return Object.freeze(Object.values(DEFINITIONS));
}

/**
 * Projects authoritative trait visual state into a short, stable active-list.
 * Adapted cards win over stale Bud duplicates, and a valid Mythic supersedes
 * its ingredient cards so the HUD describes what is actually active.
 */
export function presentActiveAdaptations(
  visuals: readonly TraitVisualAttachmentView[],
): readonly ActiveAdaptationCard[] {
  const cards: ActiveAdaptationCard[] = [];
  const consumedSources = new Set<string>();
  for (const entry of MYTHICS) {
    const mythic = DEFINITIONS[entry.id];
    const visual = activeVisual(visuals, mythic);
    if (visual !== undefined) {
      cards.push(presentCard(mythic, visual));
      for (const ingredient of entry.ingredients) consumedSources.add(ingredient);
    }
  }
  for (const [preferred, fallback] of INGREDIENTS) {
    if (consumedSources.has(DEFINITIONS[preferred].sourceId)) continue;
    const preferredVisual = activeVisual(visuals, DEFINITIONS[preferred]);
    const fallbackVisual = activeVisual(visuals, DEFINITIONS[fallback]);
    const definition = preferredVisual !== undefined
      ? DEFINITIONS[preferred]
      : fallbackVisual !== undefined ? DEFINITIONS[fallback] : null;
    const visual = preferredVisual ?? fallbackVisual;
    if (definition !== null && visual !== undefined) cards.push(presentCard(definition, visual));
  }
  return Object.freeze(cards);
}
