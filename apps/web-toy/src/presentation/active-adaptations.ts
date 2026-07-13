import type { TraitVisualAttachmentView } from '@sim';

/** Plain-language HUD content for the Forest Arsenal launch pool. */
export interface ActiveAdaptationCard {
  readonly id: string;
  readonly title: string;
  readonly stageLabel: string;
  readonly effect: string;
  readonly cadence: string;
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
  readonly card: ActiveAdaptationCard;
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
    'Pulls nearby enemies toward Greg with an inhale pulse.',
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
    'Two fireflies orbit Greg and zap the nearest enemy they touch.',
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
    "After moving, leaves a damaging pad at Greg's feet.",
    'Placement: after travelling 150 units',
  ),
  'gecko-pads:adapted': definition(
    'gecko-pads:adapted',
    'gecko-pads',
    'adapted',
    'Gecko Pads',
    'Adapted',
    "After moving, leaves larger, stronger damaging pads at Greg's feet.",
    'Placement: after travelling 110 units',
  ),
  'razorstep-chimera:mythic': definition(
    'razorstep-chimera:mythic',
    'razorstep-chimera',
    'mythic',
    'Razorstep Chimera',
    'Mythic',
    "Movement leaves stronger scythe pads at Greg's feet.",
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
  'skunk-brush:bud': definition('skunk-brush:bud', 'skunk-brush', 'bud', 'Skunk Brush', 'Bud', 'Leaves a damaging stink cloud that punishes pursuit.', 'Every 2.7 seconds'),
  'skunk-brush:adapted': definition('skunk-brush:adapted', 'skunk-brush', 'adapted', 'Skunk Brush', 'Adapted', 'Leaves a larger, stronger stink cloud.', 'Every 2 seconds'),
  'monarch-brood:bud': definition('monarch-brood:bud', 'monarch-brood', 'bud', 'Monarch Brood', 'Bud', 'Two monarchs orbit Greg and sting nearby enemies on contact.', 'Every second'),
  'monarch-brood:adapted': definition('monarch-brood:adapted', 'monarch-brood', 'adapted', 'Monarch Brood', 'Adapted', 'Three monarchs orbit wider and sting nearby enemies more often.', 'Every 0.75 seconds'),
  'royal-stinkcloud:mythic': definition('royal-stinkcloud:mythic', 'royal-stinkcloud', 'mythic', 'Royal Stinkcloud', 'Mythic', 'A monarch-crowned cloud turns the space around you into a hazard.', 'Every 2.3 seconds'),
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

function hasActiveVisual(
  visuals: readonly TraitVisualAttachmentView[],
  definition: AdaptationPresentationDefinition,
): boolean {
  return visuals.some((visual) => visual.enabled
    && visual.sourceId === definition.sourceId
    && visual.stage === definition.stage
    && visual.visualKey === definition.card.id);
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
    if (hasActiveVisual(visuals, mythic)) {
      cards.push(mythic.card);
      for (const ingredient of entry.ingredients) consumedSources.add(ingredient);
    }
  }
  for (const [preferred, fallback] of INGREDIENTS) {
    if (consumedSources.has(DEFINITIONS[preferred].sourceId)) continue;
    const definition = hasActiveVisual(visuals, DEFINITIONS[preferred])
      ? DEFINITIONS[preferred]
      : hasActiveVisual(visuals, DEFINITIONS[fallback]) ? DEFINITIONS[fallback] : null;
    if (definition !== null) cards.push(definition.card);
  }
  return Object.freeze(cards);
}
