/**
 * LEAD-OWNED integration contract test.
 *
 * Proves the toy's core guarantee: a deterministic autopilot run through the
 * fixed-tick driver finishes with the SAME simulation state hash as a headless
 * control fed the identical per-tick inputs, across a full five simulated
 * minutes. (The renderer-on vs renderer-off read-path parity is covered by
 * Agent A's hash-parity suite.)
 */
import { describe, it, expect } from 'vitest';
import { createSimulation, DEFAULT_CONFIG } from '@sim';
import { createAutopilot } from '../src/stress/autopilot';
import { createSimDriver } from '../src/sim/simulation-driver';

const HZ = DEFAULT_CONFIG.hz;
const DT_MS = 1000 / HZ;
const FIVE_MIN_TICKS = HZ * 60 * 5; // 18000 ticks @ 60hz
const PROPOSE_GOLDENS = process.env.ANIMAL_SURVIVOR_GOLDEN_MODE === 'propose';
// Rebaselined after the reviewed opening-arrival, XP pacing, and adaptation
// density pass; deterministic proposal runs agreed before this expectation
// changed.
const EXPECTED_FIVE_MINUTE_HASH = 'd23c536f1a478d8d';

/** Headless control: step a bare simulation with autopilot inputs keyed on pre-step tick. */
function headlessControl(seed: number, ticks: number): string {
  const sim = createSimulation(DEFAULT_CONFIG, seed);
  const auto = createAutopilot();
  for (let i = 0; i < ticks; i++) {
    sim.step(auto.sample(sim.tick, false));
  }
  return sim.hash();
}

/**
 * Drive the fixed-tick driver one tick per frame (renderer-off) via wall-clock
 * deltas. The first frame only establishes the wall-clock baseline (0 ticks), so
 * we prime once and then run exactly `ticks` fixed-step frames.
 */
function driverRun(seed: number, ticks: number): string {
  const driver = createSimDriver(DEFAULT_CONFIG, seed);
  const auto = createAutopilot();
  let now = 1000;
  driver.frame(now, auto, false); // priming frame: sets baseline, steps 0 ticks
  for (let i = 0; i < ticks; i++) {
    now += DT_MS;
    driver.frame(now, auto, false);
  }
  if (driver.tick !== ticks) {
    throw new Error(`driver advanced ${driver.tick} ticks, expected ${ticks}`);
  }
  return driver.hash();
}

describe('five-minute autopilot determinism & headless parity', () => {
  const SEED = 0x1234abcd;

  it('driver renderer-off hash equals headless control over 5 simulated minutes', () => {
    const control = headlessControl(SEED, FIVE_MIN_TICKS);
    const driven = driverRun(SEED, FIVE_MIN_TICKS);
    if (PROPOSE_GOLDENS) {
      process.stderr.write(`[stress:propose] ${control}\n`);
    } else {
      expect(control).toBe(EXPECTED_FIVE_MINUTE_HASH);
    }
    expect(driven).toBe(control);
    // Canonical hash for the browser acceptance harness to match at tick 18000.
    console.info(`[stress] seed=0x${SEED.toString(16)} ticks=${FIVE_MIN_TICKS} hash=${control}`);
  }, 15_000);

  it('is reproducible run-to-run (same seed → same hash)', () => {
    expect(headlessControl(SEED, 6000)).toBe(headlessControl(SEED, 6000));
  });

  it('different seeds generally diverge', () => {
    expect(headlessControl(SEED, 6000)).not.toBe(headlessControl(0xdeadbeef, 6000));
  });
});
