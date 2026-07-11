import type { InputSource, TickInput } from '../contracts';

/**
 * Deterministic stress-test `InputSource`.
 *
 * `sample(tick, paused)` is a PURE function of `tick` alone -- never
 * wall-clock time, never `Math.random` (disallowed by lint anyway). The same
 * tick always produces the exact same movement vector, regardless of call
 * order, how many times it's sampled, or which `createAutopilot()` instance
 * is asked (the factory holds no mutable state).
 *
 * The pattern combines two differently-phased sine waves with a slow,
 * step-wise directional drift (stepped every 180 ticks via `Math.floor`) so
 * the resulting path roams broadly across the arena instead of tracing a
 * tight fixed loop, while every component stays within [-1, 1].
 */

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

const TWO_PI = Math.PI * 2;
const DRIFT_STEP_TICKS = 180;
const DRIFT_STEP_ANGLE = TWO_PI / 6;

function wave(tick: number, period: number, phase: number): number {
  return Math.sin((tick / period) * TWO_PI + phase);
}

export function createAutopilot(): InputSource {
  return {
    sample(tick: number, paused: boolean): TickInput {
      const driftPhase = Math.floor(tick / DRIFT_STEP_TICKS) * DRIFT_STEP_ANGLE;
      const slow = wave(tick, 240, 0);
      const fast = wave(tick, 97, Math.PI / 3);
      const moveX = clamp(slow * 0.7 + Math.sin(driftPhase) * 0.3, -1, 1);
      const moveY = clamp(fast * 0.7 + Math.cos(driftPhase) * 0.3, -1, 1);
      return { moveX, moveY, paused };
    },
    clear(): void {
      // Stateless: nothing latched to clear.
    },
    dispose(): void {
      // Stateless: nothing to release.
    },
  };
}
