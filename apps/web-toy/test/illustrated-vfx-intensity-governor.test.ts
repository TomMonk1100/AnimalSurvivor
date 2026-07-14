import { describe, expect, it } from 'vitest';
import {
  ILLUSTRATED_VFX_DAMPENED_OPACITY_MULTIPLIER,
  ILLUSTRATED_VFX_DAMPENED_SCALE_MULTIPLIER,
  ILLUSTRATED_VFX_PRIORITY_FOUR,
  illustratedVfxIntensityForNewCast,
  illustratedVfxPriorityFourHeatCount,
  isIllustratedVfxPriorityFourHot,
  type IllustratedVfxHeatSlot,
} from '../src/render/illustrated-vfx-intensity-governor';

function slot(overrides: Partial<IllustratedVfxHeatSlot> = {}): IllustratedVfxHeatSlot {
  return {
    active: true,
    priority: ILLUSTRATED_VFX_PRIORITY_FOUR,
    tick: 100,
    expiresAtTick: 120,
    ...overrides,
  };
}

describe('illustrated VFX intensity governor', () => {
  it('keeps the first two hot priority-four cards full, then dampens later cards', () => {
    const first = slot({ tick: 100, expiresAtTick: 120 });
    const second = slot({ tick: 101, expiresAtTick: 121 });

    expect(illustratedVfxIntensityForNewCast(ILLUSTRATED_VFX_PRIORITY_FOUR, 102, [])).toMatchObject({
      opacityMultiplier: 1, scaleMultiplier: 1, dampened: false,
    });
    expect(illustratedVfxIntensityForNewCast(ILLUSTRATED_VFX_PRIORITY_FOUR, 102, [first]))
      .toMatchObject({ opacityMultiplier: 1, scaleMultiplier: 1, dampened: false });

    const dampened = illustratedVfxIntensityForNewCast(
      ILLUSTRATED_VFX_PRIORITY_FOUR,
      102,
      [first, second],
    );
    expect(dampened).toMatchObject({
      opacityMultiplier: ILLUSTRATED_VFX_DAMPENED_OPACITY_MULTIPLIER,
      scaleMultiplier: ILLUSTRATED_VFX_DAMPENED_SCALE_MULTIPLIER,
      dampened: true,
    });
  });

  it('uses only the first 30 percent of each lifetime as the brightness budget', () => {
    const candidate = slot({ tick: 100, expiresAtTick: 120 });
    expect(isIllustratedVfxPriorityFourHot(candidate, 105)).toBe(true);
    // At exactly 30% the card has settled and releases its heat reservation.
    expect(isIllustratedVfxPriorityFourHot(candidate, 106)).toBe(false);
    expect(isIllustratedVfxPriorityFourHot(candidate, 121)).toBe(false);

    const settled = [candidate, slot({ tick: 90, expiresAtTick: 110 })];
    expect(illustratedVfxPriorityFourHeatCount(settled, 106)).toBe(0);
    expect(illustratedVfxIntensityForNewCast(ILLUSTRATED_VFX_PRIORITY_FOUR, 106, settled).dampened)
      .toBe(false);
  });

  it('never dims lower-priority cards and excludes an evicted card from the new-cast decision', () => {
    const first = slot();
    const second = slot({ tick: 101, expiresAtTick: 121 });
    const replacement = slot({ tick: 102, expiresAtTick: 122 });

    expect(illustratedVfxIntensityForNewCast(3, 103, [first, second, replacement]).dampened).toBe(false);
    // Replacing the third slot leaves two other hot cards, so it stays
    // dampened. Replacing a slot in a two-card pool leaves one other hot card
    // and correctly restores a full-intensity incoming cast.
    expect(illustratedVfxIntensityForNewCast(ILLUSTRATED_VFX_PRIORITY_FOUR, 103, [first, second, replacement], replacement).dampened)
      .toBe(true);
    expect(illustratedVfxIntensityForNewCast(ILLUSTRATED_VFX_PRIORITY_FOUR, 103, [first, second], first).dampened)
      .toBe(false);
  });
});
