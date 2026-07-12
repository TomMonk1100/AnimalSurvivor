/**
 * AGENT A — OWNED.
 *
 * The authored first-run content for Greg. Frozen run facts (durations, phase
 * boundaries, boss entrance tick) come from ids.ts. Everything else here is
 * authored gameplay tuning for the vertical slice.
 */

import type {
  ArchetypeDefinition,
  BossDefinition,
  EliteBeatDefinition,
  LevelPressureConfig,
  PhaseDefinition,
  RunDefinition,
  ThreatConfig,
  WaveConfig,
} from '../contracts.js';
import { BOSS_ENTRANCE_TICK, CONTENT_VERSION, RUN_DURATION_TICKS } from '../ids.js';

/* ============================================================================
 * Phases — inclusive tick ranges, contiguous & non-overlapping.
 * ==========================================================================*/

const PHASES: readonly PhaseDefinition[] = [
  {
    id: 'opening',
    startTick: 0,
    endTick: 3_599,
    softCap: 10,
    hardCap: 18,
    threatPerTick: 2,
  },
  {
    id: 'pressure',
    startTick: 3_600,
    endTick: 10_799,
    softCap: 18,
    hardCap: 30,
    threatPerTick: 4,
  },
  {
    id: 'adaptation',
    startTick: 10_800,
    endTick: 17_999,
    softCap: 30,
    hardCap: 48,
    threatPerTick: 6,
  },
  {
    id: 'mutation',
    startTick: 18_000,
    endTick: 23_399,
    softCap: 46,
    hardCap: 72,
    threatPerTick: 8,
  },
  {
    id: 'boss',
    startTick: BOSS_ENTRANCE_TICK,
    endTick: 28_799,
    softCap: 36,
    hardCap: 56,
    threatPerTick: 3,
  },
];

/* ============================================================================
 * Archetypes
 * ==========================================================================*/

const ARCHETYPES: readonly ArchetypeDefinition[] = [
  {
    id: 'enemy:fodder',
    cost: 1,
    weight: 10,
    formation: 'arc',
    count: 4,
    minDistance: 38,
    maxDistance: 46,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:runner',
    cost: 2,
    weight: 6,
    formation: 'lane',
    count: 3,
    minDistance: 38,
    maxDistance: 46,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:brute',
    cost: 4,
    weight: 3,
    formation: 'ring',
    count: 1,
    minDistance: 40,
    maxDistance: 48,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:spitter',
    cost: 3,
    weight: 2,
    formation: 'arc',
    count: 1,
    minDistance: 38,
    maxDistance: 46,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:elite',
    cost: 8,
    weight: 1,
    formation: 'arc',
    count: 1,
    minDistance: 40,
    maxDistance: 48,
    elite: true,
    boss: false,
  },
  {
    id: 'enemy:boss',
    cost: 20,
    weight: 1,
    formation: 'ring',
    count: 1,
    minDistance: 20,
    maxDistance: 24,
    elite: false,
    boss: true,
  },
];

/* ============================================================================
 * Elite beats — increasingly frequent later in the run. Each remains a
 * one-shot, warned encounter so its reward and danger stay readable.
 * ==========================================================================*/

const ELITE_BEATS: readonly EliteBeatDefinition[] = [
  {
    id: 'elite:pressure-1',
    phaseId: 'pressure',
    warningTick: 6_900,
    requestTick: 7_200,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 40,
    maxDistance: 48,
  },
  {
    id: 'elite:adaptation-1',
    phaseId: 'adaptation',
    warningTick: 12_900,
    requestTick: 13_200,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 40,
    maxDistance: 48,
  },
  {
    id: 'elite:adaptation-2',
    phaseId: 'adaptation',
    warningTick: 15_900,
    requestTick: 16_200,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 40,
    maxDistance: 48,
  },
  {
    id: 'elite:mutation-1',
    phaseId: 'mutation',
    warningTick: 18_600,
    requestTick: 18_900,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 40,
    maxDistance: 48,
  },
  {
    id: 'elite:mutation-2',
    phaseId: 'mutation',
    warningTick: 20_400,
    requestTick: 20_700,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 40,
    maxDistance: 48,
  },
  {
    id: 'elite:mutation-3',
    phaseId: 'mutation',
    warningTick: 21_600,
    requestTick: 21_900,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 40,
    maxDistance: 48,
  },
];

/* ============================================================================
 * Boss
 * ==========================================================================*/

const BOSS: BossDefinition = {
  warningTick: 22_200,
  requestTick: BOSS_ENTRANCE_TICK,
  archetypeId: 'enemy:boss',
  formation: 'ring',
  // Ordinary waves approach from beyond the camera. The boss is deliberately
  // closer so its 6:30 entrance becomes a fight within a few seconds rather
  // than spending most of its short response period walking into range.
  minDistance: 20,
  maxDistance: 24,
};

/* ============================================================================
 * Threat and waves
 * ==========================================================================*/

const THREAT: ThreatConfig = {
  initialBudget: 0,
  maxBudget: 2_000,
};

// Levels 4, 6, and 8 earn bounded, visible pressure steps. Phase cadence makes
// the broad time ramp explicit; these player-level steps make a growing build
// invite more danger without allowing a same-tick burst.
const LEVEL_PRESSURE: LevelPressureConfig = {
  startLevel: 4,
  levelsPerStep: 2,
  maxSteps: 3,
  softCapPerStep: 1,
  hardCapPerStep: 2,
  intervalTicksReductionPerStep: 4,
};

const WAVES: WaveConfig = {
  intervalTicks: 75,
  phaseIntervalTicks: {
    opening: 75,
    pressure: 60,
    adaptation: 45,
    mutation: 30,
    boss: 36,
  },
  phaseArchetypes: {
    opening: ['enemy:fodder'],
    pressure: ['enemy:fodder', 'enemy:runner', 'enemy:spitter'],
    adaptation: ['enemy:fodder', 'enemy:runner', 'enemy:brute', 'enemy:spitter'],
    mutation: ['enemy:fodder', 'enemy:runner', 'enemy:brute', 'enemy:spitter'],
    boss: ['enemy:fodder'],
  },
};

/* ============================================================================
 * Complete run definition
 * ==========================================================================*/

export const GREG_FIRST_RUN: RunDefinition = {
  contentVersion: CONTENT_VERSION,
  mode: 'normal',
  durationTicks: RUN_DURATION_TICKS,
  phases: PHASES,
  archetypes: ARCHETYPES,
  eliteBeats: ELITE_BEATS,
  boss: BOSS,
  threat: THREAT,
  levelPressure: LEVEL_PRESSURE,
  waves: WAVES,
  eventBufferCapacity: 256,
  defaultSeed: 0x5eed,
};
