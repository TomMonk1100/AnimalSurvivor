import { describe, expect, it } from 'vitest';
import {
  ILLUSTRATED_VFX_BREATH_PERIOD_TICKS,
  createIllustratedVfxMotionSample,
  writeIllustratedVfxMotion,
} from '../src/render/illustrated-vfx-motion';

function sample(
  clip: Parameters<typeof writeIllustratedVfxMotion>[0],
  progress: number,
  ageTicks = 0,
) {
  const out = createIllustratedVfxMotionSample();
  writeIllustratedVfxMotion(clip, progress, ageTicks, 20, 1, 0, 17, out);
  return out;
}

describe('illustrated VFX motion', () => {
  it('gives impacts an overshooting launch and a settled finish', () => {
    const start = sample('normalImpact', 0);
    const launch = sample('normalImpact', 0.1);
    const finish = sample('normalImpact', 1);

    expect(start.scaleX).toBeCloseTo(11);
    expect(launch.scaleX).toBeGreaterThan(20);
    expect(finish.scaleX).toBeCloseTo(18.4);
  });

  it('gives Benny’s ridge a bounded, non-reversing ground-wave follow-through', () => {
    const early = sample('earthWave', 0.2);
    const late = sample('earthWave', 0.8);

    // The authored art is a lateral crest with a shallow forward footprint,
    // so it cannot collapse back into a round crater/decal silhouette.
    expect(early.scaleX).toBeGreaterThan(early.scaleZ);
    expect(late.scaleX).toBeGreaterThan(late.scaleZ);
    expect(late.scaleX).toBeLessThanOrEqual(early.scaleX);
    expect(early.yawOffsetDegrees).toBeLessThan(0);
    expect(late.yawOffsetDegrees).toBeLessThan(early.yawOffsetDegrees);
    // Simulation owns the event origin; the painterly body travels only a
    // bounded fraction of its own radius and never reverses direction.
    expect(early.offsetX).toBeGreaterThan(0);
    expect(late.offsetX).toBeGreaterThan(early.offsetX);
    expect(late.offsetX - early.offsetX).toBeGreaterThan(20 * 0.3);
    expect(late.offsetX).toBeLessThan(20 * 1.1);
  });

  it('gives Fox Swipe a clearly advancing directional melee path', () => {
    const early = sample('foxSwipe', 0.25);
    const late = sample('foxSwipe', 0.75);

    expect(late.offsetX - early.offsetX).toBeGreaterThan(3);
    expect(late.yawOffsetDegrees).toBeGreaterThan(early.yawOffsetDegrees);
    expect(early.scaleX).toBeCloseTo(early.scaleZ);
  });

  it('breathes zones on a deterministic period without encoding opacity', () => {
    const atStart = sample('skunkCloud', 0.5, 7);
    const onePeriodLater = sample('skunkCloud', 0.5, 7 + ILLUSTRATED_VFX_BREATH_PERIOD_TICKS);
    const halfway = sample('skunkCloud', 0.5, 7 + ILLUSTRATED_VFX_BREATH_PERIOD_TICKS / 2);

    expect(ILLUSTRATED_VFX_BREATH_PERIOD_TICKS).toBeGreaterThanOrEqual(120);
    expect(onePeriodLater.scaleX).toBeCloseTo(atStart.scaleX);
    expect(onePeriodLater.scaleZ).toBeCloseTo(atStart.scaleZ);
    expect(halfway.scaleX).not.toBeCloseTo(atStart.scaleX);
  });
});
