import type { TraitVisualAttachmentView } from '@sim';
import { getHeroBasicAttackDefinition } from '@sim';
import type { HeroBasicAttackDefinition } from '@sim';
import {
  presentActiveAdaptations,
  type ActiveAdaptationCard,
} from './active-adaptations';

/** The selected hero's starter fire plus three acquired attacks. */
export const ACTIVE_ATTACK_SLOT_CAPACITY = 4;

export interface ActiveAttackCard extends ActiveAdaptationCard {
  /** Mythics retain both ingredient footprints; ordinary attacks use one. */
  readonly slotCost: number;
}

export interface ActiveAttackLoadout {
  readonly cards: readonly ActiveAttackCard[];
  readonly slotCapacity: number;
  readonly slotsUsed: number;
}

function slotCost(card: ActiveAdaptationCard): number {
  // Each current Mythic replaces two owned ingredients. Keeping that cost
  // visible prevents an evolution from looking like it created a free weapon.
  return card.stageLabel === 'Mythic' ? 2 : 1;
}

function instinctCopy(basicAttackId: string): string {
  switch (basicAttackId) {
    case 'greg-auto-fire': return 'Movement and near-misses charge a three-wave Rush Rake.';
    case 'benny-brace-burst': return 'Two contact hits charge Brace Bloom, a defensive shockwave.';
    case 'gracie-keen-dart': return 'Every 2 seconds, Scout marks forward threats for priority fire.';
    default: return '';
  }
}

/**
 * Projects the authoritative visual/build state into the pause-only attack
 * loadout. The playable catalog caps acquired traits at four, so the result
 * cannot exceed four after the selected hero's starter attack is counted.
 */
export function presentActiveAttackLoadout(
  visuals: readonly TraitVisualAttachmentView[],
  basicAttack: HeroBasicAttackDefinition = getHeroBasicAttackDefinition('greg-auto-fire'),
): ActiveAttackLoadout {
  const starterAttack: ActiveAttackCard = Object.freeze({
    id: `${basicAttack.id}:starter`,
    title: basicAttack.title,
    stageLabel: 'Starter',
    effect: `${basicAttack.description} ${instinctCopy(basicAttack.id)}`.trim(),
    cadence: basicAttack.pattern === 'spread' ? 'Guard burst' : 'Base weapon',
    slotCost: 1,
  });
  const cards: ActiveAttackCard[] = [starterAttack];
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
