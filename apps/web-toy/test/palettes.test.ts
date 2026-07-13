import { describe, expect, it } from 'vitest';
import {
  PALETTE_IDS,
  getPaletteDefinition,
  isPaletteId,
  presentPaletteName,
} from '../src/profile/palettes';

describe('Field Guide presentation palettes', () => {
  it('ships one starting palette and one palette per Mythic', () => {
    expect(PALETTE_IDS).toHaveLength(7);
    expect(PALETTE_IDS[0]).toBe('forest');
    expect(new Set(PALETTE_IDS).size).toBe(PALETTE_IDS.length);
  });

  it('validates ids and exposes distinct readable color profiles', () => {
    expect(isPaletteId('meteor-mauler')).toBe(true);
    expect(isPaletteId('locked-secret')).toBe(false);
    const colors = PALETTE_IDS.map((id) => getPaletteDefinition(id).accent);
    expect(new Set(colors).size).toBe(PALETTE_IDS.length);
  });

  it('presents stable names for known and unknown ids', () => {
    expect(presentPaletteName('royal-stinkcloud')).toBe('Royal Stinkcloud');
    expect(presentPaletteName('future-palette')).toBe('future-palette');
  });
});
