import { describe, expect, it } from 'vitest';
import {
  GREG_ATTACK_HOLD_TICKS,
  GREG_HIT_HOLD_TICKS,
  GREG_MOVEMENT_THRESHOLD,
  advanceGregAnimation,
  createGregAnimationState,
  type GregAnimationInput,
  type GregAnimationState,
} from '../src/hero/greg-animation-state';

const idleInput: GregAnimationInput = {
  alive: true,
  movementMagnitude: 0,
  attackPulse: false,
  hitPulse: false,
};

function advance(state: GregAnimationState, changes: Partial<GregAnimationInput> = {}): GregAnimationState {
  return advanceGregAnimation(state, { ...idleInput, ...changes });
}

describe('Greg animation state', () => {
  it('starts in a looping idle clip with an initial play command', () => {
    expect(createGregAnimationState()).toEqual({
      kind: 'idle',
      clip: 'Idle',
      loop: true,
      transitionDurationSeconds: 0.2,
      restart: true,
      actionTicksRemaining: 0,
      nextHitReaction: 1,
    });
  });

  it('selects Walk above the movement dead zone and does not restart it every tick', () => {
    const initial = createGregAnimationState();
    const walking = advance(initial, { movementMagnitude: GREG_MOVEMENT_THRESHOLD + 0.001 });

    expect(walking).toMatchObject({
      kind: 'movement',
      clip: 'Walk',
      loop: true,
      transitionDurationSeconds: 0.15,
      restart: true,
    });
    expect(advance(walking, { movementMagnitude: 1 })).toMatchObject({ clip: 'Walk', restart: false });
    expect(advance(walking, { movementMagnitude: GREG_MOVEMENT_THRESHOLD })).toMatchObject({
      kind: 'idle',
      clip: 'Idle',
      restart: true,
    });
  });

  it('treats non-finite movement magnitudes as idle', () => {
    for (const movementMagnitude of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = advance(createGregAnimationState(), { movementMagnitude });
      expect(result).toMatchObject({ kind: 'idle', clip: 'Idle', restart: false });
    }
  });

  it('holds a pulse-triggered attack for an exact fixed-tick duration', () => {
    let state = advance(createGregAnimationState(), { movementMagnitude: 1, attackPulse: true });
    expect(state).toMatchObject({
      kind: 'attack',
      clip: 'Attack',
      loop: false,
      transitionDurationSeconds: 0.08,
      restart: true,
      actionTicksRemaining: GREG_ATTACK_HOLD_TICKS,
    });

    for (let tick = 1; tick < GREG_ATTACK_HOLD_TICKS; tick += 1) {
      state = advance(state, { movementMagnitude: 1 });
    }
    expect(state).toMatchObject({ kind: 'attack', actionTicksRemaining: 1, restart: false });

    state = advance(state, { movementMagnitude: 1 });
    expect(state).toMatchObject({ kind: 'movement', clip: 'Walk', restart: true, actionTicksRemaining: 0 });
  });

  it('allows a new attack pulse to restart an active attack', () => {
    const attacking = advance(createGregAnimationState(), { attackPulse: true });
    const restarted = advance(attacking, { attackPulse: true });
    expect(restarted).toMatchObject({
      kind: 'attack',
      clip: 'Attack',
      restart: true,
      actionTicksRemaining: GREG_ATTACK_HOLD_TICKS,
    });
  });

  it('gives hit priority over attack and alternates reactions without randomness', () => {
    let state = advance(createGregAnimationState(), { attackPulse: true, hitPulse: true });
    expect(state).toMatchObject({
      kind: 'hit',
      clip: 'Idle_HitReact1',
      restart: true,
      actionTicksRemaining: GREG_HIT_HOLD_TICKS,
      nextHitReaction: 2,
    });

    state = advance(state, { hitPulse: true });
    expect(state).toMatchObject({
      kind: 'hit',
      clip: 'Idle_HitReact2',
      restart: true,
      actionTicksRemaining: GREG_HIT_HOLD_TICKS,
      nextHitReaction: 1,
    });
  });

  it('does not let an attack interrupt an active hit reaction', () => {
    let state = advance(createGregAnimationState(), { hitPulse: true });
    state = advance(state, { attackPulse: true });
    expect(state).toMatchObject({
      kind: 'hit',
      clip: 'Idle_HitReact1',
      restart: false,
      actionTicksRemaining: GREG_HIT_HOLD_TICKS - 1,
    });
  });

  it('gives death absolute priority and holds without repeated restarts', () => {
    const dead = advance(createGregAnimationState(), {
      alive: false,
      movementMagnitude: 1,
      attackPulse: true,
      hitPulse: true,
    });
    expect(dead).toMatchObject({
      kind: 'death',
      clip: 'Death',
      loop: false,
      transitionDurationSeconds: 0.1,
      restart: true,
      actionTicksRemaining: 0,
    });

    const stillDead = advance(dead, { alive: false, hitPulse: true });
    expect(stillDead).toMatchObject({ kind: 'death', clip: 'Death', restart: false });

    const revived = advance(stillDead);
    expect(revived).toMatchObject({ kind: 'idle', clip: 'Idle', restart: true });
  });

  it('is pure and deterministic for identical state and input', () => {
    const previous = advance(createGregAnimationState(), { attackPulse: true });
    const snapshot = { ...previous };
    const input = { ...idleInput, hitPulse: true };

    const first = advanceGregAnimation(previous, input);
    const second = advanceGregAnimation(previous, input);

    expect(first).toEqual(second);
    expect(previous).toEqual(snapshot);
    expect(input).toEqual({ ...idleInput, hitPulse: true });
  });
});
