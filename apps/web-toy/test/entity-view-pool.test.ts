import { describe, expect, it } from 'vitest';
import { createEntityViewPool } from '../src/render/entity-view-pool';
import type { EntityFrame, ViewFactory } from '../src/render/entity-view-pool';

/**
 * `@sim`'s `index.ts` re-exports `./types.js` via `export type * from './types.js'`,
 * which is a TYPE-ONLY re-export — `makeId` (a runtime function documented in
 * `types.ts`) is therefore not actually reachable as a value through the `@sim`
 * barrel as currently frozen (verified: `Object.keys(await import('@sim'))`
 * does not include it). Rather than touch lead-owned sim source to fix the
 * barrel, this test reimplements the exact, documented packing formula from
 * `spikes/headless-sim/src/types.ts` (`(generation << 16) | slotIndex`, 16-bit
 * masked) locally. This is pure id arithmetic, not sim behavior under test.
 */
function makeId(slotIndex: number, generation: number): number {
  return ((generation & 0xffff) << 16) | (slotIndex & 0xffff);
}

interface MockView {
  readonly tag: number;
}

interface Call {
  fn: 'acquire' | 'place' | 'show' | 'hide' | 'reset';
  view: number;
  x?: number;
  y?: number;
  scale?: number;
}

function createMockFactory(): { factory: ViewFactory<MockView>; calls: Call[] } {
  let nextTag = 0;
  const calls: Call[] = [];
  const factory: ViewFactory<MockView> = {
    acquire: (): MockView => {
      const view: MockView = { tag: nextTag };
      nextTag += 1;
      calls.push({ fn: 'acquire', view: view.tag });
      return view;
    },
    place: (view, x, y, scale): void => {
      calls.push({ fn: 'place', view: view.tag, x, y, scale });
    },
    show: (view): void => {
      calls.push({ fn: 'show', view: view.tag });
    },
    hide: (view): void => {
      calls.push({ fn: 'hide', view: view.tag });
    },
    reset: (view): void => {
      calls.push({ fn: 'reset', view: view.tag });
    },
  };
  return { factory, calls };
}

interface FrameEntry {
  id: number;
  x: number;
  y: number;
  scale: number;
}

function makeFrame(entries: readonly FrameEntry[]): EntityFrame {
  const count = entries.length;
  const id = new Int32Array(count);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const scale = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const entry = entries[i]!;
    id[i] = entry.id;
    x[i] = entry.x;
    y[i] = entry.y;
    scale[i] = entry.scale;
  }
  return { count, id, x, y, scale };
}

function acquireCount(calls: readonly Call[]): number {
  return calls.filter((c) => c.fn === 'acquire').length;
}

describe('entity-view-pool', () => {
  it('reuses the same view instance for an id that persists across frames (place, not acquire)', () => {
    const { factory, calls } = createMockFactory();
    const pool = createEntityViewPool(factory);
    pool.prewarm(2);

    const id = makeId(0, 1);
    pool.sync(makeFrame([{ id, x: 1, y: 1, scale: 1 }]));
    const firstPlace = calls.find((c) => c.fn === 'place');
    expect(firstPlace).toBeDefined();
    const firstView = firstPlace!.view;

    calls.length = 0;
    pool.sync(makeFrame([{ id, x: 5, y: 6, scale: 2 }]));

    expect(acquireCount(calls)).toBe(0);
    const secondPlace = calls.find((c) => c.fn === 'place');
    expect(secondPlace).toBeDefined();
    expect(secondPlace!.view).toBe(firstView);
    expect(secondPlace!.x).toBe(5);
    expect(secondPlace!.y).toBe(6);
    expect(secondPlace!.scale).toBe(2);
    expect(pool.liveViews).toBe(1);
  });

  it('releases a despawned id back to the free list (hide + reset)', () => {
    const { factory, calls } = createMockFactory();
    const pool = createEntityViewPool(factory);
    pool.prewarm(4);

    const id = makeId(2, 1);
    pool.sync(makeFrame([{ id, x: 0, y: 0, scale: 1 }]));
    expect(pool.liveViews).toBe(1);
    const mountedView = calls.find((c) => c.fn === 'place')!.view;

    calls.length = 0;
    pool.sync(makeFrame([])); // despawned: id no longer present

    expect(pool.liveViews).toBe(0);
    const hideCall = calls.find((c) => c.fn === 'hide' && c.view === mountedView);
    const resetCall = calls.find((c) => c.fn === 'reset' && c.view === mountedView);
    expect(hideCall).toBeDefined();
    expect(resetCall).toBeDefined();
    expect(pool.freeCount).toBe(4);
    expect(acquireCount(calls)).toBe(0);
  });

  it('releases and resets a stale view before a generation-changed id reuses its slot', () => {
    const { factory, calls } = createMockFactory();
    const pool = createEntityViewPool(factory);
    pool.prewarm(4);

    const gen1 = makeId(5, 1);
    pool.sync(makeFrame([{ id: gen1, x: 1, y: 2, scale: 3 }]));
    const gen1View = calls.find((c) => c.fn === 'place')!.view;

    calls.length = 0;
    // Same underlying slot (5), but a new generation => a different EntityId.
    const gen2 = makeId(5, 2);
    pool.sync(makeFrame([{ id: gen2, x: 9, y: 9, scale: 9 }]));

    // The stale gen1 view was hidden and reset before/around the reuse.
    const hideCall = calls.find((c) => c.fn === 'hide');
    expect(hideCall).toBeDefined();
    expect(hideCall!.view).toBe(gen1View);
    const resetOfOld = calls.find((c) => c.fn === 'reset' && c.view === gen1View);
    expect(resetOfOld).toBeDefined();

    // The new id (gen2) was mounted on a view that got reset() before placement.
    const placeGen2 = calls.find((c) => c.fn === 'place' && c.x === 9);
    expect(placeGen2).toBeDefined();
    const gen2View = placeGen2!.view;
    const resetOfNew = calls.find((c) => c.fn === 'reset' && c.view === gen2View);
    expect(resetOfNew).toBeDefined();

    expect(pool.liveViews).toBe(1);
  });

  it('does not grow (no acquire() calls) once warmed, for a stable set of ids across many frames', () => {
    const { factory, calls } = createMockFactory();
    const pool = createEntityViewPool(factory);
    const ids = [makeId(0, 1), makeId(1, 1), makeId(2, 1)];
    pool.prewarm(8);
    calls.length = 0;

    for (let n = 0; n < 50; n++) {
      const frame = makeFrame(ids.map((id, i) => ({ id, x: i + n, y: i, scale: 1 })));
      pool.sync(frame);
    }

    expect(acquireCount(calls)).toBe(0);
    expect(pool.liveViews).toBe(3);
    expect(pool.highWaterViews).toBe(3);
  });
});
