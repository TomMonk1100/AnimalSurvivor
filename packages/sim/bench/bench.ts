/**
 * Repeatable Node benchmark for the deterministic simulation core.
 *
 * This measures CPU cost of the simulation's step() loop in isolation,
 * BEFORE any rendering exists — it is not a rendering-performance claim, and
 * it intentionally prints no pass/fail verdict against a frame budget (the
 * eventual browser integration owns that decision). Run via:
 *   npm run bench   (equivalently: tsc && node dist/bench/bench.js)
 *
 * bench/ is allowed to use wall-clock/timer APIs for measurement; src/ is
 * not (see scripts/lint.mjs and the determinism contract in src/simulation.ts).
 */
import os from 'node:os';
import type { SimConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSimulation } from '../src/simulation.js';

const SEED = 0xc0ffee;
const WARMUP_TICKS = 2000;
const MEASURED_TICKS = 10_000;

const BENCH_CONFIG: SimConfig = {
  ...DEFAULT_CONFIG,
  enemyCap: 1200,
  projectileCap: 500,
  pickupCap: 200,
  // A huge maxHp is a benchmark-only tuning knob, not a gameplay claim: with
  // DEFAULT_CONFIG's player HP, a swarm of ~1000 enemies kills the player in
  // a few hundred ticks (contact damage lands roughly every invulnTicksOnHit
  // ticks regardless of swarm size, since only one enemy can land a hit per
  // window — see src/simulation.ts's stepEnemies usage). Once dead, the
  // weapon stops firing entirely (see step 8's `player.alive` gate) and the
  // benchmark degenerates into "enemies idle next to a corpse" for the rest
  // of the run — which under-measures real per-tick cost by skipping
  // targeting/projectile/kill/pickup work for most of the window. Keeping
  // the player alive for the whole run keeps every system under load.
  player: { ...DEFAULT_CONFIG.player, maxHp: 1e7 },
  waves: [
    {
      startTick: 0,
      endTick: 2147483647, // 2^31 - 1
      spawnIntervalTicks: 1,
      // Keep one weight per authored archetype; the first three retain the
      // original swarm emphasis while the remaining roles stay represented
      // without turning this CPU benchmark into a balance claim.
      archetypeWeights: [5, 3, 2, 1, 1, 1, 1, 1],
      maxAlive: 1000,
    },
  ],
};

function inputAt(tick: number): { moveX: number; moveY: number; paused: boolean } {
  return { moveX: Math.cos(tick * 0.01), moveY: Math.sin(tick * 0.013), paused: false };
}

function percentile(sortedAsc: Float64Array, p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.floor(p * n)));
  return sortedAsc[idx]!;
}

function main(): void {
  const sim = createSimulation(BENCH_CONFIG, SEED);

  // ---- warmup: also lets the enemy population reach rough steady state ----
  for (let t = 0; t < WARMUP_TICKS; t++) {
    sim.step(inputAt(t));
  }

  const liveEnemiesAtStart = sim.enemies.data.count;

  // ---- measured phase ----
  const tickNanos = new Float64Array(MEASURED_TICKS);

  let enemiesSpawnedTotal = 0;
  let killsTotal = 0;
  let projectilesFiredTotal = 0;
  let pickupsCollectedTotal = 0;

  const heapUsedBefore = process.memoryUsage().heapUsed;
  const wallStart = process.hrtime.bigint();

  for (let i = 0; i < MEASURED_TICKS; i++) {
    const tick = WARMUP_TICKS + i;
    const t0 = process.hrtime.bigint();
    const events = sim.step(inputAt(tick));
    const t1 = process.hrtime.bigint();
    tickNanos[i] = Number(t1 - t0);

    enemiesSpawnedTotal += events.enemiesSpawned;
    killsTotal += events.kills;
    projectilesFiredTotal += events.projectilesFired;
    pickupsCollectedTotal += events.pickupsCollected;
  }

  const wallEnd = process.hrtime.bigint();
  const heapUsedAfter = process.memoryUsage().heapUsed;

  const liveEnemiesAtEnd = sim.enemies.data.count;
  const finalHash = sim.hash();

  // ---- derive stats ----
  const sorted = Float64Array.from(tickNanos).sort();
  const totalNanos = sorted.reduce((a, b) => a + b, 0);
  const meanNs = totalNanos / MEASURED_TICKS;
  const medianNs = percentile(sorted, 0.5);
  const p95Ns = percentile(sorted, 0.95);
  const p99Ns = percentile(sorted, 0.99);
  const worstNs = sorted[sorted.length - 1]!;

  const ns2us = (ns: number): number => ns / 1000;
  const wallNanos = Number(wallEnd - wallStart);
  const wallSeconds = wallNanos / 1e9;
  const ticksPerSecond = MEASURED_TICKS / wallSeconds;

  const cpuModel = os.cpus()[0]?.model ?? 'unknown';

  console.log('=== @animalsurvivor/sim benchmark ===');
  console.log(
    `node ${process.version} | ${process.platform}/${process.arch} | cpu: ${cpuModel}`,
  );
  console.log(`warmup ticks: ${WARMUP_TICKS}, measured ticks: ${MEASURED_TICKS}`);
  console.log(`live enemies at measurement start: ${liveEnemiesAtStart}`);
  console.log(`live enemies at measurement end:   ${liveEnemiesAtEnd}`);
  console.log('--- per-tick time (microseconds) ---');
  console.log(`mean:   ${ns2us(meanNs).toFixed(2)} us`);
  console.log(`median: ${ns2us(medianNs).toFixed(2)} us`);
  console.log(`p95:    ${ns2us(p95Ns).toFixed(2)} us`);
  console.log(`p99:    ${ns2us(p99Ns).toFixed(2)} us`);
  console.log(`worst:  ${ns2us(worstNs).toFixed(2)} us`);
  console.log('--- throughput ---');
  console.log(`total wall time: ${wallSeconds.toFixed(3)} s`);
  console.log(`ticks/second:    ${ticksPerSecond.toFixed(1)}`);
  console.log('--- spawn/despawn totals (measured phase) ---');
  console.log(`enemiesSpawned:    ${enemiesSpawnedTotal}`);
  console.log(`kills (despawned): ${killsTotal}`);
  console.log(`projectilesFired:  ${projectilesFiredTotal}`);
  console.log(`pickupsCollected:  ${pickupsCollectedTotal}`);
  console.log('--- wave director diagnostics (cumulative since tick 0) ---');
  console.log(`spawnAttempts:   ${sim.waveDirector.spawnAttempts}`);
  console.log(`spawnRejections: ${sim.waveDirector.spawnRejections}`);
  console.log(`xpLostToFullPickupPool: ${sim.xpLostToFullPickupPool}`);
  console.log('--- pool high-water marks ---');
  console.log(`enemies:     ${sim.enemies.data.highWater} / ${sim.enemies.data.capacity}`);
  console.log(`projectiles: ${sim.projectiles.data.highWater} / ${sim.projectiles.data.capacity}`);
  console.log(`pickups:     ${sim.pickups.data.highWater} / ${sim.pickups.data.capacity}`);
  console.log('--- grid ---');
  console.log(`queryCount: ${sim.grid.queryCount}`);
  console.log('--- allocation signal (rough; not a precise GC measurement) ---');
  console.log(`heapUsed before: ${(heapUsedBefore / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`heapUsed after:  ${(heapUsedAfter / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`heapUsed delta:  ${((heapUsedAfter - heapUsedBefore) / 1024 / 1024).toFixed(2)} MiB`);
  console.log('--- determinism ---');
  console.log(`final tick: ${sim.tick}`);
  console.log(`final hash: ${finalHash}`);

  if (worstNs > 20 * medianNs) {
    console.log(
      `WARNING: worst tick (${ns2us(worstNs).toFixed(2)} us) is more than 20x the median ` +
        `(${ns2us(medianNs).toFixed(2)} us) — likely a GC pause or other spike outlier.`,
    );
  }

  process.exit(0);
}

main();
