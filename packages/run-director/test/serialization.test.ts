/**
 * AGENT C — OWNED test.
 *
 * Self-contained: builds a minimal-but-valid RunDefinition inline so this
 * file compiles and runs without depending on other agents' src files.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  ArchetypeDefinition,
  BossDefinition,
  EliteBeatDefinition,
  OvertimeConfig,
  PhaseDefinition,
  RunDefinition,
  RunMetrics,
  ThreatConfig,
  WaveConfig,
} from '../src/contracts.js';
import { OPEN_END } from '../src/contracts.js';
import { CONTENT_VERSION, STATE_VERSION } from '../src/ids.js';
import { createInitialState, phaseAt, cloneState } from '../src/director-state.js';
import { evaluateOutcome } from '../src/objective-runtime.js';
import { serializeState, deserializeState } from '../src/serialization.js';
import { hashState, fingerprintDefinition } from '../src/state-hash.js';

/* ============================================================================
 * Minimal inline RunDefinition (mirrors the frozen phase-boundary ticks).
 * ==========================================================================*/

const PHASES: readonly PhaseDefinition[] = [
  { id: 'opening', startTick: 0, endTick: 7_199, softCap: 4, hardCap: 8, threatPerTick: 2 },
  { id: 'pressure', startTick: 7_200, endTick: 17_999, softCap: 6, hardCap: 12, threatPerTick: 4 },
  {
    id: 'adaptation',
    startTick: 18_000,
    endTick: 28_799,
    softCap: 8,
    hardCap: 14,
    threatPerTick: 6,
  },
  {
    id: 'mutation',
    startTick: 28_800,
    endTick: 39_599,
    softCap: 10,
    hardCap: 16,
    threatPerTick: 8,
  },
  { id: 'boss', startTick: 39_600, endTick: 43_199, softCap: 6, hardCap: 10, threatPerTick: 3 },
  {
    id: 'overtime',
    startTick: 43_200,
    endTick: OPEN_END,
    softCap: 6,
    hardCap: 10,
    threatPerTick: 3,
  },
];

const ARCHETYPES: readonly ArchetypeDefinition[] = [
  {
    id: 'enemy:fodder',
    cost: 1,
    weight: 10,
    formation: 'cluster',
    count: 3,
    minDistance: 5,
    maxDistance: 15,
    elite: false,
    boss: false,
  },
  {
    id: 'enemy:elite',
    cost: 8,
    weight: 1,
    formation: 'arc',
    count: 1,
    minDistance: 10,
    maxDistance: 20,
    elite: true,
    boss: false,
  },
  {
    id: 'enemy:boss',
    cost: 20,
    weight: 1,
    formation: 'ring',
    count: 1,
    minDistance: 15,
    maxDistance: 25,
    elite: false,
    boss: true,
  },
];

const ELITE_BEATS: readonly EliteBeatDefinition[] = [
  {
    id: 'elite:pressure-1',
    phaseId: 'pressure',
    warningTick: 11_700,
    requestTick: 12_000,
    archetypeId: 'enemy:elite',
    count: 1,
    formation: 'arc',
    minDistance: 10,
    maxDistance: 20,
  },
];

const BOSS: BossDefinition = {
  warningTick: 38_400,
  requestTick: 39_600,
  archetypeId: 'enemy:boss',
  formation: 'ring',
  minDistance: 15,
  maxDistance: 25,
};

const THREAT: ThreatConfig = { initialBudget: 0, maxBudget: 2_000 };

const WAVES: WaveConfig = {
  intervalTicks: 120,
  phaseArchetypes: {
    opening: ['enemy:fodder'],
    pressure: ['enemy:fodder'],
    adaptation: ['enemy:fodder'],
    mutation: ['enemy:fodder'],
    boss: ['enemy:fodder'],
    overtime: ['enemy:fodder'],
  },
};

const OVERTIME: OvertimeConfig = {
  supportIntervalTicks: 300,
  archetypeId: 'enemy:fodder',
  count: 2,
  formation: 'cluster',
  minDistance: 5,
  maxDistance: 15,
  maxSupportWaves: 40,
};

function makeDefinition(overrides?: Partial<RunDefinition>): RunDefinition {
  return {
    contentVersion: CONTENT_VERSION,
    durationTicks: 43_200,
    phases: PHASES,
    archetypes: ARCHETYPES,
    eliteBeats: ELITE_BEATS,
    boss: BOSS,
    threat: THREAT,
    waves: WAVES,
    overtime: OVERTIME,
    eventBufferCapacity: 256,
    defaultSeed: 0x5eed,
    ...overrides,
  };
}

const DEF = makeDefinition();

function aliveMetrics(tick: number, overrides?: Partial<RunMetrics>): RunMetrics {
  return {
    tick,
    paused: false,
    playerAlive: true,
    playerHp: 100,
    playerMaxHp: 100,
    playerLevel: 1,
    liveEnemies: 0,
    killsTotal: 0,
    bossAlive: false,
    bossDefeatedThisTick: false,
    ...overrides,
  };
}

/* ============================================================================
 * Round-trip: createInitialState -> serialize -> deserialize -> re-serialize
 * ==========================================================================*/

test('createInitialState round-trips through serialize/deserialize byte-identically', () => {
  const state = createInitialState(DEF, 12345);
  const json1 = serializeState(state);
  const restored = deserializeState(json1, DEF);
  const json2 = serializeState(restored);

  assert.equal(json2, json1, 'round-tripped JSON must be byte-identical');
  assert.equal(hashState(restored), hashState(state), 'hashState must agree after round-trip');
});

test('cloneState produces a deep, reference-free copy', () => {
  const state = createInitialState(DEF, 7);
  const clone = cloneState(state);

  assert.notEqual(clone, state);
  assert.notEqual(clone.threat, state.threat);
  assert.notEqual(clone.spawn, state.spawn);
  assert.notEqual(clone.spawn.delayed, state.spawn.delayed);
  assert.notEqual(clone.boss, state.boss);
  assert.notEqual(clone.overtime, state.overtime);
  assert.notEqual(clone.rng, state.rng);
  assert.notEqual(clone.rng.s, state.rng.s);
  assert.notEqual(clone.firedBeats, state.firedBeats);
  assert.notEqual(clone.firedWarnings, state.firedWarnings);
  assert.equal(hashState(clone), hashState(state));
});

/* ============================================================================
 * phaseAt boundary ticks
 * ==========================================================================*/

test('phaseAt returns correct phases at boundary ticks', () => {
  assert.equal(phaseAt(DEF, 0).id, 'opening');
  assert.equal(phaseAt(DEF, 7_199).id, 'opening');
  assert.equal(phaseAt(DEF, 7_200).id, 'pressure');
  assert.equal(phaseAt(DEF, 39_599).id, 'mutation');
  assert.equal(phaseAt(DEF, 39_600).id, 'boss');
  assert.equal(phaseAt(DEF, 43_199).id, 'boss');
  assert.equal(phaseAt(DEF, 43_200).id, 'overtime');
  assert.equal(phaseAt(DEF, 100_000).id, 'overtime');
});

test('phaseAt throws for negative ticks', () => {
  assert.throws(() => phaseAt(DEF, -1));
});

/* ============================================================================
 * evaluateOutcome
 * ==========================================================================*/

test('evaluateOutcome: defeat when player is not alive', () => {
  const state = createInitialState(DEF, 1);
  const result = evaluateOutcome(state, aliveMetrics(0, { playerAlive: false }));
  assert.deepEqual(result, { outcome: 'defeat', terminalKind: 'defeat' });
});

test('evaluateOutcome: no victory before boss.requested, even if bossDefeatedThisTick', () => {
  const state = createInitialState(DEF, 1);
  assert.equal(state.boss.requested, false);
  const result = evaluateOutcome(state, aliveMetrics(0, { bossDefeatedThisTick: true }));
  assert.deepEqual(result, { outcome: 'running', terminalKind: null });
});

test('evaluateOutcome: victory when boss.requested && bossDefeatedThisTick', () => {
  const state = createInitialState(DEF, 1);
  state.boss.requested = true;
  const result = evaluateOutcome(state, aliveMetrics(39_600, { bossDefeatedThisTick: true }));
  assert.deepEqual(result, { outcome: 'victory', terminalKind: 'victory' });
});

test('evaluateOutcome: defeat wins over simultaneous victory signal', () => {
  const state = createInitialState(DEF, 1);
  state.boss.requested = true;
  const result = evaluateOutcome(
    state,
    aliveMetrics(39_600, { playerAlive: false, bossDefeatedThisTick: true }),
  );
  assert.deepEqual(result, { outcome: 'defeat', terminalKind: 'defeat' });
});

test('evaluateOutcome: terminal outcome is sticky', () => {
  const state = createInitialState(DEF, 1);
  state.outcome = 'victory';
  const result = evaluateOutcome(state, aliveMetrics(40_000, { playerAlive: false }));
  assert.deepEqual(result, { outcome: 'victory', terminalKind: null });
});

/* ============================================================================
 * deserializeState rejections
 * ==========================================================================*/

test('deserializeState rejects a forged victory-without-boss-requested state', () => {
  const state = createInitialState(DEF, 1);
  state.tick = 39_600;
  state.phase = 'boss';
  state.outcome = 'victory';
  // boss.requested left false — forged.
  const json = serializeState(state);
  assert.throws(() => deserializeState(json, DEF), /boss\.requested/);
});

test('deserializeState rejects a non-finite number', () => {
  const state = createInitialState(DEF, 1);
  const json = serializeState(state);
  const obj = JSON.parse(json) as Record<string, unknown>;
  obj.seq = Number.NaN;
  assert.throws(() => deserializeState(JSON.stringify(obj), DEF), /seq/);
});

test('deserializeState rejects the wrong version', () => {
  const state = createInitialState(DEF, 1);
  const json = serializeState(state);
  const obj = JSON.parse(json) as Record<string, unknown>;
  obj.version = STATE_VERSION + 1;
  assert.throws(() => deserializeState(JSON.stringify(obj), DEF), /version/);
});

test('deserializeState rejects a phase/tick mismatch', () => {
  const state = createInitialState(DEF, 1);
  state.tick = 0;
  state.phase = 'opening';
  const json = serializeState(state);
  const obj = JSON.parse(json) as Record<string, unknown>;
  obj.phase = 'boss'; // tick 0 belongs to 'opening', not 'boss'
  assert.throws(() => deserializeState(JSON.stringify(obj), DEF), /phase\/tick mismatch/);
});

test('deserializeState rejects boss.defeated without boss.requested', () => {
  const state = createInitialState(DEF, 1);
  const json = serializeState(state);
  const obj = JSON.parse(json) as Record<string, unknown>;
  (obj.boss as Record<string, unknown>).defeated = true;
  assert.throws(() => deserializeState(JSON.stringify(obj), DEF), /boss\.defeated/);
});

test('deserializeState rejects overtime.active with negative startedTick', () => {
  const state = createInitialState(DEF, 1);
  const json = serializeState(state);
  const obj = JSON.parse(json) as Record<string, unknown>;
  (obj.overtime as Record<string, unknown>).active = true;
  assert.throws(() => deserializeState(JSON.stringify(obj), DEF), /overtime\.active/);
});

test('deserializeState accepts a well-formed serialized state', () => {
  const state = createInitialState(DEF, 42);
  const json = serializeState(state);
  const restored = deserializeState(json, DEF);
  assert.equal(restored.tick, state.tick);
  assert.equal(restored.seq, state.seq);
});

/* ============================================================================
 * fingerprintDefinition
 * ==========================================================================*/

test('fingerprintDefinition is stable across two calls', () => {
  const a = fingerprintDefinition(DEF);
  const b = fingerprintDefinition(DEF);
  assert.equal(a, b);
});

test('fingerprintDefinition differs when a phase boundary is altered', () => {
  const altered = makeDefinition({
    phases: PHASES.map((p) => (p.id === 'opening' ? { ...p, endTick: 7_198 } : p)),
  });
  const original = fingerprintDefinition(DEF);
  const changed = fingerprintDefinition(altered);
  assert.notEqual(original, changed);
});

test('fingerprintDefinition is equal for structurally-equal definitions', () => {
  const other = makeDefinition();
  assert.equal(fingerprintDefinition(DEF), fingerprintDefinition(other));
});
