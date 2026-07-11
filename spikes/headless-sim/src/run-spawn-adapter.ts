import type { RunDirectorEventView, RunFormationView, RunSpawnIntentView } from './run-director-port.js';

export const RUN_ENEMY_ROLE = Object.freeze({ regular: 0, elite: 1, boss: 2 } as const);
export type RunEnemyRole = (typeof RUN_ENEMY_ROLE)[keyof typeof RUN_ENEMY_ROLE];

export interface DirectedEnemySpawn {
  readonly archetype: number;
  readonly hpMultiplier: number;
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
  readonly bossHpMultiplier?: number;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

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
      return [baseAngle + index * GOLDEN_ANGLE, clamp(minimum + index * 8, minimum, maximum)];
  }
}

function mapping(intent: RunSpawnIntentView, eliteMultiplier: number, bossMultiplier: number) {
  if (intent.boss || intent.archetypeId === 'enemy:boss') {
    return { archetype: 2, hpMultiplier: bossMultiplier, role: RUN_ENEMY_ROLE.boss } as const;
  }
  if (intent.elite || intent.archetypeId === 'enemy:elite') {
    return { archetype: 2, hpMultiplier: eliteMultiplier, role: RUN_ENEMY_ROLE.elite } as const;
  }
  switch (intent.archetypeId) {
    case 'enemy:fodder': return { archetype: 0, hpMultiplier: 1, role: RUN_ENEMY_ROLE.regular } as const;
    case 'enemy:runner': return { archetype: 1, hpMultiplier: 1, role: RUN_ENEMY_ROLE.regular } as const;
    case 'enemy:brute': return { archetype: 2, hpMultiplier: 1, role: RUN_ENEMY_ROLE.regular } as const;
    default: return null;
  }
}

export function createRunSpawnAdapter(options: RunSpawnAdapterOptions = {}) {
  const distanceScale = options.distanceScale ?? 20;
  const eliteMultiplier = options.eliteHpMultiplier ?? 5;
  const bossMultiplier = options.bossHpMultiplier ?? 30;
  for (const [name, value] of Object.entries({ distanceScale, eliteMultiplier, bossMultiplier })) {
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
        const mapped = mapping(intent, eliteMultiplier, bossMultiplier);
        if (mapped === null) {
          stats.unsupportedArchetypes += intent.count;
          continue;
        }
        const minimum = intent.minDistance * distanceScale;
        const maximum = intent.maxDistance * distanceScale;
        if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum) {
          throw new RangeError('run spawn intent distances are invalid');
        }
        const baseAngle = mixAngle(event.tick, event.seq);
        for (let index = 0; index < intent.count; index++) {
          const [angle, distance] = placement(intent.formation, index, intent.count, baseAngle, minimum, maximum);
          const request: DirectedEnemySpawn = {
            ...mapped,
            x: clamp(playerX + Math.cos(angle) * distance, 0, worldWidth),
            y: clamp(playerY + Math.sin(angle) * distance, 0, worldHeight),
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
