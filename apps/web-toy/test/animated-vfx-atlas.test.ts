import { describe, expect, it } from 'vitest';
import {
  ANIMATED_VFX_ATLAS_CELL_COUNT,
  ANIMATED_VFX_ATLAS_GRID_SIZE,
  animatedVfxAtlasSequenceForName,
  createAnimatedVfxAtlasSample,
  createAnimatedVfxAtlasUv,
  writeAnimatedVfxAtlasSample,
  writeAnimatedVfxAtlasUv,
  type AnimatedVfxAtlasSequence,
  type AnimatedVfxAtlasSequenceLibrary,
} from '../src/render/animated-vfx-atlas';

const FOX_SWIPE_SEQUENCE: AnimatedVfxAtlasSequence = Object.freeze({
  name: 'fox-swipe',
  frames: Object.freeze([
    Object.freeze({ column: 0, row: 0 }),
    Object.freeze({ column: 1, row: 0 }),
    Object.freeze({ column: 2, row: 0 }),
  ]),
  ticksPerFrame: 4,
  loop: false,
  crossfadeTicks: 2,
});

const LOOPING_SHIELD_SEQUENCE: AnimatedVfxAtlasSequence = Object.freeze({
  name: 'shield-loop',
  frames: Object.freeze([
    Object.freeze({ column: 3, row: 0 }),
    Object.freeze({ column: 3, row: 1 }),
  ]),
  ticksPerFrame: 3,
  loop: true,
  crossfadeTicks: 1,
});

describe('animated VFX atlas helpers', () => {
  it('maps top-left authored cells into standard bottom-left UV bounds', () => {
    expect(ANIMATED_VFX_ATLAS_GRID_SIZE).toBe(4);
    expect(ANIMATED_VFX_ATLAS_CELL_COUNT).toBe(16);

    const uv = createAnimatedVfxAtlasUv();
    expect(writeAnimatedVfxAtlasUv({ column: 0, row: 0 }, uv)).toBe(true);
    expect(uv).toEqual({ uMin: 0, vMin: 0.75, uMax: 0.25, vMax: 1 });

    expect(writeAnimatedVfxAtlasUv({ column: 3, row: 3 }, uv)).toBe(true);
    expect(uv).toEqual({ uMin: 0.75, vMin: 0, uMax: 1, vMax: 0.25 });
  });

  it('looks up named sequences without manufacturing a fallback', () => {
    const library: AnimatedVfxAtlasSequenceLibrary = Object.freeze({
      [FOX_SWIPE_SEQUENCE.name]: FOX_SWIPE_SEQUENCE,
      [LOOPING_SHIELD_SEQUENCE.name]: LOOPING_SHIELD_SEQUENCE,
    });

    expect(animatedVfxAtlasSequenceForName(library, 'fox-swipe')).toBe(FOX_SWIPE_SEQUENCE);
    expect(animatedVfxAtlasSequenceForName(library, 'missing-art')).toBeNull();
  });

  it('selects non-looping frames deterministically and exposes blend/progress metadata', () => {
    const sample = createAnimatedVfxAtlasSample();

    expect(writeAnimatedVfxAtlasSample(FOX_SWIPE_SEQUENCE, 0, sample)).toBe(true);
    expect(sample).toMatchObject({
      active: true,
      frameIndex: 0,
      nextFrameIndex: 1,
      progress: 0,
      frameProgress: 0,
      crossfade: 0,
      completed: false,
      currentUv: { uMin: 0, vMin: 0.75, uMax: 0.25, vMax: 1 },
      nextUv: { uMin: 0.25, vMin: 0.75, uMax: 0.5, vMax: 1 },
    });

    expect(writeAnimatedVfxAtlasSample(FOX_SWIPE_SEQUENCE, 2.9, sample)).toBe(true);
    expect(sample.frameIndex).toBe(0);
    expect(sample.frameProgress).toBeCloseTo(0.5);
    expect(sample.progress).toBeCloseTo(2 / 12);
    expect(sample.crossfade).toBeCloseTo(0.5);

    expect(writeAnimatedVfxAtlasSample(FOX_SWIPE_SEQUENCE, 12, sample)).toBe(true);
    expect(sample).toMatchObject({
      frameIndex: 2,
      nextFrameIndex: 2,
      progress: 1,
      frameProgress: 1,
      crossfade: 0,
      completed: true,
    });
  });

  it('wraps looping sequences at the same fixed tick and blends into the first frame', () => {
    const sample = createAnimatedVfxAtlasSample();

    expect(writeAnimatedVfxAtlasSample(LOOPING_SHIELD_SEQUENCE, 5, sample)).toBe(true);
    expect(sample).toMatchObject({
      frameIndex: 1,
      nextFrameIndex: 0,
      progress: 5 / 6,
      frameProgress: 2 / 3,
      crossfade: 1,
      completed: false,
    });

    expect(writeAnimatedVfxAtlasSample(LOOPING_SHIELD_SEQUENCE, 6, sample)).toBe(true);
    expect(sample).toMatchObject({
      frameIndex: 0,
      nextFrameIndex: 1,
      progress: 0,
      frameProgress: 0,
      crossfade: 0,
      completed: false,
    });
  });

  it('reuses caller-owned sample storage and fails closed for malformed art metadata', () => {
    const sample = createAnimatedVfxAtlasSample();
    const currentUv = sample.currentUv;
    const nextUv = sample.nextUv;

    expect(writeAnimatedVfxAtlasSample(FOX_SWIPE_SEQUENCE, 4, sample)).toBe(true);
    expect(sample.currentUv).toBe(currentUv);
    expect(sample.nextUv).toBe(nextUv);

    const malformed: AnimatedVfxAtlasSequence = {
      name: 'bad-cell',
      frames: [{ column: 4, row: 0 }],
      ticksPerFrame: 1,
      loop: false,
    };
    expect(writeAnimatedVfxAtlasSample(malformed, 0, sample)).toBe(false);
    expect(sample).toMatchObject({
      active: false,
      frameIndex: -1,
      nextFrameIndex: -1,
      progress: 0,
      frameProgress: 0,
      crossfade: 0,
      completed: false,
      currentUv: { uMin: 0, vMin: 0, uMax: 0, vMax: 0 },
      nextUv: { uMin: 0, vMin: 0, uMax: 0, vMax: 0 },
    });
  });
});
