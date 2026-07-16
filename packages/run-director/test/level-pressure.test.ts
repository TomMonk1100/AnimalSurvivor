import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/director-state.js';
import { getDefaultDefinition } from '../src/definitions.js';
import { resolveDiscretionaryWaveInterval, resolveLiveEnemyCaps } from '../src/level-pressure.js';
import { serviceSpawns } from '../src/spawn-scheduler.js';
import { fingerprintDefinition, hashState } from '../src/state-hash.js';
import { accrueThreat } from '../src/threat-budget.js';
import { validateDefinition } from '../src/validation.js';
import type { PhaseDefinition, RunMetrics } from '../src/contracts.js';

function openingPhase(): PhaseDefinition {
  const phase = getDefaultDefinition().phases.find((candidate) => candidate.id === 'opening');
  if (phase === undefined) throw new Error('default opening phase is missing');
  return phase;
}

function phase(id: PhaseDefinition['id']): PhaseDefinition {
  const found = getDefaultDefinition().phases.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`default ${id} phase is missing`);
  return found;
}

function metrics(playerLevel: number, liveEnemies: number, tick = 120): RunMetrics {
  return {
    tick,
    paused: false,
    playerAlive: true,
    playerHp: 100,
    playerMaxHp: 100,
    playerLevel,
    liveEnemies,
    killsTotal: 0,
    bossAlive: false,
    bossDefeatedThisTick: false,
  };
}

test('level pressure raises capacity gradually and stops at its authored cap', () => {
  const def = getDefaultDefinition();
  const rule = def.levelPressure;
  assert.ok(rule, 'default normal content must author level pressure');
  const phase = openingPhase();

  assert.deepEqual(resolveLiveEnemyCaps(phase, rule, 1), {
    softCap: 12,
    hardCap: 20,
    levelSteps: 0,
  });
  assert.deepEqual(resolveLiveEnemyCaps(phase, rule, 4), {
    softCap: 13,
    hardCap: 22,
    levelSteps: 1,
  });
  assert.deepEqual(resolveLiveEnemyCaps(phase, rule, 6), {
    softCap: 14,
    hardCap: 24,
    levelSteps: 2,
  });
  assert.deepEqual(resolveLiveEnemyCaps(phase, rule, 8), {
    softCap: 15,
    hardCap: 26,
    levelSteps: 3,
  });
  assert.deepEqual(resolveLiveEnemyCaps(phase, rule, 99), {
    softCap: 15,
    hardCap: 26,
    levelSteps: 3,
  });

  const openingInterval = def.waves.phaseIntervalTicks?.opening;
  assert.equal(openingInterval, 60);
  assert.equal(resolveDiscretionaryWaveInterval(openingInterval!, rule, 1), 60);
  assert.equal(resolveDiscretionaryWaveInterval(openingInterval!, rule, 4), 56);
  assert.equal(resolveDiscretionaryWaveInterval(openingInterval!, rule, 6), 52);
  assert.equal(resolveDiscretionaryWaveInterval(openingInterval!, rule, 8), 48);
  assert.equal(resolveDiscretionaryWaveInterval(openingInterval!, rule, 99), 48);
});

test('higher level unlocks modest extra density capacity without a spawn burst', () => {
  const def = getDefaultDefinition();
  const phase = openingPhase();
  const state = createInitialState(def, 0x1234);
  state.threat.budget = 100;
  state.threat.ticksSinceSpawn = def.waves.phaseIntervalTicks?.opening ?? def.waves.intervalTicks;

  // At level 1, twelve alive enemies meet the opening soft cap and block a wave.
  assert.deepEqual(serviceSpawns(state, def, phase, metrics(1, 12), 120), []);

  // At level 4, the first +1 soft-cap step admits exactly one ordinary wave.
  const decisions = serviceSpawns(state, def, phase, metrics(4, 12), 120);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.delayed, false);
  assert.equal(state.threat.ticksSinceSpawn, 0);
});

test('authored phase cadence accelerates ordinary waves independently of level pressure', () => {
  const def = getDefaultDefinition();
  const state = createInitialState(def, 0x8bad);
  state.threat.budget = 1_000;

  const pressure = phase('pressure');
  const pressureInterval = def.waves.phaseIntervalTicks?.pressure;
  assert.equal(pressureInterval, 42);
  state.threat.ticksSinceSpawn = pressureInterval! - 1;
  assert.deepEqual(serviceSpawns(state, def, pressure, metrics(1, 0, 60), 60), []);

  state.threat.ticksSinceSpawn = pressureInterval!;
  const decision = serviceSpawns(state, def, pressure, metrics(1, 0, 61), 61);
  assert.equal(decision.length, 1);
  assert.equal(decision[0]?.count, 4);
});

function runBelowCapStream(playerLevel: number): {
  readonly ordinaryWaves: number;
  readonly maxDecisionsPerTick: number;
  readonly stateHash: string;
} {
  const def = getDefaultDefinition();
  const phase = openingPhase();
  const state = createInitialState(def, 0x4567);
  let ordinaryWaves = 0;
  let maxDecisionsPerTick = 0;

  for (let tick = 1; tick <= 480; tick += 1) {
    state.tick = tick;
    accrueThreat(state.threat, phase, def.threat, 1);
    const decisions = serviceSpawns(state, def, phase, metrics(playerLevel, 0, tick), tick);
    maxDecisionsPerTick = Math.max(maxDecisionsPerTick, decisions.length);
    for (const decision of decisions) {
      if (!decision.delayed && !decision.elite && !decision.boss) {
        ordinaryWaves += 1;
      }
    }
  }

  return { ordinaryWaves, maxDecisionsPerTick, stateHash: hashState(state) };
}

test('level pressure cadence emits more ordinary below-cap waves without same-tick bursts', () => {
  const level1 = runBelowCapStream(1);
  const level7 = runBelowCapStream(7);
  const level7Replay = runBelowCapStream(7);

  assert.equal(level1.ordinaryWaves, 8);
  assert.equal(level7.ordinaryWaves, 9);
  assert.ok(level7.ordinaryWaves > level1.ordinaryWaves);
  assert.equal(level1.maxDecisionsPerTick, 1);
  assert.equal(level7.maxDecisionsPerTick, 1);
  assert.equal(level7.stateHash, level7Replay.stateHash, 'fixed input must reproduce the same state');
  assert.notEqual(level7.stateHash, level1.stateHash, 'cadence must affect the resulting state');
});

test('level-pressure content is validated and fingerprinted', () => {
  const def = getDefaultDefinition();
  const rule = def.levelPressure;
  assert.ok(rule);
  const invalid = { ...def, levelPressure: { ...rule, maxSteps: 4 } };
  assert.throws(() => validateDefinition(invalid), /levelPressure\.maxSteps/);

  const invalidInterval = {
    ...def,
    levelPressure: { ...rule, intervalTicksReductionPerStep: def.waves.intervalTicks / rule.maxSteps },
  };
  assert.throws(() => validateDefinition(invalidInterval), /reduces wave interval below 1 tick/);

  const changed = {
    ...def,
    levelPressure: { ...rule, intervalTicksReductionPerStep: rule.intervalTicksReductionPerStep + 1 },
  };
  assert.notEqual(fingerprintDefinition(changed), fingerprintDefinition(def));
  assert.throws(() => resolveLiveEnemyCaps(openingPhase(), rule, 0), /playerLevel/);
  assert.throws(() => resolveDiscretionaryWaveInterval(1, rule, 7), /below 1 tick/);
});
