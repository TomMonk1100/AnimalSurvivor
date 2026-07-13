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
  /** Renderer-independent executable attack footprint, never visual sockets. */
  readonly slotCost: number;
}

export interface ActiveAttackLoadout {
  readonly cards: readonly ActiveAttackCard[];
  readonly slotCapacity: number;
  readonly slotsUsed: number;
}

function sourceIdFor(card: ActiveAdaptationCard): string {
  return card.id.split(':', 1)[0] ?? card.id;
}

function slotCost(
  visuals: readonly TraitVisualAttachmentView[],
  card: ActiveAdaptationCard,
): number {
  const visual = visuals.find((candidate) => candidate.enabled && candidate.sourceId === sourceIdFor(card));
  // V1.1 fusions retain their multiple body sockets but cost exactly one
  // logical attack slot. Old compact visual streams lacked this field and
  // safely read as one attack rather than inventing an extra slot from art.
  return visual?.logicalSlotCost ?? 1;
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
    cadence: basicAttack.pattern === 'meleeArc'
      ? 'Close-range swipe'
      : basicAttack.pattern === 'groundWave'
        ? 'Forward ground wave'
        : 'Base projectile',
    slotCost: 1,
  });
  const cards: ActiveAttackCard[] = [starterAttack];
  for (const card of presentActiveAdaptations(visuals)) {
    cards.push(Object.freeze({ ...card, slotCost: slotCost(visuals, card) }));
  }
  const slotsUsed = cards.reduce((used, card) => used + card.slotCost, 0);
  return Object.freeze({
    cards: Object.freeze(cards),
    slotCapacity: ACTIVE_ATTACK_SLOT_CAPACITY,
    slotsUsed: Math.min(ACTIVE_ATTACK_SLOT_CAPACITY, slotsUsed),
  });
}
