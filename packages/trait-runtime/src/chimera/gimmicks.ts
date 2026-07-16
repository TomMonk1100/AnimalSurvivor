/**
 * Donor graft composition for Wild Splice.
 *
 * Every graft emits only the existing trait-command vocabulary. Grafts that
 * need a payload location declare the explicit `triggerTarget` anchor; the
 * simulation resolves that stable target handoff in the same authoritative
 * command batch, with no renderer callback or ambient timing involved.
 */

import type {
  BehaviorDefinition,
  BehaviorFollowUp,
  BehaviorPhase,
  CommandTemplate,
  TraitDefinition,
} from '../contracts.js';
import { rounded } from '../rank-progression.js';
import { behaviorCycleTicks, cloneBehavior, cloneTemplate, primaryTemplate } from './chassis.js';

const SUPPORT_TRAITS = new Set<string>([
  'puffer-pouch', 'bat-ears', 'armadillo-greaves', 'monarch-brood',
]);

export function isSupportTrait(traitId: string): boolean {
  return SUPPORT_TRAITS.has(traitId);
}

function damageOf(template: CommandTemplate): number {
  const value = template.damage ?? template.amount ?? 0;
  return Number.isFinite(value) && value > 0 ? value : 8;
}

function reachOf(template: CommandTemplate): number {
  const value = template.range ?? template.radius ?? 90;
  return Number.isFinite(value) && value > 0 ? value : 90;
}

function appendFollowUp(
  behavior: BehaviorDefinition,
  followUp: BehaviorFollowUp,
): void {
  if (behavior.kind === 'multiPhase' && behavior.phases !== undefined && behavior.phases.length > 0) {
    const index = behavior.phases.length - 1;
    const phase = behavior.phases[index]!;
    behavior.phases = behavior.phases.map((candidate, candidateIndex) => {
      if (candidateIndex !== index) return candidate;
      return {
        ...phase,
        followUps: [...(phase.followUps ?? []), followUp].slice(0, 2),
      };
    });
    return;
  }
  behavior.followUps = [...(behavior.followUps ?? []), followUp].slice(0, 2);
}

function editPayload(
  behavior: BehaviorDefinition,
  edit: (template: CommandTemplate) => CommandTemplate,
): void {
  if (behavior.emit !== undefined) {
    behavior.emit = edit(behavior.emit);
    return;
  }
  if (behavior.phases === undefined || behavior.phases.length === 0) return;
  const payloadIndex = behavior.phases.length - 1;
  behavior.phases = behavior.phases.map((phase, index) => (
    index === payloadIndex ? { ...phase, emit: edit(phase.emit) } : phase
  ));
}

function asPreludeBehavior(
  behavior: BehaviorDefinition,
  preludes: readonly BehaviorPhase[],
): BehaviorDefinition {
  if (behavior.kind === 'movementTrail') {
    // Movement-gated Gecko remains movement-gated. The control action becomes
    // an ordered same-trigger deterministic graft rather than inventing a
    // second timer. These are explicitly *preludes*, not follow-ups: control
    // must land before the movement payload in this fixed-tick batch.
    behavior.preludes = [
      ...(behavior.preludes ?? []),
      ...preludes.map((prelude) => ({ emit: cloneTemplate(prelude.emit) })),
    ].slice(0, 2);
    return behavior;
  }
  const payload = primaryTemplate(behavior);
  const followUps = behavior.kind === 'multiPhase'
    ? behavior.phases?.[behavior.phases.length - 1]?.followUps
    : behavior.followUps;
  const totalPreludeTicks = preludes.reduce((total, phase) => total + phase.durationTicks, 0);
  const payloadDuration = Math.max(1, behaviorCycleTicks(behavior) - totalPreludeTicks);
  return {
    kind: 'multiPhase',
    periodTicks: 0,
    phases: [
      ...preludes.map((phase) => ({ ...phase, emit: cloneTemplate(phase.emit) })),
      {
        durationTicks: payloadDuration,
        emit: payload,
        ...(followUps === undefined ? {} : { followUps }),
      },
    ],
  };
}

function donorScale(donor: TraitDefinition): number {
  return isSupportTrait(donor.id) ? 1.5 : 1;
}

/** Add one donor's signature command shape to a cloned chassis behavior. */
export function graftDonor(
  chassisBehavior: BehaviorDefinition,
  donor: TraitDefinition,
): BehaviorDefinition {
  let behavior = cloneBehavior(chassisBehavior);
  const payload = primaryTemplate(behavior);
  const damage = damageOf(payload);
  const reach = reachOf(payload);
  const scale = donorScale(donor);

  switch (donor.id) {
    case 'porcupine-quills': {
      if (payload.kind === 'spawnProjectileBurst' || payload.kind === 'radialProjectileBurst') {
        editPayload(behavior, (template) => ({
          ...template,
          pierce: Math.min(255, (template.pierce ?? 0) + 3),
          tag: 'chimera-quills',
        }));
      } else {
        appendFollowUp(behavior, {
          emit: {
            kind: 'spawnProjectileBurst', targeting: 'nearest', count: 3,
            damage: rounded(damage * 0.4), speed: 10, spread: 0.35, pierce: 3, tag: 'chimera-quills',
          },
        });
      }
      break;
    }
    case 'puffer-pouch': {
      // Undertow Fan is the one projectile chassis paired with Puffer. A
      // compact, slowed fan prevents a fast sequence from exhausting the
      // bounded projectile pool with ten near-identical misses or tunnelling
      // through prey pulled directly beneath Greg, while keeping Owl's visible
      // fan delivery and Puffer's gather-first identity.
      if (payload.kind === 'spawnProjectileBurst') {
        editPayload(behavior, (template) => ({
          ...template,
          count: Math.min(4, Math.max(1, template.count ?? 4)),
          speed: Math.min(6, Math.max(1, template.speed ?? 6)),
          spread: rounded(Math.max(0.48, template.spread ?? 0)),
          tag: 'chimera-undertow-fan',
        }));
      }
      // Riptide Circuit's instant chain resolves best from a gentle draw, not
      // a full-strength pile directly under Greg. This keeps its visible
      // Undertow identity while avoiding saturated-target hit quantization.
      const undertowStrength = payload.kind === 'chainDamage' ? 1 : rounded(8 * scale);
      behavior = asPreludeBehavior(behavior, [
        { durationTicks: 10, emit: { kind: 'telegraph', targeting: 'none', radius: rounded(reach * 0.8), durationTicks: 10, tag: 'chimera-undertow' } },
        { durationTicks: 1, emit: { kind: 'areaGather', targeting: 'none', radius: rounded(reach * 0.8), strength: undertowStrength, tag: 'chimera-undertow' } },
      ]);
      break;
    }
    case 'electric-eel-coil':
      appendFollowUp(behavior, {
        emit: {
          kind: 'chainDamage', targeting: 'nearest', anchor: 'triggerTarget',
          damage: rounded(damage * 0.35 * scale), jumps: 4, range: rounded(reach * 1.1), tag: 'chimera-arc',
        },
      });
      break;
    case 'firefly-colony':
      appendFollowUp(behavior, {
        emit: {
          kind: 'orbitingDamage', targeting: 'none', count: 4, damage: rounded(damage * 0.3 * scale),
          speed: (Math.PI * 2) / 96, radius: rounded(Math.max(48, reach * 0.55)), range: 20, tag: 'chimera-satellite',
        },
      });
      break;
    case 'mantis-scythes':
      appendFollowUp(behavior, {
        emit: { kind: 'meleeArc', targeting: 'nearest', damage: rounded(damage * 0.5 * scale), arc: 2, range: rounded(reach * 0.9), tag: 'chimera-razor' },
      });
      break;
    case 'gecko-pads':
      appendFollowUp(behavior, {
        emit: {
          kind: 'spawnZone', targeting: 'none', anchor: 'triggerTarget', radius: rounded(Math.max(34, reach * 0.45)),
          amount: rounded(damage * 0.25 * scale), durationTicks: 100, intervalTicks: 15, tag: 'sticky-trail',
        },
      });
      break;
    case 'owl-pinions':
      if (payload.kind === 'spawnProjectileBurst' || payload.kind === 'radialProjectileBurst') {
        editPayload(behavior, (template) => ({
          ...template,
          count: Math.max(1, (template.count ?? 1) * 2),
          spread: rounded((template.spread ?? 0) + 0.35),
          tag: 'chimera-fan',
        }));
      } else {
        appendFollowUp(behavior, {
          emit: { kind: 'spawnProjectileBurst', targeting: 'nearest', count: 4, damage: rounded(damage * 0.4 * scale), speed: 10, spread: 0.45, tag: 'chimera-fan' },
        });
      }
      break;
    case 'bat-ears':
      editPayload(behavior, (template) => ({ ...template, targeting: 'marked', tag: template.tag ?? 'chimera-lock-on' }));
      behavior = asPreludeBehavior(behavior, [
        { durationTicks: 8, emit: { kind: 'markTargets', targeting: 'densestCluster', count: 6, radius: rounded(reach * 1.4), tag: 'chimera-lock-on' } },
      ]);
      break;
    case 'crab-pincers':
      appendFollowUp(behavior, {
        emit: {
          kind: 'applyAreaDamage', targeting: 'nearest', anchor: 'triggerTarget', radius: 60,
          damage: rounded(damage * 0.6 * scale), tag: 'chimera-impact',
        },
      });
      break;
    case 'armadillo-greaves':
      appendFollowUp(behavior, {
        emit: { kind: 'areaKnockback', targeting: 'none', radius: rounded(reach * 0.9), strength: rounded(10 * scale), tag: 'chimera-recoil' },
      });
      break;
    case 'skunk-brush':
      appendFollowUp(behavior, {
        emit: {
          kind: 'spawnZone', targeting: 'none', anchor: 'triggerTarget', radius: rounded(Math.max(42, reach * 0.5)),
          amount: rounded(damage * 0.25 * scale), durationTicks: 120, intervalTicks: 15, tag: 'stink-cloud',
        },
      });
      break;
    case 'monarch-brood':
      appendFollowUp(behavior, {
        emit: {
          kind: 'orbitingDamage', targeting: 'none', count: 2, damage: rounded(damage * 0.4 * scale),
          speed: (Math.PI * 2) / 150, radius: rounded(Math.max(72, reach * 0.75)), range: 16, facing: Math.PI / 4,
          tag: 'chimera-escort',
        },
      });
      break;
    default:
      break;
  }
  return behavior;
}
