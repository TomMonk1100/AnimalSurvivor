import { describe, it, expect } from 'vitest';
import { createPerformanceMonitor } from '../src/diagnostics/performance-monitor';

describe('performance monitor', () => {
  it('reports sane fps/frameTimeMs for a constant frame time', () => {
    const monitor = createPerformanceMonitor(10);
    for (let i = 0; i < 10; i++) monitor.frame(16.6667);
    expect(monitor.frameTimeMs).toBeCloseTo(16.6667, 3);
    expect(monitor.fps).toBeCloseTo(60, 0);
  });

  it('frameTimeMs reflects the most recent sample', () => {
    const monitor = createPerformanceMonitor(10);
    monitor.frame(10);
    monitor.frame(20);
    monitor.frame(33.3);
    expect(monitor.frameTimeMs).toBeCloseTo(33.3, 5);
  });

  it('orders percentiles p50 <= p95 <= p99', () => {
    const monitor = createPerformanceMonitor(100);
    for (let i = 1; i <= 100; i++) monitor.frame(i);
    const [p50, p95, p99] = monitor.percentiles();
    expect(p50).toBeLessThanOrEqual(p95);
    expect(p95).toBeLessThanOrEqual(p99);
    expect(p50).toBeGreaterThan(0);
    expect(p99).toBeLessThanOrEqual(100);
  });

  it('rolls old samples off past the window size', () => {
    const monitor = createPerformanceMonitor(5);
    for (let i = 0; i < 5; i++) monitor.frame(100);
    for (let i = 0; i < 5; i++) monitor.frame(10);
    const [p50, p95, p99] = monitor.percentiles();
    expect(p50).toBeCloseTo(10, 5);
    expect(p95).toBeCloseTo(10, 5);
    expect(p99).toBeCloseTo(10, 5);
  });

  it('handles an empty window without throwing', () => {
    const monitor = createPerformanceMonitor(10);
    expect(monitor.fps).toBe(0);
    expect(monitor.frameTimeMs).toBe(0);
    expect(monitor.percentiles()).toEqual([0, 0, 0]);
  });

  it('reset() clears accumulated stats', () => {
    const monitor = createPerformanceMonitor(10);
    for (let i = 0; i < 10; i++) monitor.frame(50);
    monitor.reset();
    expect(monitor.fps).toBe(0);
    expect(monitor.frameTimeMs).toBe(0);
    expect(monitor.percentiles()).toEqual([0, 0, 0]);
  });
});
