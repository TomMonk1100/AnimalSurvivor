/**
 * Saltwind Ruins is the second V1 biome foundation. It keeps the frozen
 * eight-minute objective contract but changes the encounter grammar: flankers
 * arrive earlier, support threats enter before the boss, and the boss phase
 * favors denial/support pressure instead of a fodder-heavy swarm.
 *
 * The simulation remains responsible for physics and damage. This file only
 * authors a deterministic run-definition variant for the shared director.
 */
import type { RunDefinition, WaveConfig } from '../contracts.js';
import { GREG_FIRST_RUN } from './greg-first-run.js';

const SALTWIND_WAVES: WaveConfig = Object.freeze({
  ...GREG_FIRST_RUN.waves,
  phaseIntervalTicks: Object.freeze({
    opening: 68,
    pressure: 52,
    adaptation: 40,
    mutation: 26,
    boss: 32,
  }),
  phaseArchetypes: Object.freeze({
    opening: ['enemy:runner', 'enemy:flanker'] as const,
    pressure: ['enemy:runner', 'enemy:spitter', 'enemy:flanker'] as const,
    adaptation: ['enemy:brute', 'enemy:spitter', 'enemy:denial', 'enemy:flanker'] as const,
    mutation: ['enemy:brute', 'enemy:charger', 'enemy:denial', 'enemy:flanker', 'enemy:support'] as const,
    boss: ['enemy:denial', 'enemy:flanker', 'enemy:support'] as const,
  }),
});

export const SALTWIND_RUINS_RUN: RunDefinition = Object.freeze({
  ...GREG_FIRST_RUN,
  contentVersion: GREG_FIRST_RUN.contentVersion + 1,
  waves: SALTWIND_WAVES,
  defaultSeed: 0x5a17,
});
