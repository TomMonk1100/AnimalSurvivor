import { describe, expect, it } from 'vitest';
import { VfxTransformStore } from '../src/render/vfx-transform-store';

function matrix(store: VfxTransformStore): number[] {
  return Array.from(store.matrices.slice(0, 16));
}

describe('VfxTransformStore', () => {
  it('writes a bounded, column-major top-down transform', () => {
    const store = new VfxTransformStore(1);
    expect(store.push(10, 20, 2, 3, 4, 5, Math.PI / 2)).toBe(true);
    expect(store.count).toBe(1);
    expect(matrix(store)).toEqual([
      0, 0, -2, 0,
      0, 3, 0, 0,
      4, 0, 0, 0,
      10, 5, 20, 1,
    ]);
    expect(store.push(0, 0, 1, 1, 1)).toBe(false);
  });

  it('writes a stable ribbon and reuses its backing storage after reset', () => {
    const store = new VfxTransformStore(2);
    const backing = store.matrices;
    expect(store.pushRibbon(0, 0, 0, 10, 2, 0.4)).toBe(true);
    expect(store.matrices[12]).toBe(0);
    expect(store.matrices[13]).toBeCloseTo(0.4);
    expect(store.matrices[14]).toBe(5);
    expect(store.matrices[0]).toBe(2);
    expect(store.matrices[10]).toBe(10);
    store.reset();
    expect(store.count).toBe(0);
    expect(store.matrices).toBe(backing);
  });
});
