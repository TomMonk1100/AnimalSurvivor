/**
 * AGENT A — OWNED.
 *
 * Pure catalog validation. Returns a ValidationResult; never throws on invalid
 * content (throw only on programmer misuse). Each issue carries a stable code.
 *
 * Required rules (each must be exercisable by a failing fixture):
 *   - duplicateTraitId        : two traits share an id.
 *   - duplicateEvolutionId    : two evolutions share an id.
 *   - invalidSocket           : trait/evolution references a socket not in SOCKETS.
 *   - unknownIngredient       : evolution ingredient id has no trait definition.
 *   - selfPairedIngredient    : evolution ingredients are the same trait.
 *   - occupiedSocketMismatch  : evolution.occupiedSockets != union of ingredient sockets.
 *   - missingStage            : trait lacks bud or adapted stage.
 *   - nonFiniteParam          : any behavior numeric param is NaN/Infinity, or
 *                               periodTicks/durationTicks < required minimum,
 *                               or counts/damage negative where nonsensical.
 *   - emptyPhases             : multiPhase behavior has no phases, or a phase
 *                               has durationTicks < 1.
 *   - visualKeyCollision      : two definitions share a visualKey.
 *
 * The shipped CATALOG must validate with ok=true and zero issues.
 */

import type {
  BehaviorDefinition,
  Catalog,
  CommandTemplate,
  EvolutionDefinition,
  TraitDefinition,
  ValidationIssue,
  ValidationResult,
} from './contracts.js';
import { isSocketId, type OwnedStage, type TraitId } from './ids.js';

const OWNED_STAGES: readonly OwnedStage[] = ['bud', 'adapted'];

/** Fields whose values must be finite and >= 0 (they represent magnitudes/counts). */
const NON_NEGATIVE_FIELDS: readonly (keyof CommandTemplate)[] = [
  'count',
  'damage',
  'speed',
  'radius',
  'strength',
  'durationTicks',
  'jumps',
  'range',
  'amount',
];

/** Fields whose values may be any finite number (directions, positions, angles). */
const UNRESTRICTED_NUMERIC_FIELDS: readonly (keyof CommandTemplate)[] = [
  'originX',
  'originY',
  'dirX',
  'dirY',
  'arc',
  'facing',
  'spread',
];

const INTEGER_FIELDS: readonly (keyof CommandTemplate)[] = [
  'count',
  'durationTicks',
  'jumps',
];

function pushIssue(
  issues: ValidationIssue[],
  code: string,
  message: string,
  subjectId?: string,
): void {
  issues.push(subjectId === undefined ? { code, message } : { code, message, subjectId });
}

function validateTemplateNumbers(
  subjectId: string,
  template: CommandTemplate | undefined,
  issues: ValidationIssue[],
): void {
  if (!template) {
    return;
  }
  for (const field of NON_NEGATIVE_FIELDS) {
    const value = template[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      pushIssue(
        issues,
        'nonFiniteParam',
        `Command template field "${String(field)}" is not a finite number.`,
        subjectId,
      );
    } else if (value < 0) {
      pushIssue(
        issues,
        'nonFiniteParam',
        `Command template field "${String(field)}" must be >= 0.`,
        subjectId,
      );
    } else if (INTEGER_FIELDS.includes(field) && !Number.isInteger(value)) {
      pushIssue(
        issues,
        'nonIntegerParam',
        `Command template field "${String(field)}" must be an integer.`,
        subjectId,
      );
    }
  }
  for (const field of UNRESTRICTED_NUMERIC_FIELDS) {
    const value = template[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      pushIssue(
        issues,
        'nonFiniteParam',
        `Command template field "${String(field)}" is not a finite number.`,
        subjectId,
      );
    }
  }
}

function validateBehavior(
  subjectId: string,
  behavior: BehaviorDefinition,
  issues: ValidationIssue[],
): void {
  switch (behavior.kind) {
    case 'periodicBurst':
    case 'periodicPulse':
    case 'generic': {
      if (!Number.isFinite(behavior.periodTicks)) {
        pushIssue(
          issues,
          'nonFiniteParam',
          'periodTicks must be a finite number.',
          subjectId,
        );
      } else if (!Number.isInteger(behavior.periodTicks) || behavior.periodTicks < 1) {
        pushIssue(issues, 'nonFiniteParam', 'periodTicks must be >= 1.', subjectId);
      }
      validateTemplateNumbers(subjectId, behavior.emit, issues);
      break;
    }
    case 'multiPhase': {
      if (!behavior.phases || behavior.phases.length === 0) {
        pushIssue(
          issues,
          'emptyPhases',
          'multiPhase behavior must have at least one phase.',
          subjectId,
        );
      } else {
        for (let i = 0; i < behavior.phases.length; i++) {
          const phase = behavior.phases[i];
          if (!phase) {
            continue;
          }
          const phaseSubject = `${subjectId}[phase ${i}]`;
          if (!Number.isFinite(phase.durationTicks)) {
            pushIssue(
              issues,
              'nonFiniteParam',
              'phase durationTicks must be a finite number.',
              phaseSubject,
            );
          } else if (!Number.isInteger(phase.durationTicks) || phase.durationTicks < 1) {
            pushIssue(
              issues,
              'emptyPhases',
              'phase durationTicks must be >= 1.',
              phaseSubject,
            );
          }
          validateTemplateNumbers(phaseSubject, phase.emit, issues);
        }
      }
      break;
    }
  }
}

function socketSetEqual(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) {
    return false;
  }
  for (const value of setA) {
    if (!setB.has(value)) {
      return false;
    }
  }
  return true;
}

export function validateCatalog(_catalog: Catalog): ValidationResult {
  const issues: ValidationIssue[] = [];
  const visualKeyOwners: Map<string, string[]> = new Map();

  function recordVisualKey(key: string, owner: string): void {
    const owners = visualKeyOwners.get(key);
    if (owners) {
      owners.push(owner);
    } else {
      visualKeyOwners.set(key, [owner]);
    }
  }

  const traitMap: Map<TraitId, TraitDefinition> = new Map();
  const seenTraitIds: Set<TraitId> = new Set();

  for (const trait of _catalog.traits) {
    if (seenTraitIds.has(trait.id)) {
      pushIssue(issues, 'duplicateTraitId', `Duplicate trait id "${trait.id}".`, trait.id);
    } else {
      seenTraitIds.add(trait.id);
      traitMap.set(trait.id, trait);
    }

    for (const socket of trait.sockets) {
      if (!isSocketId(socket)) {
        pushIssue(
          issues,
          'invalidSocket',
          `Trait "${trait.id}" references invalid socket "${String(socket)}".`,
          trait.id,
        );
      }
    }

    for (const stageName of OWNED_STAGES) {
      const stage = trait.stages?.[stageName];
      if (!stage) {
        pushIssue(
          issues,
          'missingStage',
          `Trait "${trait.id}" is missing stage "${stageName}".`,
          trait.id,
        );
        continue;
      }
      recordVisualKey(stage.visualKey, `${trait.id}:${stageName}`);
      validateBehavior(`${trait.id}:${stageName}`, stage.behavior, issues);
    }
  }

  const seenEvolutionIds: Set<string> = new Set();

  for (const evolution of _catalog.evolutions) {
    if (seenEvolutionIds.has(evolution.id)) {
      pushIssue(
        issues,
        'duplicateEvolutionId',
        `Duplicate evolution id "${evolution.id}".`,
        evolution.id,
      );
    } else {
      seenEvolutionIds.add(evolution.id);
    }

    for (const socket of evolution.occupiedSockets) {
      if (!isSocketId(socket)) {
        pushIssue(
          issues,
          'invalidSocket',
          `Evolution "${evolution.id}" references invalid socket "${String(socket)}".`,
          evolution.id,
        );
      }
    }

    const [ingredientA, ingredientB] = evolution.ingredients;

    if (ingredientA === ingredientB) {
      pushIssue(
        issues,
        'selfPairedIngredient',
        `Evolution "${evolution.id}" has identical ingredients.`,
        evolution.id,
      );
    }

    const traitA = traitMap.get(ingredientA);
    const traitB = traitMap.get(ingredientB);

    if (!traitA) {
      pushIssue(
        issues,
        'unknownIngredient',
        `Evolution "${evolution.id}" references unknown ingredient trait "${ingredientA}".`,
        evolution.id,
      );
    }
    if (!traitB) {
      pushIssue(
        issues,
        'unknownIngredient',
        `Evolution "${evolution.id}" references unknown ingredient trait "${ingredientB}".`,
        evolution.id,
      );
    }

    if (traitA && traitB && ingredientA !== ingredientB) {
      const union = [...traitA.sockets, ...traitB.sockets];
      if (!socketSetEqual(union, evolution.occupiedSockets)) {
        pushIssue(
          issues,
          'occupiedSocketMismatch',
          `Evolution "${evolution.id}" occupiedSockets does not match union of ingredient sockets.`,
          evolution.id,
        );
      }
    }

    recordVisualKey(evolution.visualKey, evolution.id);
    validateBehavior(evolution.id, evolution.behavior, issues);
  }

  for (const [key, owners] of visualKeyOwners) {
    if (owners.length > 1) {
      pushIssue(
        issues,
        'visualKeyCollision',
        `Visual key "${key}" is shared by: ${owners.join(', ')}.`,
        key,
      );
    }
  }

  return { ok: issues.length === 0, issues };
}
