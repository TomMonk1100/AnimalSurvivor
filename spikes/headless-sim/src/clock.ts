/**
 * Fixed-step simulation clock. Deliberately trivial: tick is an integer
 * counter, dt is the fixed per-tick duration derived from hz. No wall-clock
 * reads of any kind — the sim is stepped externally, one tick per advance()
 * call, so this stays fully deterministic.
 */
import type { Clock } from './types.js';

class FixedClock implements Clock {
  readonly dt: number;
  private currentTick: number;

  constructor(hz: number) {
    if (!Number.isFinite(hz) || hz <= 0) {
      throw new RangeError(`createClock: hz must be finite and > 0 (received ${hz})`);
    }
    this.dt = 1 / hz;
    this.currentTick = 0;
  }

  get tick(): number {
    return this.currentTick;
  }

  advance(): void {
    this.currentTick += 1;
  }

  reset(): void {
    this.currentTick = 0;
  }
}

export function createClock(hz: number): Clock {
  return new FixedClock(hz);
}
