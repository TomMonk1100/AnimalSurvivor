/**
 * Renderer-neutral sampling for compact, authored VFX animation atlases.
 *
 * The renderer owns only the output UVs and blend values; game simulation does
 * not enter this module. Animation advances from integer simulation ticks, so
 * a replay, a slow frame, and a fast frame choose the same art frame.
 *
 * Callers create one sample object per live visual slot, then reuse it with
 * `writeAnimatedVfxAtlasSample` every render update. The hot sampling path
 * writes scalar fields and caller-owned UV structs only; it creates no arrays,
 * strings, or temporary descriptor objects.
 */

/** The authored VFX sheet is a fixed 4-by-4 grid: sixteen visual cells. */
export const ANIMATED_VFX_ATLAS_GRID_SIZE = 4;
export const ANIMATED_VFX_ATLAS_CELL_COUNT = ANIMATED_VFX_ATLAS_GRID_SIZE * ANIMATED_VFX_ATLAS_GRID_SIZE;

/**
 * A cell is measured from the top-left of the source image. The sampled UV
 * bounds use the conventional bottom-left texture origin, so this metadata is
 * usable by any renderer that consumes ordinary normalized UV coordinates.
 */
export interface AnimatedVfxAtlasFrame {
  readonly column: number;
  readonly row: number;
}

/**
 * Named, immutable-at-runtime sequence metadata. `crossfadeTicks` is optional
 * and defaults to a hard frame switch. It is clamped to `ticksPerFrame` during
 * sampling so malformed content cannot produce a blend outside [0, 1].
 */
export interface AnimatedVfxAtlasSequence {
  readonly name: string;
  readonly frames: readonly AnimatedVfxAtlasFrame[];
  /** Positive integral simulation ticks occupied by one source frame. */
  readonly ticksPerFrame: number;
  /** Looping sequences wrap from their final frame to their first frame. */
  readonly loop: boolean;
  /** Blend across the final N ticks of a frame, defaulting to zero. */
  readonly crossfadeTicks?: number;
}

/** A stable named lookup table can be assembled at module initialization. */
export type AnimatedVfxAtlasSequenceLibrary = Readonly<Record<string, AnimatedVfxAtlasSequence | undefined>>;

/**
 * Standard lower-left-origin UV bounds. Keeping this type generic avoids any
 * PlayCanvas material concepts such as tiling or offset in the animation core.
 */
export interface AnimatedVfxAtlasUv {
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

/**
 * Reusable result for a sequence sample. `progress` is normalized through the
 * sequence once (or once through the current loop cycle); `frameProgress` is
 * normalized within the selected source frame. `crossfade` weights `nextUv`.
 */
export interface AnimatedVfxAtlasSample {
  active: boolean;
  frameIndex: number;
  nextFrameIndex: number;
  progress: number;
  frameProgress: number;
  crossfade: number;
  completed: boolean;
  readonly currentUv: AnimatedVfxAtlasUv;
  readonly nextUv: AnimatedVfxAtlasUv;
}

const TILE_SIZE = 1 / ANIMATED_VFX_ATLAS_GRID_SIZE;

function isAtlasCellCoordinate(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < ANIMATED_VFX_ATLAS_GRID_SIZE;
}

function isValidFrame(frame: AnimatedVfxAtlasFrame | null | undefined): frame is AnimatedVfxAtlasFrame {
  return frame !== null
    && frame !== undefined
    && isAtlasCellCoordinate(frame.column)
    && isAtlasCellCoordinate(frame.row);
}

function validTicksPerFrame(value: number): number {
  return Number.isSafeInteger(value) && value >= 1 ? value : 0;
}

function normalizedAgeTick(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function normalizedCrossfadeTicks(value: number | undefined, ticksPerFrame: number): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return 0;
  return Math.min(ticksPerFrame, Math.floor(value));
}

function resetUv(out: AnimatedVfxAtlasUv): void {
  out.uMin = 0;
  out.vMin = 0;
  out.uMax = 0;
  out.vMax = 0;
}

function resetSample(out: AnimatedVfxAtlasSample): void {
  out.active = false;
  out.frameIndex = -1;
  out.nextFrameIndex = -1;
  out.progress = 0;
  out.frameProgress = 0;
  out.crossfade = 0;
  out.completed = false;
  resetUv(out.currentUv);
  resetUv(out.nextUv);
}

/** Allocates one UV output for setup; reuse it with `writeAnimatedVfxAtlasUv`. */
export function createAnimatedVfxAtlasUv(): AnimatedVfxAtlasUv {
  return { uMin: 0, vMin: 0, uMax: 0, vMax: 0 };
}

/**
 * Writes lower-left-origin UV bounds for one authored top-left grid cell.
 * Returns false and clears `out` for invalid content rather than leaking a
 * stale texture region from a prior visual slot.
 */
export function writeAnimatedVfxAtlasUv(
  frame: AnimatedVfxAtlasFrame | null | undefined,
  out: AnimatedVfxAtlasUv,
): boolean {
  if (!isValidFrame(frame)) {
    resetUv(out);
    return false;
  }
  out.uMin = frame.column * TILE_SIZE;
  out.vMin = 1 - (frame.row + 1) * TILE_SIZE;
  out.uMax = out.uMin + TILE_SIZE;
  out.vMax = out.vMin + TILE_SIZE;
  return true;
}

/** Allocates one persistent sample for a renderer-owned VFX slot. */
export function createAnimatedVfxAtlasSample(): AnimatedVfxAtlasSample {
  return {
    active: false,
    frameIndex: -1,
    nextFrameIndex: -1,
    progress: 0,
    frameProgress: 0,
    crossfade: 0,
    completed: false,
    currentUv: createAnimatedVfxAtlasUv(),
    nextUv: createAnimatedVfxAtlasUv(),
  };
}

/**
 * Looks up a named sequence without constructing a fallback descriptor. This
 * keeps missing art explicit and lets the caller skip rendering that slot.
 */
export function animatedVfxAtlasSequenceForName(
  library: AnimatedVfxAtlasSequenceLibrary,
  name: string,
): AnimatedVfxAtlasSequence | null {
  if (!Object.prototype.hasOwnProperty.call(library, name)) return null;
  return library[name] ?? null;
}

/**
 * Samples a sequence into caller-owned output. `ageTick` is floored so an
 * interpolated render tick cannot make two clients select different source
 * frames. Crossfade becomes nonzero over the final requested ticks of a frame
 * and always targets `nextUv`; a non-looping final frame settles in place.
 *
 * The function returns false for invalid metadata and clears `out`. This is a
 * deliberate fail-closed route for authored VFX: rendering nothing is clearer
 * than accidentally showing the previous slot's art.
 */
export function writeAnimatedVfxAtlasSample(
  sequence: AnimatedVfxAtlasSequence | null | undefined,
  ageTick: number,
  out: AnimatedVfxAtlasSample,
): boolean {
  const frames = sequence?.frames;
  const ticksPerFrame = sequence === null || sequence === undefined
    ? 0
    : validTicksPerFrame(sequence.ticksPerFrame);
  const frameCount = frames?.length ?? 0;

  if (sequence === null
    || sequence === undefined
    || frames === undefined
    || frameCount < 1
    || ticksPerFrame === 0
    || frameCount > Math.floor(Number.MAX_SAFE_INTEGER / ticksPerFrame)) {
    resetSample(out);
    return false;
  }

  const totalTicks = frameCount * ticksPerFrame;
  const age = normalizedAgeTick(ageTick);
  const looping = sequence.loop === true;
  const completed = !looping && age >= totalTicks;
  const localTick = completed
    ? totalTicks
    : looping
      ? age % totalTicks
      : age;

  let frameIndex: number;
  let nextFrameIndex: number;
  let tickWithinFrame: number;
  if (completed) {
    frameIndex = frameCount - 1;
    nextFrameIndex = frameIndex;
    tickWithinFrame = ticksPerFrame;
  } else {
    frameIndex = Math.floor(localTick / ticksPerFrame);
    tickWithinFrame = localTick - frameIndex * ticksPerFrame;
    nextFrameIndex = frameIndex + 1;
    if (nextFrameIndex >= frameCount) nextFrameIndex = looping ? 0 : frameIndex;
  }

  const currentFrame = frames[frameIndex];
  const nextFrame = frames[nextFrameIndex];
  if (!writeAnimatedVfxAtlasUv(currentFrame, out.currentUv)
    || !writeAnimatedVfxAtlasUv(nextFrame, out.nextUv)) {
    resetSample(out);
    return false;
  }

  const crossfadeTicks = normalizedCrossfadeTicks(sequence.crossfadeTicks, ticksPerFrame);
  const canCrossfade = !completed && nextFrameIndex !== frameIndex && crossfadeTicks > 0;
  const crossfade = canCrossfade
    ? Math.min(1, Math.max(0, (tickWithinFrame - (ticksPerFrame - crossfadeTicks) + 1) / crossfadeTicks))
    : 0;

  out.active = true;
  out.frameIndex = frameIndex;
  out.nextFrameIndex = nextFrameIndex;
  out.progress = completed ? 1 : localTick / totalTicks;
  out.frameProgress = completed ? 1 : tickWithinFrame / ticksPerFrame;
  out.crossfade = crossfade;
  out.completed = completed;
  return true;
}
