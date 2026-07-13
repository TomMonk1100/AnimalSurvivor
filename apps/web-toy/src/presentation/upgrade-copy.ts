import {
  getUniversalUpgrade,
  type RunUpgradeOfferView,
  type TraitUpgradeOfferView,
  type TraitVisualAttachmentView,
  type UniversalUpgradeCatalog,
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

/** Plain-language, renderer-independent card content for the launch catalog. */
export function presentUpgrade(
  offer: TraitUpgradeOfferView,
  visualState: readonly TraitVisualAttachmentView[],
  heroName = 'Greg',
): UpgradePresentation {
  const mythicReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'porcupine-quills' && hasAdapted(visualState, 'puffer-pouch'))
      || (offer.traitId === 'puffer-pouch' && hasAdapted(visualState, 'porcupine-quills')));

  if (offer.traitId === 'porcupine-quills') {
    return {
      title: 'Porcupine Quills', badge: mythicReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Back attachment',
      description: offer.resultStage === 'bud' ? `Fires three forward quills that pierce through one extra enemy each.`
        : mythicReady ? `Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm around ${heroName}.`
          : 'Fires five wider quills that pierce through two extra enemies each.',
      pairingHint: mythicReady ? null : 'Adapt Puffer Pouch too to evolve both into Thornstorm Mantle.',
    };
  }
  if (offer.traitId === 'puffer-pouch') {
    return {
      title: 'Puffer Pouch', badge: mythicReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Head attachment',
      description: offer.resultStage === 'bud' ? `Periodically pulls nearby enemies toward ${heroName}.`
        : mythicReady ? `Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm around ${heroName}.`
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
  const midnightReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'owl-pinions' && hasAdapted(visualState, 'bat-ears'))
      || (offer.traitId === 'bat-ears' && hasAdapted(visualState, 'owl-pinions')));
  const meteorReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'crab-pincers' && hasAdapted(visualState, 'armadillo-greaves'))
      || (offer.traitId === 'armadillo-greaves' && hasAdapted(visualState, 'crab-pincers')));
  const royalReady = offer.resultStage === 'adapted'
    && ((offer.traitId === 'skunk-brush' && hasAdapted(visualState, 'monarch-brood'))
      || (offer.traitId === 'monarch-brood' && hasAdapted(visualState, 'skunk-brush')));
  if (offer.traitId === 'electric-eel-coil') {
    return {
      title: 'Electric Eel Coil',
      badge: thunderbugReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Tail attachment',
      description: offer.resultStage === 'bud'
        ? 'Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.'
        : thunderbugReady
          ? `Completes Thunderbug Dynamo: telegraph a larger chain discharge around ${heroName}.`
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
        ? `Two fireflies orbit ${heroName} and zap the nearest enemy they touch.`
        : thunderbugReady
          ? `Completes Thunderbug Dynamo: telegraph a larger chain discharge around ${heroName}.`
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
          ? `Completes Razorstep Chimera: movement leaves stronger scythe pads at ${heroName}'s feet.`
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
        ? `After moving, leaves a damaging pad at ${heroName}'s feet.`
        : razorstepReady
          ? `Completes Razorstep Chimera: movement leaves stronger scythe pads at ${heroName}'s feet.`
          : `After moving, leaves larger, stronger damaging pads at ${heroName}'s feet.`,
      pairingHint: razorstepReady ? null : 'Adapt Mantis Scythes too to evolve both into Razorstep Chimera.',
    };
  }
  if (offer.traitId === 'owl-pinions') {
    return {
      title: 'Owl Pinions',
      badge: midnightReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Wing attachments',
      description: offer.resultStage === 'bud'
        ? 'Fires a four-feather spread at the nearest threat.'
        : midnightReady
          ? `Completes Midnight Radar: mark a wide cluster and keep your aim on the marked hunt around ${heroName}.`
          : 'Fires a wider seven-feather spread.',
      pairingHint: midnightReady ? null : 'Adapt Bat Ears too to evolve both into Midnight Radar.',
    };
  }
  if (offer.traitId === 'bat-ears') {
    return {
      title: 'Bat Ears',
      badge: midnightReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Head attachment',
      description: offer.resultStage === 'bud'
        ? 'Echo-marks a nearby cluster; every automatic attack prioritizes the marked prey.'
        : midnightReady
          ? `Completes Midnight Radar: mark a wide cluster and keep your aim on the marked hunt around ${heroName}.`
          : 'Echo-marks a larger cluster for priority targeting.',
      pairingHint: midnightReady ? null : 'Adapt Owl Pinions too to evolve both into Midnight Radar.',
    };
  }
  if (offer.traitId === 'crab-pincers') {
    return {
      title: 'Crab Pincers',
      badge: meteorReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE',
      socket: 'Shoulder attachments',
      description: offer.resultStage === 'bud'
        ? 'Crushes nearby enemies with a compact area strike.'
        : meteorReady
          ? 'Completes Meteor Mauler: a heavy close-range impact crushes the nearest crowd.'
          : 'Crushes a wider area for heavier damage.',
      pairingHint: meteorReady ? null : 'Adapt Armadillo Greaves too to evolve both into Meteor Mauler.',
    };
  }
  if (offer.traitId === 'armadillo-greaves') {
    return {
      title: 'Armadillo Greaves',
      badge: meteorReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Back attachment',
      description: offer.resultStage === 'bud'
        ? 'Shoves nearby threats away from your body.'
        : meteorReady
          ? 'Completes Meteor Mauler: a heavy close-range impact crushes the nearest crowd.'
          : 'Creates a stronger defensive shove around you.',
      pairingHint: meteorReady ? null : 'Adapt Crab Pincers too to evolve both into Meteor Mauler.',
    };
  }
  if (offer.traitId === 'skunk-brush') {
    return {
      title: 'Skunk Brush',
      badge: royalReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Tail attachment',
      description: offer.resultStage === 'bud'
        ? 'Leaves a damaging stink cloud that punishes pursuit.'
        : royalReady
          ? 'Completes Royal Stinkcloud: a monarch-crowned hazard surrounds you.'
          : 'Leaves a larger, stronger stink cloud.',
      pairingHint: royalReady ? null : 'Adapt Monarch Brood too to evolve both into Royal Stinkcloud.',
    };
  }
  if (offer.traitId === 'monarch-brood') {
    return {
      title: 'Monarch Brood',
      badge: royalReady ? 'MYTHIC READY' : offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE',
      socket: 'Orbiting body attachment',
      description: offer.resultStage === 'bud'
        ? `Two monarchs orbit ${heroName} and sting nearby enemies on contact.`
        : royalReady
          ? 'Completes Royal Stinkcloud: a monarch-crowned hazard surrounds you.'
          : 'Three monarchs orbit wider and sting nearby enemies more often.',
      pairingHint: royalReady ? null : 'Adapt Skunk Brush too to evolve both into Royal Stinkcloud.',
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
  heroName = 'Greg',
  catalog: UniversalUpgradeCatalog | undefined = undefined,
): UpgradePresentation {
  if (offer.kind === 'trait') return presentUpgrade(offer, visualState, heroName);
  if (offer.kind === 'essence') {
    return {
      title: 'Essence Cache',
      badge: `+${offer.amount} ESSENCE`,
      socket: 'Permanent progression',
      description: 'All finite run upgrades are complete. Bank Essence to buy permanent upgrades after the run.',
      pairingHint: null,
    };
  }

  const definition = getUniversalUpgrade(offer.upgradeId, catalog);
  const title = definition?.title ?? offer.upgradeId.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  const starterMastery = definition?.effect.kind === 'basicAttack';
  return {
    title,
    badge: `RANK ${offer.nextRank}/${offer.maxRank}`,
    socket: starterMastery ? 'Starter mastery' : 'Neutral run upgrade',
    description: definition?.description ?? 'Strengthens a universal stat for this run.',
    pairingHint: null,
  };
}
