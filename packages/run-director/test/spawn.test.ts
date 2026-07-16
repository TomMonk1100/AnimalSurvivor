/**
 * AGENT B — OWNED.
 *
 * Coverage: threat accrual (integer + clamp + catch-up equivalence), spend
 * guard, event-buffer critical-survival overflow policy, and spawn-scheduler
 * cap/delayed-queue/interval behavior.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  ArchetypeDefinition,
  DelayedWave,
  DirectorEvent,
  DirectorState,
  PhaseDefinition,
  RunDefinition,
  RunMetrics,
  SpawnRequestedEvent,
  ThreatConfig,
  ThreatState,
} from '../src/contracts.js';
import { OPEN_END } from '../src/contracts.js';
import type { RunPhaseId } from '../src/ids.js';
import { createRng } from '../src/rng.js';
import { accrueThreat, canAfford, spend } from '../src/threat-budget.js';
import { createEventBuffer } from '../src/event-buffer.js';
import { serviceSpawns } from '../src/spawn-scheduler.js';

/* ============================================================================
 * threat-budget
 * ==========================================================================*/

function makePhase(overrides: Partial<PhaseDefinition> = {}): PhaseDefinition {
  return {
    id: 'opening',
    startTick: 0,
    endTick: 100_000,
    softCap: 10,
    hardCap: 20,
    threatPerTick: 7,
    ...overrides,
  };
}

test('accrueThreat: integer accrual, clamps at maxBudget', () => {
  const config: ThreatConfig = { initialBudget: 0, maxBudget: 50 };
  const phase = makePhase({ threatPerTick: 7 });
  const threat: ThreatState = { budget: 0, ticksSinceSpawn: 0 };

  accrueThreat(threat, phase, config, 5);
  assert.equal(threat.budget, 35);
  assert.ok(Number.isInteger(threat.budget));
  assert.equal(threat.ticksSinceSpawn, 5);

  accrueThreat(threat, phase, config, 5);
  // 35 + 35 = 70, clamped to maxBudget (50).
  assert.equal(threat.budget, 50);
  assert.equal(threat.ticksSinceSpawn, 10);
});

test('accrueThreat: catch-up over k ticks equals k single-tick accruals', () => {
  const config: ThreatConfig = { initialBudget: 0, maxBudget: 1_000_000 };
  const phase = makePhase({ threatPerTick: 3 });

  const stepwise: ThreatState = { budget: 0, ticksSinceSpawn: 0 };
  for (let i = 0; i < 17; i++) {
    accrueThreat(stepwise, phase, config, 1);
  }

  const catchUp: ThreatState = { budget: 0, ticksSinceSpawn: 0 };
  accrueThreat(catchUp, phase, config, 17);

  assert.equal(catchUp.budget, stepwise.budget);
  assert.equal(catchUp.ticksSinceSpawn, stepwise.ticksSinceSpawn);
});

test('accrueThreat: rejects negative ticks', () => {
  const config: ThreatConfig = { initialBudget: 0, maxBudget: 50 };
  const phase = makePhase();
  const threat: ThreatState = { budget: 0, ticksSinceSpawn: 0 };
  assert.throws(() => accrueThreat(threat, phase, config, -1));
});

test('spend: throws when unaffordable, succeeds at exact budget', () => {
  const threat: ThreatState = { budget: 5, ticksSinceSpawn: 0 };
  assert.equal(canAfford(threat, 10), false);
  assert.throws(() => spend(threat, 10));
  assert.equal(threat.budget, 5, 'failed spend must not mutate budget');

  assert.equal(canAfford(threat, 5), true);
  spend(threat, 5);
  assert.equal(threat.budget, 0);
});

/* ============================================================================
 * event-buffer
 * ==========================================================================*/

function makeSpawnRequested(seq: number): SpawnRequestedEvent {
  return {
    kind: 'spawnRequested',
    tick: seq,
    seq,
    phase: 'opening',
    intent: {
      archetypeId: 'enemy:fodder',
      count: 1,
      formation: 'cluster',
      minDistance: 0,
      maxDistance: 1,
      elite: false,
      boss: false,
    },
    cost: 1,
    delayed: false,
  };
}

function makeDefeat(seq: number): DirectorEvent {
  return { kind: 'defeat', tick: seq, seq, phase: 'opening' };
}

test('event buffer: critical event survives by evicting oldest non-critical', () => {
  const buf = createEventBuffer(3);

  assert.equal(buf.push(makeSpawnRequested(1)), true);
  assert.equal(buf.push(makeSpawnRequested(2)), true);
  assert.equal(buf.push(makeSpawnRequested(3)), true);
  assert.equal(buf.size, 3);
  assert.equal(buf.highWater, 3);

  // Buffer full: a 4th non-critical event is rejected outright.
  assert.equal(buf.push(makeSpawnRequested(4)), false);
  assert.equal(buf.overflowDropped, 1);
  assert.equal(buf.size, 3);

  // A critical event must survive, evicting the oldest non-critical entry.
  const defeat = makeDefeat(5);
  assert.equal(buf.push(defeat), true);
  assert.equal(buf.overflowDropped, 2);
  assert.equal(buf.size, 3);

  const drained = buf.drain();
  assert.equal(drained.length, 3);
  assert.ok(drained.includes(defeat), 'defeat event must survive overflow');
  // Oldest (seq 1) was evicted; seq 2 and 3 remain, in insertion order.
  assert.equal(drained[0]?.kind, 'spawnRequested');
  assert.equal((drained[0] as SpawnRequestedEvent).seq, 2);
  assert.equal(drained[2], defeat);

  // drain() clears size but preserves diagnostics.
  assert.equal(buf.size, 0);
  assert.equal(buf.overflowDropped, 2);
  assert.equal(buf.highWater, 3);
});

test('event buffer: throws on capacity < 1', () => {
  assert.throws(() => createEventBuffer(0));
  assert.throws(() => createEventBuffer(-1));
});

/* ============================================================================
 * spawn-scheduler
 * ==========================================================================*/

const FODDER: ArchetypeDefinition = {
  id: 'enemy:fodder',
  cost: 1,
  weight: 10,
  formation: 'cluster',
  count: 1,
  minDistance: 0,
  maxDistance: 5,
  elite: false,
  boss: false,
};

const RUNNER: ArchetypeDefinition = {
  id: 'enemy:runner',
  cost: 2,
  weight: 5,
  formation: 'lane',
  count: 1,
  minDistance: 0,
  maxDistance: 5,
  elite: false,
  boss: false,
};

const EMPTY_PHASE_ARCHETYPES: Record<RunPhaseId, readonly []> = {
  opening: [],
  pressure: [],
  adaptation: [],
  mutation: [],
  boss: [],
  overtime: [],
};

const BOSS_PROFILE = {
  id: 'test-apex-v1',
  hpMultiplier: 2,
  xpMultiplier: 1,
  speedMultiplier: 1,
  touchDamageMultiplier: 1,
  preferredRange: 200,
  rangeBand: 20,
  cycleTicks: 120,
  chargeWindupTicks: 12,
  chargeDurationTicks: 18,
  chargeSpeedMultiplier: 2,
  volleyTick: 60,
  volleyCount: 4,
  projectileSpeed: 160,
  projectileDamage: 5,
  projectileLifetimeTicks: 90,
  projectileHitRadius: 4,
} as const;

function makeDef(intervalTicks: number): RunDefinition {
  return {
    contentVersion: 1,
    mode: 'normal',
    durationTicks: 21_600,
    phases: [makePhase()],
    archetypes: [FODDER, RUNNER],
    eliteBeats: [],
    boss: {
      warningTick: 100,
      requestTick: 200,
      archetypeId: 'enemy:boss',
      formation: 'ring',
      minDistance: 10,
      maxDistance: 20,
      profile: BOSS_PROFILE,
    },
    threat: { initialBudget: 0, maxBudget: 1_000_000 },
    waves: {
      intervalTicks,
      phaseArchetypes: {
        ...EMPTY_PHASE_ARCHETYPES,
        opening: ['enemy:fodder', 'enemy:runner'],
      },
    },
    overtime: {
      supportIntervalTicks: 300,
      archetypeId: 'enemy:fodder',
      count: 1,
      formation: 'cluster',
      minDistance: 0,
      maxDistance: 5,
      maxSupportWaves: 10,
    },
    eventBufferCapacity: 64,
    defaultSeed: 0x1234,
  };
}

function makeState(overrides: Partial<DirectorState> = {}): DirectorState {
  return {
    version: 1,
    tick: -1,
    outcome: 'running',
    seq: 0,
    phase: 'opening',
    threat: { budget: 1_000, ticksSinceSpawn: 0 },
    spawn: { delayed: [], maxDelayed: 4, droppedWaves: 0 },
    boss: { warned: false, requested: false, alive: false, defeated: false },
    overtime: { active: false, startedTick: -1, nextSupportTick: -1, wavesEmitted: 0 },
    rng: createRng(0xabc123),
    firedBeats: [],
    firedWarnings: [],
    terminalEmitted: false,
    lastPhaseAnnounced: null,
    ...overrides,
  };
}

function makeMetrics(liveEnemies: number, tick = 0): RunMetrics {
  return {
    tick,
    paused: false,
    playerAlive: true,
    playerHp: 100,
    playerMaxHp: 100,
    playerLevel: 1,
    liveEnemies,
    killsTotal: 0,
    bossAlive: false,
    bossDefeatedThisTick: false,
  };
}

function makeDelayedWave(cost: number, enqueuedTick: number): DelayedWave {
  return {
    archetypeId: 'enemy:fodder',
    count: 1,
    formation: 'cluster',
    minDistance: 0,
    maxDistance: 5,
    elite: false,
    boss: false,
    cost,
    enqueuedTick,
    phase: 'opening',
  };
}

test('serviceSpawns: hardCap congestion releases nothing and leaves queue intact', () => {
  const def = makeDef(10);
  const phase = makePhase({ softCap: 5, hardCap: 8 });
  const state = makeState({
    spawn: { delayed: [makeDelayedWave(1, 0)], maxDelayed: 4, droppedWaves: 0 },
    threat: { budget: 1_000, ticksSinceSpawn: 999 },
  });
  const metrics = makeMetrics(8); // === hardCap

  const decisions = serviceSpawns(state, def, phase, metrics, 5);

  assert.deepEqual(decisions, []);
  assert.equal(state.spawn.delayed.length, 1, 'delayed queue must be untouched');
  assert.equal(state.threat.budget, 1_000, 'no spend while congested');
});

test('serviceSpawns: congested-then-cleared releases at most one delayed wave per tick', () => {
  const def = makeDef(10);
  const phase = makePhase({ softCap: 5, hardCap: 8 });
  const state = makeState({
    spawn: {
      delayed: [makeDelayedWave(1, 0), makeDelayedWave(1, 1), makeDelayedWave(1, 2)],
      maxDelayed: 4,
      droppedWaves: 0,
    },
    threat: { budget: 1_000, ticksSinceSpawn: 0 },
  });

  // Congested: hardCap reached, nothing released.
  let decisions = serviceSpawns(state, def, phase, makeMetrics(8), 1);
  assert.deepEqual(decisions, []);
  assert.equal(state.spawn.delayed.length, 3);

  // Cleared: liveEnemies now below softCap/hardCap. Drain one wave per call.
  decisions = serviceSpawns(state, def, phase, makeMetrics(1), 2);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.delayed, true);
  assert.equal(state.spawn.delayed.length, 2);

  decisions = serviceSpawns(state, def, phase, makeMetrics(1), 3);
  assert.equal(decisions.length, 1);
  assert.equal(state.spawn.delayed.length, 1);

  decisions = serviceSpawns(state, def, phase, makeMetrics(1), 4);
  assert.equal(decisions.length, 1);
  assert.equal(state.spawn.delayed.length, 0);
});

test('serviceSpawns: discretionary spawn respects intervalTicks', () => {
  const def = makeDef(10);
  const phase = makePhase({ softCap: 5, hardCap: 8 });
  const state = makeState({
    threat: { budget: 1_000, ticksSinceSpawn: 9 },
  });

  // Interval not yet elapsed: no discretionary decision, queue empty.
  let decisions = serviceSpawns(state, def, phase, makeMetrics(0), 1);
  assert.deepEqual(decisions, []);
  assert.equal(state.threat.ticksSinceSpawn, 9, 'unchanged when interval not elapsed');

  // Interval elapsed: discretionary decision fires exactly once.
  state.threat.ticksSinceSpawn = 10;
  decisions = serviceSpawns(state, def, phase, makeMetrics(0), 2);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.delayed, false);
  assert.equal(state.threat.ticksSinceSpawn, 0, 'reset after discretionary release');
});

test('serviceSpawns: no rng draw and no decision when no archetypes are eligible for the phase', () => {
  const def = makeDef(1);
  // Overwrite eligible archetypes for 'opening' to be empty.
  const emptyDef: RunDefinition = {
    ...def,
    waves: { ...def.waves, phaseArchetypes: { ...EMPTY_PHASE_ARCHETYPES } },
  };
  const phase = makePhase({ softCap: 5, hardCap: 8 });
  const state = makeState({ threat: { budget: 1_000, ticksSinceSpawn: 5 } });
  const rngBefore = state.rng;

  const decisions = serviceSpawns(state, emptyDef, phase, makeMetrics(0), 1);

  assert.deepEqual(decisions, []);
  assert.deepEqual(state.rng, rngBefore, 'rng must not advance without a genuine pick');
});
