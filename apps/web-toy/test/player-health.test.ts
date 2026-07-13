import { describe, expect, it } from 'vitest';
import { presentPlayerHealth } from '../src/presentation/player-health';

describe('player health presentation', () => {
  it('clamps authoritative values into a readable fraction and percent', () => {
    expect(presentPlayerHealth(42, 100)).toEqual({ current: 42, max: 100, fraction: 0.42, percent: 42 });
    expect(presentPlayerHealth(150, 100)).toMatchObject({ current: 100, fraction: 1, percent: 100 });
    expect(presentPlayerHealth(-5, 100)).toMatchObject({ current: 0, fraction: 0, percent: 0 });
  });

  it('hides the bar when maximum health is unavailable', () => {
    expect(presentPlayerHealth(1, 0)).toBeNull();
    expect(presentPlayerHealth(1, Number.NaN)).toBeNull();
  });
});
