import {
  getUniversalUpgrade,
  type RunUpgradeOfferView,
  type TraitUpgradeOfferView,
  type TraitVisualAttachmentView,
} from '@sim';

export interface UpgradePresentation {
  readonly title: string;
  readonly badge: string;
  readonly socket: string;
  readonly description: string;
  readonly pairingHint: string | null;
}

function hasAdapted(state: readonly TraitVisualAttachmentView[], traitId: string): boolean {
  return state.some((visual) => visual.sourceId === traitId && visual.stage === 'adapted' && visual.enabled);
}

/** Plain-language, renderer-independent card content for Greg's supported catalog. */
export function presentUpgrade(
  offer: TraitUpgradeOfferView,
  visualState: readonly TraitVisualAttachmentView[],
): UpgradePresentation {
  const mythicReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'porcupine-quills' && hasAdapted(visualState, 'puffer-pouch'))
      || (offer.traitId === 'puffer-pouch' && hasAdapted(visualState, 'porcupine-quills')));

  if (offer.traitId === 'porcupine-quills') {
    return {
      title: 'Porcupine Quills', badge: mythicReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Back attachment',
      description: offer.resultStage === 'bud' ? 'Automatically fires a compact quill burst at nearby enemies.'
        : mythicReady ? 'Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm.'
          : 'Fires a wider, faster quill burst at nearby enemies.',
      pairingHint: mythicReady ? null : 'Adapt Puffer Pouch too to evolve both into Thornstorm Mantle.',
    };
  }
  if (offer.traitId === 'puffer-pouch') {
    return {
      title: 'Puffer Pouch', badge: mythicReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Head attachment',
      description: offer.resultStage === 'bud' ? 'Periodically pulls nearby enemies toward Greg.'
        : mythicReady ? 'Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm.'
          : 'Becomes a wider pulse that knocks nearby enemies away.',
      pairingHint: mythicReady ? null : 'Adapt Porcupine Quills too to evolve both into Thornstorm Mantle.',
    };
  }
  return {
    title: offer.traitId.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    badge: offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', socket: 'Body attachment',
    description: offer.resultStage === 'bud' ? 'Adds a new visible animal adaptation.' : 'Strengthens this animal adaptation.',
    pairingHint: null,
  };
}

/**
 * Plain-language card content for the unified run-level chooser. Animal body
 * adaptations retain their specific visual/socket copy; neutral cards state
 * their concrete rank effect so no card implies a stat it does not grant.
 */
export function presentRunUpgrade(
  offer: RunUpgradeOfferView,
  visualState: readonly TraitVisualAttachmentView[],
): UpgradePresentation {
  if (offer.kind === 'trait') return presentUpgrade(offer, visualState);
  if (offer.kind === 'essence') {
    return {
      title: 'Essence Cache',
      badge: `+${offer.amount} ESSENCE`,
      socket: 'Permanent progression',
      description: 'All finite run upgrades are complete. Bank Essence to buy permanent upgrades after the run.',
      pairingHint: null,
    };
  }

  const definition = getUniversalUpgrade(offer.upgradeId);
  const title = definition?.title ?? offer.upgradeId.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  return {
    title,
    badge: `RANK ${offer.nextRank}/${offer.maxRank}`,
    socket: 'Neutral run upgrade',
    description: definition?.description ?? 'Strengthens a universal stat for this run.',
    pairingHint: null,
  };
}
