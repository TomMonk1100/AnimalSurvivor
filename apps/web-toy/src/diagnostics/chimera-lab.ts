/**
 * Deterministic Wild Splice balance sweep.
 *
 * This deliberately lives at the browser integration boundary because it
 * proves the real `TraitRuntime` working through the production `Simulation`
 * port. It has no renderer dependency and is only invoked by CI/tests or a
 * developer diagnostic route. Every result observes live enemy health before
 * and after each fixed simulation step; it never estimates damage from
 * presentation events.
 */
import {
  DEFAULT_CONFIG,
  RUN_START_LOADOUT_VERSION,
  createSimulation,
  type EntityId,
  type SimConfig,
  type Simulation,
  type TraitFusionOfferView,
  type TraitRuntimeFactory,
} from '@sim';
import {
  GREG_FOREST_ARSENAL_CATALOG,
  TraitRuntime,
  chimeraTargetDps,
  enumerateChimeraPairs,
  resolveEvolution,
  rollVariant,
} from '@traits';

/** Versioned public contract for the deterministic 66-pair PR gate. */
export const CHIMERA_LAB_VERSION = 2 as const;
export const CHIMERA_LAB_DURATION_SECONDS = 20 as const;
export const CHIMERA_LAB_TARGET_COUNT = 96 as const;
export const CHIMERA_LAB_TARGET_HEALTH = 20 as const;
export const CHIMERA_LAB_TOLERANCE = 0.25 as const;
export const CHIMERA_LAB_TEMPERAMENT = 'steady' as const;
export const CHIMERA_LAB_LEAN = 'balanced' as const;

const CHIMERA_LAB_MAX_SEED_SEARCH = 16_384;

interface TargetSnapshot {
  readonly id: EntityId;
  readonly hp: number;
  readonly x: number;
  readonly y: number;
  readonly marked: boolean;
}

interface StepObservation {
  readonly damage: number;
  readonly affectedTargets: number;
  readonly utilityEffectsObserved: number;
}

interface SteadyBalancedFusionOffer extends TraitFusionOfferView {
  readonly pairKind: 'perfect' | 'wild' | 'support';
  readonly temperamentId: typeof CHIMERA_LAB_TEMPERAMENT;
  readonly leanId: typeof CHIMERA_LAB_LEAN;
}

export interface ChimeraLabResult {
  /** Canonical unordered source-pair identity. */
  readonly pairId: string;
  /** The runtime's fused evolution id; Perfect Pairs retain their authored id. */
  readonly evolutionId: string;
  readonly ingredients: readonly [string, string];
  readonly displayName: string;
  readonly pairKind: 'perfect' | 'wild' | 'support';
  /** Per-pair deterministic search result that guarantees Steady/Balanced. */
  readonly seed: number;
  readonly temperamentId: typeof CHIMERA_LAB_TEMPERAMENT;
  readonly leanId: typeof CHIMERA_LAB_LEAN;
  readonly durationTicks: number;
  readonly totalDamage: number;
  readonly damagePerSecond: number;
  readonly targetDps: number;
  readonly lowerDps: number;
  readonly upperDps: number;
  /** Authoritative movement/mark observations; required for support pairs. */
  readonly utilityEffectsObserved: number;
  readonly requiresMovement: boolean;
  readonly withinBudget: boolean;
  readonly utilityConfirmed: boolean;
  readonly passed: boolean;
  readonly finalStateHash: string;
}

export interface ChimeraLabSummary {
  readonly totalPairs: number;
  readonly withinBudget: number;
  readonly supportPairs: number;
  readonly supportUtilityConfirmed: number;
  readonly failures: number;
}

export interface ChimeraLabReport {
  readonly version: typeof CHIMERA_LAB_VERSION;
  readonly durationSeconds: typeof CHIMERA_LAB_DURATION_SECONDS;
  readonly durationTicks: number;
  readonly targetHealth: typeof CHIMERA_LAB_TARGET_HEALTH;
  readonly targetCount: typeof CHIMERA_LAB_TARGET_COUNT;
  readonly tolerance: typeof CHIMERA_LAB_TOLERANCE;
  readonly temperamentId: typeof CHIMERA_LAB_TEMPERAMENT;
  readonly leanId: typeof CHIMERA_LAB_LEAN;
  readonly results: readonly ChimeraLabResult[];
  readonly summary: ChimeraLabSummary;
}

function createChimeraLabConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    worldWidth: 8_000,
    worldHeight: 1_000,
    gridCellSize: 50,
    enemyCap: 192,
    projectileCap: 256,
    pickupCap: 96,
    zoneCap: 96,
    waves: [],
    xpThresholds: [],
    player: {
      ...DEFAULT_CONFIG.player,
      startX: 2_000,
      startY: 500,
      maxHp: 1_000_000,
      pickupRadius: 0,
    },
    // The lab measures only the fused runtime behavior. Greg's regular
    // Auto-Fire remains alive in ordinary play but must not contribute here.
    weapon: {
      ...DEFAULT_CONFIG.weapon,
      damage: 0,
    },
  };
}

function steadyBalancedSeed(pairId: string): number {
  for (let seed = 0; seed < CHIMERA_LAB_MAX_SEED_SEARCH; seed++) {
    const variant = rollVariant(seed, pairId, 0);
    if (
      variant.temperamentId === CHIMERA_LAB_TEMPERAMENT
      && variant.leanId === CHIMERA_LAB_LEAN
    ) {
      return seed;
    }
  }
  throw new Error(
    `Chimera lab could not find a ${CHIMERA_LAB_TEMPERAMENT}/${CHIMERA_LAB_LEAN} seed for ${pairId}`,
  );
}

function masterTrait(runtime: TraitRuntime, traitId: string): void {
  for (let rank = 1; rank <= 5; rank++) {
    const result = runtime.applyUpgrade(traitId);
    if (!result.outcome.ok) {
      throw new Error(`Chimera lab could not Master ${traitId} at rank ${rank}: ${result.outcome.kind}`);
    }
  }
  if (runtime.rankOf(traitId) !== 5) {
    throw new Error(`Chimera lab expected ${traitId} to be Master after five upgrades`);
  }
}

function findPairOffer(
  offers: readonly TraitFusionOfferView[],
  ingredients: readonly [string, string],
): SteadyBalancedFusionOffer {
  const offer = offers.find((candidate) => (
    candidate.ingredients[0] === ingredients[0]
    && candidate.ingredients[1] === ingredients[1]
  ));
  if (offer === undefined) {
    throw new Error(`Chimera lab did not receive a fusion offer for ${ingredients.join(' + ')}`);
  }
  if (offer.pairKind === undefined) {
    throw new Error(`Chimera lab fusion offer omitted pair kind for ${offer.evolutionId}`);
  }
  if (offer.temperamentId !== CHIMERA_LAB_TEMPERAMENT || offer.leanId !== CHIMERA_LAB_LEAN) {
    throw new Error(
      `Chimera lab expected Steady/Balanced for ${offer.evolutionId}, got ${offer.temperamentId ?? 'unknown'}/${offer.leanId ?? 'unknown'}`,
    );
  }
  return {
    ...offer,
    pairKind: offer.pairKind,
    temperamentId: CHIMERA_LAB_TEMPERAMENT,
    leanId: CHIMERA_LAB_LEAN,
  };
}

function spawnTrainingTarget(sim: Simulation, x: number, y: number): boolean {
  const slot = sim.enemies.spawn();
  if (slot < 0) return false;
  const data = sim.enemies.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.velX[slot] = 0;
  data.velY[slot] = 0;
  data.hp[slot] = CHIMERA_LAB_TARGET_HEALTH;
  data.maxHp[slot] = CHIMERA_LAB_TARGET_HEALTH;
  data.speed[slot] = 0;
  data.radius[slot] = 3;
  data.touchDamage[slot] = 0;
  data.contactCooldown[slot] = 0;
  data.zoneDamageCooldown[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 0;
  data.marked[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), x, y);
  return true;
}

function ringOffsetX(index: number, baseRadius: number): number {
  const ring = Math.floor(index / 16);
  const angle = (index % 16) * (Math.PI * 2 / 16) + ring * 0.19;
  return Math.cos(angle) * (baseRadius + ring * 17);
}

function ringOffsetY(index: number, baseRadius: number): number {
  const ring = Math.floor(index / 16);
  const angle = (index % 16) * (Math.PI * 2 / 16) + ring * 0.19;
  return Math.sin(angle) * (baseRadius + ring * 17);
}

function seedTrainingTargets(sim: Simulation, requiresMovement: boolean): void {
  const countToAdd = Math.max(0, CHIMERA_LAB_TARGET_COUNT - sim.enemies.data.count);
  for (let index = 0; index < countToAdd; index++) {
    const x = requiresMovement
      ? sim.player.x + 8 + (index % 12) * 2
      : sim.player.x + ringOffsetX(index, 12);
    const y = requiresMovement
      ? sim.player.y - 28 + Math.floor(index / 12) * 7
      : sim.player.y + ringOffsetY(index, 12);
    if (!spawnTrainingTarget(sim, x, y)) return;
  }
}

/**
 * A movement trail needs new victims beneath the player. The dummies are a
 * controlled fixture, so this explicit relocation happens before the
 * authoritative tick and is never credited as a utility effect.
 */
function refreshMovingTrainingTargets(sim: Simulation, requiresMovement: boolean): void {
  if (!requiresMovement) return;
  const data = sim.enemies.data;
  let formationIndex = 0;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;
    data.posX[slot] = sim.player.x + 8 + (formationIndex % 12) * 2;
    data.posY[slot] = sim.player.y - 28 + Math.floor(formationIndex / 12) * 7;
    data.velX[slot] = 0;
    data.velY[slot] = 0;
    sim.grid.update(sim.enemies.idOf(slot), data.posX[slot]!, data.posY[slot]!);
    formationIndex++;
  }
}

function snapshotTargets(sim: Simulation): TargetSnapshot[] {
  const snapshots: TargetSnapshot[] = [];
  const data = sim.enemies.data;
  for (let slot = 0; slot < data.capacity; slot++) {
    if (data.alive[slot] === 0) continue;
    snapshots.push({
      id: sim.enemies.idOf(slot),
      hp: data.hp[slot]!,
      x: data.posX[slot]!,
      y: data.posY[slot]!,
      marked: data.marked[slot] === 1,
    });
  }
  return snapshots;
}

function observeAuthoritativeDamage(
  sim: Simulation,
  before: readonly TargetSnapshot[],
): StepObservation {
  let damage = 0;
  let affectedTargets = 0;
  let utilityEffectsObserved = 0;
  const data = sim.enemies.data;
  for (const target of before) {
    const slot = sim.enemies.slotOf(target.id);
    if (slot < 0) {
      // The victim died during this exact simulation step, so its full
      // remaining health was authoritative effective damage.
      damage += target.hp;
      affectedTargets++;
      continue;
    }
    const hp = data.hp[slot]!;
    if (hp < target.hp) {
      damage += target.hp - hp;
      affectedTargets++;
    }
    const dx = data.posX[slot]! - target.x;
    const dy = data.posY[slot]! - target.y;
    if (dx * dx + dy * dy > 1e-6 || (!target.marked && data.marked[slot] === 1)) {
      utilityEffectsObserved++;
    }
  }
  // Training targets can deterministically roll a sparse world Bomb after a
  // trait kill. Its screen-clear is real gameplay, but it is not damage from
  // the fused behavior under measurement. Subtract its resolved authoritative
  // hits rather than estimating around it, so the Lab credits only Chimera
  // combat while retaining the production simulation path and its RNG.
  const worldBombDamage = sim.combatPresentationEvents.reduce((total, event) => (
    event.kind === 'enemyHit' && event.sourceId === 'world-bomb'
      ? total + event.amount
      : total
  ), 0);
  return {
    damage: Math.max(0, damage - worldBombDamage),
    affectedTargets,
    utilityEffectsObserved,
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function runPair(pairId: string, first: string, second: string): ChimeraLabResult {
  const seed = steadyBalancedSeed(pairId);
  let runtime: TraitRuntime | undefined;
  const traitRuntimeFactory: TraitRuntimeFactory = ({ seed: runtimeSeed, initialTick }) => {
    runtime = new TraitRuntime({
      seed: runtimeSeed,
      initialTick,
      catalog: GREG_FOREST_ARSENAL_CATALOG,
    });
    return runtime;
  };
  const sim = createSimulation(createChimeraLabConfig(), seed, {
    runStartLoadout: {
      version: RUN_START_LOADOUT_VERSION,
      heroId: 'greg',
      maxHpBonus: 0,
    },
    traitRuntimeFactory,
  });
  if (runtime === undefined) throw new Error('Chimera lab trait runtime factory was not invoked');

  masterTrait(runtime, first);
  masterTrait(runtime, second);
  const offer = findPairOffer(sim.availableFusions, [first, second]);
  sim.fuseEvolution(offer.evolutionId);

  const resolved = runtime.getState().evolutions.find((candidate) => candidate.id === offer.evolutionId);
  if (resolved === undefined) {
    throw new Error(`Chimera lab could not find resolved fusion ${offer.evolutionId} after fusing`);
  }
  const definition = resolveEvolution(GREG_FOREST_ARSENAL_CATALOG, resolved);
  if (definition === undefined) {
    throw new Error(`Chimera lab could not resolve fusion behavior ${offer.evolutionId}`);
  }
  const requiresMovement = definition.behavior.kind === 'movementTrail';
  const durationTicks = DEFAULT_CONFIG.hz * CHIMERA_LAB_DURATION_SECONDS;
  let totalDamage = 0;
  let utilityEffectsObserved = 0;
  for (let tick = 0; tick < durationTicks; tick++) {
    seedTrainingTargets(sim, requiresMovement);
    refreshMovingTrainingTargets(sim, requiresMovement);
    const before = snapshotTargets(sim);
    sim.step({ moveX: requiresMovement ? 1 : 0, moveY: 0, paused: false });
    const observation = observeAuthoritativeDamage(sim, before);
    totalDamage += observation.damage;
    utilityEffectsObserved += observation.utilityEffectsObserved;
  }

  const damagePerSecond = roundMetric(totalDamage / CHIMERA_LAB_DURATION_SECONDS);
  const targetDps = chimeraTargetDps(first, second, offer.pairKind, 'common');
  const lowerDps = roundMetric(targetDps * (1 - CHIMERA_LAB_TOLERANCE));
  const upperDps = roundMetric(targetDps * (1 + CHIMERA_LAB_TOLERANCE));
  const withinBudget = damagePerSecond >= lowerDps && damagePerSecond <= upperDps;
  const utilityConfirmed = offer.pairKind !== 'support' || utilityEffectsObserved > 0;
  return {
    pairId,
    evolutionId: offer.evolutionId,
    ingredients: [first, second],
    displayName: offer.displayName ?? offer.evolutionId,
    pairKind: offer.pairKind,
    seed,
    temperamentId: CHIMERA_LAB_TEMPERAMENT,
    leanId: CHIMERA_LAB_LEAN,
    durationTicks,
    totalDamage: roundMetric(totalDamage),
    damagePerSecond,
    targetDps,
    lowerDps,
    upperDps,
    utilityEffectsObserved,
    requiresMovement,
    withinBudget,
    utilityConfirmed,
    passed: withinBudget && utilityConfirmed,
    finalStateHash: sim.hash(),
  };
}

function summarize(results: readonly ChimeraLabResult[]): ChimeraLabSummary {
  const supportPairs = results.filter((result) => result.pairKind === 'support');
  return {
    totalPairs: results.length,
    withinBudget: results.filter((result) => result.withinBudget).length,
    supportPairs: supportPairs.length,
    supportUtilityConfirmed: supportPairs.filter((result) => result.utilityConfirmed).length,
    failures: results.filter((result) => !result.passed).length,
  };
}

/**
 * Run the planned Steady/Balanced PR sweep over every catalog pair. The
 * selected runtime seed is pair-specific but deterministic, so each result
 * exercises the real fusion path without mutating save state or content.
 */
export function runChimeraLabReport(): ChimeraLabReport {
  const results = enumerateChimeraPairs(GREG_FOREST_ARSENAL_CATALOG).map((pair) => (
    runPair(pair.id, pair.first, pair.second)
  ));
  return {
    version: CHIMERA_LAB_VERSION,
    durationSeconds: CHIMERA_LAB_DURATION_SECONDS,
    durationTicks: DEFAULT_CONFIG.hz * CHIMERA_LAB_DURATION_SECONDS,
    targetHealth: CHIMERA_LAB_TARGET_HEALTH,
    targetCount: CHIMERA_LAB_TARGET_COUNT,
    tolerance: CHIMERA_LAB_TOLERANCE,
    temperamentId: CHIMERA_LAB_TEMPERAMENT,
    leanId: CHIMERA_LAB_LEAN,
    results,
    summary: summarize(results),
  };
}

/** Shorthand when a consumer needs just the individual pair results. */
export function runChimeraLab(): readonly ChimeraLabResult[] {
  return runChimeraLabReport().results;
}

/**
 * CI-friendly gate assertion. Failure text contains every outlier so balance
 * trimming can start from measured simulation facts rather than a rerun.
 */
export function assertChimeraLabWithinBudget(report: ChimeraLabReport = runChimeraLabReport()): void {
  const failures = report.results.filter((result) => !result.passed);
  if (failures.length === 0) return;
  const details = failures.map((result) => {
    const budget = `${result.damagePerSecond} DPS (target ${result.targetDps}, range ${result.lowerDps}-${result.upperDps})`;
    const utility = result.utilityConfirmed
      ? ''
      : `; support utility observations ${result.utilityEffectsObserved}`;
    return `${result.pairId}: ${budget}${utility}`;
  });
  throw new Error(
    `Chimera Lab failed ${failures.length}/${report.results.length} pair(s) at ±${CHIMERA_LAB_TOLERANCE * 100}%:\n${details.join('\n')}`,
  );
}

/** Readable test-log / issue-report form with one measured row per pair. */
export function formatChimeraLabReport(report: ChimeraLabReport = runChimeraLabReport()): string {
  const header = [
    `Chimera Lab v${report.version}`,
    `${report.results.length} Steady/Balanced pairs; ${report.durationSeconds}s / ${report.durationTicks} ticks each`,
    `target band: ±${report.tolerance * 100}%`,
  ].join('\n');
  const rows = report.results.map((result) => [
    result.passed ? 'PASS' : 'FAIL',
    result.pairKind.toUpperCase(),
    result.pairId,
    `${result.damagePerSecond} DPS`,
    `target ${result.targetDps}`,
    `range ${result.lowerDps}-${result.upperDps}`,
    `utility ${result.utilityEffectsObserved}`,
  ].join(' | '));
  const summary = report.summary;
  return [
    header,
    ...rows,
    `Summary: ${summary.withinBudget}/${summary.totalPairs} within budget; ${summary.supportUtilityConfirmed}/${summary.supportPairs} support utility confirmed; ${summary.failures} failures.`,
  ].join('\n');
}
