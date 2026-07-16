import type { TraitVisualAttachmentView } from '@sim';
import { getHeroBasicAttackDefinition } from '@sim';
import type { HeroBasicAttackDefinition } from '@sim';
import {
  presentActiveAdaptations,
  type ActiveAdaptationCard,
} from './active-adaptations';
import {
  formatChimeraTraitName,
  presentChimeraCopy,
  type ChimeraFusionCopy,
} from './chimera-copy';

/** The selected hero's starter fire plus up to four acquired logical attacks. */
export const ACTIVE_ATTACK_SLOT_CAPACITY = 5;

/** Declarative row content; the app chooses the visual braid icon treatment. */
export interface ChimeraBraidRow {
  readonly icon: 'braid';
  readonly parentRows: readonly [string, string];
}

export interface ActiveAttackCard extends ActiveAdaptationCard {
  /** Renderer-independent executable attack footprint, never visual sockets. */
  readonly slotCost: number;
  /** Null for an ordinary attack; otherwise render a braid plus both parents. */
  readonly chimeraBraid: ChimeraBraidRow | null;
}

export interface ActiveAttackLoadout {
  readonly cards: readonly ActiveAttackCard[];
  readonly slotCapacity: number;
  readonly slotsUsed: number;
}

function sourceIdFor(card: ActiveAdaptationCard): string {
  return card.id.replace(/:(?:bud|adapted|mythic)$/, '');
}

function slotCost(
  visuals: readonly TraitVisualAttachmentView[],
  card: ActiveAdaptationCard,
): number {
  const visual = visuals.find((candidate) => (
    candidate.enabled
    && candidate.visualOnly !== true
    && candidate.sourceId === sourceIdFor(card)
  ));
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
 * The stable `greg-auto-fire` content identifier remains part of replay-safe
 * simulation data, while the current owner-approved hero presentation is
 * Scout. Keep that implementation detail out of the player-facing card.
 */
function playerFacingStarterCopy(basicAttack: HeroBasicAttackDefinition): Readonly<{ title: string; description: string }> {
  if (basicAttack.id === 'greg-auto-fire') {
    return Object.freeze({
      title: 'Scout Swipe',
      description: 'Scout commits to a broad forward paw swipe through nearby threats.',
    });
  }
  return Object.freeze({ title: basicAttack.title, description: basicAttack.description });
}

interface ChimeraActiveVisual {
  readonly visual: TraitVisualAttachmentView;
  readonly parents: readonly [string, string];
}

function readParentPair(value: unknown): readonly [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const first = value[0];
  const second = value[1];
  if (
    typeof first !== 'string' || first.trim().length === 0
    || typeof second !== 'string' || second.trim().length === 0
  ) {
    return null;
  }
  return Object.freeze([first.trim(), second.trim()]);
}

function parentsFromDynamicSource(sourceId: string): readonly [string, string] | null {
  const match = /^chimera:([^+:]+)\+([^:]+)$/.exec(sourceId);
  if (match === null) return null;
  const first = match[1];
  const second = match[2];
  if (first === undefined || second === undefined) return null;
  return readParentPair([first, second]);
}

function readChimeraParents(visual: TraitVisualAttachmentView): readonly [string, string] | null {
  return readParentPair(visual.chimeraParents) ?? parentsFromDynamicSource(visual.sourceId);
}

function activeChimeraVisuals(
  visuals: readonly TraitVisualAttachmentView[],
): ReadonlyMap<string, ChimeraActiveVisual> {
  const chimeras = new Map<string, ChimeraActiveVisual>();
  for (const visual of visuals) {
    if (
      !visual.enabled
      || visual.visualOnly === true
      || visual.stage !== 'mythic'
      || chimeras.has(visual.sourceId)
    ) {
      continue;
    }
    const parents = readChimeraParents(visual);
    if (parents !== null) chimeras.set(visual.sourceId, Object.freeze({ visual, parents }));
  }
  return chimeras;
}

function copyForChimera(chimera: ChimeraActiveVisual): ChimeraFusionCopy {
  const { visual, parents } = chimera;
  return presentChimeraCopy({
    evolutionId: visual.sourceId,
    ingredients: parents,
    displayName: visual.displayName,
    rarity: visual.rarity,
    temperamentId: visual.temperamentId,
    pairKind: visual.pairKind,
    flavorIndex: visual.flavorIndex,
  });
}

function braidRow(parents: readonly [string, string]): ChimeraBraidRow {
  const parentRows: [string, string] = [
    formatChimeraTraitName(parents[0]),
    formatChimeraTraitName(parents[1]),
  ];
  return Object.freeze({
    icon: 'braid',
    parentRows: Object.freeze(parentRows),
  });
}

function chimeraStageLabel(copy: ChimeraFusionCopy): string {
  switch (copy.pairKind) {
    case 'perfect': return 'Perfect Pair · 1 slot';
    case 'support': return 'Support Chimera · 1 slot';
    case 'wild': return 'Wild Splice · 1 slot';
    default: return 'Chimera · 1 slot';
  }
}

function chimeraImpact(copy: ChimeraFusionCopy): Pick<ActiveAttackCard, 'impactCategory' | 'impact'> {
  if (copy.pairKind === 'support') {
    return Object.freeze({
      impactCategory: 'Crowd control',
      impact: 'Support Chimera: crowd control and its damage rider resolve in the authoritative simulation.',
    });
  }
  return Object.freeze({
    impactCategory: 'Direct damage',
    impact: 'Chimera attack: direct-damage outcomes resolve in the authoritative simulation.',
  });
}

function presentStaticChimeraCard(
  card: ActiveAdaptationCard,
  visuals: readonly TraitVisualAttachmentView[],
  chimera: ChimeraActiveVisual,
): ActiveAttackCard {
  const copy = copyForChimera(chimera);
  const procedural = copy.pairKind === 'wild' || copy.pairKind === 'support';
  return Object.freeze({
    ...card,
    title: copy.usesLegacyFallback ? card.title : copy.title,
    stageLabel: copy.usesLegacyFallback ? card.stageLabel : chimeraStageLabel(copy),
    effect: procedural ? copy.description : card.effect,
    cadence: procedural ? 'Chimera braid · 1 logical slot' : card.cadence,
    ...(procedural ? chimeraImpact(copy) : {}),
    slotCost: slotCost(visuals, card),
    chimeraBraid: braidRow(chimera.parents),
  });
}

function presentDynamicChimeraCard(
  visuals: readonly TraitVisualAttachmentView[],
  chimera: ChimeraActiveVisual,
): ActiveAttackCard {
  const copy = copyForChimera(chimera);
  const cardBase: ActiveAdaptationCard = Object.freeze({
    id: chimera.visual.visualKey,
    title: copy.title,
    stageLabel: chimeraStageLabel(copy),
    effect: copy.description,
    cadence: 'Chimera braid · 1 logical slot',
    ...chimeraImpact(copy),
  });
  return Object.freeze({
    ...cardBase,
    slotCost: slotCost(visuals, cardBase),
    chimeraBraid: braidRow(chimera.parents),
  });
}

/**
 * Projects the authoritative visual/build state into the pause-only attack
 * loadout. The playable catalog caps acquired traits at four, so the result
 * cannot exceed five after the selected hero's starter attack is counted.
 */
export function presentActiveAttackLoadout(
  visuals: readonly TraitVisualAttachmentView[],
  basicAttack: HeroBasicAttackDefinition = getHeroBasicAttackDefinition('greg-auto-fire'),
): ActiveAttackLoadout {
  const starterCopy = playerFacingStarterCopy(basicAttack);
  const starterAttack: ActiveAttackCard = Object.freeze({
    id: `${basicAttack.id}:starter`,
    title: starterCopy.title,
    stageLabel: 'Starter',
    effect: `${starterCopy.description} ${instinctCopy(basicAttack.id)}`.trim(),
    cadence: basicAttack.pattern === 'meleeArc'
      ? 'Close-range swipe'
      : basicAttack.pattern === 'groundWave'
        ? 'Forward ground wave'
        : 'Base projectile',
    impactCategory: 'Direct damage',
    impact: 'Starter attack: direct damage resolves in the authoritative simulation.',
    slotCost: 1,
    chimeraBraid: null,
  });
  const cards: ActiveAttackCard[] = [starterAttack];
  const gameplayVisuals = visuals.filter((visual) => visual.visualOnly !== true);
  const chimerasBySource = activeChimeraVisuals(gameplayVisuals);
  const representedChimeras = new Set<string>();
  for (const card of presentActiveAdaptations(gameplayVisuals)) {
    const sourceId = sourceIdFor(card);
    const chimera = chimerasBySource.get(sourceId);
    if (chimera !== undefined) {
      cards.push(presentStaticChimeraCard(card, gameplayVisuals, chimera));
      representedChimeras.add(sourceId);
    } else {
      cards.push(Object.freeze({ ...card, slotCost: slotCost(gameplayVisuals, card), chimeraBraid: null }));
    }
  }
  for (const [sourceId, chimera] of chimerasBySource) {
    if (representedChimeras.has(sourceId)) continue;
    cards.push(presentDynamicChimeraCard(gameplayVisuals, chimera));
  }
  const slotsUsed = cards.reduce((used, card) => used + card.slotCost, 0);
  return Object.freeze({
    cards: Object.freeze(cards),
    slotCapacity: ACTIVE_ATTACK_SLOT_CAPACITY,
    slotsUsed: Math.min(ACTIVE_ATTACK_SLOT_CAPACITY, slotsUsed),
  });
}
