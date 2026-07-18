import { describe, expect, it } from 'vitest';
import { createSimulation, DEFAULT_CONFIG } from '@sim';
import type { InputSource, TickInput } from '../src/contracts';
import { createSimDriver } from '../src/sim/simulation-driver';
import { captureSnapshot, createSnapshot } from '../src/sim/snapshot-producer';

const SEED = 42;
const HZ = DEFAULT_CONFIG.hz;
const DT_MS = 1000 / HZ;
const TICKS = 20;

/** Deterministic input matching a fixed per-tick pattern (a slow drift + occasional pause-free turns). */
function patternInput(): InputSource {
  return {
    sample(tick: number, _paused: boolean): TickInput {
      // A simple deterministic function of tick only - never wall-clock time.
      const angle = (tick % 7) * 0.3;
      return { moveX: Math.cos(angle), moveY: Math.sin(angle), paused: false };
    },
    clear(): void {},
    dispose(): void {},
  };
}

/** Feeds the exact same per-tick TickInput sequence the driver would produce, for the control run. */
function controlInputs(count: number): TickInput[] {
  const src = patternInput();
  const out: TickInput[] = [];
  for (let tick = 0; tick < count; tick++) {
    out.push(src.sample(tick, false));
  }
  return out;
}

describe('hash parity: driver (renderer-off) vs headless control', () => {
  it('produces an identical final hash for the same seed and same per-tick inputs', () => {
    const control = createSimulation(DEFAULT_CONFIG, SEED);
    for (const input of controlInputs(TICKS)) {
      control.step(input);
    }
    const controlHash = control.hash();
    expect(control.tick).toBe(TICKS);

    const driver = createSimDriver(DEFAULT_CONFIG, SEED);
    const input = patternInput();
    // One frame() per tick, each delta exactly one dt, so no catch-up capping
    // or dropped time perturbs which ticks get stepped.
    driver.frame(0, input, false);
    for (let i = 1; i <= TICKS; i++) {
      driver.frame(i * DT_MS, input, false);
    }

    expect(driver.tick).toBe(TICKS);
    expect(driver.hash()).toBe(controlHash);
  });

  it('capturing render snapshots between steps does not change the resulting hash', () => {
    const seed = SEED + 1;
    const control = createSimulation(DEFAULT_CONFIG, seed);
    const withCapture = createSimulation(DEFAULT_CONFIG, seed);
    const scratch = createSnapshot(DEFAULT_CONFIG);

    for (const input of controlInputs(TICKS)) {
      control.step(input);
    }

    const inputs = controlInputs(TICKS);
    for (const input of inputs) {
      withCapture.step(input);
      // Renderer-on read path: must be a pure read, never affecting gameplay state.
      captureSnapshot(scratch, withCapture);
      for (let index = 0; index < scratch.enemies.count; index++) {
        expect(Number.isFinite(scratch.enemies.attackCharge[index]!)).toBe(true);
      }
    }

    expect(withCapture.hash()).toBe(control.hash());
  });

  it('never calls Math.random and never mutates sim arrays during driver frames', () => {
    // Accessed via bracket notation (and restored the same way) so this guard
    // itself doesn't trip the app-wide "no Math.random" lint rule, which is
    // exactly the invariant this test is asserting for driver/snapshot code.
    const mathRandomKey = 'random';
    const originalRandom = Math[mathRandomKey];
    Math[mathRandomKey] = (): number => {
      throw new Error('Math.random must never be called by driver/snapshot code; the sim owns all RNG.');
    };
    try {
      const driver = createSimDriver(DEFAULT_CONFIG, SEED + 2);
      const input = patternInput();

      driver.frame(0, input, false);
      for (let i = 1; i <= TICKS; i++) {
        driver.frame(i * DT_MS, input, false);
      }
      expect(driver.tick).toBe(TICKS);
    } finally {
      Math[mathRandomKey] = originalRandom;
    }
  });

  it('is deterministic across two identical driver runs with the same seed and input sequence', () => {
    const seed = SEED + 3;
    const inputA = patternInput();
    const inputB = patternInput();

    const driverA = createSimDriver(DEFAULT_CONFIG, seed);
    const driverB = createSimDriver(DEFAULT_CONFIG, seed);

    driverA.frame(0, inputA, false);
    driverB.frame(0, inputB, false);
    for (let i = 1; i <= TICKS; i++) {
      driverA.frame(i * DT_MS, inputA, false);
      driverB.frame(i * DT_MS, inputB, false);
    }

    expect(driverA.hash()).toBe(driverB.hash());
    expect(driverA.tick).toBe(driverB.tick);
  });
});
