/**
 * Allocation-free, simulation-owned state for the first varied-enemy slice.
 *
 * It intentionally contains only values that cannot be reconstructed from a
 * live position: delayed hostile-shot cadence. Runner weaving is derived
 * from stable entity identity and tick, so slot reuse cannot leak a hidden
 * movement phase between enemies.
 */

export const ENEMY_BEHAVIOR_KIND = Object.freeze({
  direct: 0,
  runnerWeave: 1,
  eliteSkirmish: 2,
  spitterSkirmish: 3,
  chargerBurst: 4,
  bossApex: 5,
  flankerOrbit: 6,
  supportPulse: 7,
} as const);

export type EnemyBehaviorKind = (typeof ENEMY_BEHAVIOR_KIND)[keyof typeof ENEMY_BEHAVIOR_KIND];

export interface EnemyBehaviorState {
  /** One behavior kind per enemy-pool slot. */
  readonly kind: Uint8Array;
  /** Ticks until a ranged enemy may emit its next hostile projectile. */
  readonly hostileShotCooldown: Uint16Array;
  /** Cycle position for a live bespoke boss; zeroed on every pool reuse. */
  readonly bossPatternTick: Uint16Array;
}

export function createEnemyBehaviorState(capacity: number): EnemyBehaviorState {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`enemy behavior capacity must be a positive integer, got ${capacity}`);
  }
  return {
    kind: new Uint8Array(capacity),
    hostileShotCooldown: new Uint16Array(capacity),
    bossPatternTick: new Uint16Array(capacity),
  };
}

/** Reset every stateful field on spawn and despawn so reused slots stay honest. */
export function resetEnemyBehavior(
  state: EnemyBehaviorState,
  slot: number,
  archetypeName: string,
  isElite: boolean,
  eliteInitialFireDelayTicks: number,
  spitterInitialFireDelayTicks: number,
  isBoss = false,
): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.kind.length) {
    throw new RangeError(`enemy behavior slot is out of range: ${slot}`);
  }
  if (!Number.isInteger(eliteInitialFireDelayTicks) || eliteInitialFireDelayTicks < 0 || eliteInitialFireDelayTicks > 0xffff) {
    throw new RangeError(`eliteInitialFireDelayTicks must be a uint16, got ${eliteInitialFireDelayTicks}`);
  }
  if (!Number.isInteger(spitterInitialFireDelayTicks) || spitterInitialFireDelayTicks < 0 || spitterInitialFireDelayTicks > 0xffff) {
    throw new RangeError(`spitterInitialFireDelayTicks must be a uint16, got ${spitterInitialFireDelayTicks}`);
  }
  state.bossPatternTick[slot] = 0;
  if (isBoss) {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.bossApex;
    state.hostileShotCooldown[slot] = 0;
    return;
  }
  if (isElite) {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.eliteSkirmish;
    state.hostileShotCooldown[slot] = eliteInitialFireDelayTicks;
    return;
  }
  if (archetypeName === 'spitter') {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.spitterSkirmish;
    state.hostileShotCooldown[slot] = spitterInitialFireDelayTicks;
    return;
  }
  if (archetypeName === 'denial') {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.spitterSkirmish;
    state.hostileShotCooldown[slot] = spitterInitialFireDelayTicks;
    return;
  }
  if (archetypeName === 'charger') {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.chargerBurst;
    state.hostileShotCooldown[slot] = 0;
    return;
  }
  if (archetypeName === 'flanker') {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.flankerOrbit;
    state.hostileShotCooldown[slot] = 0;
    return;
  }
  if (archetypeName === 'support') {
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.supportPulse;
    state.hostileShotCooldown[slot] = 0;
    return;
  }
  state.kind[slot] = archetypeName === 'runner'
    ? ENEMY_BEHAVIOR_KIND.runnerWeave
    : ENEMY_BEHAVIOR_KIND.direct;
  state.hostileShotCooldown[slot] = 0;
}
