import { describe, it, expect } from 'vitest';
import { createAutopilot } from '../src/stress/autopilot';

describe('autopilot', () => {
  it('is a pure function of tick: same tick always yields the same output', () => {
    const a = createAutopilot();
    const b = createAutopilot();
    for (let t = 0; t < 500; t += 7) {
      const first = a.sample(t, false);
      const second = a.sample(t, false);
      const other = b.sample(t, false);
      expect(second).toEqual(first);
      expect(other).toEqual(first);
    }
  });

  it('is independent of call order (sampling ticks out of order matches in-order sampling)', () => {
    const inOrder = createAutopilot();
    const outOfOrder = createAutopilot();
    const ticks = [50, 10, 200, 0, 999, 133];
    const expected = ticks.map((t) => inOrder.sample(t, false));

    const shuffled = [...ticks].reverse();
    const actualByTick = new Map<number, ReturnType<typeof outOfOrder.sample>>();
    for (const t of shuffled) {
      actualByTick.set(t, outOfOrder.sample(t, false));
    }

    ticks.forEach((t, i) => {
      expect(actualByTick.get(t)).toEqual(expected[i]);
    });
  });

  it('produces varying output across ticks (roams rather than staying fixed)', () => {
    const a = createAutopilot();
    const samples = new Set<string>();
    for (let t = 0; t < 300; t++) {
      const s = a.sample(t, false);
      samples.add(`${s.moveX.toFixed(4)},${s.moveY.toFixed(4)}`);
    }
    expect(samples.size).toBeGreaterThan(50);
  });

  it('keeps both components within [-1, 1] across a wide tick range', () => {
    const a = createAutopilot();
    for (let t = 0; t < 5000; t += 3) {
      const s = a.sample(t, false);
      expect(s.moveX).toBeGreaterThanOrEqual(-1);
      expect(s.moveX).toBeLessThanOrEqual(1);
      expect(s.moveY).toBeGreaterThanOrEqual(-1);
      expect(s.moveY).toBeLessThanOrEqual(1);
    }
  });

  it('passes the paused flag through without affecting the movement vector', () => {
    const a = createAutopilot();
    const pausedSample = a.sample(100, true);
    const runningSample = a.sample(100, false);
    expect(pausedSample.moveX).toBe(runningSample.moveX);
    expect(pausedSample.moveY).toBe(runningSample.moveY);
    expect(pausedSample.paused).toBe(true);
    expect(runningSample.paused).toBe(false);
  });

  it('clear() and dispose() are no-ops that never throw', () => {
    const a = createAutopilot();
    expect(() => a.clear()).not.toThrow();
    expect(() => a.dispose()).not.toThrow();
    // Still produces the same deterministic output after "teardown".
    expect(a.sample(42, false)).toEqual(a.sample(42, false));
  });
});
