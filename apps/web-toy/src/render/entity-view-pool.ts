/**
 * Generation-safe pooled render views.
 *
 * Views are mapped by generation-guarded EntityId, never by pool slot alone.
 * The simulation's `EntityId` packs `(generation << 16) | slotIndex`
 * (see `@sim`'s `makeId`/`idSlot`/`idGeneration`), so a despawn+respawn that
 * reuses the same underlying sim slot but bumps the generation always
 * produces a brand-new id here. This pool treats that new id as an unrelated
 * entity: the previous occupant's view is hidden + reset and returned to the
 * free list, and the new id is mounted on a freshly-reset view. That is what
 * prevents stale visual state (leftover position/scale/tint from whatever
 * used to occupy a reused slot) from ever leaking onto the new occupant.
 *
 * The id -> view bookkeeping here is intentionally decoupled from PlayCanvas:
 * it only depends on the `ViewFactory<V>` contract below, so it is fully unit
 * testable with a mock factory — no GPU, no WebGL, no jsdom canvas required.
 * `playcanvas-scene.ts` supplies the production `ViewFactory<pc.Entity>`.
 */
import type { EntityId } from '@sim';

/**
 * Dependency-injected view lifecycle. Implementations must be side-effect
 * free with respect to simulation state — views are purely visual.
 */
export interface ViewFactory<V> {
  /** Create a brand-new view. Only called when the free list is exhausted. */
  acquire(): V;
  /** Move/scale an already-mounted view. Called every frame it is live. */
  place(view: V, x: number, y: number, scale: number): void;
  /** Make a mounted view visible. */
  show(view: V): void;
  /** Make a released view invisible. */
  hide(view: V): void;
  /** Clear any stale visual state (position/scale/tint/etc.) on a view. */
  reset(view: V): void;
}

/**
 * One frame's worth of live entities to mount, as flat parallel arrays
 * indexed `0..count-1`. Mirrors the shape of `CategorySnapshot` from
 * `contracts.ts` but stays independent of that type so this module has no
 * dependency on app-level render snapshot semantics (interpolation, world ->
 * scene coordinate mapping, etc. all happen upstream, in `playcanvas-scene.ts`).
 */
export interface EntityFrame {
  readonly count: number;
  readonly id: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
}

// Note: this interface deliberately does not parameterize over `V` — nothing
// in the public pool contract exposes a view instance (frames go in, nothing
// view-typed comes out), so callers holding an `EntityViewPool` never need to
// know `V`. `V` only matters to `ViewFactory<V>` and `createEntityViewPool`.
export interface EntityViewPool {
  /** Preallocate `n` views into the free list ahead of steady-state use. */
  prewarm(n: number): void;
  /** Mount/reuse/release views so the mounted set matches `frame` exactly. */
  sync(frame: EntityFrame): void;
  /** Count of views currently mounted (visible, tracking a live id). */
  readonly liveViews: number;
  /** High-water mark of `liveViews` observed so far. */
  readonly highWaterViews: number;
  /** Views sitting in the free list, available for reuse without growing. */
  readonly freeCount: number;
}

interface MountedView<V> {
  view: V;
  /** Frame stamp this view was last confirmed live on; see `sync`. */
  stamp: number;
}

class EntityViewPoolImpl<V> implements EntityViewPool {
  private readonly mounted = new Map<EntityId, MountedView<V>>();
  private readonly free: V[] = [];
  private frameStamp = 0;
  private live = 0;
  private highWater = 0;

  constructor(private readonly factory: ViewFactory<V>) {}

  get liveViews(): number {
    return this.live;
  }

  get highWaterViews(): number {
    return this.highWater;
  }

  get freeCount(): number {
    return this.free.length;
  }

  prewarm(n: number): void {
    for (let i = 0; i < n; i++) {
      const view = this.factory.acquire();
      this.factory.hide(view);
      this.free.push(view);
    }
  }

  sync(frame: EntityFrame): void {
    this.frameStamp += 1;
    const stamp = this.frameStamp;

    for (let i = 0; i < frame.count; i++) {
      const id = frame.id[i]!;
      const x = frame.x[i]!;
      const y = frame.y[i]!;
      const scale = frame.scale[i]!;

      let mounted = this.mounted.get(id);
      if (mounted === undefined) {
        // Unseen id this tick: either a fresh spawn, or a new generation
        // reusing a slot whose previous occupant is (still) mounted under
        // its own, different id. Either way this is a NEW mapping entry —
        // acquire a view (free list first, else grow) and clear stale state.
        const view = this.acquireView();
        this.factory.reset(view);
        this.factory.show(view);
        mounted = { view, stamp };
        this.mounted.set(id, mounted);
        this.live += 1;
        if (this.live > this.highWater) {
          this.highWater = this.live;
        }
      } else {
        mounted.stamp = stamp;
      }
      this.factory.place(mounted.view, x, y, scale);
    }

    // Anything still mapped but not touched this tick is either despawned or
    // a stale generation whose slot was reused under a new id above; release
    // it back to the free list, hidden and reset.
    for (const [id, mounted] of this.mounted) {
      if (mounted.stamp !== stamp) {
        this.factory.hide(mounted.view);
        this.factory.reset(mounted.view);
        this.free.push(mounted.view);
        this.mounted.delete(id);
        this.live -= 1;
      }
    }
  }

  private acquireView(): V {
    const fromFree = this.free.pop();
    if (fromFree !== undefined) {
      return fromFree;
    }
    return this.factory.acquire();
  }
}

export function createEntityViewPool<V>(factory: ViewFactory<V>): EntityViewPool {
  return new EntityViewPoolImpl(factory);
}
