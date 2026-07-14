import { describe, expect, it } from 'vitest';
import {
  easeInQuad,
  easeOutBack,
  easeOutCubic,
  envelope,
} from '../src/render/vfx-easing';

describe('VFX easing', () => {
  it('clamps scalar easing inputs to deterministic normalized endpoints', () => {
    expect(easeOutCubic(-10)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeInQuad(-10)).toBe(0);
    expect(easeInQuad(1)).toBe(1);
    expect(easeOutBack(0)).toBe(0);
    expect(easeOutBack(1)).toBe(1);
  });

  it('uses an overshooting launch only before settling at one', () => {
    expect(easeOutBack(0.55)).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBe(1);
  });

  it('builds a true-zero attack, hold, and release envelope', () => {
    expect(envelope(0, 0.12, 0.55)).toBe(0);
    expect(envelope(1, 0.12, 0.55)).toBe(0);
    expect(envelope(0.06, 0.12, 0.55)).toBeGreaterThan(0);
    expect(envelope(0.12, 0.12, 0.55)).toBe(1);
    expect(envelope(0.45, 0.12, 0.55)).toBe(1);
    expect(envelope(0.8, 0.12, 0.55)).toBeGreaterThan(0);
    expect(envelope(0.8, 0.12, 0.55)).toBeLessThan(1);
  });

  it('normalizes malformed overlapping windows instead of returning a stale opacity', () => {
    expect(envelope(0.5, 2, 2)).toBeGreaterThan(0);
    expect(envelope(Number.NaN, 0.12, 0.55)).toBe(0);
    expect(envelope(0.5, Number.NaN, Number.NaN)).toBe(1);
  });
});
