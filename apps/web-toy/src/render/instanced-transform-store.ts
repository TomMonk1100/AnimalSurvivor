import type { CategorySnapshot } from '../contracts';
import { idSlot } from '@sim';

/** Default renderer budget for one instanced category. */
export const DEFAULT_INSTANCE_CAPACITY = 1200;

const ENTITY_SLOT_COUNT = 0x1_0000;
const MATRIX_STRIDE = 16;
const TAU = Math.PI * 2;

/**
 * Renderer-only life for a cutout creature plane.
 *
 * The simulation deliberately does not own headings or animation state. This
 * option is therefore opt-in and only fed by the enemy-sprite batches: it
 * reads the two immutable transform snapshots already supplied to `update`,
 * then turns the resulting matrix into a facing/breathing presentation.
 */
export interface SpriteMotionOptions {
  /** Interpolated presentation time in seconds, derived from snapshot ticks. */
  timeSeconds: number;
  /** The direction, in local-plane radians, the authored art is already facing. */
  readonly artFacingRadians: number;
  /** Smallest scene-space displacement that counts as deliberate movement. */
  readonly movementThreshold?: number;
  /** Radians per second for the gentle, id-phased idle pulse. */
  readonly pulseRadiansPerSecond?: number;
  /** Long-axis scale variation. Keep this below roughly 0.05 for crisp art. */
  readonly longAxisPulse?: number;
  /** Cross-axis counter-pulse, making the flat cutout feel less mechanical. */
  readonly crossAxisPulse?: number;
  /** World-unit lift relative to the scaled sprite size. */
  readonly liftPulse?: number;
  /** A very small movement/idle facing sway in radians. */
  readonly facingSwayRadians?: number;
}

function clampAlpha(alpha: number): number {
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
}

/**
 * One stable, allocation-free phase per generation-packed entity id.
 *
 * This is presentation noise only: it never enters simulation state, but it
 * keeps a swarm from visibly breathing in lockstep and gives fresh spawns a
 * sensible, deterministic idle orientation before their first movement tick.
 */
function phaseForId(id: number): number {
  let hash = id >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return (hash / 0x1_0000_0000) * TAU;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
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
  readonly roles: Uint8Array;
  readonly marked: Uint8Array;
  readonly matrices: Float32Array;

  private readonly previousIndexBySlot = new Int32Array(ENTITY_SLOT_COUNT).fill(-1);
  private liveCount = 0;

  constructor(readonly capacity: number = DEFAULT_INSTANCE_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError(`Instance capacity must be a non-negative integer; received ${capacity}`);
    }

    this.ids = new Int32Array(capacity);
    this.archetypes = new Uint8Array(capacity);
    this.roles = new Uint8Array(capacity);
    this.marked = new Uint8Array(capacity);
    this.matrices = new Float32Array(capacity * MATRIX_STRIDE);
  }

  get count(): number {
    return this.liveCount;
  }

  /**
   * Rebuild the active instance prefix without allocating or mutating either
   * snapshot. Offsets are applied after interpolation; `zScale` supports the
   * top-down camera's simulation-Y to scene-Z inversion. When `roleFilter` is
   * supplied, only current entries with that role are emitted. An optional
   * `archetypeFilter` further divides a role into a fixed set of authored
   * silhouette batches without ever allocating a renderer view per enemy.
   * `spriteMotion` is opt-in and belongs exclusively to renderer-owned
   * cutout planes; generic world primitives remain uniform, unrotated
   * transforms exactly as before.
   */
  update(
    previous: CategorySnapshot,
    current: CategorySnapshot,
    alpha: number,
    offsetX = 0,
    offsetZ = 0,
    zScale = 1,
    roleFilter?: number,
    scaleMultiplier = 1,
    markedFilter?: number,
    archetypeFilter?: number,
    spriteMotion?: SpriteMotionOptions,
  ): void {
    if (current.count > this.capacity) {
      throw new RangeError(
        `Snapshot has ${current.count} ${current.category} instances, exceeding capacity ${this.capacity}`,
      );
    }

    const t = clampAlpha(alpha);

    for (let index = 0; index < previous.count; index++) {
      if (roleFilter !== undefined && previous.role[index] !== roleFilter) continue;
      if (markedFilter !== undefined && previous.marked[index] !== markedFilter) continue;
      if (archetypeFilter !== undefined && previous.archetype[index] !== archetypeFilter) continue;
      this.previousIndexBySlot[idSlot(previous.id[index]!)] = index;
    }

    let emitted = 0;
    for (let index = 0; index < current.count; index++) {
      if (roleFilter !== undefined && current.role[index] !== roleFilter) continue;
      if (markedFilter !== undefined && current.marked[index] !== markedFilter) continue;
      if (archetypeFilter !== undefined && current.archetype[index] !== archetypeFilter) continue;
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

      const scale = current.radius[index]! * 2 * scaleMultiplier;
      const matrixOffset = emitted * MATRIX_STRIDE;

      this.ids[emitted] = id;
      this.archetypes[emitted] = current.archetype[index]!;
      this.roles[emitted] = current.role[index]!;
      this.marked[emitted] = current.marked[index]!;

      let scaleX = scale;
      let scaleZ = scale;
      let lift = 0;
      let cosine = 1;
      let sine = 0;

      if (spriteMotion !== undefined) {
        const phase = phaseForId(id);
        const pulse = Math.sin(
          phase +
          finiteOr(spriteMotion.timeSeconds, 0) *
            finiteOr(spriteMotion.pulseRadiansPerSecond, 5.6),
        );
        const longAxisPulse = finiteOr(spriteMotion.longAxisPulse, 0.028);
        const crossAxisPulse = finiteOr(spriteMotion.crossAxisPulse, 0.018);
        const liftPulse = finiteOr(spriteMotion.liftPulse, 0.026);
        const facingSwayRadians = finiteOr(spriteMotion.facingSwayRadians, 0.035);
        const movementThreshold = Math.max(0, finiteOr(spriteMotion.movementThreshold, 0.012));

        // A snapshot-pair movement vector is the renderer's sole facing
        // signal. We intentionally map the velocity into scene space before
        // taking atan2 so a top-down Y inversion cannot mirror the art.
        let facing = phase;
        if (previousIndex !== -1 && previous.id[previousIndex] === id) {
          const dx = currentX - previous.x[previousIndex]!;
          const dz = (currentZ - previous.y[previousIndex]!) * zScale;
          if (dx * dx + dz * dz >= movementThreshold * movementThreshold) {
            facing = Math.atan2(dx, dz);
          }
        }

        const yaw =
          facing -
          finiteOr(spriteMotion.artFacingRadians, 0) +
          pulse * facingSwayRadians;
        cosine = Math.cos(yaw);
        sine = Math.sin(yaw);
        scaleX = scale * (1 + pulse * longAxisPulse);
        scaleZ = scale * (1 - pulse * crossAxisPulse);
        // The positive-only bob keeps an alpha-cutout above its contact
        // shadow without letting any frame sink into the ground artwork.
        lift = scale * liftPulse * (0.5 + pulse * 0.5);
      }

      // Column-major Y-rotation, non-uniform X/Z scale, and translation.
      // With yaw = atan2(sceneDeltaX, sceneDeltaZ), local +Z follows movement.
      this.matrices[matrixOffset] = cosine * scaleX;
      this.matrices[matrixOffset + 1] = 0;
      // Avoid writing -0 in the no-motion path: existing generic transform
      // callers intentionally retain byte-identical uniform matrices.
      this.matrices[matrixOffset + 2] = sine === 0 ? 0 : -sine * scaleX;
      this.matrices[matrixOffset + 3] = 0;
      this.matrices[matrixOffset + 4] = 0;
      this.matrices[matrixOffset + 5] = scale;
      this.matrices[matrixOffset + 6] = 0;
      this.matrices[matrixOffset + 7] = 0;
      this.matrices[matrixOffset + 8] = sine * scaleZ;
      this.matrices[matrixOffset + 9] = 0;
      this.matrices[matrixOffset + 10] = cosine * scaleZ;
      this.matrices[matrixOffset + 11] = 0;
      this.matrices[matrixOffset + 12] = x + offsetX;
      this.matrices[matrixOffset + 13] = lift;
      this.matrices[matrixOffset + 14] = z * zScale + offsetZ;
      this.matrices[matrixOffset + 15] = 1;
      emitted++;
    }

    // Clear only touched lookup entries, keeping update O(live entities) rather
    // than filling all 65,536 possible entity slots every rendered frame.
    for (let index = 0; index < previous.count; index++) {
      if (roleFilter !== undefined && previous.role[index] !== roleFilter) continue;
      if (markedFilter !== undefined && previous.marked[index] !== markedFilter) continue;
      if (archetypeFilter !== undefined && previous.archetype[index] !== archetypeFilter) continue;
      this.previousIndexBySlot[idSlot(previous.id[index]!)] = -1;
    }

    this.liveCount = emitted;
  }
}
