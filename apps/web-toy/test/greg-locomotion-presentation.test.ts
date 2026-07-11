import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@sim';
import { createSnapshot } from '../src/sim/snapshot-producer';
import {
  GREG_LOCOMOTION_START_DISTANCE,
  GREG_LOCOMOTION_STOP_DISTANCE,
  GREG_MAX_TURN_DEGREES_PER_TICK,
  advanceGregLocomotionPresentation,
  createGregLocomotionPresentationState,
  projectGregLocomotion,
  type GregLocomotionPresentationState,
} from '../src/hero/greg-locomotion-presentation';

function snapshots(
  tick: number,
  dx: number,
  dy: number,
  alive = true,
): ReturnType<typeof makeSnapshots> {
  return makeSnapshots(tick, 10, 20, dx, dy, alive);
}

function makeSnapshots(
  tick: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  alive: boolean,
) {
  const previous = createSnapshot(DEFAULT_CONFIG);
  const current = createSnapshot(DEFAULT_CONFIG);
  previous.tick = tick - 1;
  current.tick = tick;
  previous.playerX = x;
  previous.playerY = y;
  previous.playerAlive = alive;
  current.playerX = x + dx;
  current.playerY = y + dy;
  current.playerAlive = alive;
  return { previous, current };
}

function project(
  state: GregLocomotionPresentationState,
  tick: number,
  dx: number,
  dy: number,
  alpha = 1,
  alive = true,
) {
  const { previous, current } = snapshots(tick, dx, dy, alive);
  return projectGregLocomotion(state, previous, current, alpha);
}

describe('Greg locomotion presentation', () => {
  it('retains a stable heading and recommends idle for zero movement', () => {
    const initial = createGregLocomotionPresentationState(73);
    const { previous, current } = snapshots(1, 0, 0);
    const result = projectGregLocomotion(initial, previous, current, 0.5);

    expect(result.state).toEqual({
      sampledTick: 1,
      previousHeadingDegrees: 73,
      headingDegrees: 73,
      targetHeadingDegrees: 73,
      moving: false,
      movementMagnitude: 0,
    });
    expect(result.headingDegrees).toBe(73);
    expect(result.animation).toMatchObject({ kind: 'idle', moving: false, walkPlaybackRate: 1 });

    const repeated = projectGregLocomotion(result.state, previous, current, 0.9);
    expect(repeated.state).toBe(result.state);
    expect(repeated.headingDegrees).toBe(73);
  });

  it('interpolates diagonal position and heading with a bounded turn', () => {
    const result = project(createGregLocomotionPresentationState(), 1, 2, -2, 0.5);

    // dx=+2, dy=-2 maps to a 45-degree scene heading. The visual turn is
    // deliberately limited to 24 degrees/tick, then interpolated at alpha=.5.
    expect(result.x).toBeCloseTo(11);
    expect(result.y).toBeCloseTo(19);
    expect(result.targetHeadingDegrees).toBeCloseTo(45);
    expect(result.state.headingDegrees).toBe(GREG_MAX_TURN_DEGREES_PER_TICK);
    expect(result.headingDegrees).toBeCloseTo(GREG_MAX_TURN_DEGREES_PER_TICK / 2);
    expect(result.animation).toMatchObject({ kind: 'movement', moving: true });
  });

  it('uses movement-start/stop hysteresis instead of flickering around a single threshold', () => {
    let state = createGregLocomotionPresentationState();
    state = project(state, 1, GREG_LOCOMOTION_START_DISTANCE - 0.001, 0).state;
    expect(state.moving).toBe(false);

    state = project(state, 2, GREG_LOCOMOTION_START_DISTANCE, 0).state;
    expect(state.moving).toBe(true);

    const betweenThresholds = (GREG_LOCOMOTION_START_DISTANCE + GREG_LOCOMOTION_STOP_DISTANCE) / 2;
    state = project(state, 3, betweenThresholds, 0).state;
    expect(state.moving).toBe(true);

    state = project(state, 4, GREG_LOCOMOTION_STOP_DISTANCE, 0).state;
    expect(state.moving).toBe(false);
  });

  it('turns through a rapid reversal instead of snapping 180 degrees', () => {
    const right = project(createGregLocomotionPresentationState(), 1, 2, 0);
    expect(right.state.headingDegrees).toBe(GREG_MAX_TURN_DEGREES_PER_TICK);

    const left = project(right.state, 2, -2, 0);
    expect(left.targetHeadingDegrees).toBe(270);
    expect(left.state.previousHeadingDegrees).toBe(GREG_MAX_TURN_DEGREES_PER_TICK);
    expect(left.state.headingDegrees).toBe(0);
    expect(left.state.headingDegrees).not.toBe(left.targetHeadingDegrees);
  });

  it('keeps the last heading while dead and delegates terminal animation priority to the reducer', () => {
    const initial = createGregLocomotionPresentationState(90);
    const dead = project(initial, 1, 2, 0, 1, false);

    expect(dead.state).toMatchObject({
      moving: false,
      previousHeadingDegrees: 90,
      headingDegrees: 90,
      targetHeadingDegrees: 90,
    });
    expect(dead.animation).toMatchObject({ kind: 'idle', moving: false });
  });

  it('is deterministic and does not mutate snapshot or presentation input', () => {
    const state = createGregLocomotionPresentationState(300);
    const { previous, current } = snapshots(1, 2, 0);
    const stateBefore = { ...state };
    const previousBefore = { playerX: previous.playerX, playerY: previous.playerY, tick: previous.tick };
    const currentBefore = { playerX: current.playerX, playerY: current.playerY, tick: current.tick };

    const first = projectGregLocomotion(state, previous, current, 0.25);
    const second = projectGregLocomotion(state, previous, current, 0.25);

    expect(first).toEqual(second);
    expect(state).toEqual(stateBefore);
    expect(previous).toMatchObject(previousBefore);
    expect(current).toMatchObject(currentBefore);
  });

  it('returns the original state for repeated sampling of one simulation tick', () => {
    const initial = createGregLocomotionPresentationState();
    const { previous, current } = snapshots(1, 2, 0);
    const advanced = advanceGregLocomotionPresentation(initial, previous, current);

    expect(advanceGregLocomotionPresentation(advanced, previous, current)).toBe(advanced);
  });

  it('ignores an out-of-order tick so stale renderer work cannot turn Greg backward', () => {
    const initial = createGregLocomotionPresentationState();
    const newer = project(initial, 8, 2, 0).state;
    const { previous, current } = snapshots(3, -2, 0);

    expect(advanceGregLocomotionPresentation(newer, previous, current)).toBe(newer);
  });
});
