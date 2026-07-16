/**
 * LEAD-OWNED. Simulation configuration. Agents must not modify this file.
 * All tunables live here so tests and benchmarks share one source of truth.
 */
import type { EnemyArchetype, WaveSegment } from './types.js';
import { createHashWriter } from './state-hash.js';

// Version 13 adds per-spawn, run-content-authored boss behavior state on top
// of the V1.1 hero attack modes and replay-recorded Master fusions. Old
// records reject rather than silently replay with a different boss contract.
export const CONFIG_VERSION = 13;

export interface WeaponConfig {
  /** Ticks between automatic shots. */
  cooldownTicks: number;
  range: number;
  projectileSpeed: number;
  damage: number;
  lifetimeTicks: number;
  hitRadius: number;
  pierce: number;
  /** Neighbor radius used by the densestCluster targeting policy. */
  clusterRadius: number;
}

export interface PlayerConfig {
  startX: number;
  startY: number;
  maxHp: number;
  speed: number;
  radius: number;
  pickupRadius: number;
  /** Invulnerability ticks granted after taking contact damage. */
  invulnTicksOnHit: number;
}

/**
 * Authored behavior for the first varied-enemy slice. It stays in the
 * deterministic config so replay identity, headless tests, and browser play
 * all agree on runner movement and ranged projectile cadence.
 */
export interface EnemyBehaviorConfig {
  /** Sideways fraction blended into a distant runner's approach direction. */
  runnerWeaveStrength: number;
  /** Runners stop weaving and directly seek inside this world-space distance. */
  runnerDirectSeekRange: number;
  /** Fixed ticks between runner weave-direction flips. */
  runnerWeavePeriodTicks: number;
  /** Elites prefer to fight from this distance. */
  elitePreferredRange: number;
  /** Half-width of the elite's preferred range band. */
  eliteRangeBand: number;
  /** Tangential fraction used while an elite holds its preferred band. */
  eliteOrbitStrength: number;
  /** First hostile-shot delay after an elite enters firing range. */
  eliteInitialFireDelayTicks: number;
  /** Ticks between elite hostile shots. */
  eliteFireIntervalTicks: number;
  /** World units per second for an elite hostile projectile. */
  eliteProjectileSpeed: number;
  /** Damage dealt by one hostile projectile. */
  eliteProjectileDamage: number;
  /** Lifetime for a hostile projectile. */
  eliteProjectileLifetimeTicks: number;
  /** Collision radius for a hostile projectile. */
  eliteProjectileHitRadius: number;
  /** First hostile-shot delay after a spitter enters firing range. */
  spitterInitialFireDelayTicks: number;
  /** Ticks between a spitter's hostile shots while in firing range. */
  spitterFireIntervalTicks: number;
  /** Damage dealt by one spitter projectile. */
  spitterProjectileDamage: number;
  /** Preferred spacing for The Final Threat outside its charge beat. */
  bossPreferredRange: number;
  /** Half-width of the boss's preferred spacing band. */
  bossRangeBand: number;
  /** Full deterministic boss attack cycle length. */
  bossCycleTicks: number;
  /** Wind-up duration before the boss lunge. */
  bossChargeWindupTicks: number;
  /** Active lunge duration after the wind-up. */
  bossChargeDurationTicks: number;
  /** Movement multiplier during the lunge. */
  bossChargeSpeedMultiplier: number;
  /** Cycle tick at which the radial hostile volley fires. */
  bossVolleyTick: number;
  /** Number of projectiles in the radial hostile volley. */
  bossVolleyCount: number;
  /** World-space speed of each boss volley projectile. */
  bossProjectileSpeed: number;
  /** Damage dealt by each boss volley projectile. */
  bossProjectileDamage: number;
  /** Lifetime of each boss volley projectile. */
  bossProjectileLifetimeTicks: number;
  /** Collision radius of each boss volley projectile. */
  bossProjectileHitRadius: number;
  /** Preferred approach distance for flankers. */
  flankerPreferredRange: number;
  /** Tangential movement fraction used by flankers. */
  flankerOrbitStrength: number;
  /** Preferred spacing for support threats. */
  supportPreferredRange: number;
  /** Half-width of the support spacing band. */
  supportRangeBand: number;
  /** Ticks between support healing pulses. */
  supportHealIntervalTicks: number;
  /** Radius in which a support pulse restores enemy health. */
  supportHealRadius: number;
  /** Health restored to each enemy touched by a support pulse. */
  supportHealAmount: number;
}

export interface SimConfig {
  hz: number;
  worldWidth: number;
  worldHeight: number;
  gridCellSize: number;
  enemyCap: number;
  projectileCap: number;
  pickupCap: number;
  /** Maximum simultaneous persistent player damage zones. */
  zoneCap: number;
  /** Authored opening cumulative XP thresholds; simulation continues with a deterministic tail. */
  xpThresholds: readonly number[];
  /** Ticks an enemy must wait between contact-damage applications. */
  enemyContactCooldownTicks: number;
  player: PlayerConfig;
  weapon: WeaponConfig;
  enemyBehavior: EnemyBehaviorConfig;
  archetypes: readonly EnemyArchetype[];
  waves: readonly WaveSegment[];
}

function requireFinite(name: string, value: number, minimum = -Infinity): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${name} must be finite and >= ${minimum} (received ${value})`);
  }
}

function requireInteger(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}] (received ${value})`);
  }
}

/** Fail fast before malformed content can corrupt typed-array or packed-id state. */
export function validateConfig(config: SimConfig): void {
  requireFinite('hz', config.hz, Number.MIN_VALUE);
  requireFinite('worldWidth', config.worldWidth, Number.MIN_VALUE);
  requireFinite('worldHeight', config.worldHeight, Number.MIN_VALUE);
  requireFinite('gridCellSize', config.gridCellSize, Number.MIN_VALUE);
  requireInteger('enemyCap', config.enemyCap, 1, 0xfffe);
  requireInteger('projectileCap', config.projectileCap, 1, 0xfffe);
  requireInteger('pickupCap', config.pickupCap, 1, 0xfffe);
  requireInteger('zoneCap', config.zoneCap, 1, 0xfffe);
  requireInteger('enemyContactCooldownTicks', config.enemyContactCooldownTicks, 0, 0xffff);

  let previousXp = -Infinity;
  for (let i = 0; i < config.xpThresholds.length; i++) {
    const threshold = config.xpThresholds[i]!;
    requireFinite(`xpThresholds[${i}]`, threshold, 0);
    if (threshold <= previousXp) {
      throw new RangeError('xpThresholds must be strictly increasing');
    }
    previousXp = threshold;
  }

  const p = config.player;
  requireFinite('player.startX', p.startX, 0);
  requireFinite('player.startY', p.startY, 0);
  if (p.startX > config.worldWidth || p.startY > config.worldHeight) {
    throw new RangeError('player start position must be inside world bounds');
  }
  requireFinite('player.maxHp', p.maxHp, Number.MIN_VALUE);
  requireFinite('player.speed', p.speed, 0);
  requireFinite('player.radius', p.radius, 0);
  requireFinite('player.pickupRadius', p.pickupRadius, 0);
  requireInteger('player.invulnTicksOnHit', p.invulnTicksOnHit, 0, 0xffff);

  const behavior = config.enemyBehavior;
  requireFinite('enemyBehavior.runnerWeaveStrength', behavior.runnerWeaveStrength, 0);
  if (behavior.runnerWeaveStrength > 1) {
    throw new RangeError('enemyBehavior.runnerWeaveStrength must be <= 1');
  }
  requireFinite('enemyBehavior.runnerDirectSeekRange', behavior.runnerDirectSeekRange, 0);
  requireInteger('enemyBehavior.runnerWeavePeriodTicks', behavior.runnerWeavePeriodTicks, 1, 0xffff);
  requireFinite('enemyBehavior.elitePreferredRange', behavior.elitePreferredRange, 0);
  requireFinite('enemyBehavior.eliteRangeBand', behavior.eliteRangeBand, 0);
  requireFinite('enemyBehavior.eliteOrbitStrength', behavior.eliteOrbitStrength, 0);
  if (behavior.eliteOrbitStrength > 1) {
    throw new RangeError('enemyBehavior.eliteOrbitStrength must be <= 1');
  }
  requireInteger('enemyBehavior.eliteInitialFireDelayTicks', behavior.eliteInitialFireDelayTicks, 0, 0xffff);
  requireInteger('enemyBehavior.eliteFireIntervalTicks', behavior.eliteFireIntervalTicks, 1, 0xffff);
  requireFinite('enemyBehavior.eliteProjectileSpeed', behavior.eliteProjectileSpeed, Number.MIN_VALUE);
  requireFinite('enemyBehavior.eliteProjectileDamage', behavior.eliteProjectileDamage, Number.MIN_VALUE);
  requireInteger('enemyBehavior.eliteProjectileLifetimeTicks', behavior.eliteProjectileLifetimeTicks, 1, 0xffff);
  requireFinite('enemyBehavior.eliteProjectileHitRadius', behavior.eliteProjectileHitRadius, 0);
  requireInteger('enemyBehavior.spitterInitialFireDelayTicks', behavior.spitterInitialFireDelayTicks, 0, 0xffff);
  requireInteger('enemyBehavior.spitterFireIntervalTicks', behavior.spitterFireIntervalTicks, 1, 0xffff);
  requireFinite('enemyBehavior.spitterProjectileDamage', behavior.spitterProjectileDamage, Number.MIN_VALUE);
  requireFinite('enemyBehavior.bossPreferredRange', behavior.bossPreferredRange, Number.MIN_VALUE);
  requireFinite('enemyBehavior.bossRangeBand', behavior.bossRangeBand, 0);
  requireInteger('enemyBehavior.bossCycleTicks', behavior.bossCycleTicks, 1, 0xffff);
  requireInteger('enemyBehavior.bossChargeWindupTicks', behavior.bossChargeWindupTicks, 1, 0xffff);
  requireInteger('enemyBehavior.bossChargeDurationTicks', behavior.bossChargeDurationTicks, 1, 0xffff);
  requireFinite('enemyBehavior.bossChargeSpeedMultiplier', behavior.bossChargeSpeedMultiplier, Number.MIN_VALUE);
  requireInteger('enemyBehavior.bossVolleyTick', behavior.bossVolleyTick, 0, behavior.bossCycleTicks - 1);
  requireInteger('enemyBehavior.bossVolleyCount', behavior.bossVolleyCount, 1, 32);
  requireFinite('enemyBehavior.bossProjectileSpeed', behavior.bossProjectileSpeed, Number.MIN_VALUE);
  requireFinite('enemyBehavior.bossProjectileDamage', behavior.bossProjectileDamage, Number.MIN_VALUE);
  requireInteger('enemyBehavior.bossProjectileLifetimeTicks', behavior.bossProjectileLifetimeTicks, 1, 0xffff);
  requireFinite('enemyBehavior.bossProjectileHitRadius', behavior.bossProjectileHitRadius, 0);
  if (behavior.bossChargeWindupTicks + behavior.bossChargeDurationTicks >= behavior.bossVolleyTick) {
    throw new RangeError('boss charge must resolve before boss volley tick');
  }
  requireFinite('enemyBehavior.flankerPreferredRange', behavior.flankerPreferredRange, Number.MIN_VALUE);
  requireFinite('enemyBehavior.flankerOrbitStrength', behavior.flankerOrbitStrength, 0);
  if (behavior.flankerOrbitStrength > 1) throw new RangeError('flankerOrbitStrength must be <= 1');
  requireFinite('enemyBehavior.supportPreferredRange', behavior.supportPreferredRange, Number.MIN_VALUE);
  requireFinite('enemyBehavior.supportRangeBand', behavior.supportRangeBand, 0);
  requireInteger('enemyBehavior.supportHealIntervalTicks', behavior.supportHealIntervalTicks, 1, 0xffff);
  requireFinite('enemyBehavior.supportHealRadius', behavior.supportHealRadius, 0);
  requireFinite('enemyBehavior.supportHealAmount', behavior.supportHealAmount, Number.MIN_VALUE);

  const weapon = config.weapon;
  requireInteger('weapon.cooldownTicks', weapon.cooldownTicks, 1, 0xffff);
  requireFinite('weapon.range', weapon.range, 0);
  requireFinite('weapon.projectileSpeed', weapon.projectileSpeed, 0);
  requireFinite('weapon.damage', weapon.damage, 0);
  requireInteger('weapon.lifetimeTicks', weapon.lifetimeTicks, 1, 0xffff);
  requireFinite('weapon.hitRadius', weapon.hitRadius, 0);
  requireInteger('weapon.pierce', weapon.pierce, 0, 0xff);
  requireFinite('weapon.clusterRadius', weapon.clusterRadius, 0);

  requireInteger('archetypes.length', config.archetypes.length, 1, 0x100);
  for (let i = 0; i < config.archetypes.length; i++) {
    const a = config.archetypes[i]!;
    requireFinite(`archetypes[${i}].hp`, a.hp, Number.MIN_VALUE);
    requireFinite(`archetypes[${i}].speed`, a.speed, 0);
    requireFinite(`archetypes[${i}].radius`, a.radius, 0);
    requireFinite(`archetypes[${i}].touchDamage`, a.touchDamage, 0);
    requireFinite(`archetypes[${i}].xpDrop`, a.xpDrop, 0);
  }

  let priorEnd = 0;
  for (let i = 0; i < config.waves.length; i++) {
    const wave = config.waves[i]!;
    requireInteger(`waves[${i}].startTick`, wave.startTick, 0, 0xffffffff);
    requireInteger(`waves[${i}].endTick`, wave.endTick, 1, 0xffffffff);
    if (wave.endTick <= wave.startTick || wave.startTick < priorEnd) {
      throw new RangeError('waves must be ordered, non-overlapping, and have endTick > startTick');
    }
    priorEnd = wave.endTick;
    requireInteger(`waves[${i}].spawnIntervalTicks`, wave.spawnIntervalTicks, 1, 0xffffffff);
    requireInteger(`waves[${i}].maxAlive`, wave.maxAlive, 0, 0xfffe);
    if (wave.archetypeWeights.length !== config.archetypes.length) {
      throw new RangeError(`waves[${i}].archetypeWeights must match archetypes.length`);
    }
    let totalWeight = 0;
    for (let j = 0; j < wave.archetypeWeights.length; j++) {
      const weight = wave.archetypeWeights[j]!;
      requireFinite(`waves[${i}].archetypeWeights[${j}]`, weight, 0);
      totalWeight += weight;
    }
    if (!(totalWeight > 0)) throw new RangeError(`waves[${i}] must have a positive archetype weight`);
    for (let j = 0; j < (wave.elites?.length ?? 0); j++) {
      const elite = wave.elites![j]!;
      requireInteger(`waves[${i}].elites[${j}].tick`, elite.tick, wave.startTick, wave.endTick - 1);
      requireInteger(`waves[${i}].elites[${j}].archetype`, elite.archetype, 0, config.archetypes.length - 1);
      requireFinite(`waves[${i}].elites[${j}].hpMultiplier`, elite.hpMultiplier, Number.MIN_VALUE);
    }
  }
}

/** Stable identity for replay compatibility; includes all gameplay configuration. */
export function fingerprintConfig(config: SimConfig): string {
  validateConfig(config);
  const w = createHashWriter();
  w.u32(CONFIG_VERSION);
  w.f64(config.hz);
  w.f64(config.worldWidth);
  w.f64(config.worldHeight);
  w.f64(config.gridCellSize);
  w.u32(config.enemyCap);
  w.u32(config.projectileCap);
  w.u32(config.pickupCap);
  w.u32(config.zoneCap);
  w.u32(config.enemyContactCooldownTicks);
  w.u32(config.xpThresholds.length);
  for (const value of config.xpThresholds) w.f64(value);

  const p = config.player;
  w.f64(p.startX); w.f64(p.startY); w.f64(p.maxHp); w.f64(p.speed);
  w.f64(p.radius); w.f64(p.pickupRadius); w.u32(p.invulnTicksOnHit);

  const behavior = config.enemyBehavior;
  w.f64(behavior.runnerWeaveStrength);
  w.f64(behavior.runnerDirectSeekRange);
  w.u32(behavior.runnerWeavePeriodTicks);
  w.f64(behavior.elitePreferredRange);
  w.f64(behavior.eliteRangeBand);
  w.f64(behavior.eliteOrbitStrength);
  w.u32(behavior.eliteInitialFireDelayTicks);
  w.u32(behavior.eliteFireIntervalTicks);
  w.f64(behavior.eliteProjectileSpeed);
  w.f64(behavior.eliteProjectileDamage);
  w.u32(behavior.eliteProjectileLifetimeTicks);
  w.f64(behavior.eliteProjectileHitRadius);
  w.u32(behavior.spitterInitialFireDelayTicks);
  w.u32(behavior.spitterFireIntervalTicks);
  w.f64(behavior.spitterProjectileDamage);
  w.f64(behavior.bossPreferredRange);
  w.f64(behavior.bossRangeBand);
  w.u32(behavior.bossCycleTicks);
  w.u32(behavior.bossChargeWindupTicks);
  w.u32(behavior.bossChargeDurationTicks);
  w.f64(behavior.bossChargeSpeedMultiplier);
  w.u32(behavior.bossVolleyTick);
  w.u32(behavior.bossVolleyCount);
  w.f64(behavior.bossProjectileSpeed);
  w.f64(behavior.bossProjectileDamage);
  w.u32(behavior.bossProjectileLifetimeTicks);
  w.f64(behavior.bossProjectileHitRadius);
  w.f64(behavior.flankerPreferredRange);
  w.f64(behavior.flankerOrbitStrength);
  w.f64(behavior.supportPreferredRange);
  w.f64(behavior.supportRangeBand);
  w.u32(behavior.supportHealIntervalTicks);
  w.f64(behavior.supportHealRadius);
  w.f64(behavior.supportHealAmount);

  const weapon = config.weapon;
  w.u32(weapon.cooldownTicks); w.f64(weapon.range); w.f64(weapon.projectileSpeed);
  w.f64(weapon.damage); w.u32(weapon.lifetimeTicks); w.f64(weapon.hitRadius);
  w.u8(weapon.pierce); w.f64(weapon.clusterRadius);

  w.u32(config.archetypes.length);
  for (const a of config.archetypes) {
    w.str(a.name); w.f64(a.hp); w.f64(a.speed); w.f64(a.radius);
    w.f64(a.touchDamage); w.f64(a.xpDrop);
  }
  w.u32(config.waves.length);
  for (const wave of config.waves) {
    w.u32(wave.startTick); w.u32(wave.endTick); w.u32(wave.spawnIntervalTicks); w.u32(wave.maxAlive);
    w.u32(wave.archetypeWeights.length);
    for (const weight of wave.archetypeWeights) w.f64(weight);
    w.u32(wave.elites?.length ?? 0);
    for (const elite of wave.elites ?? []) {
      w.u32(elite.tick); w.u32(elite.archetype); w.f64(elite.hpMultiplier);
    }
  }
  return w.digestHex();
}

export const DEFAULT_ARCHETYPES: readonly EnemyArchetype[] = [
  { name: 'walker', hp: 20, speed: 55, radius: 6, touchDamage: 5, xpDrop: 1 },
  { name: 'runner', hp: 12, speed: 95, radius: 5, touchDamage: 4, xpDrop: 1 },
  { name: 'brute', hp: 80, speed: 35, radius: 10, touchDamage: 12, xpDrop: 4 },
  { name: 'spitter', hp: 36, speed: 48, radius: 7, touchDamage: 6, xpDrop: 2 },
  { name: 'charger', hp: 46, speed: 66, radius: 8, touchDamage: 9, xpDrop: 3 },
  { name: 'denial', hp: 58, speed: 24, radius: 12, touchDamage: 8, xpDrop: 3 },
  { name: 'flanker', hp: 28, speed: 84, radius: 7, touchDamage: 7, xpDrop: 2 },
  { name: 'support', hp: 44, speed: 30, radius: 9, touchDamage: 4, xpDrop: 3 },
];

export const DEFAULT_WAVES: readonly WaveSegment[] = [
  {
    startTick: 0,
    endTick: 1800,
    spawnIntervalTicks: 30,
    archetypeWeights: [8, 2, 0, 0, 0, 0, 0, 0],
    maxAlive: 300,
  },
  {
    startTick: 1800,
    endTick: 4800,
    spawnIntervalTicks: 12,
    archetypeWeights: [6, 3, 1, 0, 0, 0, 0, 0],
    maxAlive: 700,
    elites: [{ tick: 3000, archetype: 2, hpMultiplier: 5 }],
  },
  {
    startTick: 4800,
    endTick: 2147483647,
    spawnIntervalTicks: 6,
    archetypeWeights: [5, 3, 2, 0, 1, 0, 1, 0],
    maxAlive: 1000,
    elites: [
      { tick: 6000, archetype: 2, hpMultiplier: 8 },
      { tick: 9000, archetype: 2, hpMultiplier: 12 },
    ],
  },
];

export const DEFAULT_CONFIG: SimConfig = {
  hz: 60,
  worldWidth: 2000,
  worldHeight: 2000,
  gridCellSize: 50,
  enemyCap: 1200,
  projectileCap: 600,
  pickupCap: 300,
  zoneCap: 16,
  // Cumulative thresholds: three choices can arrive in the first two minutes
  // without introducing a later abrupt XP wall.
  xpThresholds: [4, 10, 18, 30, 46, 68, 96, 132, 176, 228],
  enemyContactCooldownTicks: 30,
  player: {
    startX: 1000,
    startY: 1000,
    maxHp: 100,
    speed: 120,
    radius: 8,
    pickupRadius: 40,
    invulnTicksOnHit: 20,
  },
  enemyBehavior: {
    runnerWeaveStrength: 0.36,
    runnerDirectSeekRange: 150,
    runnerWeavePeriodTicks: 36,
    elitePreferredRange: 290,
    eliteRangeBand: 55,
    eliteOrbitStrength: 0.52,
    eliteInitialFireDelayTicks: 72,
    eliteFireIntervalTicks: 150,
    eliteProjectileSpeed: 260,
    eliteProjectileDamage: 8,
    eliteProjectileLifetimeTicks: 180,
    eliteProjectileHitRadius: 7,
    spitterInitialFireDelayTicks: 90,
    spitterFireIntervalTicks: 180,
    spitterProjectileDamage: 6,
    bossPreferredRange: 320,
    bossRangeBand: 50,
    bossCycleTicks: 360,
    bossChargeWindupTicks: 36,
    bossChargeDurationTicks: 42,
    bossChargeSpeedMultiplier: 2.4,
    bossVolleyTick: 180,
    bossVolleyCount: 8,
    bossProjectileSpeed: 220,
    bossProjectileDamage: 10,
    bossProjectileLifetimeTicks: 180,
    bossProjectileHitRadius: 8,
    flankerPreferredRange: 220,
    flankerOrbitStrength: 0.84,
    supportPreferredRange: 300,
    supportRangeBand: 45,
    supportHealIntervalTicks: 120,
    supportHealRadius: 150,
    supportHealAmount: 8,
  },
  weapon: {
    cooldownTicks: 20,
    range: 350,
    projectileSpeed: 400,
    damage: 10,
    lifetimeTicks: 90,
    hitRadius: 6,
    // Basic Auto-Fire is single-target. Quills and future starter upgrades own
    // their pierce explicitly; it must not leak from the global default.
    pierce: 0,
    clusterRadius: 60,
  },
  archetypes: DEFAULT_ARCHETYPES,
  waves: DEFAULT_WAVES,
};
