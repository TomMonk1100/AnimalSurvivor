/**
 * Deterministic heat budget for the highest-priority illustrated attack cards.
 *
 * A busy survivor frame should preserve silhouettes, not stack several full
 * white-hot hero cards at once. This module is pure and scan-based: callers
 * pass the fixed pool they already own, so the decision allocates nothing and
 * cannot observe wall-clock time or mutate simulation state.
 */

export const ILLUSTRATED_VFX_PRIORITY_FOUR = 4;
export const ILLUSTRATED_VFX_FULL_HEAT_CAST_CAP = 2;
export const ILLUSTRATED_VFX_HEAT_WINDOW_PORTION = 0.3;
export const ILLUSTRATED_VFX_DAMPENED_OPACITY_MULTIPLIER = 0.6;
export const ILLUSTRATED_VFX_DAMPENED_SCALE_MULTIPLIER = 0.9;

export interface IllustratedVfxIntensityProfile {
  readonly opacityMultiplier: number;
  readonly scaleMultiplier: number;
  readonly dampened: boolean;
}

export interface IllustratedVfxHeatSlot {
  readonly active: boolean;
  readonly priority: number;
  readonly tick: number;
  readonly expiresAtTick: number;
}

export const ILLUSTRATED_VFX_FULL_INTENSITY_PROFILE: IllustratedVfxIntensityProfile = Object.freeze({
  opacityMultiplier: 1,
  scaleMultiplier: 1,
  dampened: false,
});

export const ILLUSTRATED_VFX_DAMPENED_INTENSITY_PROFILE: IllustratedVfxIntensityProfile = Object.freeze({
  opacityMultiplier: ILLUSTRATED_VFX_DAMPENED_OPACITY_MULTIPLIER,
  scaleMultiplier: ILLUSTRATED_VFX_DAMPENED_SCALE_MULTIPLIER,
  dampened: true,
});

function normalizedTick(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
}

/**
 * A hot cast is both alive and still inside its first 30% of lifetime. Use
 * integer multiplication rather than a floating progress comparison to keep
 * the inclusive/exclusive boundary deterministic at every sim tick.
 */
export function isIllustratedVfxPriorityFourHot(
  slot: IllustratedVfxHeatSlot,
  currentTick: number,
): boolean {
  if (!slot.active || slot.priority !== ILLUSTRATED_VFX_PRIORITY_FOUR) return false;
  const tick = normalizedTick(currentTick);
  const start = normalizedTick(slot.tick);
  const expiry = normalizedTick(slot.expiresAtTick);
  const duration = expiry - start;
  const age = tick - start;
  if (duration <= 0 || age < 0 || tick > expiry) return false;
  // Strictly first 30%; at exactly 30% the card has settled and no longer
  // consumes the start-of-life brightness budget.
  return age * 10 < duration * 3;
}

/** Counts hot priority-four cards without allocating a filtered array. */
export function illustratedVfxPriorityFourHeatCount(
  slots: readonly IllustratedVfxHeatSlot[],
  currentTick: number,
  excludedSlot: IllustratedVfxHeatSlot | null = null,
): number {
  let count = 0;
  for (const slot of slots) {
    if (slot === excludedSlot) continue;
    if (isIllustratedVfxPriorityFourHot(slot, currentTick)) count++;
  }
  return count;
}

/**
 * The first two concurrent priority-four casts retain their full authored
 * intensity. Every additional hot cast begins as a quieter, slightly smaller
 * card for its whole lifetime. Lower priorities never pay this cost.
 */
export function illustratedVfxIntensityForNewCast(
  priority: number,
  currentTick: number,
  slots: readonly IllustratedVfxHeatSlot[],
  excludedSlot: IllustratedVfxHeatSlot | null = null,
): IllustratedVfxIntensityProfile {
  if (priority !== ILLUSTRATED_VFX_PRIORITY_FOUR) return ILLUSTRATED_VFX_FULL_INTENSITY_PROFILE;
  return illustratedVfxPriorityFourHeatCount(slots, currentTick, excludedSlot)
    >= ILLUSTRATED_VFX_FULL_HEAT_CAST_CAP
    ? ILLUSTRATED_VFX_DAMPENED_INTENSITY_PROFILE
    : ILLUSTRATED_VFX_FULL_INTENSITY_PROFILE;
}
