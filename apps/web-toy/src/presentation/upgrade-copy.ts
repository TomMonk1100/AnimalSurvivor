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
      description: offer.resultStage === 'bud' ? 'Fires three forward quills that pierce through one extra enemy each.'
        : mythicReady ? 'Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm.'
          : 'Fires five wider quills that pierce through two extra enemies each.',
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
  const thunderbugReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'electric-eel-coil' && hasAdapted(visualState, 'firefly-colony'))
      || (offer.traitId === 'firefly-colony' && hasAdapted(visualState, 'electric-eel-coil')));
  const razorstepReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'mantis-scythes' && hasAdapted(visualState, 'gecko-pads'))
      || (offer.traitId === 'gecko-pads' && hasAdapted(visualState, 'mantis-scythes')));
  if (offer.traitId === 'electric-eel-coil') {
    return {
      title: 'Electric Eel Coil',
      badge: thunderbugReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Tail attachment',
      description: offer.resultStage === 'bud'
        ? 'Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.'
        : thunderbugReady
          ? 'Completes Thunderbug Dynamo: telegraph a larger chain discharge across nearby enemies.'
          : 'Instantly strikes the nearest enemy, then chains to 3 nearby unhit foes.',
      pairingHint: thunderbugReady ? null : 'Adapt Firefly Colony too to evolve both into Thunderbug Dynamo.',
    };
  }
  if (offer.traitId === 'firefly-colony') {
    return {
      title: 'Firefly Colony',
      badge: thunderbugReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Orbiting body attachment',
      description: offer.resultStage === 'bud'
        ? 'Two fireflies orbit Greg and zap the nearest enemy they touch.'
        : thunderbugReady
          ? 'Completes Thunderbug Dynamo: telegraph a larger chain discharge across nearby enemies.'
          : 'Four fireflies orbit wider and zap nearby enemies on contact.',
      pairingHint: thunderbugReady ? null : 'Adapt Electric Eel Coil too to evolve both into Thunderbug Dynamo.',
    };
  }
  if (offer.traitId === 'mantis-scythes') {
    return {
      title: 'Mantis Scythes',
      badge: razorstepReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Left shoulder attachment',
      description: offer.resultStage === 'bud'
        ? 'Auto-aims a narrow scythe sweep through nearby enemies.'
        : razorstepReady
          ? "Completes Razorstep Chimera: movement leaves stronger scythe pads at Greg's feet."
          : 'Auto-aims a wider, stronger scythe sweep through nearby enemies.',
      pairingHint: razorstepReady ? null : 'Adapt Gecko Pads too to evolve both into Razorstep Chimera.',
    };
  }
  if (offer.traitId === 'gecko-pads') {
    return {
      title: 'Gecko Pads',
      badge: razorstepReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Right shoulder attachment',
      description: offer.resultStage === 'bud'
        ? "After moving, leaves a damaging pad at Greg's feet."
        : razorstepReady
          ? "Completes Razorstep Chimera: movement leaves stronger scythe pads at Greg's feet."
          : "After moving, leaves larger, stronger damaging pads at Greg's feet.",
      pairingHint: razorstepReady ? null : 'Adapt Mantis Scythes too to evolve both into Razorstep Chimera.',
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
