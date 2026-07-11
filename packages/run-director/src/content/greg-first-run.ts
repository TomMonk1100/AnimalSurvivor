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
  OvertimeConfig,
  PhaseDefinition,
  RunDefinition,
  ThreatConfig,
  WaveConfig,
} from '../contracts.js';
import { BOSS_ENTRANCE_TICK, CONTENT_VERSION, RUN_DURATION_TICKS } from '../ids.js';
import { OPEN_END } from '../contracts.js';

/* ============================================================================
 * Phases — inclusive tick ranges, contiguous & non-overlapping.
 * ==========================================================================*/

const PHASES: readonly PhaseDefinition[] = [
  {
    id: 'opening',
    startTick: 0,
    endTick: 7_199,
    softCap: 4,
    hardCap: 8,
    threatPerTick: 2,
  },
  {
    id: 'pressure',
    startTick: 7_200,
    endTick: 17_999,
    softCap: 6,
    hardCap: 12,
    threatPerTick: 4,
  },
  {
    id: 'adaptation',
    startTick: 18_000,
    endTick: 28_799,
    softCap: 8,
    hardCap: 14,
    threatPerTick: 6,
  },
  {
    id: 'mutation',
    startTick: 28_800,
    endTick: 39_599,
    softCap: 10,
    hardCap: 16,
    threatPerTick: 8,
  },
  {
    id: 'boss',
    startTick: 39_600,
    endTick: 43_199,
    softCap: 6,
    hardCap: 10,
    threatPerTick: 3,
  },
  {
    id: 'overtime',
    startTick: 43_200,
    endTick: OPEN_END,
    softCap: 6,
    hardCap: 10,
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
    formation: 'cluster',
    count: 3,
    minDistance: 5,
    maxDistance: 15,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:runner',
    cost: 2,
    weight: 6,
    formation: 'lane',
    count: 2,
    minDistance: 8,
    maxDistance: 18,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:brute',
    cost: 4,
    weight: 3,
    formation: 'ring',
    count: 1,
    minDistance: 10,
    maxDistance: 20,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:elite',
    cost: 8,
    weight: 1,
    formation: 'arc',
    count: 1,
    minDistance: 10,
    maxDistance: 20,
    elite: true,
    boss: false,
  },
  {
    id: 'enemy:boss',
    cost: 20,
    weight: 1,
    formation: 'ring',
    count: 1,
    minDistance: 15,
    maxDistance: 25,
    elite: false,
    boss: true,
  },
];

/* ============================================================================
 * Elite beats — exactly one per pressure/adaptation/mutation.
 * ==========================================================================*/

const ELITE_BEATS: readonly EliteBeatDefinition[] = [
  {
    id: 'elite:pressure-1',
    phaseId: 'pressure',
    warningTick: 11_700,
    requestTick: 12_000,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 10,
    maxDistance: 20,
  },
  {
    id: 'elite:adaptation-1',
    phaseId: 'adaptation',
    warningTick: 23_700,
    requestTick: 24_000,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 10,
    maxDistance: 20,
  },
  {
    id: 'elite:mutation-1',
    phaseId: 'mutation',
    warningTick: 35_700,
    requestTick: 36_000,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 10,
    maxDistance: 20,
  },
];

/* ============================================================================
 * Boss
 * ==========================================================================*/

const BOSS: BossDefinition = {
  warningTick: 38_400,
  requestTick: BOSS_ENTRANCE_TICK,
  archetypeId: 'enemy:boss',
  formation: 'ring',
  minDistance: 15,
  maxDistance: 25,
};

/* ============================================================================
 * Threat, waves, overtime
 * ==========================================================================*/

const THREAT: ThreatConfig = {
  initialBudget: 0,
  maxBudget: 2_000,
};

const WAVES: WaveConfig = {
  intervalTicks: 120,
  phaseArchetypes: {
    opening: ['enemy:fodder'],
    pressure: ['enemy:fodder', 'enemy:runner'],
    adaptation: ['enemy:fodder', 'enemy:runner', 'enemy:brute'],
    mutation: ['enemy:fodder', 'enemy:runner', 'enemy:brute'],
    boss: ['enemy:fodder'],
    overtime: ['enemy:fodder'],
  },
};

const OVERTIME: OvertimeConfig = {
  supportIntervalTicks: 300,
  archetypeId: 'enemy:fodder',
  count: 2,
  formation: 'cluster',
  minDistance: 5,
  maxDistance: 15,
  maxSupportWaves: 40,
};

/* ============================================================================
 * Complete run definition
 * ==========================================================================*/

export const GREG_FIRST_RUN: RunDefinition = {
  contentVersion: CONTENT_VERSION,
  durationTicks: RUN_DURATION_TICKS,
  phases: PHASES,
  archetypes: ARCHETYPES,
  eliteBeats: ELITE_BEATS,
  boss: BOSS,
  threat: THREAT,
  waves: WAVES,
  overtime: OVERTIME,
  eventBufferCapacity: 256,
  defaultSeed: 0x5eed,
};
