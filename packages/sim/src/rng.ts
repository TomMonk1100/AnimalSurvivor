/**
 * Deterministic PRNG. sfc32 core, seeded via splitmix32 expansion of a single
 * numeric seed into the four 32-bit lanes sfc32 requires.
 *
 * Invariants:
 *  - No ambient entropy sources (global random, wall clock, or timers). The
 *    entire sequence is a pure function of the seed and the number of draws
 *    taken.
 *  - getState()/setState() round-trip exactly: resuming from a snapshot must
 *    reproduce the same future sequence as never having stopped.
 */
import type { Rng, RngState } from './types.js';

/**
 * splitmix32: cheap, well-mixed generator used only to expand one seed number
 * into four independent-looking lanes for sfc32's initial state. Not used for
 * gameplay draws directly.
 */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    return z;
  };
}

/**
 * One sfc32 round (Chris Doty-Humphrey's small fast counter generator).
 * Mutates `s` in place and returns the next raw uint32 output. All arithmetic
 * is kept within 32-bit lanes via >>> 0 / | 0 to stay deterministic across
 * platforms (avoids drifting into JS's float64 domain).
 */
function sfc32Step(s: RngState): number {
  const a = s.a >>> 0;
  const b = s.b >>> 0;
  const c = s.c >>> 0;
  const d = s.d >>> 0;

  let t = (a + b) | 0;
  const newA = (b ^ (b >>> 9)) >>> 0;
  const newB = (c + (c << 3)) >>> 0;
  let newC = ((c << 21) | (c >>> 11)) >>> 0;
  const newD = (d + 1) >>> 0;
  t = (t + newD) >>> 0;
  newC = (newC + t) >>> 0;

  s.a = newA;
  s.b = newB;
  s.c = newC;
  s.d = newD;

  return t >>> 0;
}

class Sfc32Rng implements Rng {
  private state: RngState;

  constructor(seed: number) {
    const next = splitmix32(seed);
    this.state = { a: next(), b: next(), c: next(), d: next() };
    // sfc32 needs a short warm-up to fully mix a low-entropy seed before the
    // output is used; 12 rounds is the commonly cited minimum.
    for (let i = 0; i < 12; i++) sfc32Step(this.state);
  }

  nextUint32(): number {
    return sfc32Step(this.state);
  }

  float(): number {
    return this.nextUint32() / 4294967296;
  }

  int(minIncl: number, maxExcl: number): number {
    const range = maxExcl - minIncl;
    return minIncl + Math.floor(this.float() * range);
  }

  chance(p: number): boolean {
    const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
    // float() in [0,1): draw < 0 is never true, draw < 1 is always true, so
    // this exactly satisfies chance(0) === false and chance(1) === true.
    return this.float() < clamped;
  }

  pickIndex(length: number): number {
    return this.int(0, length);
  }

  pickWeighted(weights: readonly number[]): number {
    if (weights.length === 0) {
      throw new RangeError('pickWeighted: weights array is empty');
    }
    let total = 0;
    for (const w of weights) total += w;
    if (!(total > 0)) {
      throw new RangeError('pickWeighted: all weights are zero');
    }
    const draw = this.float() * total;
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i]!;
      if (draw < cumulative) return i;
    }
    // Floating-point edge case (draw landed exactly on the running total):
    // fall through to the last non-degenerate index rather than undefined.
    return weights.length - 1;
  }

  getState(): RngState {
    return { a: this.state.a, b: this.state.b, c: this.state.c, d: this.state.d };
  }

  setState(state: RngState): void {
    this.state = {
      a: state.a >>> 0,
      b: state.b >>> 0,
      c: state.c >>> 0,
      d: state.d >>> 0,
    };
  }
}

export function createRng(seed: number): Rng {
  return new Sfc32Rng(seed);
}
