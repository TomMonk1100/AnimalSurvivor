import { describe, expect, it } from 'vitest';
import {
  FOREST_CANOPY_COUNT,
  FOREST_BOUNDARY_FOG_BAND_COUNT,
  FOREST_CLEARING_RADIUS,
  FOREST_CLEARING_LAYER_COUNT,
  FOREST_FERN_COUNT,
  FOREST_FLOWER_PATCH_COUNT,
  FOREST_GRASS_TUFT_COUNT,
  FOREST_LEAF_LITTER_COUNT,
  FOREST_LIGHT_POOL_COUNT,
  FOREST_MOSS_PATCH_COUNT,
  FOREST_ROOT_COUNT,
  FOREST_STONE_COUNT,
  FOREST_TREE_BASE_COUNT,
  SALTWIND_CLEARING_VISUAL_SEED,
  SALTWIND_RUIN_COUNT,
  createForestClearingLayout,
  createForestInstanceMatrices,
  type ForestDecoration,
} from '../src/render/forest-clearing-presentation';

function everyDecoration(layout: ReturnType<typeof createForestClearingLayout>) {
  return [
    ...layout.clearingLayers,
    ...layout.mossPatches,
    ...layout.grassTufts,
    ...layout.flowerPatches,
    ...layout.ferns,
    ...layout.leafLitter,
    ...layout.canopies,
    ...layout.treeBases,
    ...layout.stones,
    ...layout.roots,
    ...layout.lightPools,
    ...layout.boundaryFog,
  ];
}

describe('forest clearing presentation layout', () => {
  it('is deterministic, static, and uses the authored default-world density', () => {
    const first = createForestClearingLayout(2_000, 2_000);
    const second = createForestClearingLayout(2_000, 2_000);

    expect(second).toEqual(first);
    expect(first.clearingLayers).toHaveLength(FOREST_CLEARING_LAYER_COUNT);
    expect(first.mossPatches).toHaveLength(FOREST_MOSS_PATCH_COUNT);
    expect(first.grassTufts).toHaveLength(FOREST_GRASS_TUFT_COUNT);
    expect(first.flowerPatches).toHaveLength(FOREST_FLOWER_PATCH_COUNT);
    expect(first.ferns).toHaveLength(FOREST_FERN_COUNT);
    expect(first.leafLitter).toHaveLength(FOREST_LEAF_LITTER_COUNT);
    expect(first.canopies).toHaveLength(FOREST_CANOPY_COUNT);
    expect(first.treeBases).toHaveLength(FOREST_TREE_BASE_COUNT);
    expect(first.stones).toHaveLength(FOREST_STONE_COUNT);
    expect(first.roots).toHaveLength(FOREST_ROOT_COUNT);
    expect(first.lightPools).toHaveLength(FOREST_LIGHT_POOL_COUNT);
    expect(first.boundaryFog).toHaveLength(FOREST_BOUNDARY_FOG_BAND_COUNT);
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
    for (const flower of layout.flowerPatches) {
      expect(flower.x * flower.x + flower.z * flower.z).toBeGreaterThanOrEqual(
        (FOREST_CLEARING_RADIUS * 0.34) ** 2,
      );
    }
    for (const fern of layout.ferns) {
      expect(fern.x * fern.x + fern.z * fern.z).toBeGreaterThanOrEqual(
        (FOREST_CLEARING_RADIUS * 0.46) ** 2,
      );
    }
    for (const lightPool of layout.lightPools) {
      expect(lightPool.x * lightPool.x + lightPool.z * lightPool.z).toBeGreaterThanOrEqual(
        (FOREST_CLEARING_RADIUS * 0.25) ** 2,
      );
      expect(lightPool.x * lightPool.x + lightPool.z * lightPool.z).toBeLessThanOrEqual(
        (FOREST_CLEARING_RADIUS * 0.82) ** 2,
      );
    }
    expect(layout.boundaryFog.every((band) => band.scaleX > 0 && band.scaleZ > 0)).toBe(true);
  });

  it('supports a deterministic Saltwind dressing seed distinct from Forest', () => {
    const forest = createForestClearingLayout(2_000, 2_000);
    const saltwind = createForestClearingLayout(2_000, 2_000, SALTWIND_CLEARING_VISUAL_SEED, 'saltwind');

    expect(saltwind).not.toEqual(forest);
    expect(saltwind.mossPatches).toHaveLength(FOREST_MOSS_PATCH_COUNT);
    expect(saltwind.canopies).toHaveLength(FOREST_CANOPY_COUNT);
    expect(saltwind.landmarks).toHaveLength(SALTWIND_RUIN_COUNT);
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
