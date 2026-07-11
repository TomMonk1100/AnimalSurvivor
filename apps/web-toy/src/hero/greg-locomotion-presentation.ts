/**
 * Pure, renderer-only locomotion policy for Greg.
 *
 * The simulation remains the source of truth for position and movement. This
 * module only converts adjacent app-owned render snapshots into a visually
 * stable pose recommendation. Call `projectGregLocomotion` every render frame,
 * retain the returned state, and use the returned position/heading for the
 * renderer. No clocks, renderer objects, or simulation writes are involved.
 */
import type { RenderSnapshot } from '../contracts';
import { lerp } from '../render/interpolation';

/**
 * Snapshot-space distances are measured per fixed simulation tick. Greg moves
 * roughly two world units on a normal intentional tick, so this dead zone only
 * filters boundary jitter and never delays real gameplay movement.
 */
export const GREG_LOCOMOTION_START_DISTANCE = 0.15;
export const GREG_LOCOMOTION_STOP_DISTANCE = 0.06;

/** Visual turn cap, applied once per newly observed simulation tick. */
export const GREG_MAX_TURN_DEGREES_PER_TICK = 24;

/** Renderer recommendations for the existing Idle/Walk animation policy. */
export const GREG_WALK_ENTER_BLEND_SECONDS = 0.12;
export const GREG_WALK_EXIT_BLEND_SECONDS = 0.18;
export const GREG_WALK_REFERENCE_DISTANCE_PER_TICK = 2;
export const GREG_WALK_MIN_PLAYBACK_RATE = 0.85;
export const GREG_WALK_MAX_PLAYBACK_RATE = 1.2;

export type GregLocomotionKind = 'idle' | 'movement';

/**
 * State is only advanced when `current.tick` changes. Keeping the prior and
 * current heading lets the renderer interpolate a turn across the same fixed
 * tick interval it already uses for position interpolation.
 */
export interface GregLocomotionPresentationState {
  readonly sampledTick: number;
  readonly previousHeadingDegrees: number;
  readonly headingDegrees: number;
  readonly targetHeadingDegrees: number;
  readonly moving: boolean;
  readonly movementMagnitude: number;
}

export interface GregLocomotionAnimationRecommendation {
  readonly kind: GregLocomotionKind;
  /** Pass to the locomotion branch of the animation reducer. */
  readonly moving: boolean;
  /** Suggested blend when entering the recommended locomotion state. */
  readonly transitionDurationSeconds: number;
  /** Suggested speed for the looping Walk track; idle remains 1. */
  readonly walkPlaybackRate: number;
}

/** Immutable data for one visual frame. Coordinates remain in simulation space. */
export interface GregLocomotionPresentation {
  readonly state: GregLocomotionPresentationState;
  readonly x: number;
  readonly y: number;
  readonly headingDegrees: number;
  readonly targetHeadingDegrees: number;
  readonly movementMagnitude: number;
  readonly animation: GregLocomotionAnimationRecommendation;
}

export function createGregLocomotionPresentationState(
  initialHeadingDegrees = 0,
): GregLocomotionPresentationState {
  const headingDegrees = normalizeDegrees(initialHeadingDegrees);
  return {
    sampledTick: -1,
    previousHeadingDegrees: headingDegrees,
    headingDegrees,
    targetHeadingDegrees: headingDegrees,
    moving: false,
    movementMagnitude: 0,
  };
}

/**
 * Projects a stable visual locomotion pose from adjacent immutable snapshots.
 * It is referentially transparent: equal inputs always produce equal output
 * and neither snapshot nor the previous state is modified.
 */
export function projectGregLocomotion(
  previousState: Readonly<GregLocomotionPresentationState>,
  previous: Readonly<RenderSnapshot>,
  current: Readonly<RenderSnapshot>,
  alpha: number,
): GregLocomotionPresentation {
  const state = advanceGregLocomotionPresentation(previousState, previous, current);
  const interpolationAlpha = clamp01(alpha);
  const headingDegrees = interpolateDegrees(
    state.previousHeadingDegrees,
    state.headingDegrees,
    interpolationAlpha,
  );

  return {
    state,
    x: lerp(finiteOr(previous.playerX, 0), finiteOr(current.playerX, 0), interpolationAlpha),
    y: lerp(finiteOr(previous.playerY, 0), finiteOr(current.playerY, 0), interpolationAlpha),
    headingDegrees,
    targetHeadingDegrees: state.targetHeadingDegrees,
    movementMagnitude: state.movementMagnitude,
    animation: animationRecommendation(state.moving, state.movementMagnitude),
  };
}

/**
 * Exposed for focused tests and integration code that prefers to retain state
 * separately from frame projection. Repeated calls for the same tick return
 * the original state, which prevents render-frame animation churn.
 */
export function advanceGregLocomotionPresentation(
  previousState: Readonly<GregLocomotionPresentationState>,
  previous: Readonly<RenderSnapshot>,
  current: Readonly<RenderSnapshot>,
): GregLocomotionPresentationState {
  const sampledTick = finiteIntegerOr(current.tick, previousState.sampledTick);
  if (sampledTick <= previousState.sampledTick) return previousState;

  const dx = finiteOr(current.playerX, 0) - finiteOr(previous.playerX, 0);
  const dy = finiteOr(current.playerY, 0) - finiteOr(previous.playerY, 0);
  const movementMagnitude = Math.hypot(dx, dy);
  const alive = current.playerAlive === true;
  const moving = alive && isMoving(previousState.moving, movementMagnitude);
  const previousHeadingDegrees = normalizeDegrees(previousState.headingDegrees);
  const targetHeadingDegrees = moving
    ? headingFromSimulationDelta(dx, dy)
    : previousHeadingDegrees;
  const tickAdvance = tickAdvanceSince(previousState.sampledTick, sampledTick);
  const headingDegrees = turnTowards(
    previousHeadingDegrees,
    targetHeadingDegrees,
    GREG_MAX_TURN_DEGREES_PER_TICK * tickAdvance,
  );

  return {
    sampledTick,
    previousHeadingDegrees,
    headingDegrees,
    targetHeadingDegrees,
    moving,
    movementMagnitude,
  };
}

/** Movement hysteresis shared by the locomotion projector and animation reducer. */
export function isGregLocomotionMoving(wasMoving: boolean, movementMagnitude: number): boolean {
  return isMoving(wasMoving, movementMagnitude);
}

function animationRecommendation(
  moving: boolean,
  movementMagnitude: number,
): GregLocomotionAnimationRecommendation {
  if (!moving) {
    return {
      kind: 'idle',
      moving: false,
      transitionDurationSeconds: GREG_WALK_EXIT_BLEND_SECONDS,
      walkPlaybackRate: 1,
    };
  }

  const playbackRate = clamp(
    movementMagnitude / GREG_WALK_REFERENCE_DISTANCE_PER_TICK,
    GREG_WALK_MIN_PLAYBACK_RATE,
    GREG_WALK_MAX_PLAYBACK_RATE,
  );
  return {
    kind: 'movement',
    moving: true,
    transitionDurationSeconds: GREG_WALK_ENTER_BLEND_SECONDS,
    walkPlaybackRate: playbackRate,
  };
}

function isMoving(wasMoving: boolean, movementMagnitude: number): boolean {
  if (!Number.isFinite(movementMagnitude)) return false;
  // Snapshot coordinates may pass through Float32 storage. A tiny tolerance
  // keeps a value authored exactly at a hysteresis boundary from oscillating
  // because of binary round-off alone.
  const epsilon = 1e-9;
  return wasMoving
    ? movementMagnitude > GREG_LOCOMOTION_STOP_DISTANCE + epsilon
    : movementMagnitude >= GREG_LOCOMOTION_START_DISTANCE - epsilon;
}

function headingFromSimulationDelta(dx: number, dy: number): number {
  // Scene +Z points toward simulation -Y. This is the same coordinate mapping
  // used by Greg's renderer, kept here so the heading cannot reintroduce the
  // vertical-control inversion fixed in the input adapter.
  return normalizeDegrees(Math.atan2(dx, -dy) * 180 / Math.PI);
}

function turnTowards(fromDegrees: number, targetDegrees: number, maxTurnDegrees: number): number {
  const delta = shortestAngleDelta(fromDegrees, targetDegrees);
  const boundedTurn = Math.max(0, finiteOr(maxTurnDegrees, 0));
  if (Math.abs(delta) <= boundedTurn) return normalizeDegrees(targetDegrees);
  return normalizeDegrees(fromDegrees + Math.sign(delta) * boundedTurn);
}

function interpolateDegrees(fromDegrees: number, toDegrees: number, alpha: number): number {
  return normalizeDegrees(fromDegrees + shortestAngleDelta(fromDegrees, toDegrees) * alpha);
}

function shortestAngleDelta(fromDegrees: number, toDegrees: number): number {
  const raw = normalizeDegrees(toDegrees) - normalizeDegrees(fromDegrees);
  return raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
}

function normalizeDegrees(value: number): number {
  const finite = finiteOr(value, 0);
  const normalized = finite % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function tickAdvanceSince(previousTick: number, currentTick: number): number {
  if (!Number.isFinite(previousTick) || previousTick < 0 || currentTick <= previousTick) return 1;
  // The driver retains adjacent snapshots, but cap a malformed/manual jump so
  // a reset or a bad external caller cannot teleport the visual heading.
  return Math.min(5, Math.max(1, currentTick - previousTick));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  const finite = finiteOr(value, min);
  return finite < min ? min : finite > max ? max : finite;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function finiteIntegerOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
