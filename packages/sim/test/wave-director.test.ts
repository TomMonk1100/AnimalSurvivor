import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WaveSegment } from '../src/types.js';
import { createWaveDirector } from '../src/wave-director.js';
import { StubRng } from './helpers-c.js';

interface SpawnCall {
  archetype: number;
  hpMultiplier: number;
}

function recordingSpawnFn(calls: SpawnCall[], result = true): (archetype: number, hpMultiplier: number) => boolean {
  return (archetype, hpMultiplier) => {
    calls.push({ archetype, hpMultiplier });
    return result;
  };
}

test('spawns only on interval ticks within an active segment', () => {
  const waves: WaveSegment[] = [
    { startTick: 0, endTick: 100, spawnIntervalTicks: 10, archetypeWeights: [1], maxAlive: 100 },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([0, 0, 0]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls);

  director.step(0, rng, 0, spawnFn); // 0 % 10 === 0 -> spawn
  director.step(5, rng, 0, spawnFn); // not on interval -> no spawn
  director.step(10, rng, 0, spawnFn); // 10 % 10 === 0 -> spawn

  assert.equal(calls.length, 2);
  assert.equal(director.spawnAttempts, 2);
});

test('respects maxAlive: skips without consuming rng', () => {
  const waves: WaveSegment[] = [
    { startTick: 0, endTick: 100, spawnIntervalTicks: 10, archetypeWeights: [1], maxAlive: 5 },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([0]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls);

  director.step(0, rng, 5, spawnFn); // aliveEnemies (5) >= maxAlive (5) -> skip

  assert.equal(calls.length, 0);
  assert.equal(rng.pickWeightedCalls, 0, 'rng must not be consumed when skipping due to maxAlive');
  assert.equal(director.spawnAttempts, 0);
});

test('pool-full (spawnFn returns false) increments spawnRejections and does not throw', () => {
  const waves: WaveSegment[] = [
    { startTick: 0, endTick: 100, spawnIntervalTicks: 10, archetypeWeights: [1], maxAlive: 100 },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([0]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls, false);

  assert.doesNotThrow(() => director.step(0, rng, 0, spawnFn));

  assert.equal(calls.length, 1);
  assert.equal(director.spawnAttempts, 1);
  assert.equal(director.spawnRejections, 1);
});

test('elite fires exactly at its tick with its hpMultiplier, ignoring maxAlive', () => {
  const waves: WaveSegment[] = [
    {
      startTick: 0,
      endTick: 100,
      spawnIntervalTicks: 1000, // never fires a regular spawn in this window
      archetypeWeights: [1],
      maxAlive: 0, // pool "full" from the regular-spawn perspective
      elites: [{ tick: 50, archetype: 2, hpMultiplier: 5 }],
    },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls);

  director.step(49, rng, 0, spawnFn);
  assert.equal(calls.length, 0, 'elite must not fire before its tick');

  director.step(50, rng, 0, spawnFn);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { archetype: 2, hpMultiplier: 5 });

  director.step(51, rng, 0, spawnFn);
  assert.equal(calls.length, 1, 'elite must not fire again after its tick');
});

test('elite pool-full still respects spawnFn false -> spawnRejections, no throw', () => {
  const waves: WaveSegment[] = [
    {
      startTick: 0,
      endTick: 100,
      spawnIntervalTicks: 1000,
      archetypeWeights: [1],
      maxAlive: 0,
      elites: [{ tick: 10, archetype: 1, hpMultiplier: 3 }],
    },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls, false);

  assert.doesNotThrow(() => director.step(10, rng, 999, spawnFn));
  assert.equal(calls.length, 1);
  assert.equal(director.spawnRejections, 1);
});

test('elites fire after the regular spawn check on the same tick', () => {
  const waves: WaveSegment[] = [
    {
      startTick: 0,
      endTick: 100,
      spawnIntervalTicks: 10,
      archetypeWeights: [7],
      maxAlive: 100,
      elites: [{ tick: 0, archetype: 9, hpMultiplier: 2 }],
    },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([0]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls);

  director.step(0, rng, 0, spawnFn);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.archetype, 0, 'regular spawn (archetype index from rng) happens first');
  assert.equal(calls[1]!.archetype, 9, 'elite spawn happens after');
});

test('no active segment covering the tick -> no calls at all', () => {
  const waves: WaveSegment[] = [
    { startTick: 0, endTick: 100, spawnIntervalTicks: 1, archetypeWeights: [1], maxAlive: 100 },
    { startTick: 200, endTick: 300, spawnIntervalTicks: 1, archetypeWeights: [1], maxAlive: 100 },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([0]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls);

  director.step(150, rng, 0, spawnFn); // gap between segments

  assert.equal(calls.length, 0);
  assert.equal(director.spawnAttempts, 0);
});

test('weighted archetype selection uses the stubbed rng result as the archetype index', () => {
  const waves: WaveSegment[] = [
    { startTick: 0, endTick: 100, spawnIntervalTicks: 1, archetypeWeights: [1, 1, 1], maxAlive: 100 },
  ];
  const director = createWaveDirector(waves);
  const rng = new StubRng([2]);
  const calls: SpawnCall[] = [];
  const spawnFn = recordingSpawnFn(calls);

  director.step(0, rng, 0, spawnFn);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.archetype, 2);
  assert.deepEqual(rng.lastWeights, [1, 1, 1]);
});
