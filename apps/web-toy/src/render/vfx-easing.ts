/**
 * Deterministic, renderer-only easing primitives for attack VFX.
 *
 * Inputs are normalized by callers from integer simulation ticks. Keeping the
 * functions scalar and allocation-free makes the same visual envelope replay
 * identically at any render frame rate.
 */

function unitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Starts fast and settles without a terminal linear ramp. */
export function easeOutCubic(value: number): number {
  const t = unitInterval(value) - 1;
  return t * t * t + 1;
}

/** A deliberate, gentle release curve that reaches exact zero at its end. */
export function easeInQuad(value: number): number {
  const t = unitInterval(value);
  return t * t;
}

/**
 * A release multiplier with an exact terminal zero. Keeping this beside the
 * scalar easing primitives prevents renderer pools from falling back to a
 * linear partial fade and then hiding a still-visible card on the next tick.
 */
export function easeOutToZero(value: number): number {
  return 1 - easeInQuad(value);
}

/**
 * A compact launch overshoot for impact cards. `overshoot` stays explicit so
 * a caller can tune an archetype without changing the shared curve.
 */
export function easeOutBack(value: number, overshoot = 1.35): number {
  const t = unitInterval(value) - 1;
  const s = Number.isFinite(overshoot) ? Math.max(0, overshoot) : 1.35;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/**
 * A tick-normalized attack/hold/release envelope.
 *
 * - attack: 0 -> 1 with an ease-out cubic
 * - hold: exact 1
 * - release: 1 -> exact 0 with an ease-in quadratic
 *
 * Invalid or overlapping portions are normalized defensively. The endpoints
 * deliberately remain exact: a card can never disappear while still visible.
 */
export function envelope(progress: number, attack: number, release: number): number {
  const p = unitInterval(progress);
  if (p <= 0) return 0;
  if (p >= 1) return 0;

  const attackPortion = unitInterval(attack);
  const releasePortion = unitInterval(release);
  const total = attackPortion + releasePortion;
  const normalization = total > 1 ? 1 / total : 1;
  const normalizedAttack = attackPortion * normalization;
  const normalizedRelease = releasePortion * normalization;
  const releaseStart = 1 - normalizedRelease;

  if (normalizedAttack > 0 && p < normalizedAttack) {
    return easeOutCubic(p / normalizedAttack);
  }
  if (normalizedRelease > 0 && p > releaseStart) {
    return easeOutToZero((p - releaseStart) / normalizedRelease);
  }
  return 1;
}
