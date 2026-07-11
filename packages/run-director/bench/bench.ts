/**
 * Diagnostic Node benchmark for the run director. NOT a hardware-universal
 * performance gate — it reports update-time distribution and aggregate counts,
 * and asserts cross-run determinism (two independent runs => identical hash).
 *
 * bench/ is exempt from the timer lint rule; it measures wall time by design.
 */
import { RunDirector, type DirectorEvent, type RunMetrics } from '../src/index.js';

/** Pure director-independent metrics stream (see test/helpers.ts). */
function metricsAt(
  tick: number,
  opts: { liveEnemies?: number; bossDefeatTick?: number } = {},
): RunMetrics {
  const bd = opts.bossDefeatTick ?? -1;
  const live = opts.liveEnemies !== undefined ? opts.liveEnemies : (tick % 1200) < 600 ? 3 : 7;
  return {
    tick,
    paused: false,
    playerAlive: true,
    playerHp: 100,
    playerMaxHp: 100,
    playerLevel: 1 + Math.floor(tick / 3600),
    liveEnemies: live,
    killsTotal: Math.floor(tick / 10),
    bossAlive: tick >= 39_600 && (bd < 0 || tick < bd),
    bossDefeatedThisTick: bd >= 0 && tick === bd,
  };
}

interface RunResult {
  readonly updateTimesMs: number[];
  readonly eventsByKind: Record<string, number>;
  readonly requestedByArchetype: Record<string, number>;
  readonly delayedReleased: number;
  readonly droppedWaves: number;
  readonly eventBufferHighWater: number;
  readonly eventOverflow: number;
  readonly finalHash: string;
  readonly finalOutcome: string;
}

function tally(
  events: readonly DirectorEvent[],
  eventsByKind: Record<string, number>,
  requestedByArchetype: Record<string, number>,
): number {
  let delayedReleased = 0;
  for (const e of events) {
    eventsByKind[e.kind] = (eventsByKind[e.kind] ?? 0) + 1;
    if (e.kind === 'spawnRequested') {
      const a = e.intent.archetypeId;
      requestedByArchetype[a] = (requestedByArchetype[a] ?? 0) + e.intent.count;
      if (e.delayed) delayedReleased++;
    } else if (e.kind === 'eliteRequested' || e.kind === 'bossRequested') {
      const a = e.intent.archetypeId;
      requestedByArchetype[a] = (requestedByArchetype[a] ?? 0) + e.intent.count;
    }
  }
  return delayedReleased;
}

function runScenario(
  label: string,
  seed: number,
  startTick: number,
  endTick: number,
  liveEnemies: number | undefined,
  bossDefeatTick: number,
  serializeEvery: number,
): RunResult {
  const d = new RunDirector({ seed });
  const eventsByKind: Record<string, number> = {};
  const requestedByArchetype: Record<string, number> = {};
  const updateTimesMs: number[] = [];
  let delayedReleased = 0;

  const baseOpts: { liveEnemies?: number; bossDefeatTick?: number } = { bossDefeatTick };
  if (liveEnemies !== undefined) baseOpts.liveEnemies = liveEnemies;

  for (let t = startTick; t <= endTick; t++) {
    const m = metricsAt(t, baseOpts);
    const start = performance.now();
    const out = d.step(m);
    updateTimesMs.push(performance.now() - start);
    delayedReleased += tally(out, eventsByKind, requestedByArchetype);
    if (serializeEvery > 0 && t % serializeEvery === 0) {
      const s = d.serialize();
      d.stateHash();
      // Cheap sanity: serialized string is non-empty.
      if (s.length === 0) throw new Error('empty serialization');
    }
  }

  void label;
  return {
    updateTimesMs,
    eventsByKind,
    requestedByArchetype,
    delayedReleased,
    droppedWaves: d.droppedWaves,
    eventBufferHighWater: d.eventHighWater,
    eventOverflow: d.eventOverflow,
    finalHash: d.stateHash(),
    finalOutcome: d.outcome,
  };
}

function stats(xs: number[]): { mean: number; median: number; p95: number; p99: number; worst: number } {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  return { mean, median: at(0.5), p95: at(0.95), p99: at(0.99), worst: s[s.length - 1] ?? 0 };
}

function fmt(n: number): string {
  return n.toFixed(4);
}

function report(name: string, r: RunResult): void {
  const st = stats(r.updateTimesMs);
  console.log(`\n=== ${name} ===`);
  console.log(`  updates:            ${r.updateTimesMs.length}`);
  console.log(`  final outcome:      ${r.finalOutcome}`);
  console.log(
    `  update ms  mean=${fmt(st.mean)} median=${fmt(st.median)} p95=${fmt(st.p95)} p99=${fmt(st.p99)} worst=${fmt(st.worst)}`,
  );
  console.log(`  events by kind:     ${JSON.stringify(r.eventsByKind)}`);
  console.log(`  requested by arch:  ${JSON.stringify(r.requestedByArchetype)}`);
  console.log(`  delayed released:   ${r.delayedReleased}`);
  console.log(`  dropped waves:      ${r.droppedWaves}`);
  console.log(`  event high-water:   ${r.eventBufferHighWater}`);
  console.log(`  event overflow:     ${r.eventOverflow}`);
  console.log(`  final hash:         ${r.finalHash}`);
}

function main(): void {
  console.log('run-director benchmark (diagnostic, not a hardware gate)');

  // 1. One complete 43,200-tick run.
  const full = runScenario('full', 2024, 0, 43_200, undefined, -1, 3_600);
  report('full 43,200-tick run', full);

  // 2. Congested / high-live-enemy scenario.
  const congested = runScenario('congested', 2024, 0, 20_000, 999, -1, 2_000);
  report('congested (liveEnemies=999)', congested);

  // 3. Overtime scenario extending to at least tick 54,000.
  const overtime = runScenario('overtime', 2024, 0, 54_000, undefined, -1, 6_000);
  report('overtime to 54,000', overtime);

  // 4. Determinism assertion: two independent identical runs => identical hash.
  const a = runScenario('detA', 777, 0, 43_200, undefined, -1, 0);
  const b = runScenario('detB', 777, 0, 43_200, undefined, -1, 0);
  console.log('\n=== determinism check ===');
  console.log(`  hash A: ${a.finalHash}`);
  console.log(`  hash B: ${b.finalHash}`);
  if (a.finalHash !== b.finalHash) {
    console.error('DETERMINISM FAILURE: hashes differ');
    process.exit(1);
  }
  console.log('  OK: two independent identical runs produced equal final hashes.');
}

main();
