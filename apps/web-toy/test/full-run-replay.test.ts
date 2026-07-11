import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  createSimulation,
  runReplay,
  type RunDirectorFactory,
  type SimConfig,
  type SimulationOptions,
  type TraitRuntimeFactory,
} from '@sim';
import { RunDirector } from '@director';
import { GREG_VERTICAL_SLICE_CATALOG, TraitRuntime } from '@traits';
import { createAutopilot } from '../src/stress/autopilot';

const RUN_TICKS = 43_200;
const SEED = 0x1234abcd;

const traitRuntimeFactory: TraitRuntimeFactory = ({ seed, initialTick }) =>
  new TraitRuntime({ seed, initialTick, catalog: GREG_VERTICAL_SLICE_CATALOG });
const runDirectorFactory: RunDirectorFactory = ({ seed }) => new RunDirector({ seed });
const options: SimulationOptions = { traitRuntimeFactory, runDirectorFactory };

function enduranceConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    player: { ...DEFAULT_CONFIG.player, maxHp: 1_000_000 },
  };
}

describe('full authored run replay', () => {
  it('advances the real integrated stack through 12 minutes and reproduces its exact hash', () => {
    const config = enduranceConfig();
    const sim = createSimulation(config, SEED, options);
    const autopilot = createAutopilot();
    const eventKinds = new Set<string>();
    const phases = new Set<string>();

    while (sim.tick < RUN_TICKS) {
      if (sim.upgradeSelectionPending) {
        const offer = sim.pendingUpgradeOffers[0];
        if (offer !== undefined) sim.selectUpgrade(offer.traitId);
      }
      sim.step(autopilot.sample(sim.tick, false));
      for (const event of sim.directorEvents) eventKinds.add(event.kind);
      if (sim.runPhase !== null) phases.add(sim.runPhase);
    }
    if (sim.upgradeSelectionPending) {
      const offer = sim.pendingUpgradeOffers[0];
      if (offer !== undefined) sim.selectUpgrade(offer.traitId);
    }
    autopilot.dispose();

    const replay = sim.getReplay();
    const finalHash = sim.hash();
    const reproduced = runReplay(config, replay, options);

    expect(sim.tick).toBe(RUN_TICKS);
    expect(replay.inputs).toHaveLength(RUN_TICKS);
    for (const phase of ['opening', 'pressure', 'adaptation', 'mutation', 'boss']) {
      expect(phases).toContain(phase);
    }
    expect(eventKinds).toContain('bossWarning');
    expect(eventKinds).toContain('bossRequested');
    expect(sim.runOutcome === 'victory' || phases.has('overtime')).toBe(true);
    expect(reproduced).toEqual({ finalHash, ticks: RUN_TICKS });
  }, 30_000);
});
