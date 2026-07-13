import type { InstanceMatrices } from './instanced-category-batch';

const MATRIX_STRIDE = 16;

/**
 * Bounded, allocation-free transform writer for renderer-owned VFX. Unlike
 * `InstancedTransformStore`, this bridge intentionally has no simulation
 * lookup: callers feed it descriptors that were already projected from
 * immutable render snapshots or resolved presentation events.
 */
export class VfxTransformStore implements InstanceMatrices {
  readonly matrices: Float32Array;
  private liveCount = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`VFX instance capacity must be a positive integer; received ${capacity}`);
    }
    this.matrices = new Float32Array(capacity * MATRIX_STRIDE);
  }

  get count(): number {
    return this.liveCount;
  }

  reset(): void {
    this.liveCount = 0;
  }

  /**
   * Adds one local-XZ visual. `yawRadians` turns local +Z toward the desired
   * scene-space heading, matching the rest of the top-down renderer.
   */
  push(
    x: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    lift = 0,
    yawRadians = 0,
  ): boolean {
    if (this.liveCount >= this.capacity) return false;
    const offset = this.liveCount * MATRIX_STRIDE;
    const rawCosine = Math.cos(yawRadians);
    const rawSine = Math.sin(yawRadians);
    // Stable exact quarter turns make tests and GPU uploads free from noisy
    // near-zero values without changing any visible orientation.
    const cosine = Math.abs(rawCosine) < 1e-12 ? 0 : rawCosine;
    const sine = Math.abs(rawSine) < 1e-12 ? 0 : rawSine;
    this.matrices[offset] = cosine * scaleX;
    this.matrices[offset + 1] = 0;
    this.matrices[offset + 2] = sine === 0 ? 0 : -sine * scaleX;
    this.matrices[offset + 3] = 0;
    this.matrices[offset + 4] = 0;
    this.matrices[offset + 5] = scaleY;
    this.matrices[offset + 6] = 0;
    this.matrices[offset + 7] = 0;
    this.matrices[offset + 8] = sine * scaleZ;
    this.matrices[offset + 9] = 0;
    this.matrices[offset + 10] = cosine * scaleZ;
    this.matrices[offset + 11] = 0;
    this.matrices[offset + 12] = x;
    this.matrices[offset + 13] = lift;
    this.matrices[offset + 14] = z;
    this.matrices[offset + 15] = 1;
    this.liveCount++;
    return true;
  }

  /**
   * Writes a local +Z ribbon from start to end. A degenerate source becomes a
   * tiny but stable mark instead of producing NaNs or a direction pop.
   */
  pushRibbon(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    width: number,
    lift = 0,
  ): boolean {
    const dx = endX - startX;
    const dz = endZ - startZ;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    return this.push(
      (startX + endX) * 0.5,
      (startZ + endZ) * 0.5,
      Math.max(0.001, width),
      1,
      length,
      lift,
      Math.atan2(dx, dz),
    );
  }
}
