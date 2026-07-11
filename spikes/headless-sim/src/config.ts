/**
 * LEAD-OWNED. Simulation configuration. Agents must not modify this file.
 * All tunables live here so tests and benchmarks share one source of truth.
 */
import type { EnemyArchetype, WaveSegment } from './types.js';
import { createHashWriter } from './state-hash.js';

// Version 4 adds endless XP, typed run-upgrade replays, and permanent-loadout
// replay identity. Old records must reject rather than silently diverge.
export const CONFIG_VERSION = 4;

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

export interface SimConfig {
  hz: number;
  worldWidth: number;
  worldHeight: number;
  gridCellSize: number;
  enemyCap: number;
  projectileCap: number;
  pickupCap: number;
  /** Authored opening cumulative XP thresholds; simulation continues with a deterministic tail. */
  xpThresholds: readonly number[];
  /** Ticks an enemy must wait between contact-damage applications. */
  enemyContactCooldownTicks: number;
  player: PlayerConfig;
  weapon: WeaponConfig;
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
  w.u32(config.enemyContactCooldownTicks);
  w.u32(config.xpThresholds.length);
  for (const value of config.xpThresholds) w.f64(value);

  const p = config.player;
  w.f64(p.startX); w.f64(p.startY); w.f64(p.maxHp); w.f64(p.speed);
  w.f64(p.radius); w.f64(p.pickupRadius); w.u32(p.invulnTicksOnHit);

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
];

export const DEFAULT_WAVES: readonly WaveSegment[] = [
  {
    startTick: 0,
    endTick: 1800,
    spawnIntervalTicks: 30,
    archetypeWeights: [8, 2, 0],
    maxAlive: 300,
  },
  {
    startTick: 1800,
    endTick: 4800,
    spawnIntervalTicks: 12,
    archetypeWeights: [6, 3, 1],
    maxAlive: 700,
    elites: [{ tick: 3000, archetype: 2, hpMultiplier: 5 }],
  },
  {
    startTick: 4800,
    endTick: 2147483647,
    spawnIntervalTicks: 6,
    archetypeWeights: [5, 3, 2],
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
  xpThresholds: [5, 15, 30, 50, 80, 120, 170, 230, 300, 380],
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
  weapon: {
    cooldownTicks: 20,
    range: 350,
    projectileSpeed: 400,
    damage: 10,
    lifetimeTicks: 90,
    hitRadius: 6,
    pierce: 1,
    clusterRadius: 60,
  },
  archetypes: DEFAULT_ARCHETYPES,
  waves: DEFAULT_WAVES,
};
