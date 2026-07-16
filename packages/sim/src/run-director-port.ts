/** Structural zero-runtime-dependency boundary for the authored run director. */

export type RunOutcomeView = 'running' | 'victory' | 'defeat';
export type RunPhaseView = 'opening' | 'pressure' | 'adaptation' | 'mutation' | 'boss' | 'overtime';
export type RunFormationView = 'ring' | 'arc' | 'lane' | 'cluster';

/**
 * Structural mirror of the authored run-director boss contract. The simulation
 * intentionally imports this as data through its port rather than importing
 * the run-director package at runtime.
 */
export interface RunBossProfileView {
  readonly id: string;
  readonly hpMultiplier: number;
  readonly xpMultiplier: number;
  readonly speedMultiplier: number;
  readonly touchDamageMultiplier: number;
  readonly preferredRange: number;
  readonly rangeBand: number;
  readonly cycleTicks: number;
  readonly chargeWindupTicks: number;
  readonly chargeDurationTicks: number;
  readonly chargeSpeedMultiplier: number;
  readonly volleyTick: number;
  readonly volleyCount: number;
  readonly projectileSpeed: number;
  readonly projectileDamage: number;
  readonly projectileLifetimeTicks: number;
  readonly projectileHitRadius: number;
}

export interface RunMetricsView {
  readonly tick: number;
  readonly paused: boolean;
  readonly playerAlive: boolean;
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly playerLevel: number;
  readonly liveEnemies: number;
  readonly killsTotal: number;
  readonly bossAlive: boolean;
  readonly bossDefeatedThisTick: boolean;
}

export interface RunSpawnIntentView {
  readonly archetypeId: string;
  readonly count: number;
  readonly formation: RunFormationView;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
  /** Required for a boss request; absent for every non-boss spawn. */
  readonly bossProfile?: RunBossProfileView;
}

export interface RunDirectorEventView {
  readonly kind: string;
  readonly tick: number;
  readonly seq: number;
  readonly phase: RunPhaseView;
  readonly phaseId?: RunPhaseView;
  readonly intent?: RunSpawnIntentView;
  readonly beatId?: string;
  readonly requestTick?: number;
}

export interface RunDirectorPort {
  readonly outcome: RunOutcomeView;
  readonly tick: number;
  readonly phase: RunPhaseView;
  step(metrics: RunMetricsView): readonly RunDirectorEventView[];
  stateHash(): string;
  contentFingerprint(): string;
}

export interface RunDirectorFactoryOptions {
  readonly seed: number;
}

export type RunDirectorFactory = (options: RunDirectorFactoryOptions) => RunDirectorPort;

const REQUIRED_METHODS = ['step', 'stateHash', 'contentFingerprint'] as const;

export function createRunDirectorPort(
  factory: RunDirectorFactory,
  options: RunDirectorFactoryOptions,
): RunDirectorPort {
  if (typeof factory !== 'function') throw new TypeError('run director factory must be a function');
  if (!Number.isFinite(options.seed)) throw new RangeError('run director seed must be finite');
  const director = factory(options);
  if (typeof director !== 'object' || director === null) {
    throw new TypeError('run director factory must return an object');
  }
  const candidate = director as unknown as Record<string, unknown>;
  for (const method of REQUIRED_METHODS) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`run director port.${method} must be a function`);
    }
  }
  if (!['running', 'victory', 'defeat'].includes(director.outcome)) {
    throw new TypeError('run director port.outcome is invalid');
  }
  if (!Number.isSafeInteger(director.tick) || director.tick < -1) {
    throw new TypeError('run director port.tick is invalid');
  }
  return director;
}
