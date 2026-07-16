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
    endTick: 2_699,
    softCap: 12,
    hardCap: 20,
    threatPerTick: 3,
  },
  {
    id: 'pressure',
    startTick: 2_700,
    endTick: 8_099,
    softCap: 22,
    hardCap: 36,
    threatPerTick: 5,
  },
  {
    id: 'adaptation',
    startTick: 8_100,
    endTick: 13_499,
    softCap: 32,
    hardCap: 50,
    threatPerTick: 7,
  },
  {
    id: 'mutation',
    startTick: 13_500,
    endTick: 17_099,
    softCap: 44,
    hardCap: 66,
    threatPerTick: 10,
  },
  {
    id: 'boss',
    startTick: BOSS_ENTRANCE_TICK,
    endTick: RUN_DURATION_TICKS - 1,
    softCap: 34,
    hardCap: 54,
    threatPerTick: 5,
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
    // At the adapter's authored 20x scale this reaches Greg in roughly
    // 7–9 seconds, making the first movement decision land inside the opening.
    minDistance: 20,
    maxDistance: 24,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:runner',
    cost: 2,
    weight: 6,
    formation: 'lane',
    count: 3,
    minDistance: 32,
    maxDistance: 38,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:brute',
    cost: 4,
    weight: 3,
    formation: 'ring',
    count: 1,
    minDistance: 32,
    maxDistance: 40,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:spitter',
    cost: 3,
    weight: 2,
    formation: 'arc',
    count: 1,
    minDistance: 32,
    maxDistance: 40,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:charger',
    cost: 5,
    weight: 2,
    formation: 'lane',
    count: 1,
    minDistance: 34,
    maxDistance: 42,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:denial',
    cost: 5,
    weight: 1,
    formation: 'cluster',
    count: 1,
    minDistance: 32,
    maxDistance: 38,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:flanker',
    cost: 4,
    weight: 1,
    formation: 'arc',
    count: 2,
    minDistance: 34,
    maxDistance: 42,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:support',
    cost: 5,
    weight: 1,
    formation: 'cluster',
    count: 1,
    minDistance: 36,
    maxDistance: 44,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:elite',
    cost: 8,
    weight: 1,
    formation: 'arc',
    count: 1,
    minDistance: 30,
    maxDistance: 36,
    elite: true,
    boss: false,
  },
  {
    id: 'enemy:boss',
    cost: 20,
    weight: 1,
    formation: 'ring',
    count: 1,
    minDistance: 16,
    maxDistance: 20,
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
    warningTick: 3_900,
    requestTick: 4_200,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 30,
    maxDistance: 36,
  },
  {
    id: 'elite:adaptation-1',
    phaseId: 'adaptation',
    warningTick: 8_400,
    requestTick: 8_700,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 30,
    maxDistance: 36,
  },
  {
    id: 'elite:adaptation-2',
    phaseId: 'adaptation',
    warningTick: 11_400,
    requestTick: 11_700,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 30,
    maxDistance: 36,
  },
  {
    id: 'elite:mutation-1',
    phaseId: 'mutation',
    warningTick: 13_800,
    requestTick: 14_100,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 30,
    maxDistance: 36,
  },
  {
    id: 'elite:mutation-2',
    phaseId: 'mutation',
    warningTick: 15_000,
    requestTick: 15_300,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 30,
    maxDistance: 36,
  },
  {
    id: 'elite:mutation-3',
    phaseId: 'mutation',
    warningTick: 16_200,
    requestTick: 16_500,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 30,
    maxDistance: 36,
  },
];

/* ============================================================================
 * Boss
 * ==========================================================================*/

const BOSS: BossDefinition = {
  warningTick: 15_900,
  requestTick: BOSS_ENTRANCE_TICK,
  archetypeId: 'enemy:boss',
  formation: 'ring',
  // Ordinary waves approach from beyond the camera. The apex enters within
  // the weapon band so the 75-second finale starts as a fight, not a walk-in.
  minDistance: 16,
  maxDistance: 20,
  profile: {
    // This calibration keeps the deterministic strong full-build policy in
    // the intended 45–65 second finale duration without changing any global
    // player or generic-enemy stats. The profile id changes with the authored
    // encounter tuning and is part of the content fingerprint.
    id: 'forest-final-threat-v3',
    hpMultiplier: 56,
    xpMultiplier: 1,
    speedMultiplier: 1.8,
    touchDamageMultiplier: 1.25,
    preferredRange: 250,
    rangeBand: 45,
    cycleTicks: 270,
    chargeWindupTicks: 30,
    chargeDurationTicks: 48,
    chargeSpeedMultiplier: 3.1,
    volleyTick: 135,
    volleyCount: 10,
    projectileSpeed: 250,
    projectileDamage: 12,
    projectileLifetimeTicks: 180,
    projectileHitRadius: 8,
  },
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
    opening: 60,
    pressure: 42,
    adaptation: 32,
    mutation: 24,
    boss: 28,
  },
  phaseArchetypes: {
    opening: ['enemy:fodder'],
    pressure: ['enemy:fodder', 'enemy:runner', 'enemy:spitter'],
    adaptation: ['enemy:fodder', 'enemy:runner', 'enemy:brute', 'enemy:spitter', 'enemy:charger', 'enemy:flanker'],
    mutation: ['enemy:fodder', 'enemy:runner', 'enemy:brute', 'enemy:spitter', 'enemy:charger', 'enemy:denial', 'enemy:flanker', 'enemy:support'],
    boss: ['enemy:fodder', 'enemy:runner', 'enemy:charger', 'enemy:denial', 'enemy:flanker', 'enemy:support'],
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
