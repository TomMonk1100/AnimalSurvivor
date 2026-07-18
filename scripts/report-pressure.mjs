#!/usr/bin/env node
/* global console, process */
/** Compose the concrete production packages around the factory-driven sim lab. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function buildPackage(directory) {
  execFileSync('npm', ['run', 'build'], {
    cwd: resolve(workspaceRoot, directory),
    stdio: 'ignore',
  });
}

for (const directory of ['packages/run-director', 'packages/trait-runtime', 'packages/sim']) {
  buildPackage(directory);
}

const simModule = await import(new URL('../packages/sim/dist/src/index.js', import.meta.url));
const pressureModule = await import(new URL('../packages/sim/dist/src/pressure-lab.js', import.meta.url));
const directorModule = await import(new URL('../packages/run-director/dist/src/index.js', import.meta.url));
const traitModule = await import(new URL('../packages/trait-runtime/dist/src/index.js', import.meta.url));

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function parseSeed(value) {
  if (value === undefined) return 1234;
  if (!/^\d+$/.test(value)) throw new Error('--seed must be an unsigned integer');
  return Number(value) >>> 0;
}

const hero = valueAfter('--hero') ?? 'greg';
const seed = parseSeed(valueAfter('--seed'));
const policy = valueAfter('--policy') ?? 'stationary';
const openingDiagnosis = process.argv.includes('--opening-diagnosis');
const matrix = process.argv.includes('--matrix') || process.argv.includes('--verify') || openingDiagnosis;
const verify = process.argv.includes('--verify');
const summary = process.argv.includes('--summary');

if (!pressureModule.PRESSURE_LAB_HEROES.includes(hero)) throw new Error(`unknown --hero ${hero}`);
if (!pressureModule.PRESSURE_LAB_POLICIES.includes(policy)) throw new Error(`unknown --policy ${policy}`);

const traitRuntimeFactory = ({ seed: runtimeSeed, initialTick }) => new traitModule.TraitRuntime({
  seed: runtimeSeed,
  initialTick,
  catalog: traitModule.GREG_FOREST_ARSENAL_CATALOG,
});

function optionsFor(heroId) {
  return {
    traitRuntimeFactory,
    universalUpgradeCatalog: simModule.getUniversalUpgradeCatalogForHero(
      heroId,
      simModule.UNIVERSAL_UPGRADE_CATALOG,
    ),
    runDirectorFactory: ({ seed: directorSeed }) => new directorModule.RunDirector({ seed: directorSeed }),
    runStartLoadout: {
      version: simModule.RUN_START_LOADOUT_VERSION,
      heroId,
      biomeId: 'forest',
      maxHpBonus: 0,
    },
  };
}

const report = matrix
  ? pressureModule.runPressureMatrix(simModule.DEFAULT_CONFIG, optionsFor)
  : pressureModule.runPressureLab({
    config: simModule.DEFAULT_CONFIG,
    heroId: hero,
    seed,
    policy,
    simulationOptions: optionsFor(hero),
  });

const printableReport = openingDiagnosis && 'runs' in report
  ? {
      version: report.version,
      humanEvidence: report.humanEvidence,
      lane: 'mobile-greedy opening phase',
      runs: report.runs
        .filter((run) => run.policy === 'mobile-greedy')
        .map((run) => ({
          run: `${run.heroId}/${run.seed}/${run.policy}`,
          firstLevelUpTick: run.firstLevelUpTick,
          firstKillSampleTick: run.openingTimeline.find((sample) => sample.cumulativeKills > 0)?.tick ?? null,
          firstXpPickupSampleTick: run.openingTimeline.find((sample) => sample.cumulativeXpPickupsCollected > 0)?.tick ?? null,
          checkpoints: run.openingTimeline
            .filter((sample) => sample.tick % 300 === 0)
            .map((sample) => ({
              tick: sample.tick,
              spawned: sample.enemiesSpawned,
              killsTotal: sample.cumulativeKills,
              xpPickupsTotal: sample.cumulativeXpPickupsCollected,
              level: sample.playerLevel,
              unspentXp: sample.unspentXp,
              live: sample.liveEnemies,
            })),
        })),
    }
  : summary && 'runs' in report
  ? {
      version: report.version,
      humanEvidence: report.humanEvidence,
      gates: report.gates,
      allApplicableGatesPassed: report.allApplicableGatesPassed,
      runs: report.runs.map((run) => ({
        run: `${run.heroId}/${run.seed}/${run.policy}`,
        deathTick: run.deathTick,
        firstLevelUpTick: run.firstLevelUpTick,
        medianGap: run.medianLevelUpGapTicksThroughThreeMinutes,
        sameTickAdditionalModals: run.sameTickAdditionalModalsThroughThreeMinutes,
        aliveAtBossEntrance: run.aliveAtBossEntrance,
        proximityMeans: Object.fromEntries(run.phaseMeans.map((phase) => [phase.phase, phase.meanWithin350])),
        cameraMeans: Object.fromEntries(run.phaseMeans.map((phase) => [phase.phase, phase.meanCameraFraction])),
        eliteRelief: `${run.eliteRelief.filter((entry) => entry.dropFraction >= 0.25 && entry.recoveredBy25Seconds).length}/${run.eliteRelief.length}`,
        gates: Object.fromEntries(run.gates.map((gate) => [gate.id, gate.applicable ? gate.passed : null])),
      })),
    }
  : report;

console.log(JSON.stringify(printableReport, null, 2));
if (verify && !report.allApplicableGatesPassed) process.exitCode = 1;
