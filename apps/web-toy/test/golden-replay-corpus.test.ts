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

const GOLDEN_HASHES: Readonly<Record<string, string>> = Object.freeze({
  // Greg-only entries rebaselined for the earned Rush Rake cadence/damage pass.
  'greg/forest': '83ccb985d1bf8b00',
  'benny/forest': '8ed78cb3c0d1505c',
  'gracie/forest': '108962479289edea',
  'greg/saltwind': '153694c034060c52',
  'benny/saltwind': 'caa1786d50ac2fad',
  'gracie/saltwind': '53fe1b9a530d8f8e',
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
    expect(observed).toEqual(GOLDEN_HASHES);
  }, 60_000);
});
