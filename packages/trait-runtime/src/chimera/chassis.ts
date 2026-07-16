/** Chassis selection and immutable rank-five behavior extraction for Wild Splice. */

import type {
  BehaviorDefinition,
  BehaviorFollowUp,
  BehaviorPhase,
  Catalog,
  CommandTemplate,
  TraitDefinition,
} from '../contracts.js';
import type { TraitId } from '../ids.js';
import { rankStageFor } from '../rank-progression.js';

/** Higher priority owns the delivery chassis; this is authored, never rolled. */
export const CHASSIS_PRIORITY: Readonly<Record<string, number>> = Object.freeze({
  'mantis-scythes': 90,
  'porcupine-quills': 85,
  'owl-pinions': 80,
  'electric-eel-coil': 75,
  'skunk-brush': 70,
  'gecko-pads': 65,
  'crab-pincers': 60,
  'firefly-colony': 55,
  'monarch-brood': 50,
  'puffer-pouch': 40,
  'armadillo-greaves': 35,
  'bat-ears': 30,
});

export interface ChimeraChassis {
  readonly chassis: TraitDefinition;
  readonly donor: TraitDefinition;
  readonly behavior: BehaviorDefinition;
}

export function cloneTemplate(template: CommandTemplate): CommandTemplate {
  return { ...template };
}

export function cloneFollowUps(
  followUps: readonly BehaviorFollowUp[] | undefined,
): readonly BehaviorFollowUp[] | undefined {
  if (followUps === undefined) return undefined;
  return followUps.map((followUp) => ({ ...followUp, emit: cloneTemplate(followUp.emit) }));
}

function clonePhase(phase: BehaviorPhase): BehaviorPhase {
  const followUps = cloneFollowUps(phase.followUps);
  return {
    durationTicks: phase.durationTicks,
    emit: cloneTemplate(phase.emit),
    ...(followUps === undefined ? {} : { followUps }),
  };
}

/** Never mutate catalog/rank-progression cached behavior data while synthesizing. */
export function cloneBehavior(behavior: BehaviorDefinition): BehaviorDefinition {
  const preludes = cloneFollowUps(behavior.preludes);
  const followUps = cloneFollowUps(behavior.followUps);
  return {
    kind: behavior.kind,
    periodTicks: behavior.periodTicks,
    ...(behavior.distanceMilliunits === undefined ? {} : { distanceMilliunits: behavior.distanceMilliunits }),
    ...(behavior.emit === undefined ? {} : { emit: cloneTemplate(behavior.emit) }),
    ...(preludes === undefined ? {} : { preludes }),
    ...(followUps === undefined ? {} : { followUps }),
    ...(behavior.phases === undefined ? {} : { phases: behavior.phases.map(clonePhase) }),
  };
}

function requireTrait(catalog: Catalog, traitId: string): TraitDefinition {
  const trait = catalog.traits.find((candidate) => candidate.id === traitId);
  if (trait === undefined) throw new RangeError(`Unknown Chimera trait: ${traitId}`);
  return trait;
}

/** Resolve deterministic chassis/donor roles and clone the chassis Master behavior. */
export function selectChassis(
  catalog: Catalog,
  traitA: TraitId,
  traitB: TraitId,
): ChimeraChassis {
  const first = requireTrait(catalog, traitA);
  const second = requireTrait(catalog, traitB);
  const firstPriority = CHASSIS_PRIORITY[first.id] ?? 0;
  const secondPriority = CHASSIS_PRIORITY[second.id] ?? 0;
  // The canonical catalog order is a deterministic tie-break for custom data.
  const firstIndex = catalog.traits.indexOf(first);
  const secondIndex = catalog.traits.indexOf(second);
  const firstWins = firstPriority > secondPriority
    || (firstPriority === secondPriority && firstIndex <= secondIndex);
  const chassis = firstWins ? first : second;
  const donor = firstWins ? second : first;
  return {
    chassis,
    donor,
    behavior: cloneBehavior(rankStageFor(chassis, 5).behavior),
  };
}

/** Best representative payload for graft tuning / copy; prefers a damage command in multiphase forms. */
export function primaryTemplate(behavior: BehaviorDefinition): CommandTemplate {
  if (behavior.emit !== undefined) return cloneTemplate(behavior.emit);
  const phases = behavior.phases ?? [];
  const damaging = [...phases].reverse().find((phase) => (
    phase.emit.damage !== undefined || phase.emit.amount !== undefined
  ));
  const fallback = damaging ?? phases[phases.length - 1];
  if (fallback === undefined) return { kind: 'playTraitCue', targeting: 'none', tag: 'chimera-idle' };
  return cloneTemplate(fallback.emit);
}

/** Approximate one behavior cycle in fixed ticks for deterministic budget estimation. */
export function behaviorCycleTicks(behavior: BehaviorDefinition): number {
  if (behavior.kind === 'multiPhase') {
    return Math.max(1, (behavior.phases ?? []).reduce((total, phase) => total + phase.durationTicks, 0));
  }
  // Movement trails have no wall-clock cadence. The estimator treats one
  // placement per second as a conservative training-lab proxy.
  return behavior.kind === 'movementTrail' ? 60 : Math.max(1, behavior.periodTicks);
}
