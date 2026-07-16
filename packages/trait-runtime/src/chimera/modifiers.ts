/** Deterministic Temperament and Stat Lean behavior transforms. */

import type {
  BehaviorDefinition,
  BehaviorFollowUp,
  BehaviorPhase,
  CommandTemplate,
  FusionVariant,
} from '../contracts.js';
import { rounded } from '../rank-progression.js';
import { cloneBehavior, cloneTemplate, primaryTemplate } from './chassis.js';
import { getStatLean } from './leans.js';
import { getTemperament } from './temperaments.js';

type TemplateTransform = (template: CommandTemplate) => CommandTemplate;

function transformFollowUps(
  followUps: readonly BehaviorFollowUp[] | undefined,
  transform: TemplateTransform,
): readonly BehaviorFollowUp[] | undefined {
  return followUps?.map((followUp) => ({ ...followUp, emit: transform(followUp.emit) }));
}

function mapTemplates(behavior: BehaviorDefinition, transform: TemplateTransform): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  if (next.emit !== undefined) next.emit = transform(next.emit);
  const preludes = transformFollowUps(next.preludes, transform);
  if (preludes !== undefined) next.preludes = preludes;
  const followUps = transformFollowUps(next.followUps, transform);
  if (followUps !== undefined) next.followUps = followUps;
  if (next.phases !== undefined) {
    next.phases = next.phases.map((phase) => {
      const phaseFollowUps = transformFollowUps(phase.followUps, transform);
      return {
        ...phase,
        emit: transform(phase.emit),
        ...(phaseFollowUps === undefined ? {} : { followUps: phaseFollowUps }),
      };
    });
  }
  return next;
}

function damageScaled(template: CommandTemplate, multiplier: number): CommandTemplate {
  const next = { ...template };
  if (template.damage !== undefined) next.damage = Math.max(0, rounded(template.damage * multiplier));
  if (template.amount !== undefined && template.kind === 'spawnZone') {
    next.amount = Math.max(0, rounded(template.amount * multiplier));
  }
  return next;
}

function reachScaled(template: CommandTemplate, multiplier: number): CommandTemplate {
  const next = { ...template };
  if (template.radius !== undefined) next.radius = Math.max(0, rounded(template.radius * multiplier));
  if (template.range !== undefined) next.range = Math.max(0, rounded(template.range * multiplier));
  if (template.arc !== undefined) next.arc = Math.min(Math.PI * 2, Math.max(0, rounded(template.arc * multiplier)));
  return next;
}

function countScaled(template: CommandTemplate, multiplier: number, additive = 0): CommandTemplate {
  if (template.count === undefined || template.count <= 0) return { ...template };
  return { ...template, count: Math.max(1, Math.round(template.count * multiplier) + additive) };
}

function cadenceScaled(behavior: BehaviorDefinition, multiplier: number): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  if (next.kind !== 'multiPhase' && next.kind !== 'movementTrail') {
    next.periodTicks = Math.max(1, Math.round(next.periodTicks * multiplier));
  }
  if (next.kind === 'multiPhase' && next.phases !== undefined) {
    next.phases = next.phases.map((phase) => ({
      ...phase,
      durationTicks: Math.max(1, Math.round(phase.durationTicks * multiplier)),
    }));
  }
  if (next.kind === 'movementTrail' && next.distanceMilliunits !== undefined) {
    next.distanceMilliunits = Math.max(1, Math.round(next.distanceMilliunits * multiplier));
  }
  return next;
}

function appendPayloadFollowUp(behavior: BehaviorDefinition, followUp: BehaviorFollowUp): BehaviorDefinition {
  const next = cloneBehavior(behavior);
  const appendBounded = (
    existing: readonly BehaviorFollowUp[] | undefined,
    capacity = 2,
  ): readonly BehaviorFollowUp[] => {
    if (capacity <= 0) return [...(existing ?? [])].slice(0, 0);
    const candidates = [...(existing ?? []), followUp];
    if (candidates.length <= capacity) return candidates;
    // Support forms reserve one bounded direct-damage rider. A temperament
    // special must never erase either the only damage-producing rider or the
    // donor graft that makes this pair identifiable. When the three-command
    // executor ceiling is already occupied, preserve the pair and omit the
    // optional temperament follow-up instead of silently changing the build.
    const supportRider = existing?.find((candidate) => candidate.emit.tag === 'chimera-support-rider');
    if (supportRider !== undefined) {
      const donorGraft = existing?.find((candidate) => candidate !== supportRider);
      return donorGraft === undefined
        ? [supportRider, followUp].slice(0, capacity)
        : [donorGraft, supportRider].slice(0, capacity);
    }
    return candidates.slice(0, capacity);
  };
  if (next.kind === 'multiPhase' && next.phases !== undefined && next.phases.length > 0) {
    const index = next.phases.length - 1;
    next.phases = next.phases.map((phase, phaseIndex) => (
      phaseIndex === index
        ? { ...phase, followUps: appendBounded(phase.followUps) }
        : phase
    ));
  } else {
    next.followUps = appendBounded(next.followUps, 2 - (next.preludes?.length ?? 0));
  }
  return next;
}

function prependTelegraph(behavior: BehaviorDefinition, tag: string): BehaviorDefinition {
  if (behavior.kind === 'movementTrail') {
    const next = cloneBehavior(behavior);
    // Preserve an authored donor prelude (Undertow/Lock-On) over an optional
    // temperament tell when the three-command trigger ceiling is occupied.
    if ((next.preludes?.length ?? 0) < 2) {
      next.preludes = [
        ...(next.preludes ?? []),
        { emit: { kind: 'telegraph', targeting: 'none', radius: 96, durationTicks: 8, tag } },
      ];
    }
    return next;
  }
  const payload = primaryTemplate(behavior);
  const payloadFollowUps = behavior.kind === 'multiPhase'
    ? behavior.phases?.[behavior.phases.length - 1]?.followUps
    : behavior.followUps;
  const existing = behavior.kind === 'multiPhase' ? behavior.phases ?? [] : [];
  const prefix: BehaviorPhase = {
    durationTicks: 8,
    emit: { kind: 'telegraph', targeting: 'none', radius: payload.range ?? payload.radius ?? 96, durationTicks: 8, tag },
  };
  // Existing designed sequences stay intact when they fit. Otherwise collapse
  // to one payload phase so the hard <=4 phase authoring law remains true.
  const phases = existing.length > 0 && existing.length < 4
    ? [prefix, ...existing]
    : [prefix, { durationTicks: Math.max(1, behavior.periodTicks || 60), emit: payload, ...(payloadFollowUps === undefined ? {} : { followUps: payloadFollowUps }) }];
  return { kind: 'multiPhase', periodTicks: 0, phases: phases.slice(0, 4) };
}

function applyTemperament(
  behavior: BehaviorDefinition,
  variant: FusionVariant,
  donorPrimary: CommandTemplate,
): BehaviorDefinition {
  const temperament = getTemperament(variant.temperamentId as Parameters<typeof getTemperament>[0]);
  switch (temperament.id) {
    case 'steady':
      return mapTemplates(behavior, (template) => damageScaled(template, 1.05));
    case 'twitchy':
      return mapTemplates(cadenceScaled(behavior, 0.8), (template) => damageScaled(template, 0.82));
    case 'hearty':
      return mapTemplates(cadenceScaled(behavior, 1.18), (template) => damageScaled(template, 1.18));
    case 'long-arm':
      return mapTemplates(behavior, (template) => damageScaled(reachScaled(template, 1.25), 0.92));
    case 'compact':
      return mapTemplates(behavior, (template) => damageScaled(reachScaled(template, 0.8), 1.15));
    case 'echo': {
      const echo = damageScaled(primaryTemplate(behavior), 0.45);
      return appendPayloadFollowUp(behavior, { delayTicks: 6, emit: { ...echo, tag: echo.tag ?? 'chimera-echo' } });
    }
    case 'magnet-hearted':
      return appendPayloadFollowUp(behavior, {
        emit: { kind: 'areaGather', targeting: 'none', radius: 80, strength: 7, tag: 'chimera-magnet' },
      });
    case 'skittish':
      return appendPayloadFollowUp(behavior, {
        emit: { kind: 'areaKnockback', targeting: 'none', radius: 72, strength: 7, tag: 'chimera-skittish' },
      });
    case 'gilded':
      return mapTemplates(behavior, (template) => damageScaled(template, 1.1));
    case 'doubled-down':
      return mapTemplates(behavior, (template) => damageScaled(countScaled(template, 2), 0.52));
    case 'bulwark':
      return appendPayloadFollowUp(behavior, {
        everyCycles: 4,
        emit: { kind: 'grantShield', targeting: 'none', amount: 10, durationTicks: 90, tag: 'chimera-bulwark' },
      });
    case 'seismic':
      return appendPayloadFollowUp(behavior, {
        emit: { kind: 'spawnZone', targeting: 'none', radius: 52, amount: 2.5, durationTicks: 75, intervalTicks: 15, tag: 'sticky-trail' },
      });
    case 'prismatic':
      return appendPayloadFollowUp(behavior, {
        everyCycles: 3,
        emit: { ...cloneTemplate(donorPrimary), tag: donorPrimary.tag ?? 'chimera-prismatic' },
      });
    case 'colossus':
      return mapTemplates(cadenceScaled(behavior, 1.5), (template) => damageScaled(reachScaled(template, 1.5), 1.2));
    case 'apex-whisper':
      // The runtime keeps the donor's complete Master timer active in
      // parallel with this chassis-and-graft behavior. Do not collapse it to
      // one follow-up here: that would lose its cadence, movement, and phase
      // semantics, and would double-fire the primary payload.
      return behavior;
    case 'show-off': {
      const boosted = mapTemplates(behavior, (template) => damageScaled(template, 1.6));
      return prependTelegraph(boosted, 'chimera-show-off');
    }
  }
}

function applyLean(behavior: BehaviorDefinition, variant: FusionVariant): BehaviorDefinition {
  const lean = getStatLean(variant.leanId as Parameters<typeof getStatLean>[0]);
  switch (lean.id) {
    case 'balanced': return behavior;
    case 'swift': return mapTemplates(cadenceScaled(behavior, 0.88), (template) => damageScaled(template, 0.9));
    case 'heavy': return mapTemplates(cadenceScaled(behavior, 1.12), (template) => damageScaled(template, 1.1));
    case 'reaching': return mapTemplates(behavior, (template) => damageScaled(reachScaled(template, 1.12), 0.94));
    case 'dense': return mapTemplates(behavior, (template) => damageScaled(reachScaled(countScaled(template, 1, 1), 0.9), 0.9));
  }
}

/** Apply the persisted roll without consuming ambient state or mutating its input. */
export function applyChimeraVariant(
  behavior: BehaviorDefinition,
  variant: FusionVariant,
  donorPrimary: CommandTemplate,
): BehaviorDefinition {
  return applyLean(applyTemperament(behavior, variant, donorPrimary), variant);
}
