/**
 * AGENT B — OWNED.
 *
 * Integer-only threat budget accrual/spend. No floats, no per-tick loops for
 * catch-up accrual (pure arithmetic scaled by `ticks`). Threat is a simple
 * spendable pool clamped to `ThreatConfig.maxBudget`.
 */

import type { ThreatConfig, ThreatState, PhaseDefinition } from './contracts.js';

/**
 * Accrue threat for `ticks` ticks in one arithmetic step (no per-tick loop, so
 * catch-up over many ticks is O(1)). Mutates `threat` in place:
 *   - budget += phase.threatPerTick * ticks, then clamped to [*, config.maxBudget]
 *     (budget is never negative going in, so the effective floor is 0).
 *   - ticksSinceSpawn += ticks.
 *
 * `ticks` must be a non-negative integer; accruing 0 ticks is a no-op aside
 * from ticksSinceSpawn being unchanged (adding 0).
 */
export function accrueThreat(
  threat: ThreatState,
  phase: PhaseDefinition,
  config: ThreatConfig,
  ticks: number,
): void {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new RangeError(`accrueThreat: ticks must be a non-negative integer, got ${ticks}`);
  }
  threat.budget += phase.threatPerTick * ticks;
  if (threat.budget > config.maxBudget) {
    threat.budget = config.maxBudget;
  }
  threat.ticksSinceSpawn += ticks;
}

/** True if `threat` currently holds at least `cost` spendable units. */
export function canAfford(threat: ThreatState, cost: number): boolean {
  return threat.budget >= cost;
}

/** Spend `cost` units. Throws if the budget cannot cover it (caller must canAfford() first). */
export function spend(threat: ThreatState, cost: number): void {
  if (threat.budget < cost) {
    throw new Error(`spend: insufficient threat budget (have ${threat.budget}, need ${cost})`);
  }
  threat.budget -= cost;
}
