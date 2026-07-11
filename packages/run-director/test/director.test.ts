/**
 * Integration tests for the RunDirector orchestrator: phases, authored beats,
 * outcomes, pause, congestion, repeated-tick and catch-up policies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RunDirector } from '../src/index.js';
import { metricsAt, runEveryTick, runAtTicks, authoredOnly, countKind } from './helpers.js';

test('every required phase starts at its exact boundary, in order', () => {
  const d = new RunDirector({ seed: 1 });
  const events = runEveryTick(d, 0, 43_200);
  const starts = events
    .filter((e) => e.kind === 'phaseStarted')
    .map((e) => ({ id: (e as { phaseId: string }).phaseId, tick: e.tick }));
  assert.deepEqual(starts, [
    { id: 'opening', tick: 0 },
    { id: 'pressure', tick: 7_200 },
    { id: 'adaptation', tick: 18_000 },
    { id: 'mutation', tick: 28_800 },
    { id: 'boss', tick: 39_600 },
    { id: 'overtime', tick: 43_200 },
  ]);
});

test('three pre-boss elite beats fire exactly once at authored ticks', () => {
  const d = new RunDirector({ seed: 2 });
  const events = runEveryTick(d, 0, 39_600);
  const elites = events
    .filter((e) => e.kind === 'eliteRequested')
    .map((e) => ({ id: (e as { beatId: string }).beatId, tick: e.tick }));
  assert.deepEqual(elites, [
    { id: 'elite:pressure-1', tick: 12_000 },
    { id: 'elite:adaptation-1', tick: 24_000 },
    { id: 'elite:mutation-1', tick: 36_000 },
  ]);
});

test('each elite warning precedes its request in stable order', () => {
  const d = new RunDirector({ seed: 3 });
  const events = runEveryTick(d, 0, 39_600);
  for (const beatId of ['elite:pressure-1', 'elite:adaptation-1', 'elite:mutation-1']) {
    const warn = events.find((e) => e.kind === 'eliteWarning' && (e as { beatId: string }).beatId === beatId);
    const req = events.find((e) => e.kind === 'eliteRequested' && (e as { beatId: string }).beatId === beatId);
    assert.ok(warn && req, `both events for ${beatId}`);
    assert.ok(warn!.tick < req!.tick, 'warning tick before request tick');
    assert.ok(warn!.seq < req!.seq, 'warning seq before request seq');
  }
});

test('boss warning precedes boss request; request fires exactly once at 39,600', () => {
  const d = new RunDirector({ seed: 4 });
  const events = runEveryTick(d, 0, 43_200);
  const warn = events.find((e) => e.kind === 'bossWarning');
  const reqs = events.filter((e) => e.kind === 'bossRequested');
  assert.ok(warn, 'boss warning present');
  assert.equal(reqs.length, 1, 'exactly one boss request');
  assert.equal(reqs[0]!.tick, 39_600);
  assert.ok(warn!.tick < reqs[0]!.tick);
  assert.ok(warn!.seq < reqs[0]!.seq);
});

test('reaching tick 43,200 with a live boss enters overtime, not victory', () => {
  const d = new RunDirector({ seed: 5 });
  const events = runEveryTick(d, 0, 43_200); // no boss defeat ever
  assert.equal(countKind(events, 'overtimeStarted'), 1);
  assert.equal(countKind(events, 'victory'), 0);
  assert.equal(d.outcome, 'running');
  assert.equal(d.phase, 'overtime');
});

test('overtime support waves are bounded and never grow without limit', () => {
  const d = new RunDirector({ seed: 6 });
  runEveryTick(d, 0, 43_200);
  const events = runEveryTick(d, 43_201, 54_000);
  // Overtime support waves are the free (cost 0) spawnRequested events; normal
  // discretionary spawns (cost > 0) may also occur but are rate/cap limited.
  const support = events.filter(
    (e) => e.kind === 'spawnRequested' && (e as { cost: number }).cost === 0,
  );
  // maxSupportWaves is 40 in content; support must never exceed it.
  assert.ok(support.length <= 40, `support waves ${support.length} <= 40`);
  assert.equal(d.outcome, 'running');
});

test('valid boss defeat after request produces exactly one victory', () => {
  const d = new RunDirector({ seed: 7 });
  runEveryTick(d, 0, 40_000);
  const events = runAtTicks(d, [40_001], { bossDefeatTick: 40_001 });
  assert.equal(countKind(events, 'victory'), 1);
  assert.equal(d.outcome, 'victory');
  // Later inputs emit nothing and cannot change outcome.
  const after = d.step(metricsAt(40_500, { bossDefeatTick: -1 }));
  assert.equal(after.length, 0);
  assert.equal(d.outcome, 'victory');
});

test('premature boss-defeat signal cannot win', () => {
  const d = new RunDirector({ seed: 8 });
  const events = runAtTicks(d, [1_000], { bossDefeatTick: 1_000 });
  assert.equal(countKind(events, 'victory'), 0);
  assert.equal(d.outcome, 'running');
});

test('player death produces exactly one defeat event and is terminal', () => {
  const d = new RunDirector({ seed: 9 });
  const events = runEveryTick(d, 0, 6_000, { deathTick: 5_000 });
  assert.equal(countKind(events, 'defeat'), 1);
  assert.equal(d.outcome, 'defeat');
  const defeat = events.find((e) => e.kind === 'defeat')!;
  assert.equal(defeat.tick, 5_000);
});

test('same-tick death and boss defeat: defeat wins', () => {
  const d = new RunDirector({ seed: 10 });
  runEveryTick(d, 0, 40_000);
  const events = runAtTicks(d, [40_050], { deathTick: 40_050, bossDefeatTick: 40_050 });
  assert.equal(countKind(events, 'defeat'), 1);
  assert.equal(countKind(events, 'victory'), 0);
  assert.equal(d.outcome, 'defeat');
});

test('terminal state suppresses later spawns and phase events', () => {
  const d = new RunDirector({ seed: 11 });
  runEveryTick(d, 0, 5_000, { deathTick: 4_000 });
  // Cross the pressure boundary (7,200) after death — no phaseStarted should emit.
  const after = runEveryTick(d, 5_001, 8_000);
  assert.equal(after.length, 0);
  assert.equal(d.outcome, 'defeat');
});

test('pause emits nothing and leaves state/hash byte-identical', () => {
  const d = new RunDirector({ seed: 12 });
  runEveryTick(d, 0, 100);
  const hashBefore = d.stateHash();
  const serBefore = d.serialize();
  const tickBefore = d.tick;
  const out = d.step({
    tick: 200,
    paused: true,
    playerAlive: true,
    playerHp: 100,
    playerMaxHp: 100,
    playerLevel: 1,
    liveEnemies: 3,
    killsTotal: 0,
    bossAlive: false,
    bossDefeatedThisTick: false,
  });
  assert.equal(out.length, 0);
  assert.equal(d.stateHash(), hashBefore);
  assert.equal(d.serialize(), serBefore);
  assert.equal(d.tick, tickBefore);
});

test('repeated tick is an idempotent no-op; backward tick throws', () => {
  const d = new RunDirector({ seed: 13 });
  runEveryTick(d, 0, 100);
  const hash = d.stateHash();
  const again = d.step(metricsAt(100));
  assert.equal(again.length, 0);
  assert.equal(d.stateHash(), hash);
  assert.throws(() => d.step(metricsAt(50)), /backward tick/);
});

test('congestion respects hard cap: no spawns while over cap; delayed queue bounded', () => {
  const d = new RunDirector({ seed: 14 });
  // Flood liveEnemies far above any hard cap for a long stretch.
  const events = runEveryTick(d, 0, 10_000, { liveEnemies: 999 });
  const spawns = events.filter((e) => e.kind === 'spawnRequested');
  assert.equal(spawns.length, 0, 'no discretionary spawns while congested');
  assert.ok(d.delayedCount <= 64, 'delayed queue stays bounded');
});

test('delayed waves never release as an unbounded burst when congestion clears', () => {
  const d = new RunDirector({ seed: 15 });
  runEveryTick(d, 0, 6_000, { liveEnemies: 999 }); // build backlog in opening/pressure
  // Clear congestion; observe releases per tick.
  let maxPerTick = 0;
  for (let t = 6_001; t <= 6_200; t++) {
    const out = d.step(metricsAt(t, { liveEnemies: 0 }));
    const spawns = out.filter((e) => e.kind === 'spawnRequested');
    maxPerTick = Math.max(maxPerTick, spawns.length);
  }
  assert.ok(maxPerTick <= 1, `at most one delayed release per tick (saw ${maxPerTick})`);
});

test('tick-skip catch-up preserves authored one-shot events and ordering', () => {
  const fine = new RunDirector({ seed: 16 });
  const skip = new RunDirector({ seed: 16 });
  const fineEvents = authoredOnly(runEveryTick(fine, 0, 43_200));
  // Big skips that still straddle every authored boundary and beat.
  const ticks = [
    0, 7_200, 11_700, 12_000, 18_000, 23_700, 24_000, 28_800, 35_700, 36_000, 38_400,
    39_600, 43_200,
  ];
  const skipEvents = authoredOnly(runAtTicks(skip, ticks));
  const norm = (e: (typeof fineEvents)[number]) => `${e.kind}@${e.tick}`;
  assert.deepEqual(skipEvents.map(norm), fineEvents.map(norm));
});
