/**
 * Renderer-only animation policy for Greg.
 *
 * Advance this reducer exactly once for each simulation tick for which animation
 * events are sampled. It never reads a clock and it never mutates simulation
 * state. The returned `restart` flag is a one-update command that maps cleanly
 * to a PlayCanvas anim transition/play call.
 */

export type GregAnimationClip =
  | 'Attack'
  | 'Death'
  | 'Eating'
  | 'Gallop'
  | 'Gallop_Jump'
  | 'Idle'
  | 'Idle_2'
  | 'Idle_2_HeadLow'
  | 'Idle_HitReact1'
  | 'Idle_HitReact2'
  | 'Jump_ToIdle'
  | 'Walk';

export type GregAnimationKind = 'idle' | 'movement' | 'attack' | 'hit' | 'death';

export interface GregAnimationInput {
  readonly alive: boolean;
  /** Length of the movement-intent vector. Values <= the threshold are idle. */
  readonly movementMagnitude: number;
  /** One-tick renderer event. It is consumed even when a higher-priority action wins. */
  readonly attackPulse: boolean;
  /** One-tick renderer event. Hit always wins over an attack on the same tick. */
  readonly hitPulse: boolean;
}

/**
 * State plus the command to apply for the current tick.
 *
 * `restart` is true only when PlayCanvas should enter/re-enter `clip`. A caller
 * may use `transitionDurationSeconds` as the anim component's blend time and
 * `loop` as the clip loop setting.
 */
export interface GregAnimationState {
  readonly kind: GregAnimationKind;
  readonly clip: GregAnimationClip;
  readonly loop: boolean;
  readonly transitionDurationSeconds: number;
  readonly restart: boolean;
  /** Remaining ticks including the current tick; zero for non-timed states. */
  readonly actionTicksRemaining: number;
  /** Selects the next hit reaction without randomness. */
  readonly nextHitReaction: 1 | 2;
}

export const GREG_MOVEMENT_THRESHOLD = 0.05;
export const GREG_ATTACK_HOLD_TICKS = 24;
export const GREG_HIT_HOLD_TICKS = 18;

const CLIP_POLICY: Readonly<
  Record<GregAnimationKind, { clip: GregAnimationClip; loop: boolean; transitionDurationSeconds: number }>
> = {
  idle: { clip: 'Idle', loop: true, transitionDurationSeconds: 0.2 },
  movement: { clip: 'Walk', loop: true, transitionDurationSeconds: 0.15 },
  attack: { clip: 'Attack', loop: false, transitionDurationSeconds: 0.08 },
  hit: { clip: 'Idle_HitReact1', loop: false, transitionDurationSeconds: 0.05 },
  death: { clip: 'Death', loop: false, transitionDurationSeconds: 0.1 },
};

export function createGregAnimationState(): GregAnimationState {
  return enter('idle', CLIP_POLICY.idle.clip, 0, 1, true);
}

/** Pure reducer. The input state is never modified. */
export function advanceGregAnimation(
  previous: Readonly<GregAnimationState>,
  input: Readonly<GregAnimationInput>,
): GregAnimationState {
  // Death is not timed: it holds on its final pose until the actor is alive
  // again. Pulses received while dead are intentionally consumed, not queued.
  if (!input.alive) {
    return enter('death', CLIP_POLICY.death.clip, 0, previous.nextHitReaction, previous.kind !== 'death');
  }

  // A hit starts (or restarts) immediately and deterministically alternates the
  // two supplied reaction clips. It preempts both a new and an active attack.
  if (input.hitPulse) {
    const reaction = previous.nextHitReaction;
    const clip: GregAnimationClip = reaction === 1 ? 'Idle_HitReact1' : 'Idle_HitReact2';
    const nextReaction: 1 | 2 = reaction === 1 ? 2 : 1;
    return enter('hit', clip, GREG_HIT_HOLD_TICKS, nextReaction, true);
  }

  if (previous.kind === 'hit' && previous.actionTicksRemaining > 1) {
    return continueAction(previous);
  }

  // An attack pulse that loses to a hit is not queued. This keeps renderer
  // state observational and prevents delayed visuals from implying a sim event.
  if (input.attackPulse) {
    return enter('attack', CLIP_POLICY.attack.clip, GREG_ATTACK_HOLD_TICKS, previous.nextHitReaction, true);
  }

  if (previous.kind === 'attack' && previous.actionTicksRemaining > 1) {
    return continueAction(previous);
  }

  const moving = Number.isFinite(input.movementMagnitude) && input.movementMagnitude > GREG_MOVEMENT_THRESHOLD;
  const kind: GregAnimationKind = moving ? 'movement' : 'idle';
  const policy = CLIP_POLICY[kind];
  return enter(kind, policy.clip, 0, previous.nextHitReaction, previous.kind !== kind || previous.clip !== policy.clip);
}

function continueAction(previous: Readonly<GregAnimationState>): GregAnimationState {
  return {
    ...previous,
    restart: false,
    actionTicksRemaining: previous.actionTicksRemaining - 1,
  };
}

function enter(
  kind: GregAnimationKind,
  clip: GregAnimationClip,
  actionTicksRemaining: number,
  nextHitReaction: 1 | 2,
  restart: boolean,
): GregAnimationState {
  const policy = CLIP_POLICY[kind];
  return {
    kind,
    clip,
    loop: policy.loop,
    transitionDurationSeconds: policy.transitionDurationSeconds,
    restart,
    actionTicksRemaining,
    nextHitReaction,
  };
}
