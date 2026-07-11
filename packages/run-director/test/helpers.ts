/**
 * Shared test helpers (not a *.test.ts, so the node --test glob ignores it).
 * Provides deterministic, director-independent metrics streams so independent
 * runs are byte-reproducible.
 */
import type { DirectorEvent, RunMetrics } from '../src/index.js';
import { RunDirector } from '../src/index.js';
import { BOSS_ENTRANCE_TICK } from '../src/ids.js';

export interface WorldOptions {
  /** Tick at which the player dies (playerAlive=false from then on). -1 = never. */
  readonly deathTick?: number;
  /** Tick at which bossDefeatedThisTick is reported true (once). -1 = never. */
  readonly bossDefeatTick?: number;
  /** Constant liveEnemies override; if undefined uses an oscillating pattern. */
  readonly liveEnemies?: number;
}

/** A pure metrics function of tick — identical across independent runs. */
export function metricsAt(tick: number, opts: WorldOptions = {}): RunMetrics {
  const deathTick = opts.deathTick ?? -1;
  const bossDefeatTick = opts.bossDefeatTick ?? -1;
  const alive = deathTick < 0 || tick < deathTick;
  const live =
    opts.liveEnemies !== undefined ? opts.liveEnemies : (tick % 1200) < 600 ? 3 : 7;
  return {
    tick,
    paused: false,
    playerAlive: alive,
    playerHp: alive ? 100 : 0,
    playerMaxHp: 100,
    playerLevel: 1 + Math.floor(tick / 3600),
    liveEnemies: live,
    killsTotal: Math.floor(tick / 10),
    bossAlive: tick >= BOSS_ENTRANCE_TICK && (bossDefeatTick < 0 || tick < bossDefeatTick),
    bossDefeatedThisTick: bossDefeatTick >= 0 && tick === bossDefeatTick,
  };
}

/** Step a director every tick from `start` to `end` inclusive, collecting events. */
export function runEveryTick(
  director: RunDirector,
  start: number,
  end: number,
  opts: WorldOptions = {},
): DirectorEvent[] {
  const events: DirectorEvent[] = [];
  for (let t = start; t <= end; t++) {
    for (const e of director.step(metricsAt(t, opts))) events.push(e);
  }
  return events;
}

/** Step a director at an explicit list of ticks (catch-up), collecting events. */
export function runAtTicks(
  director: RunDirector,
  ticks: readonly number[],
  opts: WorldOptions = {},
): DirectorEvent[] {
  const events: DirectorEvent[] = [];
  for (const t of ticks) {
    for (const e of director.step(metricsAt(t, opts))) events.push(e);
  }
  return events;
}

/** Authored (non-discretionary) events: phase/elite/boss/terminal. */
export function authoredOnly(events: readonly DirectorEvent[]): DirectorEvent[] {
  return events.filter((e) => {
    if (e.kind === 'spawnRequested') return false;
    return true;
  });
}

export function countKind(events: readonly DirectorEvent[], kind: DirectorEvent['kind']): number {
  let n = 0;
  for (const e of events) if (e.kind === kind) n++;
  return n;
}
