/**
 * Read-only rank-impact metadata derived from the executable trait catalog.
 *
 * This module does not apply an upgrade, mutate runtime state, or know about
 * browser UI. It gives presentation a truthful way to explain the exact rank
 * offer already selected by the deterministic trait runtime.
 */
import type { BehaviorDefinition, CommandTemplate } from './contracts.js';
import { getTrait } from './definitions.js';
import type { TraitId, TraitRank } from './ids.js';
import { rankStageFor } from './rank-progression.js';

export type TraitUpgradeImpactCategory =
  | 'Direct damage'
  | 'Crowd control'
  | 'Targeting'
  | 'Defense'
  | 'Economy / utility';

export interface TraitUpgradeImpact {
  readonly traitId: string;
  readonly currentRank: number;
  readonly nextRank: TraitRank;
  readonly rankTransition: string;
  readonly category: TraitUpgradeImpactCategory;
  readonly directDamage: boolean;
  /** Exact target-rank behavior fields from executable catalog content. */
  readonly summary: string;
  /** Exact field changes from the preceding rank, or an unlock summary. */
  readonly delta: string;
}

interface BehaviorProfile {
  readonly periodTicks: number;
  readonly distanceMilliunits: number | null;
  readonly templates: readonly CommandTemplate[];
}

const DIRECT_DAMAGE_KINDS = new Set([
  'spawnProjectileBurst',
  'radialProjectileBurst',
  'orbitingDamage',
  'applyAreaDamage',
  'spawnZone',
  'chainDamage',
  'meleeArc',
]);
const CROWD_CONTROL_KINDS = new Set(['areaGather', 'areaKnockback']);
const TARGETING_KINDS = new Set(['markTargets']);
const DEFENSE_KINDS = new Set(['grantShield']);

function profile(behavior: BehaviorDefinition): BehaviorProfile {
  const templates = behavior.emit === undefined
    ? (behavior.phases?.map((phase) => phase.emit) ?? [])
    : [behavior.emit];
  return {
    periodTicks: behavior.periodTicks,
    distanceMilliunits: behavior.distanceMilliunits ?? null,
    templates,
  };
}

function categoryFor(behavior: BehaviorProfile): TraitUpgradeImpactCategory {
  const kinds = behavior.templates.map((template) => template.kind);
  if (kinds.some((kind) => DIRECT_DAMAGE_KINDS.has(kind))) return 'Direct damage';
  if (kinds.some((kind) => CROWD_CONTROL_KINDS.has(kind))) return 'Crowd control';
  if (kinds.some((kind) => TARGETING_KINDS.has(kind))) return 'Targeting';
  if (kinds.some((kind) => DEFENSE_KINDS.has(kind))) return 'Defense';
  return 'Economy / utility';
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function readableDistance(milliunits: number): string {
  return formatNumber(milliunits / 1_000);
}

function firstTemplate(profileValue: BehaviorProfile): CommandTemplate | undefined {
  return profileValue.templates.find((template) => DIRECT_DAMAGE_KINDS.has(template.kind))
    ?? profileValue.templates[0];
}

function fieldsFor(profileValue: BehaviorProfile): readonly string[] {
  const template = firstTemplate(profileValue);
  if (template === undefined) return [];
  const fields: string[] = [];
  if (template.damage !== undefined) fields.push(`damage ${formatNumber(template.damage)}`);
  else if (template.amount !== undefined && DIRECT_DAMAGE_KINDS.has(template.kind)) fields.push(`damage ${formatNumber(template.amount)}`);
  if (template.count !== undefined && template.count > 0) fields.push(`count ${formatNumber(template.count)}`);
  if (template.jumps !== undefined && template.jumps > 0) fields.push(`chains ${formatNumber(template.jumps)}`);
  if (template.pierce !== undefined && template.pierce > 0) fields.push(`pierce ${formatNumber(template.pierce)}`);
  if (template.radius !== undefined && template.radius > 0) fields.push(`radius ${formatNumber(template.radius)}`);
  if (template.range !== undefined && template.range > 0) fields.push(`range ${formatNumber(template.range)}`);
  if (template.strength !== undefined && template.strength > 0) fields.push(`force ${formatNumber(template.strength)}`);
  if (template.durationTicks !== undefined && template.durationTicks > 0) fields.push(`duration ${formatNumber(template.durationTicks)} ticks`);
  if (template.intervalTicks !== undefined && template.intervalTicks > 0) fields.push(`pulse ${formatNumber(template.intervalTicks)} ticks`);
  return fields;
}

function compareField(
  label: string,
  before: number | undefined,
  after: number | undefined,
  changes: string[],
): void {
  if (before === after || (before === undefined && after === undefined)) return;
  if (before === undefined) {
    changes.push(`${label} unlocked: ${formatNumber(after!)}`);
    return;
  }
  if (after === undefined) {
    changes.push(`${label} removed`);
    return;
  }
  changes.push(`${label} ${formatNumber(before)} → ${formatNumber(after)}`);
}

function deltaFor(before: BehaviorProfile | null, after: BehaviorProfile, category: TraitUpgradeImpactCategory): string {
  const target = firstTemplate(after);
  if (before === null) {
    const fields = fieldsFor(after);
    const cadence = after.distanceMilliunits === null
      ? after.periodTicks > 0 ? `every ${after.periodTicks} ticks` : 'multi-phase cycle'
      : `after travelling ${readableDistance(after.distanceMilliunits)} units`;
    const directPrefix = category === 'Direct damage' ? 'Direct damage unlock' : `${category} unlock — no direct damage`;
    return `${directPrefix}: ${fields.length === 0 ? cadence : `${fields.join(', ')}; ${cadence}`}.`;
  }

  const previous = firstTemplate(before);
  const changes: string[] = [];
  if (before.distanceMilliunits !== after.distanceMilliunits) {
    if (before.distanceMilliunits === null || after.distanceMilliunits === null) {
      changes.push(after.distanceMilliunits === null
        ? `cadence ${before.periodTicks} ticks`
        : `placement ${readableDistance(after.distanceMilliunits)} units`);
    } else {
      changes.push(`placement ${readableDistance(before.distanceMilliunits)} → ${readableDistance(after.distanceMilliunits)} units`);
    }
  } else if (before.periodTicks !== after.periodTicks) {
    changes.push(`cadence ${before.periodTicks} → ${after.periodTicks} ticks`);
  }
  compareField('damage', previous?.damage ?? (DIRECT_DAMAGE_KINDS.has(previous?.kind ?? '') ? previous?.amount : undefined), target?.damage ?? (DIRECT_DAMAGE_KINDS.has(target?.kind ?? '') ? target?.amount : undefined), changes);
  compareField('count', previous?.count, target?.count, changes);
  compareField('chains', previous?.jumps, target?.jumps, changes);
  compareField('pierce', previous?.pierce, target?.pierce, changes);
  compareField('radius', previous?.radius, target?.radius, changes);
  compareField('range', previous?.range, target?.range, changes);
  compareField('force', previous?.strength, target?.strength, changes);
  compareField('duration', previous?.durationTicks, target?.durationTicks, changes);
  compareField('pulse', previous?.intervalTicks, target?.intervalTicks, changes);
  if (changes.length === 0) {
    return category === 'Direct damage'
      ? 'Direct-damage behavior is unchanged at this rank.'
      : `${category} behavior is unchanged at this rank; no direct damage is added.`;
  }
  const prefix = category === 'Direct damage' ? 'Direct damage' : `${category} — no direct damage`;
  return `${prefix}: ${changes.join('; ')}.`;
}

/**
 * Return an exact rank transition for a known trait, or `undefined` for an
 * unknown/legacy offer. Callers can then retain a conservative legacy label.
 */
export function describeTraitUpgradeImpact(
  traitId: string,
  nextRank: TraitRank | number,
): TraitUpgradeImpact | undefined {
  if (!Number.isSafeInteger(nextRank) || nextRank < 1 || nextRank > 5) return undefined;
  const trait = getTrait(traitId as TraitId);
  if (trait === undefined) return undefined;
  const rank = nextRank as TraitRank;
  const after = profile(rankStageFor(trait, rank).behavior);
  const before = rank === 1 ? null : profile(rankStageFor(trait, (rank - 1) as TraitRank).behavior);
  const category = categoryFor(after);
  const targetFields = fieldsFor(after);
  const cadence = after.distanceMilliunits === null
    ? after.periodTicks > 0 ? `every ${after.periodTicks} ticks` : 'multi-phase cycle'
    : `after travelling ${readableDistance(after.distanceMilliunits)} units`;
  const summaryPrefix = category === 'Direct damage' ? 'Direct damage' : `${category} — no direct damage`;
  return Object.freeze({
    traitId,
    currentRank: rank - 1,
    nextRank: rank,
    rankTransition: `Rank ${rank - 1} → ${rank}`,
    category,
    directDamage: category === 'Direct damage',
    summary: `${summaryPrefix}: ${targetFields.length === 0 ? cadence : `${targetFields.join(', ')}; ${cadence}`}.`,
    delta: deltaFor(before, after, category),
  });
}
