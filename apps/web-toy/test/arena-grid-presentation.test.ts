import { describe, expect, it } from 'vitest';
import {
  ARENA_GRID_MAJOR_EVERY,
  ARENA_GRID_MAJOR_TICK_LENGTH,
  ARENA_GRID_MINOR_TICK_LENGTH,
  ARENA_GRID_MINOR_SPACING,
  createArenaGridLineBuffers,
} from '../src/render/arena-grid-presentation';

function vertices(buffer: Float32Array): Array<readonly [number, number, number]> {
  const result: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < buffer.length; index += 3) {
    result.push([buffer[index]!, buffer[index + 1]!, buffer[index + 2]!]);
  }
  return result;
}

describe('arena grid presentation geometry', () => {
  it('keeps every static line inside the centered world bounds and retains its edges', () => {
    const width = 1_000;
    const height = 800;
    const { minor, major } = createArenaGridLineBuffers(width, height);
    const all = [...vertices(minor), ...vertices(major)];

    expect(minor.length % 6).toBe(0);
    expect(major.length % 6).toBe(0);
    expect(all.length).toBeGreaterThan(0);
    for (const [x, y, z] of all) {
      expect(x).toBeGreaterThanOrEqual(-width / 2);
      expect(x).toBeLessThanOrEqual(width / 2);
      expect(z).toBeGreaterThanOrEqual(-height / 2);
      expect(z).toBeLessThanOrEqual(height / 2);
      expect(y).toBeLessThan(0);
    }
    expect(major.some((value, index) => index % 3 === 0
      && value === -width / 2
      && major[index + 2] === -height / 2)).toBe(true);
    expect(major.some((value, index) => index % 3 === 0
      && value === width / 2
      && major[index + 2] === height / 2)).toBe(true);
  });

  it('keeps the authored five-cell cadence at the perimeter instead of crossing the arena', () => {
    const width = ARENA_GRID_MINOR_SPACING * ARENA_GRID_MAJOR_EVERY * 2;
    const { major } = createArenaGridLineBuffers(width, width);
    const half = width / 2;
    let hasVerticalCentreCadence = false;
    let hasHorizontalCentreCadence = false;
    for (let index = 0; index < major.length; index += 6) {
      const [x0, , z0, x1, , z1] = major.slice(index, index + 6);
      const length = Math.hypot(x1! - x0!, z1! - z0!);
      const touchesBorder = Math.abs(x0!) === half
        || Math.abs(x1!) === half
        || Math.abs(z0!) === half
        || Math.abs(z1!) === half;

      expect(length).toBeGreaterThan(0);
      expect(length).toBeLessThanOrEqual(ARENA_GRID_MAJOR_TICK_LENGTH);
      expect(touchesBorder).toBe(true);
      if (x0 === 0 && x1 === 0) hasVerticalCentreCadence = true;
      if (z0 === 0 && z1 === 0) hasHorizontalCentreCadence = true;
    }

    expect(hasVerticalCentreCadence).toBe(true);
    expect(hasHorizontalCentreCadence).toBe(true);
  });

  it('uses short border stitches instead of a full minor diagnostic lattice', () => {
    const width = 1_000;
    const height = 800;
    const { minor } = createArenaGridLineBuffers(width, height);
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    expect(minor.length).toBeGreaterThan(0);
    for (let index = 0; index < minor.length; index += 6) {
      const [x0, , z0, x1, , z1] = minor.slice(index, index + 6);
      const length = Math.hypot(x1! - x0!, z1! - z0!);
      const touchesBorder = Math.abs(x0!) === halfWidth
        || Math.abs(x1!) === halfWidth
        || Math.abs(z0!) === halfHeight
        || Math.abs(z1!) === halfHeight;

      expect(length).toBeGreaterThan(0);
      expect(length).toBeLessThanOrEqual(ARENA_GRID_MINOR_TICK_LENGTH);
      expect(touchesBorder).toBe(true);
    }
  });

  it('rejects non-positive or non-finite arena dimensions', () => {
    expect(() => createArenaGridLineBuffers(0, 100)).toThrow(RangeError);
    expect(() => createArenaGridLineBuffers(100, Number.NaN)).toThrow(RangeError);
  });
});
