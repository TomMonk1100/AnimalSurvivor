/**
 * LEAD-OWNED — FROZEN deterministic RNG (xorshift128).
 *
 * Pure functional API: every call returns the next immutable RngState alongside
 * its value. No Math.random, no ambient state, no float accumulation. uint32
 * arithmetic throughout so behaviour is identical on any JS engine.
 *
 * Implementation agents import these; they MUST NOT construct RNG any other way.
 */
import type { RngState } from './contracts.js';

/** splitmix32 — used only to expand a single integer seed into 4 state words. */
function splitmix32(a: number): number {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

/** Build an RngState from a single integer seed. Deterministic and total. */
export function createRng(seed: number): RngState {
  let x = seed >>> 0;
  // Guarantee a non-zero state (all-zero is a fixed point for xorshift).
  const s0 = splitmix32((x = (x + 1) | 0));
  const s1 = splitmix32((x = (x + 1) | 0));
  const s2 = splitmix32((x = (x + 1) | 0));
  const s3 = splitmix32((x = (x + 1) | 0));
  const s: [number, number, number, number] = [s0, s1, s2, s3];
  if ((s0 | s1 | s2 | s3) === 0) s[0] = 0x1;
  return { s };
}

/** Advance the generator once. Returns [nextState, uint32 value]. */
export function rngNext(rng: RngState): readonly [RngState, number] {
  let [x, y, z, w] = rng.s;
  const t = x ^ ((x << 11) & 0xffffffff);
  x = y;
  y = z;
  z = w;
  w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
  return [{ s: [x >>> 0, y >>> 0, z >>> 0, w >>> 0] }, w >>> 0];
}

/**
 * Uniform integer in [0, maxExclusive). maxExclusive must be a positive integer.
 * Uses rejection sampling to avoid modulo bias; deterministic given state.
 */
export function rngInt(rng: RngState, maxExclusive: number): readonly [RngState, number] {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`rngInt: maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  const limit = 0x100000000; // 2^32
  const threshold = limit - (limit % maxExclusive);
  let state = rng;
  for (;;) {
    const [next, v] = rngNext(state);
    state = next;
    if (v < threshold) return [state, v % maxExclusive];
  }
}

/**
 * Weighted pick from parallel arrays. `weights` are positive integers. Returns
 * [nextState, index]. Order-stable: iterates items in array order only.
 */
export function rngWeightedIndex(
  rng: RngState,
  weights: readonly number[],
): readonly [RngState, number] {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) throw new RangeError('rngWeightedIndex: total weight must be positive');
  const [state, roll] = rngInt(rng, total);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] as number;
    if (roll < acc) return [state, i];
  }
  return [state, weights.length - 1];
}
