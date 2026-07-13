/**
 * Deterministic five-rank attack progression.
 *
 * Existing presentation assets are still authored as Bud/Adapted, so rank 1
 * reads the Bud definition and ranks 2–5 retain the Adapted visual key. The
 * behavior is not a cosmetic alias: ranks 3–5 derive stronger cadence,
 * damage, reach, density, and utility values from the authored Adapted form.
 * A future content pass can supply per-rank overrides through
 * TraitDefinition.rankStages without changing runtime semantics.
 */

import type {
  BehaviorDefinition,
  CommandTemplate,
  StageDefinition,
  TraitDefinition,
} from './contracts.js';
import {
  MASTER_RANK,
  TRAIT_RANKS,
  type OwnedStage,
  type TraitRank,
} from './ids.js';

export type TraitRankStages = Readonly<Record<TraitRank, StageDefinition>>;

const CACHE = new WeakMap<TraitDefinition, TraitRankStages>();

const SCALE_BY_RANK: Readonly<Record<3 | 4 | 5, Readonly<{
  cadence: number;
  damage: number;
  reach: number;
  duration: number;
}>>> = {
  3: { cadence: 0.88, damage: 1.22, reach: 1.10, duration: 1.08 },
  4: { cadence: 0.76, damage: 1.48, reach: 1.22, duration: 1.16 },
  5: { cadence: 0.64, damage: 1.78, reach: 1.36, duration: 1.26 },
};

function rounded(value: number): number {
  // Keep authored integer behavior integer while making non-integer authored
  // arcs/spreads byte-stable across every JS runtime we support.
  return Math.round(value * 1_000) / 1_000;
}

function positiveScaled(value: number, multiplier: number, minimum = 1): number {
  return Math.max(minimum, rounded(value * multiplier));
}

function scaledTemplate(template: CommandTemplate | undefined, rank: 3 | 4 | 5): CommandTemplate | undefined {
  if (template === undefined) return undefined;
  const tuning = SCALE_BY_RANK[rank];
  const rankStep = rank - 2;
  const next: CommandTemplate = { ...template };

  if (template.damage !== undefined) next.damage = positiveScaled(template.damage, tuning.damage, 0);
  if (template.amount !== undefined) next.amount = positiveScaled(template.amount, tuning.damage, 0);
  if (template.strength !== undefined) next.strength = positiveScaled(template.strength, tuning.damage, 0);
  if (template.radius !== undefined) next.radius = positiveScaled(template.radius, tuning.reach, 0);
  if (template.range !== undefined) next.range = positiveScaled(template.range, tuning.reach, 0);
  if (template.speed !== undefined) next.speed = positiveScaled(template.speed, 1 + (rankStep * 0.06), 0);
  if (template.arc !== undefined) next.arc = Math.min(Math.PI * 2, rounded(template.arc * tuning.reach));
  if (template.spread !== undefined) next.spread = rounded(template.spread * (1 + (rankStep * 0.08)));

  // A positive count represents visible emitted things / targets. Increasing
  // it makes later ranks visibly denser without inventing new command kinds.
  if (template.count !== undefined && template.count > 0) next.count = template.count + rankStep;
  if (template.jumps !== undefined && template.jumps > 0) {
    // Mirrors the fixed accepted-simulation chain work bound.
    next.jumps = Math.min(7, template.jumps + rankStep);
  }
  if (template.pierce !== undefined && template.pierce > 0) {
    next.pierce = Math.min(255, template.pierce + rankStep);
  }
  if (template.durationTicks !== undefined && template.durationTicks > 0) {
    next.durationTicks = Math.max(1, Math.round(template.durationTicks * tuning.duration));
  }
  if (template.intervalTicks !== undefined && template.intervalTicks > 0) {
    next.intervalTicks = Math.max(1, Math.round(template.intervalTicks * tuning.cadence));
  }

  return next;
}

function scaledBehavior(behavior: BehaviorDefinition, rank: 3 | 4 | 5): BehaviorDefinition {
  const tuning = SCALE_BY_RANK[rank];
  const next: BehaviorDefinition = {
    ...behavior,
    periodTicks: behavior.periodTicks === 0
      ? 0
      : Math.max(1, Math.round(behavior.periodTicks * tuning.cadence)),
  };
  if (behavior.distanceMilliunits !== undefined) {
    next.distanceMilliunits = Math.max(1, Math.round(behavior.distanceMilliunits * tuning.cadence));
  }
  const emit = scaledTemplate(behavior.emit, rank);
  if (emit !== undefined) next.emit = emit;
  if (behavior.phases !== undefined) {
    next.phases = behavior.phases.map((phase) => ({
      ...phase,
      durationTicks: Math.max(1, Math.round(phase.durationTicks * tuning.cadence)),
      emit: scaledTemplate(phase.emit, rank)!,
    }));
  }
  return next;
}

function derivedStages(definition: TraitDefinition): TraitRankStages {
  const adapted = definition.stages.adapted;
  const overrides = definition.rankStages;
  return Object.freeze({
    1: overrides?.[1] ?? definition.stages.bud,
    2: overrides?.[2] ?? adapted,
    3: overrides?.[3] ?? {
      visualKey: adapted.visualKey,
      behavior: scaledBehavior(adapted.behavior, 3),
    },
    4: overrides?.[4] ?? {
      visualKey: adapted.visualKey,
      behavior: scaledBehavior(adapted.behavior, 4),
    },
    5: overrides?.[5] ?? {
      visualKey: adapted.visualKey,
      behavior: scaledBehavior(adapted.behavior, 5),
    },
  });
}

/** Full authored-or-derived rank set for a trait. Cached outside the hot path. */
export function rankStagesFor(definition: TraitDefinition): TraitRankStages {
  const cached = CACHE.get(definition);
  if (cached !== undefined) return cached;
  const stages = derivedStages(definition);
  CACHE.set(definition, stages);
  return stages;
}

/** The executable stage definition for one exact rank. */
export function rankStageFor(definition: TraitDefinition, rank: TraitRank): StageDefinition {
  return rankStagesFor(definition)[rank];
}

/** Compatibility bucket for attachment art and callers not yet rank-aware. */
export function legacyStageForRank(rank: TraitRank): OwnedStage {
  return rank === 1 ? 'bud' : 'adapted';
}

export function isMasterRank(rank: TraitRank): boolean {
  return rank === MASTER_RANK;
}

/** Assert the exported list remains the complete serializable rank ladder. */
export function isCompleteRankSet(stages: Partial<Record<TraitRank, StageDefinition>>): boolean {
  return TRAIT_RANKS.every((rank) => stages[rank] !== undefined);
}
