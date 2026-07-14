import { describe, expect, it } from 'vitest';
import {
  XP_PHYSICAL_MARKER_CAP,
  XP_ILLUSTRATED_ACCENT_CAP,
  XP_ILLUSTRATED_HALO_CAP,
  shouldRenderXpPhysicalMarker,
  shouldRenderXpIllustratedAccent,
  shouldRenderXpIllustratedHalo,
} from '../src/render/xp-visual-density-governor';

describe('XP visual density governor', () => {
  it('keeps every accent when the field is calm', () => {
    expect(shouldRenderXpPhysicalMarker(11, XP_PHYSICAL_MARKER_CAP)).toBe(true);
    expect(shouldRenderXpIllustratedAccent(11, XP_ILLUSTRATED_ACCENT_CAP)).toBe(true);
    expect(shouldRenderXpIllustratedHalo(11, XP_ILLUSTRATED_HALO_CAP)).toBe(true);
  });

  it('uses stable generation slots to reduce the full reward field before duplicate art', () => {
    const liveCount = 200;
    const physicalIds = Array.from({ length: liveCount }, (_, index) => index)
      .filter((id) => shouldRenderXpPhysicalMarker(id, liveCount));
    const accentIds = Array.from({ length: liveCount }, (_, index) => index)
      .filter((id) => shouldRenderXpIllustratedAccent(id, liveCount));
    const haloIds = Array.from({ length: liveCount }, (_, index) => index)
      .filter((id) => shouldRenderXpIllustratedHalo(id, liveCount));

    expect(physicalIds).toHaveLength(67);
    expect(accentIds).toHaveLength(34);
    expect(haloIds).toHaveLength(12);
    expect(shouldRenderXpPhysicalMarker(96, liveCount)).toBe(true);
    expect(shouldRenderXpPhysicalMarker(97, liveCount)).toBe(false);
    expect(shouldRenderXpIllustratedAccent(66, liveCount)).toBe(true);
    expect(shouldRenderXpIllustratedAccent(67, liveCount)).toBe(false);
  });
});
