/**
 * LEAD-OWNED — FROZEN.
 *
 * Deterministic seeded RNG (mulberry32). Single uint32 of state so it
 * serializes trivially and reproduces byte-identically across runs. Uses only
 * pure integer arithmetic; no ambient entropy source, no wall clock.
 */

import type { SeededRng } from './contracts.js';

const U32 = 0xffffffff;

export class Mulberry32 implements SeededRng {
  private s: number;

  constructor(seed: number) {
    // Force to uint32.
    this.s = seed >>> 0;
  }

  nextU32(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextU32() / (U32 + 1);
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`nextInt requires positive integer, got ${maxExclusive}`);
    }
    // Rejection sampling for unbiased result.
    const limit = (U32 + 1) - ((U32 + 1) % maxExclusive);
    let r = this.nextU32();
    while (r >= limit) {
      r = this.nextU32();
    }
    return r % maxExclusive;
  }

  state(): number {
    return this.s >>> 0;
  }
}

/** Create an RNG from a seed. */
export function createRng(seed: number): SeededRng {
  return new Mulberry32(seed);
}

/** Restore an RNG from a previously serialized state value. */
export function restoreRng(state: number): SeededRng {
  return new Mulberry32(state >>> 0);
}
