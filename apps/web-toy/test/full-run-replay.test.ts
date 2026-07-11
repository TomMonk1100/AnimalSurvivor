import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  UNIVERSAL_UPGRADE_CATALOG,
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
const options: SimulationOptions = {
  traitRuntimeFactory,
  universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
  runDirectorFactory,
};

function enduranceConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    player: { ...DEFAULT_CONFIG.player, maxHp: 1_000_000 },
  };
}

describe('full authored run replay', () => {
  it('advances the real integrated stack to its terminal outcome no later than 12 minutes and reproduces its exact hash', () => {
    const config = enduranceConfig();
    const sim = createSimulation(config, SEED, options);
    const autopilot = createAutopilot();
    const eventKinds = new Set<string>();
    const phases = new Set<string>();

    // The simulation freezes at either victory or defeat. A strong build may
    // defeat the 10:00 boss before the normal 12:00 deadline, so do not keep
    // feeding inputs into an already-terminal run just to reach the cap.
    while (sim.tick < RUN_TICKS && sim.runOutcome === 'running') {
      if (sim.upgradeSelectionPending) {
        const offer = sim.pendingUpgradeOffers[0];
        if (offer !== undefined) sim.selectUpgrade(offer.id);
      }
      sim.step(autopilot.sample(sim.tick, false));
      for (const event of sim.directorEvents) eventKinds.add(event.kind);
      if (sim.runPhase !== null) phases.add(sim.runPhase);
    }
    if (sim.runOutcome === 'running' && sim.upgradeSelectionPending) {
      const offer = sim.pendingUpgradeOffers[0];
      if (offer !== undefined) sim.selectUpgrade(offer.id);
    }
    autopilot.dispose();

    const replay = sim.getReplay();
    const finalHash = sim.hash();
    const reproduced = runReplay(config, replay, options);

    expect(sim.tick).toBeLessThanOrEqual(RUN_TICKS);
    expect(replay.inputs).toHaveLength(sim.tick);
    for (const phase of ['opening', 'pressure', 'adaptation', 'mutation', 'boss']) {
      expect(phases).toContain(phase);
    }
    expect(eventKinds).toContain('bossWarning');
    expect(eventKinds).toContain('bossRequested');
    expect(sim.runOutcome === 'victory' || sim.runOutcome === 'defeat').toBe(true);
    expect(phases.has('overtime')).toBe(false);
    expect(reproduced).toEqual({ finalHash, ticks: sim.tick });
  }, 30_000);
});
