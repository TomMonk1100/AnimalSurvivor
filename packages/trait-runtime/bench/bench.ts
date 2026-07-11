/**
 * LEAD-OWNED benchmark. Repeatable Node microbenchmark for the trait runtime.
 *
 * Scenario: three resolved Mythics active (six ingredient traits taken to
 * Adapted, then evolved), 18,000 fixed ticks, exercising the command buffer and
 * a visual-state read each tick. Reports mean/median/p95/p99/worst tick time,
 * command totals by kind, an allocation/heap signal, and the final canonical
 * hash (also printed by a second `--hash-only` process for cross-process
 * evidence).
 *
 * NOTE: wall-clock timings here are hardware-dependent and are NOT a pass/fail
 * threshold. Only the final hash is asserted to be reproducible.
 */

import { performance } from 'node:perf_hooks';
import type { CommandKind, RuntimeContext } from '../src/contracts.js';
import { COMMAND_KINDS } from '../src/contracts.js';
import { TraitRuntime } from '../src/index.js';

const TICKS = 18_000;

function buildThreeMythics(seed: number): TraitRuntime {
  const rt = new TraitRuntime({ seed, commandCapacity: 4096 });
  const pairs: string[] = [
    'porcupine-quills',
    'puffer-pouch',
    'electric-eel-coil',
    'firefly-colony',
    'mantis-scythes',
    'gecko-pads',
  ];
  for (const id of pairs) {
    rt.applyUpgrade(id);
    rt.applyUpgrade(id);
  }
  return rt;
}

function ctx(tick: number): RuntimeContext {
  return {
    tick,
    playerX: (tick * 3) % 256,
    playerY: (tick * 5) % 256,
    moveDirX: 1,
    moveDirY: 0,
    distanceMovedThisTick: 1,
  };
}

function runHashOnly(): void {
  const rt = buildThreeMythics(0xc0ffee);
  for (let t = 0; t < TICKS; t++) rt.update(ctx(t));
  process.stdout.write(rt.hash() + '\n');
}

function percentile(sorted: Float64Array, p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function main(): void {
  if (process.argv.includes('--hash-only')) {
    runHashOnly();
    return;
  }

  const rt = buildThreeMythics(0xc0ffee);
  assertMythics(rt);

  const timings = new Float64Array(TICKS);
  const totals: Record<CommandKind, number> = blankCounts();
  let commandTotal = 0;

  if (typeof global.gc === 'function') global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let t = 0; t < TICKS; t++) {
    const start = performance.now();
    const buf = rt.update(ctx(t));
    // Consume a visual-state read each tick as the renderer would.
    const vis = rt.visualState();
    if (vis.length < 0) throw new Error('unreachable');
    const end = performance.now();
    timings[t] = end - start;

    for (let i = 0; i < buf.length; i++) {
      totals[buf.at(i).kind]++;
      commandTotal++;
    }
  }

  const heapAfter = process.memoryUsage().heapUsed;
  const sorted = Float64Array.from(timings).sort();
  let sum = 0;
  for (const v of timings) sum += v;

  const finalHash = rt.hash();

  console.log('=== trait-runtime benchmark ===');
  console.log(`ticks:            ${TICKS}`);
  console.log(`active mythics:   ${rt.getState().evolutions.length}`);
  console.log(`commands emitted: ${commandTotal}`);
  console.log(`buffer overflow:  ${rt.commands().overflowCount}`);
  console.log('--- per-tick time (ms) ---');
  console.log(`mean:   ${(sum / TICKS).toFixed(6)}`);
  console.log(`median: ${percentile(sorted, 50).toFixed(6)}`);
  console.log(`p95:    ${percentile(sorted, 95).toFixed(6)}`);
  console.log(`p99:    ${percentile(sorted, 99).toFixed(6)}`);
  console.log(`worst:  ${sorted[sorted.length - 1]!.toFixed(6)}`);
  console.log('--- commands by kind ---');
  for (const k of COMMAND_KINDS) console.log(`${k.padEnd(22)} ${totals[k]}`);
  console.log('--- allocation signal ---');
  console.log(`heap delta bytes: ${heapAfter - heapBefore}`);
  console.log(`gc available:     ${typeof global.gc === 'function'}`);
  console.log('--- reproducibility ---');
  console.log(`final hash: ${finalHash}`);
  console.log('(run `node dist/bench/bench.js --hash-only` in a fresh process to compare)');
}

function blankCounts(): Record<CommandKind, number> {
  const r = {} as Record<CommandKind, number>;
  for (const k of COMMAND_KINDS) r[k] = 0;
  return r;
}

function assertMythics(rt: TraitRuntime): void {
  const n = rt.getState().evolutions.length;
  if (n !== 3) throw new Error(`expected 3 resolved mythics, got ${n}`);
}

main();
