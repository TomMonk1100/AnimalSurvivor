import { describe, expect, it } from 'vitest';
import {
  FOREST_CANOPY_COUNT,
  FOREST_CLEARING_RADIUS,
  FOREST_MOSS_PATCH_COUNT,
  FOREST_ROOT_COUNT,
  FOREST_STONE_COUNT,
  createForestClearingLayout,
  createForestInstanceMatrices,
  type ForestDecoration,
} from '../src/render/forest-clearing-presentation';

function everyDecoration(layout: ReturnType<typeof createForestClearingLayout>) {
  return [...layout.mossPatches, ...layout.canopies, ...layout.stones, ...layout.roots];
}

describe('forest clearing presentation layout', () => {
  it('is deterministic, static, and uses the authored default-world density', () => {
    const first = createForestClearingLayout(2_000, 2_000);
    const second = createForestClearingLayout(2_000, 2_000);

    expect(second).toEqual(first);
    expect(first.mossPatches).toHaveLength(FOREST_MOSS_PATCH_COUNT);
    expect(first.canopies).toHaveLength(FOREST_CANOPY_COUNT);
    expect(first.stones).toHaveLength(FOREST_STONE_COUNT);
    expect(first.roots).toHaveLength(FOREST_ROOT_COUNT);
  });

  it('keeps visual placements inside the centered world and preserves the opening clearing', () => {
    const width = 2_000;
    const height = 2_000;
    const layout = createForestClearingLayout(width, height, 0xabcdef01);

    for (const decoration of everyDecoration(layout)) {
      expect(decoration.x).toBeGreaterThanOrEqual(-width / 2);
      expect(decoration.x).toBeLessThanOrEqual(width / 2);
      expect(decoration.z).toBeGreaterThanOrEqual(-height / 2);
      expect(decoration.z).toBeLessThanOrEqual(height / 2);
      expect(decoration.y).toBeLessThan(0);
    }
    for (const canopy of layout.canopies) {
      expect(canopy.x * canopy.x + canopy.z * canopy.z).toBeGreaterThanOrEqual(
        FOREST_CLEARING_RADIUS * FOREST_CLEARING_RADIUS,
      );
    }
  });

  it('packs stable column-major transforms for one static draw upload', () => {
    const decorations: readonly ForestDecoration[] = [{
      x: 12,
      y: -0.5,
      z: -8,
      scaleX: 4,
      scaleY: 0.25,
      scaleZ: 3,
      rotationY: 0,
    }];
    const instanceData = createForestInstanceMatrices(decorations);

    expect(instanceData.count).toBe(1);
    expect(Array.from(instanceData.matrices)).toEqual([
      4, 0, 0, 0,
      0, 0.25, 0, 0,
      0, 0, 3, 0,
      12, -0.5, -8, 1,
    ]);
  });

  it('rejects invalid world dimensions before allocating visual layout', () => {
    expect(() => createForestClearingLayout(0, 100)).toThrow(RangeError);
    expect(() => createForestClearingLayout(100, Number.NaN)).toThrow(RangeError);
  });
});
