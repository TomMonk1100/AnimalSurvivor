import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
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
import { RunDirector, SALTWIND_RUINS_RUN } from '@director';
import { GREG_FOREST_ARSENAL_CATALOG, TraitRuntime } from '@traits';
import { createAutopilot } from '../src/stress/autopilot';

const RUN_TICKS = DEFAULT_CONFIG.hz * 60 * 8;
const CORPUS_SEED = 0x51_aa_2026;
const PROPOSE_GOLDENS = process.env.ANIMAL_SURVIVOR_GOLDEN_MODE === 'propose';

const GOLDEN_HASHES: Readonly<Record<string, string>> = Object.freeze({
  // Rebaselined after the opening-arrival, XP pacing, and adaptation-density
  // adjustments were observed identically across three deterministic runs.
  'greg/forest': '006b135f8b7efd20',
  'benny/forest': '96579e9d86408b1b',
  'gracie/forest': 'a7754245f851014b',
  'greg/saltwind': 'e916f07c553487d9',
  'benny/saltwind': 'cc8975c1ec88800f',
  'gracie/saltwind': 'bb3d901bb2d89168',
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
    runStartLoadout: { version: 3, heroId, biomeId, maxHpBonus: 0 },
  };
}

function finishCorpusRun(config: SimConfig, seed: number, options: SimulationOptions): Simulation {
  const sim = createSimulation(config, seed, options);
  const autopilot = createAutopilot();
  while (sim.tick < RUN_TICKS && sim.runOutcome === 'running') {
    if (sim.upgradeSelectionPending) {
      const offer = sim.pendingUpgradeOffers[0];
      if (offer !== undefined) sim.selectUpgrade(offer.id);
    }
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
