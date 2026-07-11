/**
 * AGENT C — OWNED.
 *
 * Construction, phase lookup, and deep-clone helpers for the mutable
 * DirectorState. No wall-clock, no randomness beyond the frozen rng.js API,
 * no mutation of caller-provided RunDefinition.
 */

import type { DirectorState, PhaseDefinition, RunDefinition } from './contracts.js';
import { OPEN_END } from './contracts.js';
import { STATE_VERSION } from './ids.js';
import { createRng } from './rng.js';

/**
 * Bound on the delayed-wave FIFO. Chosen generously relative to authored hard
 * caps (max hardCap in the frozen content is 16) so legitimate catch-up bursts
 * are never starved, while still bounding worst-case memory/serialized size.
 */
const DEFAULT_MAX_DELAYED = 64;

/** Build a fresh DirectorState for `def` seeded with `seed`. Pure. */
export function createInitialState(def: RunDefinition, seed: number): DirectorState {
  return {
    version: STATE_VERSION,
    tick: -1,
    outcome: 'running',
    seq: 0,
    phase: 'opening',
    threat: {
      budget: def.threat.initialBudget,
      ticksSinceSpawn: 0,
    },
    spawn: {
      delayed: [],
      maxDelayed: DEFAULT_MAX_DELAYED,
      droppedWaves: 0,
    },
    boss: {
      warned: false,
      requested: false,
      alive: false,
      defeated: false,
    },
    overtime: {
      active: false,
      startedTick: -1,
      nextSupportTick: -1,
      wavesEmitted: 0,
    },
    rng: createRng(seed),
    firedBeats: [],
    firedWarnings: [],
    terminalEmitted: false,
    lastPhaseAnnounced: null,
  };
}

/**
 * Return the phase definition whose inclusive [startTick, endTick] range
 * contains `tick`. Overtime's endTick is the OPEN_END sentinel and matches
 * any tick >= its startTick. Throws for tick < 0 or if no phase matches
 * (malformed definition).
 */
export function phaseAt(def: RunDefinition, tick: number): PhaseDefinition {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new Error(`phaseAt: tick must be a non-negative integer, got ${tick}`);
  }
  for (const phase of def.phases) {
    if (phase.endTick === OPEN_END) {
      if (tick >= phase.startTick) return phase;
    } else if (tick >= phase.startTick && tick <= phase.endTick) {
      return phase;
    }
  }
  throw new Error(`phaseAt: no phase definition covers tick ${tick}`);
}

/**
 * Deep structural clone of a DirectorState. Result shares no references with
 * the input (arrays, nested objects, and the rng word tuple are all copied).
 */
export function cloneState(s: DirectorState): DirectorState {
  const rngWords: readonly [number, number, number, number] = s.rng.s;
  return {
    version: s.version,
    tick: s.tick,
    outcome: s.outcome,
    seq: s.seq,
    phase: s.phase,
    threat: {
      budget: s.threat.budget,
      ticksSinceSpawn: s.threat.ticksSinceSpawn,
    },
    spawn: {
      delayed: s.spawn.delayed.map((w) => ({ ...w })),
      maxDelayed: s.spawn.maxDelayed,
      droppedWaves: s.spawn.droppedWaves,
    },
    boss: { ...s.boss },
    overtime: { ...s.overtime },
    rng: { s: [rngWords[0], rngWords[1], rngWords[2], rngWords[3]] },
    firedBeats: [...s.firedBeats],
    firedWarnings: [...s.firedWarnings],
    terminalEmitted: s.terminalEmitted,
    lastPhaseAnnounced: s.lastPhaseAnnounced,
  };
}
