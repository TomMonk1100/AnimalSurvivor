import type { TraitUpgradeOfferView, TraitVisualAttachmentView } from '@sim';

export interface UpgradePresentation {
  readonly title: string;
  readonly badge: 'NEW' | 'UPGRADE' | 'MYTHIC READY';
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
