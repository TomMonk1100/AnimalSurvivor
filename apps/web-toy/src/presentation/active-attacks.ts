import type { TraitVisualAttachmentView } from '@sim';
import {
  presentActiveAdaptations,
  type ActiveAdaptationCard,
} from './active-adaptations';

/** Greg's starter fire occupies the first of five attack footprints. */
export const ACTIVE_ATTACK_SLOT_CAPACITY = 5;

export interface ActiveAttackCard extends ActiveAdaptationCard {
  /** Mythics retain both ingredient footprints; ordinary attacks use one. */
  readonly slotCost: number;
}

export interface ActiveAttackLoadout {
  readonly cards: readonly ActiveAttackCard[];
  readonly slotCapacity: number;
  readonly slotsUsed: number;
}

const STARTER_ATTACK: ActiveAttackCard = Object.freeze({
  id: 'greg-auto-fire:starter',
  title: "Greg's Auto-Fire",
  stageLabel: 'Starter',
  effect: 'Automatically fires at the nearest enemy.',
  cadence: 'Base weapon',
  slotCost: 1,
});

function slotCost(card: ActiveAdaptationCard): number {
  // Each current Mythic replaces two owned ingredients. Keeping that cost
  // visible prevents an evolution from looking like it created a free weapon.
  return card.stageLabel === 'Mythic' ? 2 : 1;
}

/**
 * Projects the authoritative visual/build state into the pause-only attack
 * loadout. The playable catalog caps acquired traits at four, so the result
 * cannot exceed five after Greg's starter attack is counted.
 */
export function presentActiveAttackLoadout(
  visuals: readonly TraitVisualAttachmentView[],
): ActiveAttackLoadout {
  const cards: ActiveAttackCard[] = [STARTER_ATTACK];
  for (const card of presentActiveAdaptations(visuals)) {
    cards.push(Object.freeze({ ...card, slotCost: slotCost(card) }));
  }
  const slotsUsed = cards.reduce((used, card) => used + card.slotCost, 0);
  return Object.freeze({
    cards: Object.freeze(cards),
    slotCapacity: ACTIVE_ATTACK_SLOT_CAPACITY,
    slotsUsed: Math.min(ACTIVE_ATTACK_SLOT_CAPACITY, slotsUsed),
  });
}
