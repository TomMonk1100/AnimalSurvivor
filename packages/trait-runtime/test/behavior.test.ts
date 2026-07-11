import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeContext } from '../src/contracts.js';
import { TraitRuntime } from '../src/index.js';

function ctx(tick: number): RuntimeContext {
  return { tick, playerX: 0, playerY: 0, moveDirX: 0, moveDirY: 0, distanceMovedThisTick: 0 };
}

function toThornstorm(): TraitRuntime {
  const rt = new TraitRuntime({ seed: 7 });
  rt.applyUpgrade('porcupine-quills');
  rt.applyUpgrade('porcupine-quills');
  rt.applyUpgrade('puffer-pouch');
  rt.applyUpgrade('puffer-pouch');
  return rt;
}

/** Collect (tick, sourceId, kind) emissions over [0, ticks). */
function run(rt: TraitRuntime, ticks: number): Array<[number, string, string]> {
  const out: Array<[number, string, string]> = [];
  for (let t = 0; t < ticks; t++) {
    const buf = rt.update(ctx(t));
    for (let i = 0; i < buf.length; i++) {
      const c = buf.at(i);
      out.push([t, c.sourceId, c.kind]);
    }
  }
  return out;
}

test('Thornstorm emits exact phase order telegraph -> gather -> radial exhale', () => {
  const rt = toThornstorm();
  const emissions = run(rt, 91).filter((e) => e[1] === 'thornstorm-mantle');
  const kinds = emissions.map((e) => e[2]);
  // One full cycle then the start of the next.
  assert.deepEqual(kinds.slice(0, 4), [
    'telegraph',
    'areaGather',
    'radialProjectileBurst',
    'telegraph',
  ]);
});

test('Thornstorm replaces both independent ingredient loops (only the mythic fires)', () => {
  const rt = toThornstorm();
  const emissions = run(rt, 200);
  const sources = new Set(emissions.map((e) => e[1]));
  assert.deepEqual([...sources], ['thornstorm-mantle']);
  assert.ok(!sources.has('porcupine-quills'));
  assert.ok(!sources.has('puffer-pouch'));
});

test('long sequential tick run does not double-fire or skip phases', () => {
  const rt = toThornstorm();
  const TICKS = 9000; // exactly 100 full 90-tick cycles
  const emissions = run(rt, TICKS).filter((e) => e[1] === 'thornstorm-mantle');
  // Cycle length is 90 ticks: telegraph@0, gather@20, radial@35.
  for (const [tick, , kind] of emissions) {
    const phase = tick % 90;
    const expected =
      phase === 0 ? 'telegraph' : phase === 20 ? 'areaGather' : 'radialProjectileBurst';
    assert.equal(kind, expected, `tick ${tick}`);
    assert.ok(phase === 0 || phase === 20 || phase === 35, `unexpected emit tick ${tick}`);
  }
  // Exactly 3 emissions per 90-tick cycle, no doubles.
  const cycles = TICKS / 90;
  assert.equal(emissions.length, cycles * 3);
});

test('a single bud trait fires its periodic burst deterministically', () => {
  const rt = new TraitRuntime({ seed: 1 });
  rt.applyUpgrade('porcupine-quills'); // bud, periodTicks 90
  const emissions = run(rt, 271).filter((e) => e[1] === 'porcupine-quills');
  // Fires at ticks 0, 90, 180, 270 (fires on first processed tick then each period).
  assert.deepEqual(emissions.map((e) => e[0]), [0, 90, 180, 270]);
  assert.ok(emissions.every((e) => e[2] === 'spawnProjectileBurst'));
});
