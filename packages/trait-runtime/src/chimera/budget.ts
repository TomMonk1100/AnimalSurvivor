/** Deterministic Chimera DPS estimator, solver, and executor-bound clamps. */

import type {
  BehaviorDefinition,
  BehaviorFollowUp,
  CommandTemplate,
} from '../contracts.js';
import { rounded } from '../rank-progression.js';
import { behaviorCycleTicks, cloneBehavior } from './chassis.js';
import { isSupportTrait } from './gimmicks.js';
import { chimeraLabCadenceMultiplier, chimeraLabCalibrationMultiplier } from './lab-calibration.js';
import { MASTER_DPS, MEAN_MASTER_DPS } from './master-dps.generated.js';
import type { ChimeraPairKind } from './naming.js';
import { getTemperament } from './temperaments.js';

const MAX_FLOAT32 = 3.4028234663852886e38;
const MAX_JUMPS = 7;
const MAX_PIERCE = 255;
const MAX_ORBITING = 16;
const RARITY_ENVELOPE: Readonly<Record<string, number>> = Object.freeze({
  common: 1,
  uncommon: 1.02,
  rare: 1.05,
  epic: 1.08,
  mythic: 1.12,
});

export interface ChimeraBudgetResult {
  readonly behavior: BehaviorDefinition;
  readonly targetDps: number;
  readonly estimatedBefore: number;
  readonly estimatedAfter: number;
  readonly scalar: number;
  /** Explicit Lab-v2 correction after closed-form normalization. */
  readonly calibrationMultiplier: number;
  /** Explicit Lab-v2 timing correction after damage normalization. */
  readonly cadenceMultiplier: number;
}

function commandEstimate(template: CommandTemplate): number {
  const damage = template.damage ?? 0;
  const amount = template.kind === 'spawnZone' ? template.amount ?? 0 : 0;
  switch (template.kind) {
    case 'spawnProjectileBurst':
      return damage * Math.max(1, template.count ?? 1) * (1 + Math.min(4, template.pierce ?? 0) * 0.25);
    case 'radialProjectileBurst':
      return damage * Math.max(1, template.count ?? 1) * 0.85;
    case 'chainDamage':
      return damage * Math.max(1, (template.jumps ?? 0) + 1);
    case 'orbitingDamage':
      return damage * Math.max(1, template.count ?? 1) * 0.7;
    case 'applyAreaDamage':
      return damage * 2;
    case 'meleeArc':
      return damage * 1.5;
    case 'spawnZone':
      return amount * Math.max(1, (template.durationTicks ?? 60) / Math.max(1, template.intervalTicks ?? 30)) * 0.45;
    default:
      return 0;
  }
}

function followUpEstimate(followUp: BehaviorFollowUp): number {
  return commandEstimate(followUp.emit) / Math.max(1, followUp.everyCycles ?? 1);
}

function cycleEstimate(
  template: CommandTemplate | undefined,
  preludes: readonly BehaviorFollowUp[] | undefined,
  followUps: readonly BehaviorFollowUp[] | undefined,
): number {
  let total = template === undefined ? 0 : commandEstimate(template);
  for (const prelude of preludes ?? []) total += followUpEstimate(prelude);
  for (const followUp of followUps ?? []) total += followUpEstimate(followUp);
  return total;
}

/** Closed-form consistent estimator used only for deterministic budget normalization. */
export function estimateBehaviorDps(behavior: BehaviorDefinition): number {
  if (behavior.kind === 'multiPhase') {
    const damagePerCycle = (behavior.phases ?? [])
      .reduce((total, phase) => total + cycleEstimate(phase.emit, undefined, phase.followUps), 0)
      + cycleEstimate(undefined, behavior.preludes, undefined);
    return rounded((damagePerCycle * 60) / behaviorCycleTicks(behavior));
  }
  return rounded((cycleEstimate(behavior.emit, behavior.preludes, behavior.followUps) * 60) / behaviorCycleTicks(behavior));
}

function parentDps(traitId: string): number {
  return MASTER_DPS[traitId as keyof typeof MASTER_DPS] ?? 0;
}

/** The plan's target formula, including the Perfect Pair premium and support rider. */
export function chimeraTargetDps(
  traitA: string,
  traitB: string,
  pairKind: ChimeraPairKind,
  rarity: string,
): number {
  const dpsA = parentDps(traitA);
  const dpsB = parentDps(traitB);
  const aSupport = isSupportTrait(traitA);
  const bSupport = isSupportTrait(traitB);
  let target: number;
  if (pairKind === 'support' || (aSupport && bSupport)) {
    target = MEAN_MASTER_DPS * 0.6;
  } else if (aSupport !== bSupport) {
    target = (aSupport ? dpsB : dpsA) * 1.25;
  } else {
    target = (Math.max(dpsA, dpsB) + 0.5 * Math.min(dpsA, dpsB)) * (pairKind === 'perfect' ? 1.2 : 1.1);
  }
  return rounded(target * (RARITY_ENVELOPE[rarity] ?? 1));
}

function scaleTemplate(template: CommandTemplate, scalar: number): CommandTemplate {
  const next = { ...template };
  if (template.damage !== undefined) next.damage = Math.max(0, rounded(template.damage * scalar));
  if (template.kind === 'spawnZone' && template.amount !== undefined) {
    next.amount = Math.max(0, rounded(template.amount * scalar));
  }
  return next;
}

function scaleBehaviorDamage(behavior: BehaviorDefinition, scalar: number): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  if (next.emit !== undefined) next.emit = scaleTemplate(next.emit, scalar);
  if (next.preludes !== undefined) next.preludes = next.preludes.map((prelude) => ({
    ...prelude,
    emit: scaleTemplate(prelude.emit, scalar),
  }));
  if (next.followUps !== undefined) next.followUps = next.followUps.map((followUp) => ({
    ...followUp,
    emit: scaleTemplate(followUp.emit, scalar),
  }));
  if (next.phases !== undefined) next.phases = next.phases.map((phase) => ({
    ...phase,
    emit: scaleTemplate(phase.emit, scalar),
    ...(phase.followUps === undefined ? {} : {
      followUps: phase.followUps.map((followUp) => ({
        ...followUp,
        emit: scaleTemplate(followUp.emit, scalar),
      })),
    }),
  }));
  return next;
}

/** Scale a full behavior loop without changing command vocabulary or ordering. */
function scaleBehaviorCadence(behavior: BehaviorDefinition, multiplier: number): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  const positiveTicks = (value: number): number => Math.max(1, Math.round(value * multiplier));
  switch (next.kind) {
    case 'multiPhase':
      if (next.phases !== undefined) {
        next.phases = next.phases.map((phase) => ({
          ...phase,
          durationTicks: positiveTicks(phase.durationTicks),
        }));
      }
      break;
    case 'movementTrail':
      if (next.distanceMilliunits !== undefined) {
        next.distanceMilliunits = positiveTicks(next.distanceMilliunits);
      }
      break;
    case 'periodicBurst':
    case 'periodicPulse':
    case 'generic':
      next.periodTicks = positiveTicks(next.periodTicks);
      break;
  }
  return next;
}

function clampFinite(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_FLOAT32, Math.max(0, rounded(value)));
}

function clampTemplate(template: CommandTemplate): CommandTemplate {
  const next = { ...template };
  for (const field of ['damage', 'amount', 'radius', 'range', 'speed', 'strength'] as const) {
    if (next[field] !== undefined) next[field] = clampFinite(next[field]!);
  }
  if (next.jumps !== undefined) next.jumps = Math.min(MAX_JUMPS, Math.max(0, Math.floor(next.jumps)));
  if (next.pierce !== undefined) next.pierce = Math.min(MAX_PIERCE, Math.max(0, Math.floor(next.pierce)));
  if (next.count !== undefined) next.count = Math.max(0, Math.floor(next.count));
  if (next.durationTicks !== undefined) next.durationTicks = Math.max(1, Math.floor(next.durationTicks));
  if (next.intervalTicks !== undefined) next.intervalTicks = Math.max(1, Math.floor(next.intervalTicks));
  if (next.arc !== undefined) next.arc = Math.min(Math.PI * 2, Math.max(0, rounded(next.arc)));
  if (next.spread !== undefined) next.spread = rounded(next.spread);
  return next;
}

function clampFollowUps(
  followUps: readonly BehaviorFollowUp[] | undefined,
  maxCount = 2,
  immediate = false,
): readonly BehaviorFollowUp[] | undefined {
  return followUps?.slice(0, Math.max(0, maxCount)).map((followUp) => ({
    ...followUp,
    delayTicks: immediate ? 0 : Math.max(0, Math.floor(followUp.delayTicks ?? 0)),
    everyCycles: Math.max(1, Math.floor(followUp.everyCycles ?? 1)),
    emit: clampTemplate(followUp.emit),
  }));
}

/** Reserve a total of two auxiliary commands around any one payload trigger. */
function clampTriggerExtras(
  preludes: readonly BehaviorFollowUp[] | undefined,
  followUps: readonly BehaviorFollowUp[] | undefined,
): {
  readonly preludes: readonly BehaviorFollowUp[] | undefined;
  readonly followUps: readonly BehaviorFollowUp[] | undefined;
} {
  const boundedPreludes = clampFollowUps(preludes, 2, true);
  return {
    preludes: boundedPreludes,
    followUps: clampFollowUps(followUps, 2 - (boundedPreludes?.length ?? 0)),
  };
}

function clampOrbitingTotal(behavior: BehaviorDefinition): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  let remaining = MAX_ORBITING;
  const clampOrbit = (template: CommandTemplate): CommandTemplate => {
    if (template.kind !== 'orbitingDamage') return template;
    const count = Math.max(0, Math.min(remaining, template.count ?? 0));
    remaining -= count;
    return { ...template, count };
  };
  const clampGroup = (
    emit: CommandTemplate | undefined,
    preludes: readonly BehaviorFollowUp[] | undefined,
    followUps: readonly BehaviorFollowUp[] | undefined,
  ) => {
    const extras = clampTriggerExtras(preludes, followUps);
    return {
      emit: emit === undefined ? undefined : clampOrbit(clampTemplate(emit)),
      preludes: extras.preludes?.map((prelude) => ({
        ...prelude,
        emit: clampOrbit(prelude.emit),
      })),
      followUps: extras.followUps?.map((followUp) => ({
        ...followUp,
        emit: clampOrbit(followUp.emit),
      })),
    };
  };
  if (next.phases !== undefined) {
    next.phases = next.phases.slice(0, 4).map((phase, index) => {
      const group = clampGroup(
        phase.emit,
        index === 0 ? next.preludes : undefined,
        phase.followUps,
      );
      if (index === 0) {
        if (group.preludes === undefined) delete next.preludes;
        else next.preludes = group.preludes;
      }
      return {
        ...phase,
        emit: group.emit!,
        ...(group.followUps === undefined ? {} : { followUps: group.followUps }),
      };
    });
  } else {
    const group = clampGroup(next.emit, next.preludes, next.followUps);
    if (group.emit !== undefined) next.emit = group.emit;
    if (group.preludes === undefined) delete next.preludes;
    else next.preludes = group.preludes;
    if (group.followUps !== undefined) next.followUps = group.followUps;
  }
  return next;
}

/** Clamp generated behavior to executor and authoring hard bounds. */
export function clampChimeraBehavior(behavior: BehaviorDefinition): BehaviorDefinition {
  return clampOrbitingTotal(behavior);
}

/** Scale behavior damage-like fields to the plan's deterministic target envelope. */
export function solveChimeraBudget(
  behavior: BehaviorDefinition,
  traitA: string,
  traitB: string,
  pairKind: ChimeraPairKind,
  temperamentId: string,
): ChimeraBudgetResult {
  const targetDps = chimeraTargetDps(traitA, traitB, pairKind, getTemperament(temperamentId as Parameters<typeof getTemperament>[0]).rarity);
  const bounded = clampChimeraBehavior(behavior);
  const estimatedBefore = estimateBehaviorDps(bounded);
  const calibrationMultiplier = chimeraLabCalibrationMultiplier(traitA, traitB);
  const cadenceMultiplier = chimeraLabCadenceMultiplier(traitA, traitB);
  const scalar = estimatedBefore > 0
    ? rounded((targetDps / estimatedBefore) * calibrationMultiplier)
    : calibrationMultiplier;
  const solved = clampChimeraBehavior(
    scaleBehaviorCadence(scaleBehaviorDamage(bounded, scalar), cadenceMultiplier),
  );
  return {
    behavior: solved,
    targetDps,
    estimatedBefore,
    estimatedAfter: estimateBehaviorDps(solved),
    scalar,
    calibrationMultiplier,
    cadenceMultiplier,
  };
}
