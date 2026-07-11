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
  | 'thornstorm-mantle:mythic';

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
});

const INGREDIENTS: readonly (readonly [GregAdaptationId, GregAdaptationId])[] = Object.freeze([
  ['porcupine-quills:adapted', 'porcupine-quills:bud'],
  ['puffer-pouch:adapted', 'puffer-pouch:bud'],
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
  const mythic = DEFINITIONS['thornstorm-mantle:mythic'];
  if (hasActiveVisual(visuals, mythic)) return Object.freeze([mythic.card]);

  const cards: ActiveAdaptationCard[] = [];
  for (const [preferred, fallback] of INGREDIENTS) {
    const definition = hasActiveVisual(visuals, DEFINITIONS[preferred])
      ? DEFINITIONS[preferred]
      : hasActiveVisual(visuals, DEFINITIONS[fallback]) ? DEFINITIONS[fallback] : null;
    if (definition !== null) cards.push(definition.card);
  }
  return Object.freeze(cards);
}
