import type {
  RunBossProfileView,
  RunDirectorEventView,
  RunFormationView,
  RunSpawnIntentView,
} from './run-director-port.js';
import {
  runEnemyContentFor,
  RUN_ENEMY_ROLE,
  type RunEnemyRole,
} from './run-enemy-content.js';

export { RUN_ENEMY_CONTENT, validateRunEnemyContent } from './run-enemy-content.js';
export { RUN_ENEMY_ROLE } from './run-enemy-content.js';
export type {
  RunEnemyBehavior,
  RunEnemyContentDefinition,
  RunEnemyReward,
  RunEnemyRole,
  RunEnemyVisual,
} from './run-enemy-content.js';

export interface DirectedEnemySpawn {
  readonly archetype: number;
  readonly hpMultiplier: number;
  /** Multiplier applied to this unit's authored XP drop. */
  readonly xpMultiplier: number;
  readonly role: RunEnemyRole;
  /** Present only for an authored boss; consumed into authoritative behavior state. */
  readonly bossProfile?: RunBossProfileView;
  readonly x: number;
  readonly y: number;
}

export interface RunSpawnAdapterContext {
  readonly playerX: number;
  readonly playerY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  spawn(request: DirectedEnemySpawn): boolean;
}

export interface RunSpawnAdapterStats {
  requested: number;
  spawned: number;
  rejected: number;
  unsupportedArchetypes: number;
}

export interface RunSpawnAdapterOptions {
  /** Converts authored distance units into simulation world units. Default 20. */
  readonly distanceScale?: number;
  readonly eliteHpMultiplier?: number;
  /** Makes rare elite kills a visibly meaningful XP event. Default 6. */
  readonly eliteXpMultiplier?: number;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;
const PLACEMENT_ATTEMPTS = 32;
/** Authored cluster radial separation, expressed in intent-distance units. */
const CLUSTER_DISTANCE_STEP = 0.4;

function mixAngle(tick: number, seq: number): number {
  let word = (Math.imul(tick | 0, 0x9e3779b1) ^ Math.imul(seq | 0, 0x85ebca6b)) >>> 0;
  word ^= word >>> 16;
  word = Math.imul(word, 0x7feb352d) >>> 0;
  word ^= word >>> 15;
  return (word / 0x100000000) * TAU;
}

function placement(
  formation: RunFormationView,
  index: number,
  count: number,
  baseAngle: number,
  minimum: number,
  maximum: number,
  clusterDistanceStep: number,
): readonly [number, number] {
  const middle = (minimum + maximum) * 0.5;
  switch (formation) {
    case 'ring':
      return [baseAngle + (TAU * index) / count, middle];
    case 'arc':
      return [baseAngle + (index - (count - 1) * 0.5) * 0.28, middle];
    case 'lane':
      return [baseAngle + (index - (count - 1) * 0.5) * 0.035, minimum + (maximum - minimum) * (index + 1) / (count + 1)];
    case 'cluster':
      return [baseAngle + index * GOLDEN_ANGLE, Math.min(maximum, Math.max(minimum, minimum + index * clusterDistanceStep))];
  }
}

function mapping(
  intent: RunSpawnIntentView,
  eliteMultiplier: number,
  eliteXpMultiplier: number,
) {
  const content = runEnemyContentFor(intent.archetypeId);
  if (content === undefined) return null;
  if (intent.boss || content.reward === 'boss') {
    const profile = intent.bossProfile;
    if (profile === undefined) {
      throw new RangeError('boss spawn intent must include an authored bossProfile');
    }
    validateBossProfile(profile);
    return {
      archetype: content.simulationArchetype,
      hpMultiplier: profile.hpMultiplier,
      xpMultiplier: profile.xpMultiplier,
      role: RUN_ENEMY_ROLE.boss,
      bossProfile: profile,
    } as const;
  }
  if (intent.elite || content.reward === 'elite') {
    return {
      archetype: content.simulationArchetype,
      hpMultiplier: eliteMultiplier,
      xpMultiplier: eliteXpMultiplier,
      role: RUN_ENEMY_ROLE.elite,
    } as const;
  }
  return {
    archetype: content.simulationArchetype,
    hpMultiplier: 1,
    xpMultiplier: 1,
    role: content.role,
  } as const;
}

function validateBossProfile(profile: RunBossProfileView): void {
  if (typeof profile.id !== 'string' || profile.id.length === 0) {
    throw new RangeError('boss profile id must be a non-empty string');
  }
  for (const [name, value] of Object.entries({
    hpMultiplier: profile.hpMultiplier,
    xpMultiplier: profile.xpMultiplier,
    speedMultiplier: profile.speedMultiplier,
    touchDamageMultiplier: profile.touchDamageMultiplier,
    preferredRange: profile.preferredRange,
    chargeSpeedMultiplier: profile.chargeSpeedMultiplier,
    projectileSpeed: profile.projectileSpeed,
    projectileDamage: profile.projectileDamage,
  })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`boss profile ${name} must be finite and positive`);
    }
  }
  for (const [name, value] of Object.entries({
    rangeBand: profile.rangeBand,
    projectileHitRadius: profile.projectileHitRadius,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`boss profile ${name} must be finite and non-negative`);
    }
  }
  for (const [name, value] of Object.entries({
    cycleTicks: profile.cycleTicks,
    chargeWindupTicks: profile.chargeWindupTicks,
    chargeDurationTicks: profile.chargeDurationTicks,
    volleyTick: profile.volleyTick,
    projectileLifetimeTicks: profile.projectileLifetimeTicks,
  })) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff) {
      throw new RangeError(`boss profile ${name} must be a positive uint16`);
    }
  }
  if (!Number.isSafeInteger(profile.volleyCount) || profile.volleyCount < 1 || profile.volleyCount > 32) {
    throw new RangeError('boss profile volleyCount must be an integer in [1, 32]');
  }
  if (profile.volleyTick >= profile.cycleTicks) throw new RangeError('boss profile volleyTick must be inside cycleTicks');
  if (profile.chargeWindupTicks + profile.chargeDurationTicks >= profile.volleyTick) {
    throw new RangeError('boss profile charge must resolve before volleyTick');
  }
}

function coordinates(playerX: number, playerY: number, angle: number, distance: number): readonly [number, number] {
  return [playerX + Math.cos(angle) * distance, playerY + Math.sin(angle) * distance];
}

function isInsideWorld(x: number, y: number, worldWidth: number, worldHeight: number): boolean {
  return x >= 0 && x <= worldWidth && y >= 0 && y <= worldHeight;
}

/**
 * Choose a deterministic angle that keeps the complete formation inside the
 * simulation world without clamping it beside an edge-bound player. The
 * authored distance therefore remains truthful: enemies approach from the
 * off-screen perimeter rather than materializing at a world edge near Greg.
 */
function placementBaseAngle(
  formation: RunFormationView,
  count: number,
  initialAngle: number,
  minimum: number,
  maximum: number,
  playerX: number,
  playerY: number,
  worldWidth: number,
  worldHeight: number,
  clusterDistanceStep: number,
): number | null {
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const candidate = initialAngle + attempt * GOLDEN_ANGLE;
    let fits = true;
    for (let index = 0; index < count; index++) {
      const [angle, distance] = placement(formation, index, count, candidate, minimum, maximum, clusterDistanceStep);
      const [x, y] = coordinates(playerX, playerY, angle, distance);
      if (!isInsideWorld(x, y, worldWidth, worldHeight)) {
        fits = false;
        break;
      }
    }
    if (fits) return candidate;
  }
  return null;
}

export function createRunSpawnAdapter(options: RunSpawnAdapterOptions = {}) {
  const distanceScale = options.distanceScale ?? 20;
  const clusterDistanceStep = CLUSTER_DISTANCE_STEP * distanceScale;
  const eliteMultiplier = options.eliteHpMultiplier ?? 5;
  const eliteXpMultiplier = options.eliteXpMultiplier ?? 6;
  for (const [name, value] of Object.entries({
    distanceScale, eliteMultiplier, eliteXpMultiplier,
  })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  }
  const stats: RunSpawnAdapterStats = { requested: 0, spawned: 0, rejected: 0, unsupportedArchetypes: 0 };

  return {
    execute(events: readonly RunDirectorEventView[], context: RunSpawnAdapterContext): RunSpawnAdapterStats {
      stats.requested = 0;
      stats.spawned = 0;
      stats.rejected = 0;
      stats.unsupportedArchetypes = 0;
      const { playerX, playerY, worldWidth, worldHeight } = context;
      if (![playerX, playerY, worldWidth, worldHeight].every(Number.isFinite) || worldWidth <= 0 || worldHeight <= 0) {
        throw new RangeError('run spawn adapter context is invalid');
      }
      for (const event of events) {
        const intent = event.intent;
        if (intent === undefined || !['spawnRequested', 'eliteRequested', 'bossRequested'].includes(event.kind)) continue;
        if (!Number.isSafeInteger(intent.count) || intent.count < 1) {
          throw new RangeError('run spawn intent count must be a positive safe integer');
        }
        const mapped = mapping(intent, eliteMultiplier, eliteXpMultiplier);
        if (mapped === null) {
          stats.unsupportedArchetypes += intent.count;
          continue;
        }
        const minimum = intent.minDistance * distanceScale;
        const maximum = intent.maxDistance * distanceScale;
        if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum) {
          throw new RangeError('run spawn intent distances are invalid');
        }
        const baseAngle = placementBaseAngle(
          intent.formation,
          intent.count,
          mixAngle(event.tick, event.seq),
          minimum,
          maximum,
          playerX,
          playerY,
          worldWidth,
          worldHeight,
          clusterDistanceStep,
        );
        if (baseAngle === null) {
          // A tiny world or a formation that cannot fit at its authored radius
          // must skip deterministically rather than clamp a far spawn nearby.
          stats.requested += intent.count;
          stats.rejected += intent.count;
          continue;
        }
        for (let index = 0; index < intent.count; index++) {
          const [angle, distance] = placement(
            intent.formation,
            index,
            intent.count,
            baseAngle,
            minimum,
            maximum,
            clusterDistanceStep,
          );
          const [x, y] = coordinates(playerX, playerY, angle, distance);
          const request: DirectedEnemySpawn = {
            ...mapped,
            x,
            y,
          };
          stats.requested++;
          if (context.spawn(request)) stats.spawned++;
          else stats.rejected++;
        }
      }
      return stats;
    },
  };
}
