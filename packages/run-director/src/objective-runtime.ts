/**
 * AGENT C — OWNED.
 *
 * Pure outcome evaluation. No mutation of `state` or `metrics`. The
 * orchestrator (outside this package's owned files) is responsible for
 * applying the returned outcome to state and emitting the terminal event
 * exactly once, guarded by state.terminalEmitted.
 */

import type { DirectorState, OutcomeEvaluation, RunMetrics } from './contracts.js';

/**
 * Evaluate the run outcome for the current tick.
 *
 * Precedence rules:
 *  - Terminal outcomes are sticky: once state.outcome !== 'running', it never
 *    changes, and no further terminal event is signalled here (the caller's
 *    terminalEmitted guard handles single-emission bookkeeping).
 *  - Same-tick precedence: DEFEAT WINS over any simultaneous victory signal.
 *  - Victory requires the boss to have already been requested this run; a
 *    bossDefeatedThisTick signal without boss.requested is invalid and
 *    ignored (treated as still running).
 */
export function evaluateOutcome(
  state: DirectorState,
  metrics: RunMetrics,
  normalDeadlineTick: number | null = null,
): OutcomeEvaluation {
  if (state.outcome !== 'running') {
    return { outcome: state.outcome, terminalKind: null };
  }

  if (metrics.playerAlive === false) {
    return { outcome: 'defeat', terminalKind: 'defeat' };
  }

  if (
    state.boss.requested === true
    && metrics.bossDefeatedThisTick === true
    && (normalDeadlineTick === null || metrics.tick <= normalDeadlineTick)
  ) {
    return { outcome: 'victory', terminalKind: 'victory' };
  }

  if (normalDeadlineTick !== null && metrics.tick >= normalDeadlineTick) {
    return { outcome: 'defeat', terminalKind: 'defeat' };
  }

  return { outcome: 'running', terminalKind: null };
}
