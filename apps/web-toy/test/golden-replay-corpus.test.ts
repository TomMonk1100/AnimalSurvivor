import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  RUN_START_LOADOUT_VERSION,
  getUniversalUpgradeCatalogForHero,
  UNIVERSAL_UPGRADE_CATALOG,
  createSimulation,
  runReplay,
  type HeroId,
  type SimConfig,
  type Simulation,
  type SimulationOptions,
  type RunDirectorFactory,
  type TraitRuntimeFactory,
} from '@sim';
import { RUN_DURATION_TICKS, RunDirector, SALTWIND_RUINS_RUN } from '@director';
import { GREG_FOREST_ARSENAL_CATALOG, TraitRuntime } from '@traits';
import { createAutopilot } from '../src/stress/autopilot';

const RUN_TICKS = RUN_DURATION_TICKS;
const CORPUS_SEED = 0x51_aa_2026;
const PROPOSE_GOLDENS = process.env.ANIMAL_SURVIVOR_GOLDEN_MODE === 'propose';

const GOLDEN_HASHES: Readonly<Record<string, string>> = Object.freeze({
  // Rebaselined after deterministic V1.1 hero kits, five-rank Mastery,
  // explicit free fusions, combat defenses, and world-pickup state landed.
  // Rebaselined again for RUN_START_LOADOUT_VERSION 5: the permanent
  // meta-progression stat block (Might, Swiftness, Armor, Haste, etc.) is now
  // part of the run-start fingerprint. Gameplay is identical at the neutral
  // defaults these goldens use; only the loadout fingerprint changed.
  // Rebaselined for Wild Splice v2: measured Lab calibration and the
  // four-acquired-slot (three-terminal-Chimera) loadout contract both affect
  // the deterministic runtime-content fingerprint. The replay driver and
  // headless controls agreed for all six seeded corpus lanes before these
  // intentional expectations were updated.
  'greg/forest': 'f2cd913edee0269a',
  'benny/forest': 'c1e89b5f3638e032',
  'gracie/forest': '90ff0d0ddf9f0aea',
  'greg/saltwind': '56296ee1cac16e65',
  'benny/saltwind': 'a1d33fdb1f445060',
  'gracie/saltwind': '3694c77a21c4fe66',
});

const traitRuntimeFactory: TraitRuntimeFactory = ({ seed, initialTick }) =>
  new TraitRuntime({ seed, initialTick, catalog: GREG_FOREST_ARSENAL_CATALOG });

function enduranceConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    player: { ...DEFAULT_CONFIG.player, maxHp: 1_000_000 },
  };
}

function optionsFor(heroId: HeroId, biomeId: 'forest' | 'saltwind'): SimulationOptions {
  const runDirectorFactory: RunDirectorFactory = ({ seed }) => new RunDirector({
    seed,
    definition: biomeId === 'saltwind' ? SALTWIND_RUINS_RUN : undefined,
  });
  return {
    traitRuntimeFactory,
    universalUpgradeCatalog: getUniversalUpgradeCatalogForHero(heroId, UNIVERSAL_UPGRADE_CATALOG),
    runDirectorFactory,
    runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId, biomeId, maxHpBonus: 0 },
  };
}

/** Keep the golden player policy explicit, deterministic, and replay-bound. */
function resolveQueuedRunActions(sim: Simulation): void {
  while (sim.upgradeSelectionPending) {
    const fusion = sim.availableFusions[0];
    if (fusion !== undefined) sim.fuseEvolution(fusion.evolutionId);
    const offer = sim.pendingUpgradeOffers[0];
    if (offer === undefined) throw new Error('queued upgrade has no selectable offer');
    sim.selectUpgrade(offer.id);
  }
  const fusion = sim.availableFusions[0];
  if (fusion !== undefined) sim.fuseEvolution(fusion.evolutionId);
}

function finishCorpusRun(config: SimConfig, seed: number, options: SimulationOptions): Simulation {
  const sim = createSimulation(config, seed, options);
  const autopilot = createAutopilot();
  while (sim.tick < RUN_TICKS && sim.runOutcome === 'running') {
    resolveQueuedRunActions(sim);
    sim.step(autopilot.sample(sim.tick, false));
  }
  autopilot.dispose();
  if (sim.runOutcome !== 'victory' && sim.runOutcome !== 'defeat') {
    throw new Error(`golden run did not reach a terminal outcome at tick ${sim.tick}`);
  }
  return sim;
}

describe('golden replay corpus', () => {
  it('covers every founding hero in both authored biomes with exact replay reproduction', () => {
    const config = enduranceConfig();
    const cases = [
      ['greg', 'forest'],
      ['benny', 'forest'],
      ['gracie', 'forest'],
      ['greg', 'saltwind'],
      ['benny', 'saltwind'],
      ['gracie', 'saltwind'],
    ] as const;
    const observed: Record<string, string> = {};

    for (const [heroId, biomeId] of cases) {
      const options = optionsFor(heroId, biomeId);
      const sim = finishCorpusRun(config, CORPUS_SEED, options);
      const replay = sim.getReplay();
      const finalHash = sim.hash();
      expect(runReplay(config, replay, options), `${heroId}/${biomeId}`).toEqual({
        finalHash,
        ticks: sim.tick,
      });
      observed[`${heroId}/${biomeId}`] = finalHash;
      console.info(`[golden] ${heroId}/${biomeId} tick=${sim.tick} hash=${finalHash}`);
    }
    if (PROPOSE_GOLDENS) {
      process.stderr.write(`[golden:propose] ${JSON.stringify(observed)}\n`);
    } else {
      expect(observed).toEqual(GOLDEN_HASHES);
    }
  }, 60_000);
});
