import type { PerformanceMonitor } from '../contracts';

/**
 * Rolling-window frame-time monitor. `frame()` writes into a fixed-size ring
 * buffer (no allocation in the steady-state per-frame path); `percentiles()`
 * copies + sorts the current window and may allocate, since it's only called
 * at the HUD's throttled update rate.
 */
export function createPerformanceMonitor(windowSize = 120): PerformanceMonitor {
  const size = Math.max(1, Math.floor(windowSize));
  const buffer = new Float64Array(size);
  let count = 0; // number of valid samples currently in the buffer (<= size)
  let head = 0; // index the NEXT sample will be written to
  let sum = 0; // running sum of samples currently in the buffer
  let lastFrameTimeMs = 0;

  function frame(frameTimeMs: number): void {
    if (count === size) {
      const old = buffer[head] ?? 0;
      sum -= old;
    } else {
      count += 1;
    }
    buffer[head] = frameTimeMs;
    sum += frameTimeMs;
    head = (head + 1) % size;
    lastFrameTimeMs = frameTimeMs;
  }

  function percentileAt(sorted: Float64Array, p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx] ?? 0;
  }

  return {
    frame,
    get fps(): number {
      const avg = count > 0 ? sum / count : 0;
      return avg > 0 ? 1000 / avg : 0;
    },
    get frameTimeMs(): number {
      return lastFrameTimeMs;
    },
    percentiles(): [number, number, number] {
      if (count === 0) return [0, 0, 0];
      const values = new Float64Array(count);
      const start = (head - count + size) % size;
      for (let i = 0; i < count; i++) {
        const idx = (start + i) % size;
        values[i] = buffer[idx] ?? 0;
      }
      values.sort();
      return [percentileAt(values, 0.5), percentileAt(values, 0.95), percentileAt(values, 0.99)];
    },
    reset(): void {
      buffer.fill(0);
      count = 0;
      head = 0;
      sum = 0;
      lastFrameTimeMs = 0;
    },
  };
}
