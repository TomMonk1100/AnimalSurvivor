export interface CameraBoundsInput {
  readonly targetX: number;
  readonly targetY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly aspect: number;
  readonly orthoHalfHeight: number;
  readonly cameraHeight: number;
  readonly followBackOffset: number;
}

export interface CameraTarget {
  readonly x: number;
  readonly y: number;
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Clamps a renderer-owned camera target to the visible simulation world.
 * The shallow follow offset expands the ground-plane vertical extent beyond
 * the orthographic height, while the player itself remains completely
 * authoritative and unmodified.
 */
export function clampCameraTarget(input: CameraBoundsInput): CameraTarget {
  const worldWidth = positiveOr(input.worldWidth, 1);
  const worldHeight = positiveOr(input.worldHeight, 1);
  const aspect = positiveOr(input.aspect, 1);
  const orthoHalfHeight = positiveOr(input.orthoHalfHeight, 1);
  const cameraHeight = positiveOr(input.cameraHeight, 1);
  const followBackOffset = Number.isFinite(input.followBackOffset) ? input.followBackOffset : 0;

  const halfExtentX = Math.min(worldWidth * 0.5, orthoHalfHeight * aspect);
  const groundProjection = Math.hypot(cameraHeight, followBackOffset) / cameraHeight;
  const halfExtentY = Math.min(worldHeight * 0.5, orthoHalfHeight * groundProjection);
  const targetX = Number.isFinite(input.targetX) ? input.targetX : worldWidth * 0.5;
  const targetY = Number.isFinite(input.targetY) ? input.targetY : worldHeight * 0.5;

  return Object.freeze({
    x: clamp(targetX, halfExtentX, worldWidth - halfExtentX),
    y: clamp(targetY, halfExtentY, worldHeight - halfExtentY),
  });
}
