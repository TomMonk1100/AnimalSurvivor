import type { TraitVisualAttachmentView } from '@sim';

/** Plain-language HUD content for the adaptations available in Greg's slice. */
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
  | 'razorstep-chimera:mythic';

interface AdaptationDefinition {
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
): AdaptationDefinition {
  return Object.freeze({
    card: Object.freeze({ id, title, stageLabel, effect, cadence }),
    sourceId,
    stage,
  });
}

const DEFINITIONS: Readonly<Record<GregAdaptationId, AdaptationDefinition>> = Object.freeze({
  'porcupine-quills:bud': definition(
    'porcupine-quills:bud',
    'porcupine-quills',
    'bud',
    'Porcupine Quills',
    'Bud',
    'Automatically fires a compact quill burst at nearby enemies.',
    'Every 1.5 seconds',
  ),
  'porcupine-quills:adapted': definition(
    'porcupine-quills:adapted',
    'porcupine-quills',
    'adapted',
    'Porcupine Quills',
    'Adapted',
    'Automatically fires a wider, faster quill burst at nearby enemies.',
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
    'Releases a six-spark burst in every direction.',
    'Every 2 seconds',
  ),
  'firefly-colony:adapted': definition(
    'firefly-colony:adapted',
    'firefly-colony',
    'adapted',
    'Firefly Colony',
    'Adapted',
    'Releases ten stronger sparks in every direction.',
    'Every 1.3 seconds',
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
    'Sweeps nearby enemies with a close-range damaging pulse.',
    'Every 0.9 seconds',
  ),
  'mantis-scythes:adapted': definition(
    'mantis-scythes:adapted',
    'mantis-scythes',
    'adapted',
    'Mantis Scythes',
    'Adapted',
    'Sweeps a wider area for stronger close-range damage.',
    'Every 0.6 seconds',
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
});

const INGREDIENTS: readonly (readonly [GregAdaptationId, GregAdaptationId])[] = Object.freeze([
  ['porcupine-quills:adapted', 'porcupine-quills:bud'],
  ['puffer-pouch:adapted', 'puffer-pouch:bud'],
  ['electric-eel-coil:adapted', 'electric-eel-coil:bud'],
  ['firefly-colony:adapted', 'firefly-colony:bud'],
  ['mantis-scythes:adapted', 'mantis-scythes:bud'],
  ['gecko-pads:adapted', 'gecko-pads:bud'],
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
]);

function hasActiveVisual(
  visuals: readonly TraitVisualAttachmentView[],
  definition: AdaptationDefinition,
): boolean {
  return visuals.some((visual) => visual.enabled
    && visual.sourceId === definition.sourceId
    && visual.stage === definition.stage
    && visual.visualKey === definition.card.id);
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
