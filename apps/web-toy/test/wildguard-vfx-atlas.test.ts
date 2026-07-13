import { describe, expect, it } from 'vitest';
import {
  WILDGUARD_VFX_ATLAS_CELLS,
  WILDGUARD_VFX_ATLAS_GRID_SIZE,
  wildguardVfxAtlasUv,
} from '../src/render/wildguard-vfx-atlas';

describe('Wildguard VFX atlas routing', () => {
  it('keeps every semantic visual in the compact four-by-four atlas', () => {
    expect(Object.keys(WILDGUARD_VFX_ATLAS_CELLS)).toHaveLength(16);
    for (const cell of Object.values(WILDGUARD_VFX_ATLAS_CELLS)) {
      expect(cell.column).toBeGreaterThanOrEqual(0);
      expect(cell.column).toBeLessThan(WILDGUARD_VFX_ATLAS_GRID_SIZE);
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(WILDGUARD_VFX_ATLAS_GRID_SIZE);
    }
  });

  it('converts top-left authored cells into bottom-left PlayCanvas UV offsets', () => {
    expect(wildguardVfxAtlasUv('foxSwipe')).toEqual({
      tilingX: 0.25, tilingY: 0.25, offsetX: 0, offsetY: 0.75,
    });
    expect(wildguardVfxAtlasUv('arcaneComet')).toEqual({
      tilingX: 0.25, tilingY: 0.25, offsetX: 0.75, offsetY: 0,
    });
  });
});
