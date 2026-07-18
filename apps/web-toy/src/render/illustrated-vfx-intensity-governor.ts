/**
 * Deterministic heat budget for the highest-priority illustrated attack cards.
 *
 * A busy survivor frame should preserve silhouettes, not stack several full
 * white-hot hero cards at once. This module is pure and scan-based: callers
 * pass the fixed pool they already own, so the decision allocates nothing and
 * cannot observe wall-clock time or mutate simulation state.
 */

import type { AttackVfxFamily } from './attack-vfx-palette';

export const ILLUSTRATED_VFX_PRIORITY_FOUR = 4;
export const ILLUSTRATED_VFX_FULL_HEAT_CAST_CAP = 2;
export const ILLUSTRATED_VFX_HEAT_WINDOW_PORTION = 0.3;
export const ILLUSTRATED_VFX_DAMPENED_OPACITY_MULTIPLIER = 0.6;
export const ILLUSTRATED_VFX_DAMPENED_SCALE_MULTIPLIER = 0.9;

/** No more than three attack families may own the travel/impact read at once. */
export const ILLUSTRATED_VFX_PROMINENT_FAMILY_CAP = 3;
/** The staged-card travel beat begins at 16% of its tick-normalized life. */
export const ILLUSTRATED_VFX_PROMINENT_START_PERCENT = 16;
/** The impact beat ends before the final 18% aftermath/release window. */
export const ILLUSTRATED_VFX_PROMINENT_END_PERCENT = 82;
/** A fourth family gives the oldest family this short eased release window. */
export const ILLUSTRATED_VFX_FAMILY_EVICTION_RELEASE_TICKS = 6;

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

/**
 * The family policy intentionally reads only the fields already retained by a
 * fixed illustrated-card pool. `prominenceEndsAtTick` lets a caller mark a
 * card as releasing now while it eases to zero over a few more render ticks.
 */
export interface IllustratedVfxFamilySlot extends IllustratedVfxHeatSlot {
  readonly family: AttackVfxFamily | null;
  readonly prominenceEndsAtTick?: number;
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
 * A prominent family is in the staged travel/impact body, not its initial
 * cast spark or quiet aftermath. Integer percentages avoid fractional-tick
 * ambiguity when the renderer is replayed at different frame rates.
 */
export function isIllustratedVfxFamilyProminent(
  slot: IllustratedVfxFamilySlot,
  currentTick: number,
): boolean {
  if (!slot.active || slot.family === null) return false;
  const tick = normalizedTick(currentTick);
  const start = normalizedTick(slot.tick);
  const expiry = normalizedTick(slot.expiresAtTick);
  const prominenceEnd = slot.prominenceEndsAtTick === undefined
    ? expiry
    : Math.min(expiry, normalizedTick(slot.prominenceEndsAtTick));
  const duration = expiry - start;
  const age = tick - start;
  if (duration <= 0 || age < 0 || tick >= prominenceEnd || tick > expiry) return false;
  const agePercent = age * 100;
  return agePercent >= duration * ILLUSTRATED_VFX_PROMINENT_START_PERCENT
    && agePercent < duration * ILLUSTRATED_VFX_PROMINENT_END_PERCENT;
}

/**
 * A fresh cast reserves its family before it reaches the travel frame. That
 * look-ahead is what prevents four same-tick casts from all becoming
 * prominent together two frames later. A card already in aftermath, or one
 * explicitly sent to release, does not retain a reservation.
 */
function isIllustratedVfxFamilyReservedForProminence(
  slot: IllustratedVfxFamilySlot,
  currentTick: number,
): boolean {
  if (!slot.active || slot.family === null) return false;
  const tick = normalizedTick(currentTick);
  const start = normalizedTick(slot.tick);
  const expiry = normalizedTick(slot.expiresAtTick);
  const prominenceEnd = slot.prominenceEndsAtTick === undefined
    ? expiry
    : Math.min(expiry, normalizedTick(slot.prominenceEndsAtTick));
  const duration = expiry - start;
  const age = tick - start;
  return duration > 0
    && age >= 0
    && tick < prominenceEnd
    && tick <= expiry
    && age * 100 < duration * ILLUSTRATED_VFX_PROMINENT_END_PERCENT;
}

function illustratedVfxReservedFamilyCount(
  slots: readonly IllustratedVfxFamilySlot[],
  currentTick: number,
  excludedSlot: IllustratedVfxFamilySlot | null,
): number {
  let count = 0;
  for (let index = 0; index < slots.length; index++) {
    const candidate = slots[index]!;
    if (candidate === excludedSlot || !isIllustratedVfxFamilyReservedForProminence(candidate, currentTick)) continue;
    let alreadyCounted = false;
    for (let previousIndex = 0; previousIndex < index; previousIndex++) {
      const previous = slots[previousIndex]!;
      if (
        previous !== excludedSlot
        && previous.family === candidate.family
        && isIllustratedVfxFamilyReservedForProminence(previous, currentTick)
      ) {
        alreadyCounted = true;
        break;
      }
    }
    if (!alreadyCounted) count++;
  }
  return count;
}

/** Counts distinct live prominent families without allocating a Set per frame. */
export function illustratedVfxProminentFamilyCount(
  slots: readonly IllustratedVfxFamilySlot[],
  currentTick: number,
  excludedSlot: IllustratedVfxFamilySlot | null = null,
): number {
  let count = 0;
  for (let index = 0; index < slots.length; index++) {
    const candidate = slots[index]!;
    if (candidate === excludedSlot || !isIllustratedVfxFamilyProminent(candidate, currentTick)) continue;
    let alreadyCounted = false;
    for (let previousIndex = 0; previousIndex < index; previousIndex++) {
      const previous = slots[previousIndex]!;
      if (
        previous !== excludedSlot
        && previous.family === candidate.family
        && isIllustratedVfxFamilyProminent(previous, currentTick)
      ) {
        alreadyCounted = true;
        break;
      }
    }
    if (!alreadyCounted) count++;
  }
  return count;
}

/**
 * Returns the oldest distinct family that must begin its aftermath release
 * before an incoming card would make four families prominent. A family that
 * is already visible remains eligible without spending another family slot.
 */
export function illustratedVfxOldestProminentFamilyToRelease(
  slots: readonly IllustratedVfxFamilySlot[],
  currentTick: number,
  incomingFamily: AttackVfxFamily | null,
  excludedSlot: IllustratedVfxFamilySlot | null = null,
): AttackVfxFamily | null {
  if (incomingFamily === null) return null;
  for (const slot of slots) {
    if (
      slot !== excludedSlot
      && slot.family === incomingFamily
      && isIllustratedVfxFamilyReservedForProminence(slot, currentTick)
    ) return null;
  }
  if (
    illustratedVfxReservedFamilyCount(slots, currentTick, excludedSlot)
    < ILLUSTRATED_VFX_PROMINENT_FAMILY_CAP
  ) return null;

  let oldestFamily: AttackVfxFamily | null = null;
  let oldestTick = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    if (slot === excludedSlot || !isIllustratedVfxFamilyReservedForProminence(slot, currentTick)) continue;
    const family = slot.family;
    if (family === null) continue;
    if (
      slot.tick < oldestTick
      || (slot.tick === oldestTick && (oldestFamily === null || family < oldestFamily))
    ) {
      oldestTick = slot.tick;
      oldestFamily = family;
    }
  }
  return oldestFamily;
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
