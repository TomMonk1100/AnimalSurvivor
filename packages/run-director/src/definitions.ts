/**
 * AGENT A — OWNED.
 *
 * Pure, read-only accessors over an authored RunDefinition. No mutation of
 * inputs. The default definition is the frozen Greg first-run content.
 */

import type {
  ArchetypeDefinition,
  PhaseDefinition,
  RunDefinition,
} from './contracts.js';
import type { ArchetypeId, RunPhaseId } from './ids.js';
import { GREG_FIRST_RUN } from './content/greg-first-run.js';

/** Return the default authored run definition (Greg's first run). */
export function getDefaultDefinition(): RunDefinition {
  return GREG_FIRST_RUN;
}

/** Look up a phase definition by id. Throws if the phase is not present. */
export function phaseDefFor(def: RunDefinition, id: RunPhaseId): PhaseDefinition {
  const phase = def.phases.find((p) => p.id === id);
  if (!phase) {
    throw new Error(`phaseDefFor: no phase definition for id "${id}"`);
  }
  return phase;
}

/** Look up an archetype definition by id. Throws if the archetype is not present. */
export function archetypeDef(def: RunDefinition, id: ArchetypeId): ArchetypeDefinition {
  const archetype = def.archetypes.find((a) => a.id === id);
  if (!archetype) {
    throw new Error(`archetypeDef: no archetype definition for id "${id}"`);
  }
  return archetype;
}
