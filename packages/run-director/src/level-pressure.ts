import type { LevelPressureConfig, PhaseDefinition } from './contracts.js';

export interface ResolvedLiveEnemyCaps {
  readonly softCap: number;
  readonly hardCap: number;
  readonly levelSteps: number;
}

/** Resolves the bounded number of earned level-pressure steps. */
export function resolveLevelPressureSteps(
  levelPressure: LevelPressureConfig | undefined,
  playerLevel: number,
): number {
  if (!Number.isSafeInteger(playerLevel) || playerLevel < 1) {
    throw new RangeError(`playerLevel must be a positive safe integer, got ${playerLevel}`);
  }
  if (levelPressure === undefined || playerLevel < levelPressure.startLevel) return 0;
  const uncappedSteps = Math.floor((playerLevel - levelPressure.startLevel) / levelPressure.levelsPerStep) + 1;
  return Math.min(levelPressure.maxSteps, uncappedSteps);
}

/**
 * Resolves an authored level-pressure rule without mutating content or state.
 * A missing rule keeps the phase's authored caps exactly unchanged.
 */
export function resolveLiveEnemyCaps(
  phase: PhaseDefinition,
  levelPressure: LevelPressureConfig | undefined,
  playerLevel: number,
): ResolvedLiveEnemyCaps {
  const levelSteps = resolveLevelPressureSteps(levelPressure, playerLevel);
  if (levelPressure === undefined) {
    return { softCap: phase.softCap, hardCap: phase.hardCap, levelSteps: 0 };
  }
  return {
    softCap: phase.softCap + levelSteps * levelPressure.softCapPerStep,
    hardCap: phase.hardCap + levelSteps * levelPressure.hardCapPerStep,
    levelSteps,
  };
}

/**
 * Resolves a wave cadence without changing the scheduler's one-decision-per-
 * tick policy. Validation guarantees the returned interval is always >= 1.
 */
export function resolveDiscretionaryWaveInterval(
  baseIntervalTicks: number,
  levelPressure: LevelPressureConfig | undefined,
  playerLevel: number,
): number {
  if (!Number.isSafeInteger(baseIntervalTicks) || baseIntervalTicks < 1) {
    throw new RangeError(`baseIntervalTicks must be a positive safe integer, got ${baseIntervalTicks}`);
  }
  if (levelPressure === undefined) {
    // Still validate metric input so the scheduler has one consistent boundary.
    resolveLevelPressureSteps(levelPressure, playerLevel);
    return baseIntervalTicks;
  }
  const intervalTicks = baseIntervalTicks
    - resolveLevelPressureSteps(levelPressure, playerLevel) * levelPressure.intervalTicksReductionPerStep;
  if (intervalTicks < 1) {
    throw new RangeError(
      `levelPressure resolves discretionary wave interval below 1 tick, got ${intervalTicks}`,
    );
  }
  return intervalTicks;
}
