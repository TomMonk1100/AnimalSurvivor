/**
 * Data-defined bridge between authored run-director archetypes and the
 * renderer-free simulation. Gameplay code consumes this table by authored id;
 * it must not grow another switch or parallel id list.
 *
 * The descriptive fields are deliberately explicit even where two entries
 * currently share a simulation primitive. That keeps behavior, reward, visual,
 * and spawn identity auditable before a future authored model or behavior is
 * added.
 */

import type { RunFormationView } from './run-director-port.js';

export const RUN_ENEMY_ROLE = Object.freeze({
  regular: 0,
  elite: 1,
  boss: 2,
  ranged: 3,
  charger: 4,
  denial: 5,
  flanker: 6,
  support: 7,
} as const);

export type RunEnemyRole = (typeof RUN_ENEMY_ROLE)[keyof typeof RUN_ENEMY_ROLE];
export type RunEnemyBehavior = 'approach' | 'weave' | 'brute' | 'ranged' | 'charger' | 'denial' | 'flanker' | 'support' | 'elite' | 'boss';
export type RunEnemyReward = 'standard' | 'elite' | 'boss';
export type RunEnemyVisual = 'regular' | 'elite' | 'boss' | 'ranged' | 'charger' | 'denial' | 'flanker' | 'support';

export interface RunEnemyContentDefinition {
  /** Stable id emitted by the run director. */
  readonly archetypeId: string;
  /** Index into SimConfig.archetypes. */
  readonly simulationArchetype: number;
  readonly behavior: RunEnemyBehavior;
  readonly reward: RunEnemyReward;
  /** Stable renderer role; the browser maps this to a pooled batch. */
  readonly visual: RunEnemyVisual;
  readonly role: RunEnemyRole;
  /** Spawn contract used by authored content and adapter diagnostics. */
  readonly spawn: {
    readonly formation: RunFormationView;
    readonly count: number;
  };
}

const CONTENT: readonly RunEnemyContentDefinition[] = [
  { archetypeId: 'enemy:fodder', simulationArchetype: 0, behavior: 'approach', reward: 'standard', visual: 'regular', role: RUN_ENEMY_ROLE.regular, spawn: { formation: 'arc', count: 4 } },
  { archetypeId: 'enemy:runner', simulationArchetype: 1, behavior: 'weave', reward: 'standard', visual: 'regular', role: RUN_ENEMY_ROLE.regular, spawn: { formation: 'lane', count: 3 } },
  { archetypeId: 'enemy:brute', simulationArchetype: 2, behavior: 'brute', reward: 'standard', visual: 'regular', role: RUN_ENEMY_ROLE.regular, spawn: { formation: 'ring', count: 1 } },
  { archetypeId: 'enemy:spitter', simulationArchetype: 3, behavior: 'ranged', reward: 'standard', visual: 'ranged', role: RUN_ENEMY_ROLE.ranged, spawn: { formation: 'arc', count: 1 } },
  { archetypeId: 'enemy:charger', simulationArchetype: 4, behavior: 'charger', reward: 'standard', visual: 'charger', role: RUN_ENEMY_ROLE.charger, spawn: { formation: 'lane', count: 1 } },
  { archetypeId: 'enemy:denial', simulationArchetype: 5, behavior: 'denial', reward: 'standard', visual: 'denial', role: RUN_ENEMY_ROLE.denial, spawn: { formation: 'cluster', count: 1 } },
  { archetypeId: 'enemy:flanker', simulationArchetype: 6, behavior: 'flanker', reward: 'standard', visual: 'flanker', role: RUN_ENEMY_ROLE.flanker, spawn: { formation: 'arc', count: 2 } },
  { archetypeId: 'enemy:support', simulationArchetype: 7, behavior: 'support', reward: 'standard', visual: 'support', role: RUN_ENEMY_ROLE.support, spawn: { formation: 'cluster', count: 1 } },
  { archetypeId: 'enemy:elite', simulationArchetype: 2, behavior: 'elite', reward: 'elite', visual: 'elite', role: RUN_ENEMY_ROLE.elite, spawn: { formation: 'arc', count: 1 } },
  { archetypeId: 'enemy:boss', simulationArchetype: 2, behavior: 'boss', reward: 'boss', visual: 'boss', role: RUN_ENEMY_ROLE.boss, spawn: { formation: 'ring', count: 1 } },
];

export const RUN_ENEMY_CONTENT: readonly RunEnemyContentDefinition[] = Object.freeze(
  CONTENT.map((entry) => Object.freeze({ ...entry, spawn: Object.freeze({ ...entry.spawn }) })),
);

const CONTENT_BY_ID = new Map(RUN_ENEMY_CONTENT.map((entry) => [entry.archetypeId, entry]));

export function runEnemyContentFor(archetypeId: string): RunEnemyContentDefinition | undefined {
  return CONTENT_BY_ID.get(archetypeId);
}

/**
 * Fail-fast validation for release/content gates. Keeping this independent of
 * a specific RunDefinition makes it usable by adapter tests and future biomes.
 */
export function validateRunEnemyContent(archetypeIds: readonly string[]): void {
  const seenIds = new Set<string>();
  const seenSimulationArchetypes = new Set<number>();
  for (const entry of RUN_ENEMY_CONTENT) {
    if (seenIds.has(entry.archetypeId)) throw new Error(`duplicate run enemy content id "${entry.archetypeId}"`);
    seenIds.add(entry.archetypeId);
    if (seenSimulationArchetypes.has(entry.simulationArchetype) && entry.reward !== 'elite' && entry.reward !== 'boss') {
      throw new Error(`duplicate simulation archetype ${entry.simulationArchetype} for standard run enemy content`);
    }
    seenSimulationArchetypes.add(entry.simulationArchetype);
    if (entry.spawn.count < 1) throw new Error(`run enemy content "${entry.archetypeId}" has invalid spawn count`);
    if (entry.reward === 'standard' && (entry.role === RUN_ENEMY_ROLE.elite || entry.role === RUN_ENEMY_ROLE.boss)) {
      throw new Error(`standard run enemy content "${entry.archetypeId}" cannot use elite/boss role`);
    }
  }
  for (const archetypeId of archetypeIds) {
    if (!seenIds.has(archetypeId)) throw new Error(`missing run enemy content for "${archetypeId}"`);
  }
}

validateRunEnemyContent(RUN_ENEMY_CONTENT.map((entry) => entry.archetypeId));
