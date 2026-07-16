import {
  describeUniversalUpgradeImpact,
  getUniversalUpgrade,
  type RunUpgradeOfferView,
  type TraitUpgradeOfferView,
  type TraitVisualAttachmentView,
  type UniversalUpgradeCatalog,
} from '@sim';
import { describeTraitUpgradeImpact } from '@traits';
import { presentMasteryRank } from './mastery-fusions';

export type UpgradeImpactCategory =
  | 'Direct damage'
  | 'Crowd control'
  | 'Targeting'
  | 'Defense'
  | 'Economy / utility';

interface UpgradePresentationBase {
  readonly title: string;
  readonly badge: string;
  readonly socket: string;
  readonly description: string;
  readonly pairingHint: string | null;
}

export interface UpgradePresentation extends UpgradePresentationBase {
  /** Truthful authored lane; never inferred from browser combat visuals. */
  readonly impactCategory: UpgradeImpactCategory;
  /** Exact offered rank transition and its real change, when data is available. */
  readonly impact: string;
}

export interface UpgradeConfirmationPresentation {
  readonly title: string;
  readonly category: UpgradeImpactCategory;
  readonly detail: string;
}

function hasAdapted(state: readonly TraitVisualAttachmentView[], traitId: string): boolean {
  return state.some((visual) => visual.sourceId === traitId && visual.stage === 'adapted' && visual.enabled);
}

function hasMaster(state: readonly TraitVisualAttachmentView[], traitId: string): boolean {
  return state.some((visual) => visual.sourceId === traitId
    && visual.enabled
    && (visual.isMaster === true || visual.rank === 5));
}

function hasRankMetadata(offer: TraitUpgradeOfferView): boolean {
  return typeof offer.resultRank === 'number' || typeof offer.isMaster === 'boolean';
}

function reachesMaster(offer: TraitUpgradeOfferView): boolean {
  return offer.isMaster === true || offer.resultRank === 5;
}

function pairReady(
  offer: TraitUpgradeOfferView,
  state: readonly TraitVisualAttachmentView[],
  firstTraitId: string,
  secondTraitId: string,
): boolean {
  const partner = offer.traitId === firstTraitId
    ? secondTraitId
    : offer.traitId === secondTraitId ? firstTraitId : null;
  if (partner === null) return false;
  // Legacy V1 offers only carried Bud/Adapted. V1.1 requires two actual
  // Masters and a separate free fusion action, not an upgrade side effect.
  return hasRankMetadata(offer)
    ? reachesMaster(offer) && hasMaster(state, partner)
    : offer.resultStage === 'adapted' && hasAdapted(state, partner);
}

function traitBadge(offer: TraitUpgradeOfferView, legacyBadge: string, fusionReady: boolean): string {
  const badge = presentMasteryRank(offer.resultRank, offer.isMaster, legacyBadge);
  return fusionReady && hasRankMetadata(offer) ? `${badge} · FUSION READY` : fusionReady ? 'MYTHIC READY' : badge;
}

function pairingHint(
  offer: TraitUpgradeOfferView,
  fusionReady: boolean,
  partnerTitle: string,
  legacyHint: string,
): string | null {
  if (fusionReady) return null;
  return hasRankMetadata(offer)
    ? `Master ${partnerTitle} too, then choose a free Fuse now action.`
    : legacyHint;
}

function fusionReadyDescription(offer: TraitUpgradeOfferView, legacyDescription: string): string {
  return hasRankMetadata(offer)
    ? legacyDescription.replace(/^Completes /, 'Ready to fuse into ')
    : legacyDescription;
}

/** Plain-language, renderer-independent trait card content for the launch catalog. */
function presentTraitUpgradeBase(
  offer: TraitUpgradeOfferView,
  visualState: readonly TraitVisualAttachmentView[],
  heroName = 'Greg',
): UpgradePresentationBase {
  const mythicReady = pairReady(offer, visualState, 'porcupine-quills', 'puffer-pouch');

  if (offer.traitId === 'porcupine-quills') {
    return {
      title: 'Porcupine Quills', badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', mythicReady),
      socket: 'Back attachment',
      description: offer.resultStage === 'bud' ? `Fires three forward quills that pierce through one extra enemy each.`
        : mythicReady ? fusionReadyDescription(offer, `Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm around ${heroName}.`)
          : 'Fires five wider quills that pierce through two extra enemies each.',
      pairingHint: pairingHint(offer, mythicReady, 'Puffer Pouch', 'Adapt Puffer Pouch too to evolve both into Thornstorm Mantle.'),
    };
  }
  if (offer.traitId === 'puffer-pouch') {
    return {
      title: 'Puffer Pouch', badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', mythicReady),
      socket: 'Head attachment',
      description: offer.resultStage === 'bud' ? `Periodically pulls nearby enemies toward ${heroName}.`
        : mythicReady ? fusionReadyDescription(offer, `Completes Thornstorm Mantle: gather enemies, then fire a radial quill storm around ${heroName}.`)
          : 'Becomes a wider pulse that knocks nearby enemies away.',
      pairingHint: pairingHint(offer, mythicReady, 'Porcupine Quills', 'Adapt Porcupine Quills too to evolve both into Thornstorm Mantle.'),
    };
  }
  const thunderbugReady = pairReady(offer, visualState, 'electric-eel-coil', 'firefly-colony');
  const razorstepReady = pairReady(offer, visualState, 'mantis-scythes', 'gecko-pads');
  const midnightReady = pairReady(offer, visualState, 'owl-pinions', 'bat-ears');
  const meteorReady = pairReady(offer, visualState, 'crab-pincers', 'armadillo-greaves');
  const royalReady = pairReady(offer, visualState, 'skunk-brush', 'monarch-brood');
  if (offer.traitId === 'electric-eel-coil') {
    return {
      title: 'Electric Eel Coil',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE', thunderbugReady),
      socket: 'Tail attachment',
      description: offer.resultStage === 'bud'
        ? 'Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.'
        : thunderbugReady
          ? fusionReadyDescription(offer, `Completes Thunderbug Dynamo: telegraph a larger chain discharge around ${heroName}.`)
          : 'Instantly strikes the nearest enemy, then chains to 3 nearby unhit foes.',
      pairingHint: pairingHint(offer, thunderbugReady, 'Firefly Colony', 'Adapt Firefly Colony too to evolve both into Thunderbug Dynamo.'),
    };
  }
  if (offer.traitId === 'firefly-colony') {
    return {
      title: 'Firefly Colony',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE', thunderbugReady),
      socket: 'Orbiting body attachment',
      description: offer.resultStage === 'bud'
        ? `Two fireflies orbit ${heroName} and zap the nearest enemy they touch.`
        : thunderbugReady
          ? fusionReadyDescription(offer, `Completes Thunderbug Dynamo: telegraph a larger chain discharge around ${heroName}.`)
          : 'Four fireflies orbit wider and zap nearby enemies on contact.',
      pairingHint: pairingHint(offer, thunderbugReady, 'Electric Eel Coil', 'Adapt Electric Eel Coil too to evolve both into Thunderbug Dynamo.'),
    };
  }
  if (offer.traitId === 'mantis-scythes') {
    return {
      title: 'Mantis Scythes',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE', razorstepReady),
      socket: 'Left shoulder attachment',
      description: offer.resultStage === 'bud'
        ? 'Auto-aims a narrow scythe sweep through nearby enemies.'
        : razorstepReady
          ? fusionReadyDescription(offer, `Completes Razorstep Chimera: movement leaves stronger scythe pads at ${heroName}'s feet.`)
          : 'Auto-aims a wider, stronger scythe sweep through nearby enemies.',
      pairingHint: pairingHint(offer, razorstepReady, 'Gecko Pads', 'Adapt Gecko Pads too to evolve both into Razorstep Chimera.'),
    };
  }
  if (offer.traitId === 'gecko-pads') {
    return {
      title: 'Gecko Pads',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE', razorstepReady),
      socket: 'Right shoulder attachment',
      description: offer.resultStage === 'bud'
        ? `After moving, leaves a damaging pad at ${heroName}'s feet.`
        : razorstepReady
          ? fusionReadyDescription(offer, `Completes Razorstep Chimera: movement leaves stronger scythe pads at ${heroName}'s feet.`)
          : `After moving, leaves larger, stronger damaging pads at ${heroName}'s feet.`,
      pairingHint: pairingHint(offer, razorstepReady, 'Mantis Scythes', 'Adapt Mantis Scythes too to evolve both into Razorstep Chimera.'),
    };
  }
  if (offer.traitId === 'owl-pinions') {
    return {
      title: 'Owl Pinions',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE', midnightReady),
      socket: 'Wing attachments',
      description: offer.resultStage === 'bud'
        ? 'Fires a four-feather spread at the nearest threat.'
        : midnightReady
          ? fusionReadyDescription(offer, `Completes Midnight Radar: mark a wide cluster and keep your aim on the marked hunt around ${heroName}.`)
          : 'Fires a wider seven-feather spread.',
      pairingHint: pairingHint(offer, midnightReady, 'Bat Ears', 'Adapt Bat Ears too to evolve both into Midnight Radar.'),
    };
  }
  if (offer.traitId === 'bat-ears') {
    return {
      title: 'Bat Ears',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', midnightReady),
      socket: 'Head attachment',
      description: offer.resultStage === 'bud'
        ? 'Echo-marks a nearby cluster; every automatic attack prioritizes the marked prey.'
        : midnightReady
          ? fusionReadyDescription(offer, `Completes Midnight Radar: mark a wide cluster and keep your aim on the marked hunt around ${heroName}.`)
          : 'Echo-marks a larger cluster for priority targeting.',
      pairingHint: pairingHint(offer, midnightReady, 'Owl Pinions', 'Adapt Owl Pinions too to evolve both into Midnight Radar.'),
    };
  }
  if (offer.traitId === 'crab-pincers') {
    return {
      title: 'Crab Pincers',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW ATTACK' : 'UPGRADE', meteorReady),
      socket: 'Shoulder attachments',
      description: offer.resultStage === 'bud'
        ? 'Crushes nearby enemies with a compact area strike.'
        : meteorReady
          ? fusionReadyDescription(offer, 'Completes Meteor Mauler: a heavy close-range impact crushes the nearest crowd.')
          : 'Crushes a wider area for heavier damage.',
      pairingHint: pairingHint(offer, meteorReady, 'Armadillo Greaves', 'Adapt Armadillo Greaves too to evolve both into Meteor Mauler.'),
    };
  }
  if (offer.traitId === 'armadillo-greaves') {
    return {
      title: 'Armadillo Greaves',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', meteorReady),
      socket: 'Back attachment',
      description: offer.resultStage === 'bud'
        ? 'Shoves nearby threats away from your body.'
        : meteorReady
          ? fusionReadyDescription(offer, 'Completes Meteor Mauler: a heavy close-range impact crushes the nearest crowd.')
          : 'Creates a stronger defensive shove around you.',
      pairingHint: pairingHint(offer, meteorReady, 'Crab Pincers', 'Adapt Crab Pincers too to evolve both into Meteor Mauler.'),
    };
  }
  if (offer.traitId === 'skunk-brush') {
    return {
      title: 'Skunk Brush',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', royalReady),
      socket: 'Tail attachment',
      description: offer.resultStage === 'bud'
        ? 'Leaves a damaging stink cloud that punishes pursuit.'
        : royalReady
          ? fusionReadyDescription(offer, 'Completes Royal Stinkcloud: a monarch-crowned hazard surrounds you.')
          : 'Leaves a larger, stronger stink cloud.',
      pairingHint: pairingHint(offer, royalReady, 'Monarch Brood', 'Adapt Monarch Brood too to evolve both into Royal Stinkcloud.'),
    };
  }
  if (offer.traitId === 'monarch-brood') {
    return {
      title: 'Monarch Brood',
      badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', royalReady),
      socket: 'Orbiting body attachment',
      description: offer.resultStage === 'bud'
        ? `Two monarchs orbit ${heroName} and sting nearby enemies on contact.`
        : royalReady
          ? fusionReadyDescription(offer, 'Completes Royal Stinkcloud: a monarch-crowned hazard surrounds you.')
          : 'Three monarchs orbit wider and sting nearby enemies more often.',
      pairingHint: pairingHint(offer, royalReady, 'Skunk Brush', 'Adapt Skunk Brush too to evolve both into Royal Stinkcloud.'),
    };
  }
  return {
    title: offer.traitId.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    badge: traitBadge(offer, offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE', false), socket: 'Body attachment',
    description: offer.resultStage === 'bud' ? 'Adds a new visible animal adaptation.' : 'Strengthens this animal adaptation.',
    pairingHint: null,
  };
}

function legacyTraitImpactCategory(traitId: string): UpgradeImpactCategory {
  if (traitId === 'puffer-pouch' || traitId === 'armadillo-greaves') return 'Crowd control';
  if (traitId === 'bat-ears') return 'Targeting';
  return 'Direct damage';
}

/** Keeps a stable content definition from leaking retired hero copy into UI. */
function playerFacingUniversalDescription(upgradeId: string, description: string): string {
  return upgradeId === 'basic-attack:greg-precision'
    ? description.replaceAll('Fox Swipe', 'Scout Swipe')
    : description;
}

/**
 * Presentation wrapper around the immutable trait-runtime rank content. The
 * browser receives a precomputed offer rank and only displays this explanation;
 * it never turns the text back into combat or selection state.
 */
export function presentUpgrade(
  offer: TraitUpgradeOfferView,
  visualState: readonly TraitVisualAttachmentView[],
  heroName = 'Greg',
): UpgradePresentation {
  const base = presentTraitUpgradeBase(offer, visualState, heroName);
  const impact = typeof offer.resultRank === 'number'
    ? describeTraitUpgradeImpact(offer.traitId, offer.resultRank)
    : undefined;
  if (impact !== undefined) {
    return {
      ...base,
      impactCategory: impact.category,
      impact: `${impact.rankTransition} · ${impact.delta}`,
    };
  }
  const category = legacyTraitImpactCategory(offer.traitId);
  return {
    ...base,
    impactCategory: category,
    impact: category === 'Direct damage'
      ? 'Legacy offer: direct-damage outcome is determined by the simulation.'
      : `Legacy offer: ${category}; no direct damage is claimed.`,
  };
}

/** A short post-pick confirmation that reuses the exact offered presentation. */
export function presentUpgradeConfirmation(
  presentation: UpgradePresentation,
): UpgradeConfirmationPresentation {
  return Object.freeze({
    title: `${presentation.title} applied`,
    category: presentation.impactCategory,
    detail: presentation.impact,
  });
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
      impactCategory: 'Economy / utility',
      impact: `Economy / utility · no direct damage · +${offer.amount} Essence after the run.`,
    };
  }

  const definition = getUniversalUpgrade(offer.upgradeId, catalog);
  const title = definition?.title ?? offer.upgradeId.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  const starterMastery = definition?.effect.kind === 'basicAttack';
  const impact = definition === undefined
    ? null
    : describeUniversalUpgradeImpact(definition, offer.currentRank, offer.nextRank);
  return {
    title,
    badge: `RANK ${offer.nextRank}/${offer.maxRank}`,
    socket: starterMastery ? 'Starter mastery' : 'Neutral run upgrade',
    description: playerFacingUniversalDescription(
      offer.upgradeId,
      definition?.description ?? 'Strengthens a universal stat for this run.',
    ),
    pairingHint: null,
    impactCategory: impact?.category ?? 'Economy / utility',
    impact: impact === null
      ? `Rank ${offer.currentRank} → ${offer.nextRank} · authored impact unavailable; no direct-damage claim.`
      : `${impact.rankTransition} · ${impact.delta}`,
  };
}
