/**
 * Agent B — Uniform 2D spatial grid over world bounds.
 *
 * Storage: per-cell singly-doubly-linked lists over a dense internal slot
 * table (parallel typed arrays), keyed from public EntityIds via a
 * Map<EntityId, internalSlot>. Insert/remove/update touch the Map (not the
 * hot query path); queryRadius/nearest never allocate beyond a fixed
 * per-grid scratch buffer and the caller-supplied `out` array.
 *
 * Documented policy choices (also exercised in test/spatial-grid.test.ts):
 *  - insert(): throws Error on a duplicate id, and throws Error if the grid
 *    is at maxEntities capacity (both are programmer-error invariants).
 *  - remove(): throws Error on an unknown id. Chosen (rather than a
 *    no-op) so that grid bookkeeping bugs (double-remove, remove-before-
 *    insert, removing an id from the wrong grid) surface immediately;
 *    unlike Pool.despawn (a hot per-tick path where re-despawn-of-dead is
 *    plausible and harmless), grid membership changes are comparatively
 *    rare and always paired 1:1 with a prior insert() in correct code.
 *  - update(): throws Error on an unknown id, for the same reason as
 *    remove().

 *  - Cell binning clamps out-of-bounds positions to the nearest edge cell
 *    (per the frozen interface doc), but the *stored* x/y used for exact
 *    distance checks in queryRadius/nearest is always the raw, un-clamped
 *    value passed in. This keeps queries geometrically exact even for
 *    entities or query points outside world bounds.
 *  - Positions are stored as Float64Array (not Float32Array) even though
 *    insert/update take plain `number`. The interface's "exact distance
 *    check" requirement (dist^2 <= r^2, inclusive) is easiest to reason
 *    about — and to test at exact-boundary cases — without an extra layer
 *    of float32 rounding on top of whatever precision the caller passed in.
 */
import type { EntityId, SpatialGrid } from './types.js';
import { NO_ENTITY } from './types.js';

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

class SpatialGridImpl implements SpatialGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellSize: number;
  private readonly maxEntities: number;

  private readonly cellHead: Int32Array;
  private readonly prevInCell: Int32Array;
  private readonly nextInCell: Int32Array;
  private readonly cellOfSlot: Int32Array;
  private readonly entityIdOfSlot: Int32Array;
  private readonly posX: Float64Array;
  private readonly posY: Float64Array;

  private readonly freeSlots: Int32Array;
  private freeTop: number;

  private readonly idToSlot = new Map<EntityId, number>();

  private readonly scratch: Int32Array;

  private _queryCount = 0;

  constructor(worldWidth: number, worldHeight: number, cellSize: number, maxEntities: number) {
    if (!Number.isFinite(worldWidth) || worldWidth <= 0) {
      throw new RangeError(`createSpatialGrid: worldWidth must be finite and > 0 (received ${worldWidth})`);
    }
    if (!Number.isFinite(worldHeight) || worldHeight <= 0) {
      throw new RangeError(`createSpatialGrid: worldHeight must be finite and > 0 (received ${worldHeight})`);
    }
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError(`createSpatialGrid: cellSize must be finite and > 0 (received ${cellSize})`);
    }
    if (!Number.isInteger(maxEntities) || maxEntities < 1 || maxEntities >= 0xffff) {
      throw new RangeError(
        `createSpatialGrid: maxEntities must be an integer in [1, 65534] (received ${maxEntities})`,
      );
    }
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(worldWidth / cellSize));
    this.rows = Math.max(1, Math.ceil(worldHeight / cellSize));
    this.maxEntities = maxEntities;

    this.cellHead = new Int32Array(this.cols * this.rows).fill(-1);
    this.prevInCell = new Int32Array(maxEntities).fill(-1);
    this.nextInCell = new Int32Array(maxEntities).fill(-1);
    this.cellOfSlot = new Int32Array(maxEntities).fill(-1);
    this.entityIdOfSlot = new Int32Array(maxEntities);
    this.posX = new Float64Array(maxEntities);
    this.posY = new Float64Array(maxEntities);

    this.freeSlots = new Int32Array(maxEntities);
    for (let i = 0; i < maxEntities; i++) {
      this.freeSlots[i] = maxEntities - 1 - i;
    }
    this.freeTop = maxEntities;

    this.scratch = new Int32Array(maxEntities);
  }

  get queryCount(): number {
    return this._queryCount;
  }

  private cellIndexFor(x: number, y: number): number {
    const cx = clampInt(Math.floor(x / this.cellSize), 0, this.cols - 1);
    const cy = clampInt(Math.floor(y / this.cellSize), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  private linkInto(cellIdx: number, slot: number): void {
    const head = this.cellHead[cellIdx]!;
    this.nextInCell[slot] = head;
    this.prevInCell[slot] = -1;
    if (head !== -1) this.prevInCell[head] = slot;
    this.cellHead[cellIdx] = slot;
    this.cellOfSlot[slot] = cellIdx;
  }

  private unlinkFrom(cellIdx: number, slot: number): void {
    const p = this.prevInCell[slot]!;
    const n = this.nextInCell[slot]!;
    if (p !== -1) this.nextInCell[p] = n;
    else this.cellHead[cellIdx] = n;
    if (n !== -1) this.prevInCell[n] = p;
    this.prevInCell[slot] = -1;
    this.nextInCell[slot] = -1;
  }

  insert(id: EntityId, x: number, y: number): void {
    if (this.idToSlot.has(id)) {
      throw new Error(`SpatialGrid.insert: duplicate id ${id}`);
    }
    if (this.freeTop === 0) {
      throw new Error('SpatialGrid.insert: capacity exceeded');
    }
    this.freeTop--;
    const slot = this.freeSlots[this.freeTop]!;
    this.posX[slot] = x;
    this.posY[slot] = y;
    this.entityIdOfSlot[slot] = id;
    const cellIdx = this.cellIndexFor(x, y);
    this.linkInto(cellIdx, slot);
    this.idToSlot.set(id, slot);
  }

  update(id: EntityId, x: number, y: number): void {
    const slot = this.idToSlot.get(id);
    if (slot === undefined) {
      throw new Error(`SpatialGrid.update: unknown id ${id}`);
    }
    this.posX[slot] = x;
    this.posY[slot] = y;
    const newCellIdx = this.cellIndexFor(x, y);
    const oldCellIdx = this.cellOfSlot[slot]!;
    if (newCellIdx !== oldCellIdx) {
      this.unlinkFrom(oldCellIdx, slot);
      this.linkInto(newCellIdx, slot);
    }
  }

  remove(id: EntityId): void {
    const slot = this.idToSlot.get(id);
    if (slot === undefined) {
      throw new Error(`SpatialGrid.remove: unknown id ${id}`);
    }
    const cellIdx = this.cellOfSlot[slot]!;
    this.unlinkFrom(cellIdx, slot);
    this.cellOfSlot[slot] = -1;
    this.idToSlot.delete(id);
    this.freeSlots[this.freeTop] = slot;
    this.freeTop++;
  }

  clear(): void {
    this.cellHead.fill(-1);
    this.prevInCell.fill(-1);
    this.nextInCell.fill(-1);
    this.cellOfSlot.fill(-1);
    this.idToSlot.clear();
    for (let i = 0; i < this.maxEntities; i++) {
      this.freeSlots[i] = this.maxEntities - 1 - i;
    }
    this.freeTop = this.maxEntities;
    // _queryCount is diagnostic-only and intentionally not reset by clear().
  }

  queryRadius(x: number, y: number, radius: number, out: EntityId[]): number {
    this._queryCount++;
    const s = this.cellSize;
    const minCellX = clampInt(Math.floor((x - radius) / s), 0, this.cols - 1);
    const maxCellX = clampInt(Math.floor((x + radius) / s), 0, this.cols - 1);
    const minCellY = clampInt(Math.floor((y - radius) / s), 0, this.rows - 1);
    const maxCellY = clampInt(Math.floor((y + radius) / s), 0, this.rows - 1);
    const rSq = radius * radius;

    let n = 0;
    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellIdx = cy * this.cols + cx;
        let slot = this.cellHead[cellIdx]!;
        while (slot !== -1) {
          const dx = this.posX[slot]! - x;
          const dy = this.posY[slot]! - y;
          const distSq = dx * dx + dy * dy;
          if (distSq <= rSq) {
            this.scratch[n++] = this.entityIdOfSlot[slot]!;
          }
          slot = this.nextInCell[slot]!;
        }
      }
    }

    const view = this.scratch.subarray(0, n);
    view.sort(); // TypedArray default sort is numeric ascending.
    out.length = n;
    for (let i = 0; i < n; i++) {
      out[i] = view[i]!;
    }
    return n;
  }

  nearest(x: number, y: number, maxRadius: number, exclude?: (id: EntityId) => boolean): EntityId {
    this._queryCount++;
    const s = this.cellSize;
    // Ring search must expand around the same CLAMPED cell that insert()
    // would bin this (x,y) into, not the raw (possibly negative / >=cols)
    // cell index. Out-of-bounds entities are stored in the clamped edge
    // cell, so an out-of-bounds query point must center its search there
    // too, or the ring can chase nonexistent cells and stop early without
    // ever reaching the real edge cell (see spatial-grid.test.ts).
    const ccx = clampInt(Math.floor(x / s), 0, this.cols - 1);
    const ccy = clampInt(Math.floor(y / s), 0, this.rows - 1);
    const ox = x - ccx * s;
    const oy = y - ccy * s;
    const maxRadiusSq = maxRadius * maxRadius;

    let bestId: EntityId = NO_ENTITY;
    let bestDistSq = Infinity;

    const consider = (id: EntityId, distSq: number): void => {
      if (distSq > maxRadiusSq) return;
      if (exclude && exclude(id)) return;
      if (distSq < bestDistSq || (distSq === bestDistSq && id < bestId)) {
        bestDistSq = distSq;
        bestId = id;
      }
    };

    const scanCell = (cx: number, cy: number): void => {
      if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return;
      const cellIdx = cy * this.cols + cx;
      let slot = this.cellHead[cellIdx]!;
      while (slot !== -1) {
        const dx = this.posX[slot]! - x;
        const dy = this.posY[slot]! - y;
        consider(this.entityIdOfSlot[slot]!, dx * dx + dy * dy);
        slot = this.nextInCell[slot]!;
      }
    };

    const maxRing = this.cols + this.rows + 2; // generous, mathematically never needed to reach
    let R = 0;
    while (R <= maxRing) {
      if (R === 0) {
        scanCell(ccx, ccy);
      } else {
        for (let cx = ccx - R; cx <= ccx + R; cx++) {
          scanCell(cx, ccy - R);
          scanCell(cx, ccy + R);
        }
        for (let cy = ccy - R + 1; cy <= ccy + R - 1; cy++) {
          scanCell(ccx - R, cy);
          scanCell(ccx + R, cy);
        }
      }

      // Minimum possible distance from (x,y) to any point in a valid grid
      // cell not yet scanned. Once this bound meets or exceeds maxRadius,
      // or already exceeds/equals the current best, no further ring can
      // change the answer. A direction contributes no bound (Infinity)
      // once the valid grid is exhausted that way (no more cells exist
      // there, ever) — otherwise a query point far outside world bounds
      // could yield a spurious small gap in the "away from the grid"
      // direction and stop the search before reaching real cells.
      const hasLeftMore = ccx - R - 1 >= 0;
      const hasRightMore = ccx + R + 1 <= this.cols - 1;
      const hasTopMore = ccy - R - 1 >= 0;
      const hasBottomMore = ccy + R + 1 <= this.rows - 1;
      const leftGap = hasLeftMore ? ox + R * s : Infinity;
      const rightGap = hasRightMore ? (R + 1) * s - ox : Infinity;
      const topGap = hasTopMore ? oy + R * s : Infinity;
      const bottomGap = hasBottomMore ? (R + 1) * s - oy : Infinity;
      const minGap = Math.min(leftGap, rightGap, topGap, bottomGap);

      if (minGap >= maxRadius) break;
      if (bestId !== NO_ENTITY && bestDistSq <= minGap * minGap) break;
      R++;
    }

    return bestId;
  }
}

export function createSpatialGrid(
  worldWidth: number,
  worldHeight: number,
  cellSize: number,
  maxEntities: number,
): SpatialGrid {
  return new SpatialGridImpl(worldWidth, worldHeight, cellSize, maxEntities);
}
