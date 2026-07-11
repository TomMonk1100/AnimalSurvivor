import { describe, expect, it } from 'vitest';
import {
  ARENA_GRID_MAJOR_EVERY,
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

  it('places major lines at the authored five-cell cadence', () => {
    const width = ARENA_GRID_MINOR_SPACING * ARENA_GRID_MAJOR_EVERY * 2;
    const { major } = createArenaGridLineBuffers(width, width);
    const coordinates = new Set<number>();
    for (const [x, , z] of vertices(major)) {
      coordinates.add(x);
      coordinates.add(z);
    }

    expect(coordinates).toEqual(new Set([-width / 2, 0, width / 2]));
  });

  it('rejects non-positive or non-finite arena dimensions', () => {
    expect(() => createArenaGridLineBuffers(0, 100)).toThrow(RangeError);
    expect(() => createArenaGridLineBuffers(100, Number.NaN)).toThrow(RangeError);
  });
});
