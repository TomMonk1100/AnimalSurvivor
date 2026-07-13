import { describe, expect, it } from 'vitest';
import { clampCameraTarget } from '../src/render/camera-bounds';

const camera = (overrides: Partial<Parameters<typeof clampCameraTarget>[0]> = {}) => clampCameraTarget({
  targetX: 1_000,
  targetY: 1_000,
  worldWidth: 2_000,
  worldHeight: 2_000,
  aspect: 16 / 9,
  orthoHalfHeight: 190,
  cameraHeight: 600,
  followBackOffset: 520,
  ...overrides,
});

describe('renderer camera bounds', () => {
  it('passes through a centered target and clamps all four world edges', () => {
    expect(camera()).toEqual({ x: 1_000, y: 1_000 });
    expect(camera({ targetX: -10, targetY: -10 })).toEqual({ x: 337.77777777777777, y: 251.42615438953663 });
    expect(camera({ targetX: 9_000, targetY: 9_000 })).toEqual({ x: 1662.2222222222222, y: 1748.5738456104634 });
  });

  it('adapts the horizontal viewport to portrait and ultrawide layouts', () => {
    expect(camera({ targetX: 0, aspect: 0.5 }).x).toBe(95);
    expect(camera({ targetX: 0, aspect: 2.5 }).x).toBe(475);
  });

  it('centers a world smaller than the projected viewport instead of inverting bounds', () => {
    expect(camera({ worldWidth: 100, worldHeight: 80, targetX: -20, targetY: 900 })).toEqual({ x: 50, y: 40 });
  });
});
