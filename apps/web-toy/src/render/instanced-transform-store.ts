import type { CategorySnapshot } from '../contracts';

/** Default renderer budget for one instanced category. */
export const DEFAULT_INSTANCE_CAPACITY = 1200;

const ENTITY_SLOT_COUNT = 0x1_0000;
const MATRIX_STRIDE = 16;

function idSlot(id: number): number {
  return id & 0xffff;
}

function clampAlpha(alpha: number): number {
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
}

/**
 * Allocation-stable bridge from simulation snapshots to a GPU instance buffer.
 *
 * `matrices` contains a tightly packed, column-major affine matrix for every
 * live entry in the current snapshot. Its active prefix is
 * `matrices.subarray(0, count * 16)`, although render code should avoid making
 * that subarray in its frame loop and upload the backing buffer with `count`.
 * The layout matches `pc.Mat4#data` and PlayCanvas's default four-vec4 instance
 * transform format.
 *
 * Output order is exactly current-snapshot order. Previous transforms are
 * found by the entity's 16-bit pool slot and then guarded by equality of the
 * complete generation-packed id. A new entity reusing a slot therefore snaps
 * to its current transform instead of interpolating from the stale occupant.
 */
export class InstancedTransformStore {
  readonly ids: Int32Array;
  readonly archetypes: Uint8Array;
  readonly matrices: Float32Array;

  private readonly previousIndexBySlot = new Int32Array(ENTITY_SLOT_COUNT).fill(-1);
  private liveCount = 0;

  constructor(readonly capacity: number = DEFAULT_INSTANCE_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError(`Instance capacity must be a non-negative integer; received ${capacity}`);
    }

    this.ids = new Int32Array(capacity);
    this.archetypes = new Uint8Array(capacity);
    this.matrices = new Float32Array(capacity * MATRIX_STRIDE);
  }

  get count(): number {
    return this.liveCount;
  }

  /**
   * Rebuild the active instance prefix without allocating or mutating either
   * snapshot. Offsets are applied after interpolation; `zScale` supports the
   * top-down camera's simulation-Y to scene-Z inversion.
   */
  update(
    previous: CategorySnapshot,
    current: CategorySnapshot,
    alpha: number,
    offsetX = 0,
    offsetZ = 0,
    zScale = 1,
  ): void {
    if (current.count > this.capacity) {
      throw new RangeError(
        `Snapshot has ${current.count} ${current.category} instances, exceeding capacity ${this.capacity}`,
      );
    }

    const t = clampAlpha(alpha);

    for (let index = 0; index < previous.count; index++) {
      this.previousIndexBySlot[idSlot(previous.id[index]!)] = index;
    }

    for (let index = 0; index < current.count; index++) {
      const id = current.id[index]!;
      const previousIndex = this.previousIndexBySlot[idSlot(id)]!;
      const currentX = current.x[index]!;
      const currentZ = current.y[index]!;
      let x = currentX;
      let z = currentZ;

      if (previousIndex !== -1 && previous.id[previousIndex] === id) {
        x = previous.x[previousIndex]! + (currentX - previous.x[previousIndex]!) * t;
        z = previous.y[previousIndex]! + (currentZ - previous.y[previousIndex]!) * t;
      }

      const scale = current.radius[index]! * 2;
      const matrixOffset = index * MATRIX_STRIDE;

      this.ids[index] = id;
      this.archetypes[index] = current.archetype[index]!;

      // Column-major uniform-scale + translation matrix.
      this.matrices[matrixOffset] = scale;
      this.matrices[matrixOffset + 1] = 0;
      this.matrices[matrixOffset + 2] = 0;
      this.matrices[matrixOffset + 3] = 0;
      this.matrices[matrixOffset + 4] = 0;
      this.matrices[matrixOffset + 5] = scale;
      this.matrices[matrixOffset + 6] = 0;
      this.matrices[matrixOffset + 7] = 0;
      this.matrices[matrixOffset + 8] = 0;
      this.matrices[matrixOffset + 9] = 0;
      this.matrices[matrixOffset + 10] = scale;
      this.matrices[matrixOffset + 11] = 0;
      this.matrices[matrixOffset + 12] = x + offsetX;
      this.matrices[matrixOffset + 13] = 0;
      this.matrices[matrixOffset + 14] = z * zScale + offsetZ;
      this.matrices[matrixOffset + 15] = 1;
    }

    // Clear only touched lookup entries, keeping update O(live entities) rather
    // than filling all 65,536 possible entity slots every rendered frame.
    for (let index = 0; index < previous.count; index++) {
      this.previousIndexBySlot[idSlot(previous.id[index]!)] = -1;
    }

    this.liveCount = current.count;
  }
}
