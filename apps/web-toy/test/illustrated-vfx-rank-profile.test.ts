import { describe, expect, it } from 'vitest';
import type { IllustratedVfxRankVisual } from '../src/render/illustrated-vfx-rank-profile';
import {
  DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE,
  illustratedVfxRankProfileForSource,
} from '../src/render/illustrated-vfx-rank-profile';

function visual(overrides: Partial<IllustratedVfxRankVisual> = {}): IllustratedVfxRankVisual {
  return {
    sourceId: 'mantis-scythes',
    rank: 1,
    isMaster: false,
    enabled: true,
    ...overrides,
  };
}

describe('illustrated VFX rank profiles', () => {
  it('uses the renderer snapshot source id and ignores missing, disabled, or foreign visuals', () => {
    expect(illustratedVfxRankProfileForSource([], 'mantis-scythes'))
      .toBe(DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE);
    expect(illustratedVfxRankProfileForSource([
      visual({ enabled: false, rank: 5 }),
      visual({ sourceId: 'owl-pinions', rank: 5 }),
    ], 'mantis-scythes')).toBe(DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE);
  });

  it('gives every R1–R5 a distinct bounded scale, opacity, and timing profile', () => {
    const profiles = ([1, 2, 3, 4, 5] as const).map((rank) => (
      illustratedVfxRankProfileForSource([visual({ rank })], 'mantis-scythes')
    ));

    expect(profiles.map((profile) => profile.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(profiles.map((profile) => profile.scaleMultiplier)).toEqual([0.88, 0.94, 1, 1.08, 1.16]);
    expect(profiles.map((profile) => profile.opacityMultiplier)).toEqual([0.78, 0.85, 0.91, 0.96, 1]);
    expect(profiles.map((profile) => profile.lifetimeMultiplier)).toEqual([0.88, 0.94, 1, 1.06, 1.12]);
  });

  it('prefers the strongest enabled source state and reserves a modest sparkle profile for Master', () => {
    const profile = illustratedVfxRankProfileForSource([
      visual({ rank: 2 }),
      visual({ rank: 5 }),
      visual({ rank: 5, isMaster: true }),
    ], 'mantis-scythes');

    expect(profile).toMatchObject({
      rank: 5,
      isMaster: true,
      showMasterAccent: true,
      scaleMultiplier: 1.2,
      opacityMultiplier: 1,
      lifetimeMultiplier: 1.16,
    });
  });
});
