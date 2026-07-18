import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG } from '../src/config.js';
import {
  PRESSURE_LAB_CAMERA_RADIUS,
  PRESSURE_LAB_GREEDY_SEEK_RADIUS,
  PRESSURE_LAB_ORBIT_DIRECTION_OFFSET,
  PRESSURE_LAB_ORBIT_DIRECTION_TICKS,
  PRESSURE_LAB_POLICIES,
  PRESSURE_LAB_PROXIMITY_RADIUS,
  runPressureLab,
  serializePressureReport,
} from '../src/pressure-lab.js';
import { RUN_START_LOADOUT_VERSION } from '../src/run-start-loadout.js';
import type { RunDirectorFactory, RunDirectorPort } from '../src/run-director-port.js';

function quietDirectorFactory(): RunDirectorFactory {
  return (): RunDirectorPort => {
    let tick = -1;
    return {
      outcome: 'running',
      get tick() { return tick; },
      phase: 'opening',
      step(metrics) { tick = metrics.tick; return []; },
      stateHash() { return Math.max(0, tick).toString(16).padStart(8, '0'); },
      contentFingerprint() { return '12345678'; },
    };
  };
}

test('pressure lab is byte-identical for orbit and greedy policies', () => {
  for (const policy of ['mobile-orbit', 'mobile-greedy'] as const) {
    const request = {
      config: { ...DEFAULT_CONFIG, waves: [], xpThresholds: [] },
      seed: 1234,
      heroId: 'greg' as const,
      policy,
      maximumTicks: 180,
      simulationOptions: {
        runDirectorFactory: quietDirectorFactory(),
        runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'greg' as const, maxHpBonus: 0 },
      },
    };
    const first = runPressureLab(request);
    const second = runPressureLab(request);
    assert.equal(serializePressureReport(first), serializePressureReport(second));
    assert.equal(first.finalStateHash, second.finalStateHash);
    assert.equal(first.proximityRadius, PRESSURE_LAB_PROXIMITY_RADIUS);
    assert.equal(first.cameraRadius, PRESSURE_LAB_CAMERA_RADIUS);
    assert.equal(first.humanEvidence, false);
    if (policy === 'mobile-greedy') {
      assert.match(first.inputPolicyDefinition, new RegExp(`${PRESSURE_LAB_GREEDY_SEEK_RADIUS} units`));
      assert.match(first.inputPolicyDefinition, new RegExp(`every ${PRESSURE_LAB_ORBIT_DIRECTION_TICKS} ticks`));
      assert.match(first.inputPolicyDefinition, new RegExp(`offset ${PRESSURE_LAB_ORBIT_DIRECTION_OFFSET}`));
    }
  }
  assert.deepEqual(PRESSURE_LAB_POLICIES, ['stationary', 'mobile-orbit', 'mobile-kite', 'mobile-greedy']);
});

test('pressure lab keeps current-reality gate expectations explicit and data-driven', () => {
  const report = runPressureLab({
    config: { ...DEFAULT_CONFIG, waves: [], xpThresholds: [] },
    seed: 7,
    heroId: 'benny',
    policy: 'stationary',
    maximumTicks: 120,
    simulationOptions: {
      runDirectorFactory: quietDirectorFactory(),
      runStartLoadout: { version: RUN_START_LOADOUT_VERSION, heroId: 'benny', maxHpBonus: 0 },
    },
  });
  const expectedCurrentReality: Readonly<Record<string, boolean>> = Object.freeze({
    G1: false,
    G2: false,
    G3: false,
    G4a: false,
    G4b: false,
    G5: false,
    G6: false,
  });
  for (const [id, expected] of Object.entries(expectedCurrentReality)) {
    assert.equal(report.gates.find((gate) => gate.id === id)?.passed, expected, id);
  }
});
