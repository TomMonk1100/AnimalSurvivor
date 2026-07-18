/**
 * Deterministic encounter-pressure instrumentation for authored production runs.
 *
 * The simulation package deliberately does not import the concrete trait runtime
 * or run director. Callers inject the same structural factories used by the web
 * integration, which keeps this lab renderer-free and dependency-free while the
 * root report script composes the real production packages.
 */
import type { SimConfig } from './config.js';
import { RUN_ENEMY_ROLE } from './run-enemy-content.js';
import type { HeroId } from './run-start-loadout.js';
import { createSimulation, type Simulation, type SimulationOptions } from './simulation.js';
import type { TickInput } from './types.js';

export const PRESSURE_LAB_VERSION = 1 as const;
export const PRESSURE_LAB_PROXIMITY_RADIUS = 350 as const;
export const PRESSURE_LAB_CAMERA_RADIUS = 750 as const;
export const PRESSURE_LAB_THREE_MINUTE_TICK = 10_800 as const;
export const PRESSURE_LAB_BOSS_ENTRANCE_TICK = 17_100 as const;
export const PRESSURE_LAB_ORBIT_DIRECTION_TICKS = 120 as const;
export const PRESSURE_LAB_ORBIT_DIRECTION_OFFSET = 0 as const;
export const PRESSURE_LAB_GREEDY_SEEK_RADIUS = 200 as const;

export const PRESSURE_LAB_HEROES = Object.freeze(['greg', 'benny', 'gracie'] as const);
export const PRESSURE_LAB_SEEDS = Object.freeze([1234, 7, 90210] as const);
export const PRESSURE_LAB_POLICIES = Object.freeze([
  'stationary',
  'mobile-orbit',
  'mobile-kite',
  'mobile-greedy',
] as const);

export type PressureInputPolicy = (typeof PRESSURE_LAB_POLICIES)[number];
export type PressurePhase = 'opening' | 'pressure' | 'adaptation' | 'mutation' | 'boss';
export type PressureGateId = 'G1' | 'G2' | 'G3' | 'G4a' | 'G4b' | 'G5' | 'G6';

export interface PressureSample {
  readonly tick: number;
  readonly phase: PressurePhase;
  readonly liveEnemies: number;
  readonly within350: number;
  readonly withinCamera: number;
  readonly cameraFraction: number;
}

export interface PressurePhaseMean {
  readonly phase: PressurePhase;
  readonly samples: number;
  readonly meanLiveEnemies: number;
  readonly meanWithin350: number;
  readonly meanWithinCamera: number;
  readonly meanCameraFraction: number;
}

export interface PressureOpeningTimelineSample {
  readonly tick: number;
  readonly enemiesSpawned: number;
  readonly kills: number;
  readonly xpPickupsCollected: number;
  readonly cumulativeKills: number;
  readonly cumulativeXpPickupsCollected: number;
  readonly playerLevel: number;
  readonly unspentXp: number;
  readonly liveEnemies: number;
}

export interface PressureEliteRelief {
  readonly defeatTick: number;
  readonly phase: PressurePhase;
  readonly proximityAtDefeat: number;
  readonly minimumWithin10Seconds: number;
  readonly dropFraction: number;
  readonly maximumFrom10To25Seconds: number;
  readonly phaseFloor: number;
  readonly recoveredBy25Seconds: boolean;
}

export interface PressureBossHealth {
  readonly current: number;
  readonly maximum: number;
  readonly fraction: number;
}

export interface PressureGateResult {
  readonly id: PressureGateId;
  readonly applicable: boolean;
  readonly passed: boolean;
  readonly actual: string;
  readonly target: string;
}

export interface PressureRunReport {
  readonly version: typeof PRESSURE_LAB_VERSION;
  readonly humanEvidence: false;
  readonly heroId: HeroId;
  readonly seed: number;
  readonly policy: PressureInputPolicy;
  readonly hz: number;
  readonly proximityRadius: typeof PRESSURE_LAB_PROXIMITY_RADIUS;
  readonly cameraRadius: typeof PRESSURE_LAB_CAMERA_RADIUS;
  readonly cameraRadiusDefinition: string;
  readonly inputPolicyDefinition: string;
  readonly terminalTick: number;
  readonly terminalOutcome: 'running' | 'victory' | 'defeat' | null;
  readonly deathTick: number | null;
  readonly survivedToDeadline: boolean;
  readonly levelUpTicks: readonly number[];
  readonly firstLevelUpTick: number | null;
  readonly medianLevelUpGapTicksThroughThreeMinutes: number | null;
  readonly sameTickAdditionalModalsThroughThreeMinutes: number;
  readonly aliveAtBossEntrance: boolean;
  readonly samples: readonly PressureSample[];
  readonly openingTimeline: readonly PressureOpeningTimelineSample[];
  readonly phaseMeans: readonly PressurePhaseMean[];
  readonly eliteRelief: readonly PressureEliteRelief[];
  readonly totalKills: number;
  readonly bossHealthAtEnd: PressureBossHealth | null;
  readonly enemyHighWater: number;
  readonly finalStateHash: string;
  readonly gates: readonly PressureGateResult[];
}

export interface PressureRunRequest {
  readonly config: SimConfig;
  readonly seed: number;
  readonly heroId: HeroId;
  readonly policy: PressureInputPolicy;
  readonly simulationOptions: SimulationOptions;
  /** Defaults to six authored minutes at config.hz. */
  readonly maximumTicks?: number;
}

export interface PressureMatrixReport {
  readonly version: typeof PRESSURE_LAB_VERSION;
  readonly humanEvidence: false;
  readonly heroes: readonly HeroId[];
  readonly seeds: readonly number[];
  readonly policies: readonly PressureInputPolicy[];
  readonly runs: readonly PressureRunReport[];
  readonly gates: readonly PressureGateResult[];
  readonly allApplicableGatesPassed: boolean;
}

export type PressureOptionsFactory = (heroId: HeroId, seed: number) => SimulationOptions;

const PHASES: readonly PressurePhase[] = Object.freeze([
  'opening', 'pressure', 'adaptation', 'mutation', 'boss',
]);

const PHASE_FLOORS: Readonly<Record<PressurePhase, number>> = Object.freeze({
  opening: 6,
  pressure: 12,
  adaptation: 20,
  mutation: 30,
  boss: 30,
});

const ORBIT_DIRECTIONS: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([1, 0] as const),
  Object.freeze([Math.SQRT1_2, Math.SQRT1_2] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([-Math.SQRT1_2, Math.SQRT1_2] as const),
  Object.freeze([-1, 0] as const),
  Object.freeze([-Math.SQRT1_2, -Math.SQRT1_2] as const),
  Object.freeze([0, -1] as const),
  Object.freeze([Math.SQRT1_2, -Math.SQRT1_2] as const),
]);

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function phaseOf(sim: Simulation): PressurePhase {
  const phase = sim.runPhase;
  return phase === 'opening' || phase === 'pressure' || phase === 'adaptation'
    || phase === 'mutation' || phase === 'boss'
    ? phase
    : 'boss';
}

function enemyCounts(sim: Simulation): { within350: number; withinCamera: number } {
  const enemies = sim.enemies.data;
  const nearSquared = PRESSURE_LAB_PROXIMITY_RADIUS * PRESSURE_LAB_PROXIMITY_RADIUS;
  const cameraSquared = PRESSURE_LAB_CAMERA_RADIUS * PRESSURE_LAB_CAMERA_RADIUS;
  let within350 = 0;
  let withinCamera = 0;
  for (let slot = 0; slot < enemies.capacity; slot += 1) {
    if (enemies.alive[slot] !== 1) continue;
    const dx = enemies.posX[slot]! - sim.player.x;
    const dy = enemies.posY[slot]! - sim.player.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared <= nearSquared) within350 += 1;
    if (distanceSquared <= cameraSquared) withinCamera += 1;
  }
  return { within350, withinCamera };
}

function liveEliteIds(sim: Simulation): Set<number> {
  const result = new Set<number>();
  const enemies = sim.enemies.data;
  for (let slot = 0; slot < enemies.capacity; slot += 1) {
    if (enemies.alive[slot] !== 1) continue;
    const id = sim.enemies.idOf(slot);
    if (sim.enemyPresentationRole(id) === RUN_ENEMY_ROLE.elite) result.add(id);
  }
  return result;
}

function orbitInput(tick: number): TickInput {
  const index = (Math.floor(tick / PRESSURE_LAB_ORBIT_DIRECTION_TICKS)
    + PRESSURE_LAB_ORBIT_DIRECTION_OFFSET) % ORBIT_DIRECTIONS.length;
  const direction = ORBIT_DIRECTIONS[index]!;
  return { moveX: direction[0], moveY: direction[1], paused: false };
}

function greedyInput(sim: Simulation): TickInput {
  const pickups = sim.pickups.data;
  const seekRadiusSquared = PRESSURE_LAB_GREEDY_SEEK_RADIUS * PRESSURE_LAB_GREEDY_SEEK_RADIUS;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let nearestX = sim.player.x;
  let nearestY = sim.player.y;
  let nearestId = Number.MAX_SAFE_INTEGER;
  for (let slot = 0; slot < pickups.capacity; slot += 1) {
    if (pickups.alive[slot] !== 1) continue;
    const dx = pickups.posX[slot]! - sim.player.x;
    const dy = pickups.posY[slot]! - sim.player.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > seekRadiusSquared) continue;
    const id = sim.pickups.idOf(slot);
    if (distanceSquared < bestDistanceSquared || (distanceSquared === bestDistanceSquared && id < nearestId)) {
      bestDistanceSquared = distanceSquared;
      nearestX = pickups.posX[slot]!;
      nearestY = pickups.posY[slot]!;
      nearestId = id;
    }
  }
  if (!Number.isFinite(bestDistanceSquared)) return orbitInput(sim.tick);
  const towardX = nearestX - sim.player.x;
  const towardY = nearestY - sim.player.y;
  const magnitude = Math.hypot(towardX, towardY);
  if (magnitude <= 1e-9) return { moveX: 0, moveY: 0, paused: false };
  return { moveX: towardX / magnitude, moveY: towardY / magnitude, paused: false };
}

function inputFor(policy: PressureInputPolicy, sim: Simulation, config: SimConfig): TickInput {
  if (policy === 'stationary') return { moveX: 0, moveY: 0, paused: false };
  if (policy === 'mobile-orbit') return orbitInput(sim.tick);
  if (policy === 'mobile-greedy') return greedyInput(sim);

  const enemies = sim.enemies.data;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let nearestX = sim.player.x;
  let nearestY = sim.player.y;
  let nearestId = Number.MAX_SAFE_INTEGER;
  for (let slot = 0; slot < enemies.capacity; slot += 1) {
    if (enemies.alive[slot] !== 1) continue;
    const dx = enemies.posX[slot]! - sim.player.x;
    const dy = enemies.posY[slot]! - sim.player.y;
    const distanceSquared = dx * dx + dy * dy;
    const id = sim.enemies.idOf(slot);
    if (distanceSquared < bestDistanceSquared || (distanceSquared === bestDistanceSquared && id < nearestId)) {
      bestDistanceSquared = distanceSquared;
      nearestX = enemies.posX[slot]!;
      nearestY = enemies.posY[slot]!;
      nearestId = id;
    }
  }
  if (!Number.isFinite(bestDistanceSquared)) return { moveX: 1, moveY: 0, paused: false };
  let awayX = sim.player.x - nearestX;
  let awayY = sim.player.y - nearestY;
  const magnitude = Math.hypot(awayX, awayY);
  if (magnitude <= 1e-9) return { moveX: 1, moveY: 0, paused: false };
  awayX /= magnitude;
  awayY /= magnitude;

  // A pure flee vector can pin itself against an arena edge forever. Preserve
  // the flee direction when it is viable; at an edge, take the deterministic
  // tangent that still increases distance from the nearest threat.
  const margin = 40;
  const blockedX = (sim.player.x <= margin && awayX < 0)
    || (sim.player.x >= config.worldWidth - margin && awayX > 0);
  const blockedY = (sim.player.y <= margin && awayY < 0)
    || (sim.player.y >= config.worldHeight - margin && awayY > 0);
  if (blockedX || blockedY) {
    const left = { x: -awayY, y: awayX };
    const right = { x: awayY, y: -awayX };
    const viable = (candidate: { readonly x: number; readonly y: number }): boolean =>
      !((sim.player.x <= margin && candidate.x < 0)
        || (sim.player.x >= config.worldWidth - margin && candidate.x > 0)
        || (sim.player.y <= margin && candidate.y < 0)
        || (sim.player.y >= config.worldHeight - margin && candidate.y > 0));
    const tangent = viable(left) ? left : right;
    return { moveX: tangent.x, moveY: tangent.y, paused: false };
  }
  return { moveX: awayX, moveY: awayY, paused: false };
}

function resolveQueuedChoices(sim: Simulation): void {
  while (sim.upgradeSelectionPending) {
    const offer = sim.pendingUpgradeOffers[0];
    if (offer === undefined) throw new Error('pressure lab received a blocked upgrade queue without an offer');
    sim.selectUpgrade(offer.id);
  }
  const fusion = sim.availableFusions[0];
  if (fusion !== undefined) sim.fuseEvolution(fusion.evolutionId);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function phaseMeans(samples: readonly PressureSample[]): readonly PressurePhaseMean[] {
  return PHASES.map((phase) => {
    const matching = samples.filter((sample) => sample.phase === phase);
    const count = matching.length;
    const divisor = Math.max(1, count);
    return Object.freeze({
      phase,
      samples: count,
      meanLiveEnemies: round(matching.reduce((total, sample) => total + sample.liveEnemies, 0) / divisor),
      meanWithin350: round(matching.reduce((total, sample) => total + sample.within350, 0) / divisor),
      meanWithinCamera: round(matching.reduce((total, sample) => total + sample.withinCamera, 0) / divisor),
      meanCameraFraction: round(matching.reduce((total, sample) => total + sample.cameraFraction, 0) / divisor),
    });
  });
}

function sampleAtOrBefore(samples: readonly PressureSample[], tick: number): PressureSample | null {
  let result: PressureSample | null = null;
  for (const sample of samples) {
    if (sample.tick > tick) break;
    result = sample;
  }
  return result;
}

function reliefReports(samples: readonly PressureSample[], defeats: readonly { tick: number; phase: PressurePhase }[], hz: number): readonly PressureEliteRelief[] {
  return defeats.map(({ tick, phase }) => {
    const atDefeat = sampleAtOrBefore(samples, tick)?.within350 ?? 0;
    const firstWindow = samples.filter((sample) => sample.tick >= tick && sample.tick <= tick + hz * 10);
    const recoveryWindow = samples.filter((sample) => sample.tick > tick + hz * 10 && sample.tick <= tick + hz * 25);
    const minimum = firstWindow.length === 0 ? atDefeat : Math.min(...firstWindow.map((sample) => sample.within350));
    const maximum = recoveryWindow.length === 0 ? 0 : Math.max(...recoveryWindow.map((sample) => sample.within350));
    const dropFraction = atDefeat <= 0 ? 0 : (atDefeat - minimum) / atDefeat;
    const phaseFloor = PHASE_FLOORS[phase];
    return Object.freeze({
      defeatTick: tick,
      phase,
      proximityAtDefeat: atDefeat,
      minimumWithin10Seconds: minimum,
      dropFraction: round(dropFraction),
      maximumFrom10To25Seconds: maximum,
      phaseFloor,
      recoveredBy25Seconds: maximum >= phaseFloor,
    });
  });
}

function bossHealth(sim: Simulation): PressureBossHealth | null {
  const enemies = sim.enemies.data;
  for (let slot = 0; slot < enemies.capacity; slot += 1) {
    if (enemies.alive[slot] !== 1) continue;
    const id = sim.enemies.idOf(slot);
    if (sim.enemyPresentationRole(id) !== RUN_ENEMY_ROLE.boss) continue;
    const maximum = enemies.maxHp[slot]!;
    const current = enemies.hp[slot]!;
    return Object.freeze({ current: round(current), maximum: round(maximum), fraction: round(current / maximum) });
  }
  return null;
}

function gate(id: PressureGateId, applicable: boolean, passed: boolean, actual: string, target: string): PressureGateResult {
  return Object.freeze({ id, applicable, passed: applicable && passed, actual, target });
}

function evaluateRunGates(input: {
  readonly hz: number;
  readonly policy: PressureInputPolicy;
  readonly deathTick: number | null;
  readonly firstLevelUpTick: number | null;
  readonly medianGap: number | null;
  readonly sameTickAdditionalModals: number;
  readonly aliveAtBossEntrance: boolean;
  readonly means: readonly PressurePhaseMean[];
  readonly relief: readonly PressureEliteRelief[];
  readonly samples: readonly PressureSample[];
}): readonly PressureGateResult[] {
  const stationary = input.policy === 'stationary';
  const orbit = input.policy === 'mobile-orbit';
  const greedy = input.policy === 'mobile-greedy';
  const movementPattern = orbit || input.policy === 'mobile-kite';
  const moving = !stationary;
  const pressureSamples = input.samples.filter((sample) => sample.phase !== 'opening' && sample.liveEnemies > 0);
  const cameraMean = pressureSamples.length === 0
    ? 0
    : pressureSamples.reduce((total, sample) => total + sample.cameraFraction, 0) / pressureSamples.length;
  const requiredMeans = input.means.filter((mean) => mean.phase !== 'boss').map((mean) => {
    if (mean.phase !== 'opening') return mean;
    const openingAfterThirtySeconds = input.samples.filter(
      (sample) => sample.phase === 'opening' && sample.tick >= input.hz * 30,
    );
    const divisor = Math.max(1, openingAfterThirtySeconds.length);
    return {
      ...mean,
      samples: openingAfterThirtySeconds.length,
      meanWithin350: round(
        openingAfterThirtySeconds.reduce((total, sample) => total + sample.within350, 0) / divisor,
      ),
    };
  });
  const scoredMeans = requiredMeans.filter((mean) => mean.samples > 0);
  const proximityPassed = scoredMeans.length > 0
    && scoredMeans.every((mean) => mean.meanWithin350 >= PHASE_FLOORS[mean.phase]);
  const reliefPassed = input.relief.length > 0
    && input.relief.every((entry) => entry.dropFraction >= 0.25 && entry.recoveredBy25Seconds);
  const noEarlyOrbitDeath = input.deathTick === null || input.deathTick >= 8_100;
  return Object.freeze([
    gate('G1', stationary, input.deathTick !== null && input.deathTick >= 3_900 && input.deathTick <= 7_200,
      input.deathTick === null ? 'survived' : `${input.deathTick} ticks`, 'per-run death between 3900 and 7200 ticks'),
    gate('G2', greedy, input.firstLevelUpTick !== null && input.firstLevelUpTick >= 1_500 && input.firstLevelUpTick <= 2_400,
      input.firstLevelUpTick === null ? 'none' : `${input.firstLevelUpTick} ticks`, 'inner first-choice band 1500-2400 ticks'),
    gate('G3', greedy, input.medianGap !== null && input.medianGap >= 1_200 && input.sameTickAdditionalModals <= 1,
      `${input.medianGap === null ? 'none' : input.medianGap} ticks; ${input.sameTickAdditionalModals} same-tick additional`,
      'median gap at least 1200 ticks in 7/9 greedy runs; at most one same-tick additional modal per run'),
    gate('G4a', movementPattern, proximityPassed,
      scoredMeans.map((mean) => `${mean.phase}:${mean.meanWithin350}`).join(','), 'opening>=6, pressure>=12, adaptation>=20, mutation>=30'),
    gate('G4b', orbit, noEarlyOrbitDeath,
      `${input.deathTick === null ? 'survived' : `death:${input.deathTick}`}; boss:${input.aliveAtBossEntrance}`,
      'no orbit death before 8100 ticks; 6/9 alive at boss entrance matrix-wide'),
    gate('G5', movementPattern, cameraMean >= 0.6, `${round(cameraMean)}`, 'mean camera fraction at least 0.6 from pressure onward'),
    gate('G6', moving, reliefPassed,
      `${input.relief.length} elite defeats; ${input.relief.filter((entry) => entry.dropFraction >= 0.25 && entry.recoveredBy25Seconds).length} passing`,
      'matrix has at least 20 defeats and at least 70% pass relief/recovery'),
  ]);
}

export function runPressureLab(request: PressureRunRequest): PressureRunReport {
  if (!PRESSURE_LAB_HEROES.includes(request.heroId)) throw new RangeError(`unsupported pressure-lab hero ${request.heroId}`);
  if (!PRESSURE_LAB_POLICIES.includes(request.policy)) throw new RangeError(`unsupported pressure-lab policy ${request.policy}`);
  const sim = createSimulation(request.config, request.seed, request.simulationOptions);
  const maximumTicks = request.maximumTicks ?? request.config.hz * 360;
  const samples: PressureSample[] = [];
  const openingTimeline: PressureOpeningTimelineSample[] = [];
  const levelUpTicks: number[] = [];
  const eliteDefeats: { tick: number; phase: PressurePhase }[] = [];
  let previousElites = liveEliteIds(sim);
  let deathTick: number | null = null;
  let intervalSpawns = 0;
  let intervalKills = 0;
  let intervalXpPickups = 0;
  let cumulativeXpPickups = 0;

  while (sim.tick < maximumTicks && (sim.runOutcome === null || sim.runOutcome === 'running')) {
    resolveQueuedChoices(sim);
    const events = sim.step(inputFor(request.policy, sim, request.config));
    intervalSpawns += events.enemiesSpawned;
    intervalKills += events.kills;
    intervalXpPickups += events.pickupsCollected;
    cumulativeXpPickups += events.pickupsCollected;
    for (let index = 0; index < events.levelUps.length; index += 1) levelUpTicks.push(sim.tick);
    if (!sim.player.alive && deathTick === null) deathTick = sim.tick;

    const currentElites = liveEliteIds(sim);
    for (const id of previousElites) {
      if (!currentElites.has(id)) eliteDefeats.push({ tick: sim.tick, phase: phaseOf(sim) });
    }
    previousElites = currentElites;

    if (sim.tick % request.config.hz === 0) {
      const counts = enemyCounts(sim);
      const liveEnemies = sim.enemies.data.count;
      samples.push(Object.freeze({
        tick: sim.tick,
        phase: phaseOf(sim),
        liveEnemies,
        within350: counts.within350,
        withinCamera: counts.withinCamera,
        cameraFraction: liveEnemies === 0 ? 1 : round(counts.withinCamera / liveEnemies),
      }));
      if (phaseOf(sim) === 'opening') {
        openingTimeline.push(Object.freeze({
          tick: sim.tick,
          enemiesSpawned: intervalSpawns,
          kills: intervalKills,
          xpPickupsCollected: intervalXpPickups,
          cumulativeKills: sim.totalKills,
          cumulativeXpPickupsCollected: cumulativeXpPickups,
          playerLevel: sim.player.level,
          unspentXp: round(sim.player.xp),
          liveEnemies,
        }));
      }
      intervalSpawns = 0;
      intervalKills = 0;
      intervalXpPickups = 0;
    }
  }
  if (sim.upgradeSelectionPending && (sim.runOutcome === null || sim.runOutcome === 'running')) resolveQueuedChoices(sim);

  const earlyLevelUps = levelUpTicks.filter((tick) => tick <= PRESSURE_LAB_THREE_MINUTE_TICK);
  const gaps = earlyLevelUps.slice(1).map((tick, index) => tick - earlyLevelUps[index]!);
  const sameTickAdditionalModals = gaps.filter((gap) => gap === 0).length;
  const means = phaseMeans(samples);
  const relief = reliefReports(samples, eliteDefeats, request.config.hz);
  const medianGap = median(gaps);
  const gates = evaluateRunGates({
    hz: request.config.hz,
    policy: request.policy,
    deathTick,
    firstLevelUpTick: levelUpTicks[0] ?? null,
    medianGap,
    sameTickAdditionalModals,
    aliveAtBossEntrance: sim.tick >= PRESSURE_LAB_BOSS_ENTRANCE_TICK
      && (deathTick === null || deathTick > PRESSURE_LAB_BOSS_ENTRANCE_TICK),
    means,
    relief,
    samples,
  });
  return Object.freeze({
    version: PRESSURE_LAB_VERSION,
    humanEvidence: false,
    heroId: request.heroId,
    seed: request.seed >>> 0,
    policy: request.policy,
    hz: request.config.hz,
    proximityRadius: PRESSURE_LAB_PROXIMITY_RADIUS,
    cameraRadius: PRESSURE_LAB_CAMERA_RADIUS,
    cameraRadiusDefinition: 'Fixed engineering fallback: 750 simulation world units; renderer-independent.',
    inputPolicyDefinition: request.policy === 'mobile-orbit'
      ? `Eight-direction rotation every ${PRESSURE_LAB_ORBIT_DIRECTION_TICKS} ticks; direction offset ${PRESSURE_LAB_ORBIT_DIRECTION_OFFSET}.`
      : request.policy === 'mobile-greedy'
        ? `Seek nearest XP mote within ${PRESSURE_LAB_GREEDY_SEEK_RADIUS} units; otherwise use eight-direction rotation every ${PRESSURE_LAB_ORBIT_DIRECTION_TICKS} ticks with direction offset ${PRESSURE_LAB_ORBIT_DIRECTION_OFFSET}.`
      : request.policy === 'mobile-kite'
        ? 'Flee nearest enemy; use a deterministic tangent when the flee vector is edge-blocked.'
        : 'Zero movement input.',
    terminalTick: sim.tick,
    terminalOutcome: sim.runOutcome,
    deathTick,
    survivedToDeadline: deathTick === null && sim.tick >= maximumTicks,
    levelUpTicks: Object.freeze(levelUpTicks),
    firstLevelUpTick: levelUpTicks[0] ?? null,
    medianLevelUpGapTicksThroughThreeMinutes: medianGap,
    sameTickAdditionalModalsThroughThreeMinutes: sameTickAdditionalModals,
    aliveAtBossEntrance: sim.tick >= PRESSURE_LAB_BOSS_ENTRANCE_TICK
      && (deathTick === null || deathTick > PRESSURE_LAB_BOSS_ENTRANCE_TICK),
    samples: Object.freeze(samples),
    openingTimeline: Object.freeze(openingTimeline),
    phaseMeans: means,
    eliteRelief: relief,
    totalKills: sim.totalKills,
    bossHealthAtEnd: bossHealth(sim),
    enemyHighWater: sim.enemies.data.highWater,
    finalStateHash: sim.hash(),
    gates,
  });
}

export function runPressureMatrix(
  config: SimConfig,
  optionsFor: PressureOptionsFactory,
  heroes: readonly HeroId[] = PRESSURE_LAB_HEROES,
  seeds: readonly number[] = PRESSURE_LAB_SEEDS,
  policies: readonly PressureInputPolicy[] = PRESSURE_LAB_POLICIES,
): PressureMatrixReport {
  const runs: PressureRunReport[] = [];
  for (const heroId of heroes) {
    for (const seed of seeds) {
      for (const policy of policies) {
        runs.push(runPressureLab({
          config,
          seed,
          heroId,
          policy,
          simulationOptions: optionsFor(heroId, seed),
        }));
      }
    }
  }
  const stationaryRuns = runs.filter((run) => run.policy === 'stationary');
  const orbitRuns = runs.filter((run) => run.policy === 'mobile-orbit');
  const greedyRuns = runs.filter((run) => run.policy === 'mobile-greedy');
  const movementPatternRuns = runs.filter(
    (run) => run.policy === 'mobile-orbit' || run.policy === 'mobile-kite',
  );
  const movingRuns = runs.filter((run) => run.policy !== 'stationary');

  const stationaryDeathTicks = stationaryRuns
    .map((run) => run.deathTick)
    .filter((tick): tick is number => tick !== null);
  const stationaryMedian = median(stationaryDeathTicks);
  const g1HardPasses = stationaryDeathTicks.filter((tick) => tick >= 3_900 && tick <= 7_200).length;

  const greedyFirstChoices = greedyRuns.map((run) => run.firstLevelUpTick);
  const g2InnerPasses = greedyFirstChoices.filter((tick) => tick !== null && tick >= 1_500 && tick <= 2_400).length;
  const g2OuterPasses = greedyFirstChoices.filter((tick) => tick !== null && tick >= 900 && tick <= 3_600).length;

  const g3MedianPasses = greedyRuns.filter(
    (run) => run.medianLevelUpGapTicksThroughThreeMinutes !== null
      && run.medianLevelUpGapTicksThroughThreeMinutes >= 1_200,
  ).length;
  const g3SameTickPasses = greedyRuns.filter(
    (run) => run.sameTickAdditionalModalsThroughThreeMinutes <= 1,
  ).length;

  const pressurePhases = ['opening', 'pressure', 'adaptation', 'mutation'] as const;
  const phaseScores = pressurePhases.map((phase) => {
    const means = movementPatternRuns.flatMap((run) => {
      if (phase === 'opening') {
        const samples = run.samples.filter(
          (sample) => sample.phase === phase && sample.tick >= run.hz * 30,
        );
        if (samples.length === 0) return [];
        return [samples.reduce((sum, sample) => sum + sample.within350, 0) / samples.length];
      }
      const mean = run.phaseMeans.find((candidate) => candidate.phase === phase);
      return mean === undefined || mean.samples === 0 ? [] : [mean.meanWithin350];
    });
    return Object.freeze({
      phase,
      qualifyingRuns: means.length,
      meanWithin350: means.length === 0 ? 0 : round(means.reduce((sum, value) => sum + value, 0) / means.length),
      floor: PHASE_FLOORS[phase],
    });
  });
  const scoreablePhases = phaseScores.filter((score) => score.qualifyingRuns >= 5);
  const g4aPassed = scoreablePhases.length > 0
    && scoreablePhases.every((score) => score.meanWithin350 >= score.floor);
  const g4bEarlyPasses = orbitRuns.filter((run) => run.deathTick === null || run.deathTick >= 8_100).length;
  const g4bBossPasses = orbitRuns.filter((run) => run.aliveAtBossEntrance).length;
  const g4bScoreable = phaseScores.every((score) => score.qualifyingRuns >= 5);

  const g5RunResults = movementPatternRuns.map((run) => run.gates.find((result) => result.id === 'G5'));
  const g5Passes = g5RunResults.filter((result) => result?.passed === true).length;

  const reliefEvents = movingRuns.flatMap((run) => run.eliteRelief);
  const reliefPasses = reliefEvents.filter(
    (entry) => entry.dropFraction >= 0.25 && entry.recoveredBy25Seconds,
  ).length;
  const reliefFraction = reliefEvents.length === 0 ? 0 : reliefPasses / reliefEvents.length;

  const gates = Object.freeze([
    gate('G1', true,
      g1HardPasses === stationaryRuns.length
        && stationaryMedian !== null && stationaryMedian >= 4_800 && stationaryMedian <= 6_600,
      `${g1HardPasses}/${stationaryRuns.length} hard-bound; median ${stationaryMedian ?? 'none'}`,
      '9/9 within 3900-7200 ticks; median within 4800-6600 ticks'),
    gate('G2', true, g2InnerPasses >= 7 && g2OuterPasses === greedyRuns.length,
      `${g2InnerPasses}/${greedyRuns.length} inner; ${g2OuterPasses}/${greedyRuns.length} outer`,
      'at least 7/9 within 1500-2400 ticks; 9/9 within 900-3600 ticks'),
    gate('G3', true, g3MedianPasses >= 7 && g3SameTickPasses === greedyRuns.length,
      `${g3MedianPasses}/${greedyRuns.length} median; ${g3SameTickPasses}/${greedyRuns.length} same-tick bound`,
      'at least 7/9 median gaps >=1200 ticks; every run <=1 same-tick additional modal'),
    gate('G4a', true, g4aPassed,
      phaseScores.map((score) => `${score.phase}:${score.meanWithin350}(${score.qualifyingRuns})`).join(','),
      'every scoreable phase meets its floor; phase qualification is reported separately in G4b'),
    gate('G4b', true,
      g4bEarlyPasses === orbitRuns.length && g4bBossPasses >= 6 && g4bScoreable,
      `${g4bEarlyPasses}/${orbitRuns.length} no early death; ${g4bBossPasses}/${orbitRuns.length} boss; scoreable ${g4bScoreable}`,
      '9/9 orbit alive through 8100; at least 6/9 alive at 17100; at least 5 qualifiers per phase'),
    gate('G5', true, g5Passes === movementPatternRuns.length,
      `${g5Passes}/${movementPatternRuns.length} movement-pattern runs passed`,
      'all orbit and kite runs retain >=0.6 camera occupancy'),
    gate('G6', true, reliefEvents.length >= 20 && reliefFraction >= 0.7,
      `${reliefPasses}/${reliefEvents.length} events (${round(reliefFraction)})`,
      'at least 20 observed elite defeats; at least 70% pass relief and recovery'),
  ]);
  return Object.freeze({
    version: PRESSURE_LAB_VERSION,
    humanEvidence: false,
    heroes: Object.freeze([...heroes]),
    seeds: Object.freeze([...seeds]),
    policies: Object.freeze([...policies]),
    runs: Object.freeze(runs),
    gates: Object.freeze(gates),
    allApplicableGatesPassed: gates.every((result) => !result.applicable || result.passed),
  });
}

/** Stable JSON is itself part of the determinism evidence. */
export function serializePressureReport(report: PressureRunReport | PressureMatrixReport): string {
  return JSON.stringify(report);
}
