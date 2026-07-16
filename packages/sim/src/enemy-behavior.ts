/**
 * Allocation-free, simulation-owned state for the first varied-enemy slice.
 *
 * It intentionally contains only values that cannot be reconstructed from a
 * live position: delayed hostile-shot cadence. Runner weaving is derived
 * from stable entity identity and tick, so slot reuse cannot leak a hidden
 * movement phase between enemies.
 */

import type { RunBossProfileView } from './run-director-port.js';

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
  /** Per-boss authored behavior profile, copied on spawn and canonical-hashed. */
  readonly bossPreferredRange: Float32Array;
  readonly bossRangeBand: Float32Array;
  readonly bossCycleTicks: Uint16Array;
  readonly bossChargeWindupTicks: Uint16Array;
  readonly bossChargeDurationTicks: Uint16Array;
  readonly bossChargeSpeedMultiplier: Float32Array;
  readonly bossVolleyTick: Uint16Array;
  readonly bossVolleyCount: Uint8Array;
  readonly bossProjectileSpeed: Float32Array;
  readonly bossProjectileDamage: Float32Array;
  readonly bossProjectileLifetimeTicks: Uint16Array;
  readonly bossProjectileHitRadius: Float32Array;
}

export function createEnemyBehaviorState(capacity: number): EnemyBehaviorState {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`enemy behavior capacity must be a positive integer, got ${capacity}`);
  }
  return {
    kind: new Uint8Array(capacity),
    hostileShotCooldown: new Uint16Array(capacity),
    bossPatternTick: new Uint16Array(capacity),
    bossPreferredRange: new Float32Array(capacity),
    bossRangeBand: new Float32Array(capacity),
    bossCycleTicks: new Uint16Array(capacity),
    bossChargeWindupTicks: new Uint16Array(capacity),
    bossChargeDurationTicks: new Uint16Array(capacity),
    bossChargeSpeedMultiplier: new Float32Array(capacity),
    bossVolleyTick: new Uint16Array(capacity),
    bossVolleyCount: new Uint8Array(capacity),
    bossProjectileSpeed: new Float32Array(capacity),
    bossProjectileDamage: new Float32Array(capacity),
    bossProjectileLifetimeTicks: new Uint16Array(capacity),
    bossProjectileHitRadius: new Float32Array(capacity),
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
  bossProfile?: RunBossProfileView,
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
  state.bossPreferredRange[slot] = 0;
  state.bossRangeBand[slot] = 0;
  state.bossCycleTicks[slot] = 0;
  state.bossChargeWindupTicks[slot] = 0;
  state.bossChargeDurationTicks[slot] = 0;
  state.bossChargeSpeedMultiplier[slot] = 0;
  state.bossVolleyTick[slot] = 0;
  state.bossVolleyCount[slot] = 0;
  state.bossProjectileSpeed[slot] = 0;
  state.bossProjectileDamage[slot] = 0;
  state.bossProjectileLifetimeTicks[slot] = 0;
  state.bossProjectileHitRadius[slot] = 0;
  if (bossProfile !== undefined) {
    validateBossProfile(bossProfile);
    state.kind[slot] = ENEMY_BEHAVIOR_KIND.bossApex;
    state.hostileShotCooldown[slot] = 0;
    state.bossPreferredRange[slot] = bossProfile.preferredRange;
    state.bossRangeBand[slot] = bossProfile.rangeBand;
    state.bossCycleTicks[slot] = bossProfile.cycleTicks;
    state.bossChargeWindupTicks[slot] = bossProfile.chargeWindupTicks;
    state.bossChargeDurationTicks[slot] = bossProfile.chargeDurationTicks;
    state.bossChargeSpeedMultiplier[slot] = bossProfile.chargeSpeedMultiplier;
    state.bossVolleyTick[slot] = bossProfile.volleyTick;
    state.bossVolleyCount[slot] = bossProfile.volleyCount;
    state.bossProjectileSpeed[slot] = bossProfile.projectileSpeed;
    state.bossProjectileDamage[slot] = bossProfile.projectileDamage;
    state.bossProjectileLifetimeTicks[slot] = bossProfile.projectileLifetimeTicks;
    state.bossProjectileHitRadius[slot] = bossProfile.projectileHitRadius;
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

function validateBossProfile(profile: RunBossProfileView): void {
  const tickValues = [
    profile.cycleTicks,
    profile.chargeWindupTicks,
    profile.chargeDurationTicks,
    profile.volleyTick,
    profile.projectileLifetimeTicks,
  ];
  if (tickValues.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 0xffff)) {
    throw new RangeError('boss profile ticks must be positive uint16 values');
  }
  if (!Number.isSafeInteger(profile.volleyCount) || profile.volleyCount < 1 || profile.volleyCount > 32) {
    throw new RangeError('boss profile volleyCount must be an integer in [1, 32]');
  }
  for (const value of [
    profile.preferredRange,
    profile.rangeBand,
    profile.chargeSpeedMultiplier,
    profile.projectileSpeed,
    profile.projectileDamage,
    profile.projectileHitRadius,
  ]) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('boss profile has an invalid numeric value');
  }
  if (profile.preferredRange <= 0 || profile.chargeSpeedMultiplier <= 0 || profile.projectileSpeed <= 0 || profile.projectileDamage <= 0) {
    throw new RangeError('boss profile has a non-positive combat value');
  }
  if (profile.volleyTick >= profile.cycleTicks) throw new RangeError('boss profile volleyTick must be inside cycleTicks');
  if (profile.chargeWindupTicks + profile.chargeDurationTicks >= profile.volleyTick) {
    throw new RangeError('boss profile charge must resolve before volleyTick');
  }
}
