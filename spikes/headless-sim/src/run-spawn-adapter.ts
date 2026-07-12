import type { RunDirectorEventView, RunFormationView, RunSpawnIntentView } from './run-director-port.js';

export const RUN_ENEMY_ROLE = Object.freeze({ regular: 0, elite: 1, boss: 2, ranged: 3 } as const);
export type RunEnemyRole = (typeof RUN_ENEMY_ROLE)[keyof typeof RUN_ENEMY_ROLE];

export interface DirectedEnemySpawn {
  readonly archetype: number;
  readonly hpMultiplier: number;
  /** Multiplier applied to this unit's authored XP drop. */
  readonly xpMultiplier: number;
  readonly role: RunEnemyRole;
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
  readonly bossHpMultiplier?: number;
  /** Boss XP is unused after a terminal kill today, but stays explicit. Default 1. */
  readonly bossXpMultiplier?: number;
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
  bossMultiplier: number,
  bossXpMultiplier: number,
) {
  if (intent.boss || intent.archetypeId === 'enemy:boss') {
    return {
      archetype: 2, hpMultiplier: bossMultiplier, xpMultiplier: bossXpMultiplier, role: RUN_ENEMY_ROLE.boss,
    } as const;
  }
  if (intent.elite || intent.archetypeId === 'enemy:elite') {
    return {
      archetype: 2, hpMultiplier: eliteMultiplier, xpMultiplier: eliteXpMultiplier, role: RUN_ENEMY_ROLE.elite,
    } as const;
  }
  switch (intent.archetypeId) {
    case 'enemy:fodder': return { archetype: 0, hpMultiplier: 1, xpMultiplier: 1, role: RUN_ENEMY_ROLE.regular } as const;
    case 'enemy:runner': return { archetype: 1, hpMultiplier: 1, xpMultiplier: 1, role: RUN_ENEMY_ROLE.regular } as const;
    case 'enemy:brute': return { archetype: 2, hpMultiplier: 1, xpMultiplier: 1, role: RUN_ENEMY_ROLE.regular } as const;
    case 'enemy:spitter': return { archetype: 3, hpMultiplier: 1, xpMultiplier: 1, role: RUN_ENEMY_ROLE.ranged } as const;
    default: return null;
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
  // The first playable Greg boss needs a real response period before the
  // normal-mode boundary. This remains an adapter-owned temporary tune until
  // boss health moves into versioned run content.
  const bossMultiplier = options.bossHpMultiplier ?? 18;
  const bossXpMultiplier = options.bossXpMultiplier ?? 1;
  for (const [name, value] of Object.entries({
    distanceScale, eliteMultiplier, eliteXpMultiplier, bossMultiplier, bossXpMultiplier,
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
        const mapped = mapping(intent, eliteMultiplier, eliteXpMultiplier, bossMultiplier, bossXpMultiplier);
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
