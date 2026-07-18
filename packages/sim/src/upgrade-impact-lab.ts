/**
 * Deterministic before/after proof for universal rank offers.
 *
 * Each row creates two simulations from the same seed, loadout, training
 * targets, and fixed-tick input. The only intentional gameplay difference is
 * whether the offered rank was selected through `Simulation.selectUpgrade`.
 * Direct-damage rows therefore measure authoritative enemy-health loss; every
 * other row names its real authoritative outcome and explicitly avoids a DPS
 * claim.
 */
import { xpRequiredForNextLevel } from './combat.js';
import { DEFAULT_CONFIG, type SimConfig } from './config.js';
import { RUN_START_LOADOUT_VERSION, type HeroId } from './run-start-loadout.js';
import { createSimulation, type Simulation } from './simulation.js';
import type { EntityId, TickInput } from './types.js';
import {
  HERO_BASIC_ATTACK_UPGRADES,
  HERO_DEFENSIVE_UPGRADES,
  UNIVERSAL_UPGRADE_CATALOG,
  describeUniversalUpgradeImpact,
  type UniversalUpgradeDefinition,
  type UniversalUpgradeImpact,
  type UniversalUpgradeImpactCategory,
} from './universal-upgrades.js';

export const UPGRADE_IMPACT_LAB_VERSION = 1 as const;
export const UPGRADE_IMPACT_LAB_SEED = 0x0b_a1_a0_c2 as const;
// A minute contains enough deterministic hit rolls for the smallest Keen Eye
// ranks to register in the authoritative health delta. A shorter interval can
// legitimately produce no additional crits even though the projected chance
// changed, which makes a balance-proof row look inert.
export const UPGRADE_IMPACT_LAB_DURATION_SECONDS = 60 as const;

const TRAINING_TARGET_HP = 1_000_000;
const TRAINING_TARGET_COUNT = 24;
const XP_SAMPLE_AMOUNT = 100;
const XP_COLLECTION_SAMPLE_SECONDS = 1;
const XP_COLLECTION_SAMPLE_DISTANCES = Object.freeze([
  60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260,
  280, 300, 320, 340, 360, 380, 400, 420, 440, 460,
] as const);
const IDLE_INPUT: TickInput = Object.freeze({ moveX: 0, moveY: 0, paused: false });

export type UpgradeImpactDamageStatus = 'measured' | 'no-direct-damage';

export interface UpgradeImpactLabMetric {
  readonly label: string;
  readonly unit: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

export interface UpgradeImpactLabResult {
  readonly id: string;
  readonly title: string;
  readonly heroId: HeroId;
  readonly currentRank: number;
  readonly nextRank: number;
  readonly category: UniversalUpgradeImpactCategory;
  readonly authoredOutcome: string;
  readonly authoredDelta: string;
  readonly directDamageStatus: UpgradeImpactDamageStatus;
  readonly metric: UpgradeImpactLabMetric;
  readonly beforeStateHash: string;
  readonly afterStateHash: string;
}

export interface UpgradeImpactLabSummary {
  readonly totalComparisons: number;
  readonly directDamageComparisons: number;
  readonly nonDamageComparisons: number;
  readonly directDamageImprovements: number;
  /** A chance-based damage card can be valid yet roll no extra crit in one fixed interval. */
  readonly directDamageNoObservedChange: number;
  /** Only an observed damage decrease is a deterministic lab regression. */
  readonly failures: number;
}

export interface UpgradeImpactLabReport {
  readonly version: typeof UPGRADE_IMPACT_LAB_VERSION;
  readonly seed: number;
  readonly durationSeconds: typeof UPGRADE_IMPACT_LAB_DURATION_SECONDS;
  readonly durationTicks: number;
  readonly targetCount: number;
  readonly targetHealth: number;
  readonly results: readonly UpgradeImpactLabResult[];
  readonly summary: UpgradeImpactLabSummary;
}

interface LabCase {
  readonly definition: UniversalUpgradeDefinition;
  readonly heroId: HeroId;
}

interface Measurement {
  readonly metric: UpgradeImpactLabMetric;
  readonly finalStateHash: string;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function createLabConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    worldWidth: 3_000,
    worldHeight: 1_000,
    gridCellSize: 50,
    enemyCap: 64,
    projectileCap: 256,
    pickupCap: 32,
    zoneCap: 32,
    waves: [],
    // Five authored thresholds cover every selectable rank in this catalog.
    // The baseline receives one empty fixed tick after setup so each compared
    // simulation reaches the same combat-start tick without leaving an offer
    // pending (the production simulation correctly rejects that).
    xpThresholds: [1, 2, 3, 4, 5],
    player: {
      ...DEFAULT_CONFIG.player,
      startX: 1_500,
      startY: 500,
      maxHp: 1_000_000,
    },
  };
}

function heroFor(definition: UniversalUpgradeDefinition): HeroId {
  switch (definition.effect.kind) {
    case 'basicAttack':
    case 'heroDodge':
    case 'heroArmor':
    case 'heroShield':
      return definition.effect.heroId;
    default:
      return 'greg';
  }
}

const LAB_CASES: readonly LabCase[] = Object.freeze([
  ...UNIVERSAL_UPGRADE_CATALOG.map((definition) => Object.freeze({ definition, heroId: heroFor(definition) })),
  ...HERO_BASIC_ATTACK_UPGRADES.map((definition) => Object.freeze({ definition, heroId: heroFor(definition) })),
  ...HERO_DEFENSIVE_UPGRADES.map((definition) => Object.freeze({ definition, heroId: heroFor(definition) })),
]);

function createLabSimulation(labCase: LabCase): Simulation {
  return createSimulation(createLabConfig(), UPGRADE_IMPACT_LAB_SEED, {
    universalUpgradeCatalog: Object.freeze([labCase.definition]),
    runStartLoadout: {
      version: RUN_START_LOADOUT_VERSION,
      heroId: labCase.heroId,
      maxHpBonus: 0,
    },
  });
}

function enqueueOneLevel(sim: Simulation, definition: UniversalUpgradeDefinition): string {
  const threshold = xpRequiredForNextLevel(createLabConfig().xpThresholds, sim.player.level);
  if (threshold === null) throw new Error('upgrade impact lab requires leveling to be enabled');
  sim.player.xp = threshold;
  sim.step(IDLE_INPUT);
  const offer = sim.pendingUpgradeOffers.find((candidate) => (
    candidate.kind === 'universal' && candidate.upgradeId === definition.id
  ));
  if (offer === undefined) {
    throw new Error(`upgrade impact lab did not receive its expected offer for ${definition.id}`);
  }
  return offer.id;
}

/** Build a deterministic rank state through the same public selection API as a run. */
function prepareSimulation(labCase: LabCase, rank: number, addOneIdleTick: boolean): Simulation {
  const sim = createLabSimulation(labCase);
  for (let selected = 0; selected < rank; selected++) {
    const offerId = enqueueOneLevel(sim, labCase.definition);
    sim.selectUpgrade(offerId);
  }
  if (addOneIdleTick) sim.step(IDLE_INPUT);
  return sim;
}

function spawnTrainingTarget(sim: Simulation, x: number, y: number): EntityId {
  const slot = sim.enemies.spawn();
  if (slot < 0) throw new Error('upgrade impact lab enemy pool exhausted');
  const data = sim.enemies.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.velX[slot] = 0;
  data.velY[slot] = 0;
  data.hp[slot] = TRAINING_TARGET_HP;
  data.maxHp[slot] = TRAINING_TARGET_HP;
  data.speed[slot] = 0;
  data.radius[slot] = 3;
  data.touchDamage[slot] = 0;
  data.contactCooldown[slot] = 0;
  data.zoneDamageCooldown[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 0;
  data.marked[slot] = 0;
  const id = sim.enemies.idOf(slot);
  sim.grid.insert(id, x, y);
  return id;
}

function seedTrainingTargets(sim: Simulation): readonly EntityId[] {
  const ids: EntityId[] = [];
  for (let index = 0; index < TRAINING_TARGET_COUNT; index++) {
    const row = Math.floor(index / 6);
    const column = index % 6;
    ids.push(spawnTrainingTarget(
      sim,
      sim.player.x + 42 + column * 24,
      sim.player.y - 30 + row * 20,
    ));
  }
  return ids;
}

function totalHealth(sim: Simulation, ids: readonly EntityId[]): number {
  let total = 0;
  for (const id of ids) {
    const slot = sim.enemies.slotOf(id);
    if (slot < 0) continue;
    total += sim.enemies.data.hp[slot]!;
  }
  return total;
}

function measureDirectDamage(sim: Simulation): Measurement {
  const ids = seedTrainingTargets(sim);
  const healthBefore = totalHealth(sim, ids);
  const durationTicks = DEFAULT_CONFIG.hz * UPGRADE_IMPACT_LAB_DURATION_SECONDS;
  for (let tick = 0; tick < durationTicks; tick++) sim.step(IDLE_INPUT);
  const damage = healthBefore - totalHealth(sim, ids);
  return {
    metric: Object.freeze({
      label: `Authoritative damage over ${UPGRADE_IMPACT_LAB_DURATION_SECONDS}s`,
      unit: 'damage',
      before: roundMetric(damage),
      after: 0,
      delta: 0,
    }),
    finalStateHash: sim.hash(),
  };
}

function spawnXpSample(sim: Simulation): void {
  const slot = sim.pickups.spawn();
  if (slot < 0) throw new Error('upgrade impact lab pickup pool exhausted');
  const data = sim.pickups.data;
  data.posX[slot] = sim.player.x;
  data.posY[slot] = sim.player.y;
  data.kind[slot] = 0;
  data.xp[slot] = XP_SAMPLE_AMOUNT;
  data.radius[slot] = 1;
}

function measureXpCollectionRate(sim: Simulation): number {
  for (const distance of XP_COLLECTION_SAMPLE_DISTANCES) {
    const slot = sim.pickups.spawn();
    if (slot < 0) throw new Error('upgrade impact lab pickup pool exhausted');
    const data = sim.pickups.data;
    data.posX[slot] = sim.player.x + distance;
    data.posY[slot] = sim.player.y;
    data.kind[slot] = 0;
    data.xp[slot] = 0;
    data.radius[slot] = 1;
  }
  const startingCount = sim.pickups.data.count;
  for (let tick = 0; tick < DEFAULT_CONFIG.hz * XP_COLLECTION_SAMPLE_SECONDS; tick++) sim.step(IDLE_INPUT);
  return (startingCount - sim.pickups.data.count) / XP_COLLECTION_SAMPLE_SECONDS;
}

function measureNonDamage(sim: Simulation, definition: UniversalUpgradeDefinition): Measurement {
  let label: string;
  let unit: string;
  let value: number;
  switch (definition.effect.kind) {
    case 'speedMultiplier':
      label = 'Authoritative player speed';
      unit = 'units/sec';
      value = sim.player.speed;
      break;
    case 'xpMagnet':
      label = `Authoritative XP motes collected in ${XP_COLLECTION_SAMPLE_SECONDS}s`;
      unit = 'motes/sec';
      value = measureXpCollectionRate(sim);
      break;
    case 'maxHp':
      label = 'Authoritative maximum health';
      unit = 'health';
      value = sim.player.maxHp;
      break;
    case 'xpMultiplier': {
      label = 'Authoritative XP from one pickup';
      unit = 'xp';
      const before = sim.player.xp;
      spawnXpSample(sim);
      sim.step(IDLE_INPUT);
      value = sim.player.xp - before;
      break;
    }
    case 'heroDodge':
      label = 'Authoritative dodge chance';
      unit = 'fraction';
      value = sim.player.dodgeChance ?? 0;
      break;
    case 'heroArmor':
      label = 'Authoritative armor';
      unit = 'armor';
      value = sim.player.armor ?? 0;
      break;
    case 'heroShield':
      label = 'Authoritative shield maximum';
      unit = 'shield';
      value = sim.player.shieldMax ?? 0;
      break;
    case 'weaponDamageMultiplier':
    case 'weaponCooldownMultiplier':
    case 'critChance':
    case 'basicAttack':
      throw new Error(`${definition.id} is a direct-damage row and must use combat measurement`);
  }
  return {
    metric: Object.freeze({ label, unit, before: roundMetric(value), after: 0, delta: 0 }),
    finalStateHash: sim.hash(),
  };
}

function compareMeasurement(
  before: Measurement,
  after: Measurement,
): { readonly metric: UpgradeImpactLabMetric; readonly beforeStateHash: string; readonly afterStateHash: string } {
  if (before.metric.label !== after.metric.label || before.metric.unit !== after.metric.unit) {
    throw new Error('upgrade impact lab comparison requires matching metrics');
  }
  return {
    metric: Object.freeze({
      label: before.metric.label,
      unit: before.metric.unit,
      before: before.metric.before,
      after: after.metric.before,
      delta: roundMetric(after.metric.before - before.metric.before),
    }),
    beforeStateHash: before.finalStateHash,
    afterStateHash: after.finalStateHash,
  };
}

function runComparison(labCase: LabCase, currentRank: number): UpgradeImpactLabResult {
  const nextRank = currentRank + 1;
  const impact = describeUniversalUpgradeImpact(labCase.definition, currentRank, nextRank);
  // Both simulations advance through the same number of setup ticks. The
  // baseline gets a no-input tick after its final valid selection rather than
  // relying on a pending offer, which production simulation correctly blocks.
  const beforeSim = prepareSimulation(labCase, currentRank, true);
  const afterSim = prepareSimulation(labCase, nextRank, false);
  const before = impact.directDamage
    ? measureDirectDamage(beforeSim)
    : measureNonDamage(beforeSim, labCase.definition);
  const after = impact.directDamage
    ? measureDirectDamage(afterSim)
    : measureNonDamage(afterSim, labCase.definition);
  const compared = compareMeasurement(before, after);
  return Object.freeze({
    id: labCase.definition.id,
    title: labCase.definition.title,
    heroId: labCase.heroId,
    currentRank,
    nextRank,
    category: impact.category,
    authoredOutcome: impact.summary,
    authoredDelta: impact.delta,
    directDamageStatus: impact.directDamage ? 'measured' : 'no-direct-damage',
    metric: compared.metric,
    beforeStateHash: compared.beforeStateHash,
    afterStateHash: compared.afterStateHash,
  });
}

function summarize(results: readonly UpgradeImpactLabResult[]): UpgradeImpactLabSummary {
  let directDamageComparisons = 0;
  let directDamageImprovements = 0;
  let directDamageNoObservedChange = 0;
  let failures = 0;
  for (const result of results) {
    if (result.directDamageStatus !== 'measured') continue;
    directDamageComparisons++;
    if (result.metric.delta > 0) directDamageImprovements++;
    else if (result.metric.delta === 0) directDamageNoObservedChange++;
    else failures++;
  }
  return Object.freeze({
    totalComparisons: results.length,
    directDamageComparisons,
    nonDamageComparisons: results.length - directDamageComparisons,
    directDamageImprovements,
    directDamageNoObservedChange,
    failures,
  });
}

/** Run every universal rank transition using fixed seed and fixtures. */
export function runUpgradeImpactLabReport(): UpgradeImpactLabReport {
  const results: UpgradeImpactLabResult[] = [];
  for (const labCase of LAB_CASES) {
    for (let currentRank = 0; currentRank < labCase.definition.maxRank; currentRank++) {
      results.push(runComparison(labCase, currentRank));
    }
  }
  return Object.freeze({
    version: UPGRADE_IMPACT_LAB_VERSION,
    seed: UPGRADE_IMPACT_LAB_SEED,
    durationSeconds: UPGRADE_IMPACT_LAB_DURATION_SECONDS,
    durationTicks: DEFAULT_CONFIG.hz * UPGRADE_IMPACT_LAB_DURATION_SECONDS,
    targetCount: TRAINING_TARGET_COUNT,
    targetHealth: TRAINING_TARGET_HP,
    results: Object.freeze(results),
    summary: summarize(results),
  });
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Readable deterministic evidence for CI logs or a balance-review handoff. */
export function formatUpgradeImpactLabReport(report: UpgradeImpactLabReport = runUpgradeImpactLabReport()): string {
  const header = [
    `Upgrade Impact Lab v${report.version}`,
    `seed ${report.seed} • ${report.durationSeconds}s / ${report.durationTicks} ticks for direct-damage rows`,
    `training targets: ${report.targetCount} × ${report.targetHealth} HP`,
  ].join('\n');
  const rows = report.results.map((result) => [
    result.directDamageStatus === 'measured' ? 'DAMAGE' : 'NO DIRECT DAMAGE',
    result.category.toUpperCase(),
    result.title,
    `Rank ${result.currentRank}→${result.nextRank}`,
    `${formatNumber(result.metric.before)} → ${formatNumber(result.metric.after)} ${result.metric.unit}`,
    `Δ ${formatNumber(result.metric.delta)}`,
  ].join(' | '));
  return [
    header,
    ...rows,
    `Summary: ${report.summary.directDamageImprovements}/${report.summary.directDamageComparisons} direct-damage comparisons improved; ${report.summary.directDamageNoObservedChange} chance-interval rows had no observed damage delta; ${report.summary.nonDamageComparisons} no-direct-damage comparisons; ${report.summary.failures} regressions.`,
  ].join('\n');
}
