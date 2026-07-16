/** Pure dynamic Chimera definition synthesis. */

import type {
  BehaviorDefinition,
  BehaviorFollowUp,
  Catalog,
  CommandTemplate,
  EvolutionDefinition,
  FusionVariant,
} from '../contracts.js';
import { rankStageFor } from '../rank-progression.js';
import { estimateBehaviorDps, solveChimeraBudget } from './budget.js';
import { canonicalChimeraPair, type ChimeraPairId } from './chimera-ids.js';
import { selectChassis, cloneBehavior } from './chassis.js';
import { graftDonor } from './gimmicks.js';
import { getStatLean, isStatLeanId } from './leans.js';
import { classifyChimeraPair, displayChimeraNameForPair, type ChimeraPairKind } from './naming.js';
import { applyChimeraVariant } from './modifiers.js';
import { getTemperament, isTemperamentId, rarityLabel } from './temperaments.js';

export interface SynthesizedChimera {
  readonly definition: EvolutionDefinition;
  readonly pairId: ChimeraPairId;
  readonly pairKind: ChimeraPairKind;
  readonly displayName: string;
  readonly rarity: string;
  readonly temperamentId: string;
  readonly leanId: string;
  readonly variantSeed: number;
  readonly targetDps: number;
  readonly estimatedDps: number;
}

const CACHE = new WeakMap<Catalog, Map<string, SynthesizedChimera>>();

function variantKey(variant: FusionVariant): string {
  return `${variant.seed >>> 0}:${variant.temperamentId}:${variant.leanId}`;
}

function cacheFor(catalog: Catalog): Map<string, SynthesizedChimera> {
  const existing = CACHE.get(catalog);
  if (existing !== undefined) return existing;
  const created = new Map<string, SynthesizedChimera>();
  CACHE.set(catalog, created);
  return created;
}

function validateVariant(variant: FusionVariant): void {
  if (!Number.isSafeInteger(variant.seed) || variant.seed < 0 || variant.seed > 0xffff_ffff) {
    throw new RangeError('Chimera variant seed must be uint32');
  }
  if (!isTemperamentId(variant.temperamentId)) throw new RangeError(`Unknown temperament: ${variant.temperamentId}`);
  if (!isStatLeanId(variant.leanId)) throw new RangeError(`Unknown Stat Lean: ${variant.leanId}`);
}

function unionSockets(catalog: Catalog, traitA: string, traitB: string): EvolutionDefinition['occupiedSockets'] {
  const sockets: EvolutionDefinition['occupiedSockets'][number][] = [];
  for (const traitId of [traitA, traitB]) {
    const trait = catalog.traits.find((candidate) => candidate.id === traitId);
    if (trait === undefined) continue;
    for (const socket of trait.sockets) {
      if (!sockets.includes(socket)) sockets.push(socket);
    }
  }
  return sockets;
}

function appendDamageRider(behavior: BehaviorDefinition): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  const rider: BehaviorFollowUp = {
    emit: {
      kind: 'applyAreaDamage', targeting: 'nearest', radius: 62, damage: 8, tag: 'chimera-support-rider',
    },
  };
  const merge = (followUps: readonly BehaviorFollowUp[] | undefined): readonly BehaviorFollowUp[] => {
    if (followUps?.some((followUp) => followUp.emit.tag === 'chimera-support-rider')) {
      return followUps;
    }
    // One payload plus two follow-ups is the fixed command-buffer law. Keep
    // the first existing control graft and reserve the other slot for the
    // support damage rider; temperament transforms preserve that rider below.
    return [...(followUps ?? []).slice(0, 1), rider];
  };
  if (next.kind === 'multiPhase' && next.phases !== undefined && next.phases.length > 0) {
    const index = next.phases.length - 1;
    next.phases = next.phases.map((phase, phaseIndex) => (
      phaseIndex === index
        ? { ...phase, followUps: merge(phase.followUps) }
        : phase
    ));
  } else {
    next.followUps = merge(next.followUps);
  }
  return next;
}

function authoredPerfect(catalog: Catalog, traitA: string, traitB: string): EvolutionDefinition | undefined {
  return catalog.evolutions.find((evolution) => (
    (evolution.ingredients[0] === traitA && evolution.ingredients[1] === traitB)
    || (evolution.ingredients[0] === traitB && evolution.ingredients[1] === traitA)
  ));
}

function donorPrimaryFor(catalog: Catalog, traitA: string, traitB: string): CommandTemplate {
  const roles = selectChassis(catalog, traitA, traitB);
  return rankStageFor(roles.donor, 5).behavior.emit
    ?? roles.behavior.emit
    ?? { kind: 'playTraitCue', targeting: 'none', tag: 'chimera-donor' };
}

/**
 * Synthesize one complete immutable definition from a canonical pair and a
 * persisted pure variant. It never mutates catalog data or consumes RNG.
 */
export function synthesizeChimera(
  catalog: Catalog,
  traitA: string,
  traitB: string,
  variant: FusionVariant,
): SynthesizedChimera {
  validateVariant(variant);
  const pair = canonicalChimeraPair(catalog, traitA, traitB);
  if (pair === undefined) throw new RangeError(`Invalid Chimera pair: ${traitA}, ${traitB}`);
  const cachedKey = `${pair.id}:${variantKey(variant)}`;
  const cache = cacheFor(catalog);
  const cached = cache.get(cachedKey);
  if (cached !== undefined) return cached;

  const pairKind = classifyChimeraPair(catalog, pair.first, pair.second);
  if (pairKind === undefined) throw new RangeError(`Unclassified Chimera pair: ${pair.id}`);
  const perfect = authoredPerfect(catalog, pair.first, pair.second);
  const chassis = selectChassis(catalog, pair.first, pair.second);
  const donorPrimary = donorPrimaryFor(catalog, pair.first, pair.second);
  let behavior = perfect === undefined
    ? graftDonor(chassis.behavior, chassis.donor)
    : cloneBehavior(perfect.behavior);
  // Utility + utility forms always reserve an authoritative trash-clear
  // rider. Put it in before temperament composition so it cannot be dropped
  // by a bounded special follow-up.
  if (pairKind === 'support') behavior = appendDamageRider(behavior);
  behavior = applyChimeraVariant(behavior, variant, donorPrimary);
  // Support Chimeras and utility Perfect Pairs must remain actively useful;
  // attach a bounded direct-damage rider before solving a zero-DPS form.
  if (estimateBehaviorDps(behavior) <= 0) behavior = appendDamageRider(behavior);
  const budget = solveChimeraBudget(behavior, pair.first, pair.second, pairKind, variant.temperamentId);
  const temperament = getTemperament(variant.temperamentId as Parameters<typeof getTemperament>[0]);
  const definition: EvolutionDefinition = {
    id: perfect?.id ?? pair.id,
    ingredients: [pair.first, pair.second],
    occupiedSockets: unionSockets(catalog, pair.first, pair.second),
    behavior: budget.behavior,
    visualKey: perfect?.visualKey ?? `${pair.id}:mythic`,
  };
  const result: SynthesizedChimera = Object.freeze({
    definition: Object.freeze(definition),
    pairId: pair.id,
    pairKind,
    displayName: displayChimeraNameForPair(
      catalog,
      pair.first,
      pair.second,
      variant.temperamentId as Parameters<typeof displayChimeraNameForPair>[3],
    ) ?? pair.id,
    rarity: rarityLabel(temperament.rarity),
    temperamentId: variant.temperamentId,
    leanId: getStatLean(variant.leanId as Parameters<typeof getStatLean>[0]).id,
    variantSeed: variant.seed >>> 0,
    targetDps: budget.targetDps,
    estimatedDps: budget.estimatedAfter,
  });
  cache.set(cachedKey, result);
  return result;
}

/** Test/diagnostic hook only; gameplay never needs to invalidate a catalog cache. */
export function clearChimeraSynthesisCache(): void {
  // WeakMap itself cannot be cleared. Individual catalog entries naturally
  // collect; this no-op preserves a future-compatible diagnostic API.
}
