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
import { RunDirector, SALTWIND_RUINS_RUN } from '@director';
import { GREG_FOREST_ARSENAL_CATALOG, TraitRuntime } from '@traits';
import { createAutopilot } from '../src/stress/autopilot';

const RUN_TICKS = 28_800;
const SEED = 0x1234abcd;

const traitRuntimeFactory: TraitRuntimeFactory = ({ seed, initialTick }) =>
  new TraitRuntime({ seed, initialTick, catalog: GREG_FOREST_ARSENAL_CATALOG });
const runDirectorFactory: RunDirectorFactory = ({ seed }) => new RunDirector({ seed });
const options: SimulationOptions = {
  traitRuntimeFactory,
  universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
  runDirectorFactory,
};
const saltwindOptions: SimulationOptions = {
  ...options,
  runDirectorFactory: ({ seed }) => new RunDirector({ seed, definition: SALTWIND_RUINS_RUN }),
  runStartLoadout: { version: 3, heroId: 'greg', biomeId: 'saltwind', maxHpBonus: 0 },
};

function enduranceConfig(): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    player: { ...DEFAULT_CONFIG.player, maxHp: 1_000_000 },
  };
}

describe('full authored run replay', () => {
  it('advances the real integrated stack to its terminal outcome no later than 8 minutes and reproduces its exact hash', () => {
    const config = enduranceConfig();
    const sim = createSimulation(config, SEED, options);
    const autopilot = createAutopilot();
    const eventKinds = new Set<string>();
    const phases = new Set<string>();

    // The simulation freezes at either victory or defeat. A strong build may
    // defeat the 6:30 boss before the normal 8:00 deadline, so do not keep
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

  it('runs the unlocked Saltwind contract through its apex variant and reproduces its exact hash', () => {
    const config = enduranceConfig();
    const sim = createSimulation(config, SEED, saltwindOptions);
    const autopilot = createAutopilot();
    let bossRequested = false;

    while (sim.tick < RUN_TICKS && sim.runOutcome === 'running') {
      if (sim.upgradeSelectionPending) {
        const offer = sim.pendingUpgradeOffers[0];
        if (offer !== undefined) sim.selectUpgrade(offer.id);
      }
      sim.step(autopilot.sample(sim.tick, false));
      if (sim.directorEvents.some((event) => event.kind === 'bossRequested')) bossRequested = true;
    }
    autopilot.dispose();

    const replay = sim.getReplay();
    const finalHash = sim.hash();
    const reproduced = runReplay(config, replay, saltwindOptions);

    expect(sim.tick).toBeLessThanOrEqual(RUN_TICKS);
    expect(bossRequested).toBe(true);
    expect(sim.runOutcome === 'victory' || sim.runOutcome === 'defeat').toBe(true);
    expect(reproduced).toEqual({ finalHash, ticks: sim.tick });
  }, 30_000);
});
