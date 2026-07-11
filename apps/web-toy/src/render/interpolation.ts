/**
 * Agent A — pure interpolation helpers. No DOM, no simulation imports. Agent B
 * (PlayCanvas renderer) imports `lerp` from this module (same directory:
 * `src/render/interpolation.ts`) to blend between `prev`/`curr` RenderSnapshots.
 */

/** Standard linear interpolation from `a` to `b`. `t` is clamped to [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  const ct = t < 0 ? 0 : t > 1 ? 1 : t;
  return a + (b - a) * ct;
}
