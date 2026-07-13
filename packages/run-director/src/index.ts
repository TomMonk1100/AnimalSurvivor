/**
 * LEAD-OWNED — public entry point and per-tick orchestrator.
 *
 * RunDirector ties the frozen modules into one renderer-independent authority.
 * It owns no simulation physics, no pools, no combat, and no wall-clock time. It
 * consumes fixed-tick RunMetrics and emits deterministic DirectorEvents.
 *
 * Orchestration order within a single non-paused, non-terminal step at tick T
 * advancing from prevTick P (k = T - P >= 1):
 *   1. Interval processing over (P, T]: threat accrual per phase segment,
 *      phaseStarted events, authored one-shot beats (elite warnings/requests,
 *      boss warning/request), and (for explicit endless content only) bounded
 *      overtime support.
 *      All interval events are collected then emitted in chronological
 *      (tick, priority, id) order so sequence numbers are stable regardless of
 *      catch-up granularity.
 *   2. Outcome evaluation at T (defeat wins ties; victory only after the boss was
 *      requested). A terminal outcome emits exactly one victory/defeat event and
 *      suppresses discretionary spawns this tick and all events thereafter.
 *   3. Discretionary spawn scheduling at T (threat-budget + cap aware), only
 *      while still running.
 *
 * Determinism guarantees: seeded RNG only (no ambient randomness), no timers/clock, no
 * DOM/network/fs; identical (seed, definition, metrics stream) inputs produce
 * byte-identical serialized state, event streams, and hashes.
 */

import type {
  ArchetypeDefinition,
  DirectorEvent,
  DirectorState,
  RunDefinition,
  RunMetrics,
  SpawnIntent,
} from './contracts.js';
import type { EventKind, RunOutcome, RunPhaseId } from './ids.js';
import { getDefaultDefinition } from './definitions.js';
import { validateDefinition } from './validation.js';
import { createInitialState, cloneState, phaseAt } from './director-state.js';
import { accrueThreat } from './threat-budget.js';
import { serviceSpawns } from './spawn-scheduler.js';
import { resolveLiveEnemyCaps } from './level-pressure.js';
import { evaluateOutcome } from './objective-runtime.js';
import { createEventBuffer, type EventSink } from './event-buffer.js';
import { serializeState, deserializeState } from './serialization.js';
import { hashState, fingerprintDefinition } from './state-hash.js';

export interface RunDirectorOptions {
  /** Discretionary RNG seed. Defaults to definition.defaultSeed. */
  readonly seed?: number;
  /** Authored run definition. Defaults to the Greg first run. */
  readonly definition?: RunDefinition;
}

/**
 * Internal record for an event scheduled during interval processing. `make`
 * builds the concrete event (seq/phase are stamped at emit time) and may apply
 * chronological state side effects (e.g. flipping the boss.requested flag).
 */
interface PendingEmission {
  readonly tick: number;
  readonly prio: number;
  readonly tie: string;
  make(seq: number, phase: RunPhaseId): DirectorEvent;
}

/** Chronological priority buckets for same-tick ordering. */
const PRIO = {
  phaseStarted: 0,
  overtimeStarted: 1,
  warning: 2,
  request: 3,
  support: 4,
} as const;

export class RunDirector {
  private readonly def: RunDefinition;
  private state: DirectorState;
  private readonly buffer: EventSink;

  constructor(options: RunDirectorOptions = {}) {
    this.def = options.definition ?? getDefaultDefinition();
    validateDefinition(this.def);
    const seed = options.seed ?? this.def.defaultSeed;
    this.state = createInitialState(this.def, seed);
    this.buffer = createEventBuffer(this.def.eventBufferCapacity);
  }

  get outcome(): RunOutcome {
    return this.state.outcome;
  }

  get tick(): number {
    return this.state.tick;
  }

  get phase(): RunPhaseId {
    return this.state.phase;
  }

  /** Diagnostic: waves dropped because the delayed queue was full. */
  get droppedWaves(): number {
    return this.state.spawn.droppedWaves;
  }

  /** Diagnostic: current delayed-queue length. */
  get delayedCount(): number {
    return this.state.spawn.delayed.length;
  }

  /** Diagnostic: events dropped by event-buffer overflow. */
  get eventOverflow(): number {
    return this.buffer.overflowDropped;
  }

  /** Diagnostic: event-buffer high-water mark. */
  get eventHighWater(): number {
    return this.buffer.highWater;
  }

  /**
   * Advance the director to `metrics.tick`. Returns the events emitted this call
   * in chronological order. Pure with respect to wall-clock time.
   *
   * Tick policy: a repeated tick (metrics.tick === current tick) is an idempotent
   * no-op returning []. A backward tick throws. Skips advance by bounded
   * arithmetic catch-up without losing authored one-shot or terminal events.
   */
  step(metrics: RunMetrics): readonly DirectorEvent[] {
    // 1. Pause: never advance state, timers, budgets, RNG, or sequence.
    if (metrics.paused) return [];

    const T = metrics.tick;
    if (!Number.isInteger(T) || T < 0) {
      throw new RangeError(`step: metrics.tick must be a non-negative integer, got ${T}`);
    }

    const prev = this.state.tick;
    if (prev >= 0) {
      if (T === prev) return []; // idempotent repeated tick
      if (T < prev) {
        throw new RangeError(`step: backward tick ${T} < current ${prev}`);
      }
    }

    // 2. Terminal state suppresses all later events; only advance the tick cursor.
    if (this.state.outcome !== 'running') {
      this.state.tick = T;
      return [];
    }

    // 3. A finite normal run never processes an overtime tick. On a catch-up
    // call that crosses the deadline, still emit any authored events through
    // the final playable tick before resolving the terminal result at exactly
    // durationTicks.
    const normalDeadlineReached = this.def.mode === 'normal' && T >= this.def.durationTicks;
    const intervalEnd = normalDeadlineReached ? this.def.durationTicks - 1 : T;
    if (intervalEnd >= prev + 1) {
      this.processInterval(prev, intervalEnd, metrics);
    }

    // 4. Outcome evaluation at T. boss.requested is now accurate for this tick.
    // A boss killed on the exact deadline still wins; a missing kill signal at
    // or after the deadline is a normal-mode defeat instead of hidden overtime.
    const evaluation = evaluateOutcome(
      this.state,
      metrics,
      normalDeadlineReached ? this.def.durationTicks : null,
    );
    if (evaluation.terminalKind !== null && !this.state.terminalEmitted) {
      const terminalTick = normalDeadlineReached ? this.def.durationTicks : T;
      this.state.outcome = evaluation.outcome;
      if (evaluation.terminalKind === 'victory') {
        this.state.boss.alive = false;
        this.state.boss.defeated = true;
      }
      this.emitTerminal(evaluation.terminalKind, terminalTick);
      this.state.terminalEmitted = true;
      this.state.tick = T;
      this.state.phase = this.phaseAtTerminal(terminalTick);
      return this.buffer.drain();
    }

    // 5. Discretionary spawns at T (only while running). The authored boss
    // owns its exact entrance tick: a concurrent ordinary wave turns the
    // introduction into unreadable clutter and undercuts the warning beat.
    const phase = phaseAt(this.def, T);
    const decisions = T === this.def.boss.requestTick
      ? []
      : serviceSpawns(this.state, this.def, phase, metrics, T);
    for (const d of decisions) {
      const intent: SpawnIntent = {
        archetypeId: d.archetypeId,
        count: d.count,
        formation: d.formation,
        minDistance: d.minDistance,
        maxDistance: d.maxDistance,
        elite: d.elite,
        boss: d.boss,
      };
      this.push({
        kind: 'spawnRequested',
        tick: T,
        seq: this.state.seq++,
        phase: phase.id,
        intent,
        cost: d.cost,
        delayed: d.delayed,
      });
    }

    this.state.tick = T;
    this.state.phase = phase.id;
    return this.buffer.drain();
  }

  /** Stable versioned serialization of all gameplay-affecting state. */
  serialize(): string {
    return `{"version":1,"contentFingerprint":"${this.contentFingerprint()}","state":${serializeState(this.state)}}`;
  }

  /** Canonical hash of current gameplay state. */
  stateHash(): string {
    return hashState(this.state);
  }

  /** Canonical fingerprint of the (immutable) content definition. */
  contentFingerprint(): string {
    return fingerprintDefinition(this.def);
  }

  /** Restore a director from serialized state. Definition must match. */
  static deserialize(json: string, options: RunDirectorOptions = {}): RunDirector {
    const director = new RunDirector(options);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(`RunDirector.deserialize: invalid JSON (${(error as Error).message})`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('RunDirector.deserialize: save envelope must be an object');
    }
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== 1) {
      throw new Error('RunDirector.deserialize: unsupported save envelope version');
    }
    if (typeof envelope.contentFingerprint !== 'string' || !/^[0-9a-f]{8}$/.test(envelope.contentFingerprint)) {
      throw new Error('RunDirector.deserialize: invalid content fingerprint');
    }
    if (envelope.contentFingerprint !== director.contentFingerprint()) {
      throw new Error('RunDirector.deserialize: content fingerprint mismatch');
    }
    if (typeof envelope.state !== 'object' || envelope.state === null || Array.isArray(envelope.state)) {
      throw new Error('RunDirector.deserialize: missing director state');
    }
    director.state = deserializeState(JSON.stringify(envelope.state), director.def);
    return director;
  }

  /** Deep copy of internal state (diagnostics/testing). */
  snapshotState(): DirectorState {
    return cloneState(this.state);
  }

  // -------------------------------------------------------------------------

  private processInterval(prev: number, T: number, metrics: RunMetrics): void {
    const def = this.def;
    const state = this.state;
    const from = prev + 1; // first newly-entered tick
    const pending: PendingEmission[] = [];

    // (a) Threat accrual + phaseStarted, segment by segment (bounded by phase count).
    const announced = new Set<RunPhaseId>();
    let cursor = from;
    while (cursor <= T) {
      const phase = phaseAt(def, cursor);
      const segEnd = phase.endTick === Number.MAX_SAFE_INTEGER ? T : Math.min(T, phase.endTick);
      const segTicks = segEnd - cursor + 1;
      accrueThreat(state.threat, phase, def.threat, segTicks);

      if (state.lastPhaseAnnounced !== phase.id && !announced.has(phase.id)) {
        announced.add(phase.id);
        const emitTick = Math.max(phase.startTick, from);
        const pid = phase.id;
        pending.push({
          tick: emitTick,
          prio: PRIO.phaseStarted,
          tie: `phase:${pid}`,
          make: (seq, ph) => {
            state.lastPhaseAnnounced = pid;
            return { kind: 'phaseStarted', tick: emitTick, seq, phase: ph, phaseId: pid };
          },
        });
      }
      cursor = segEnd + 1;
    }

    // (b) Elite beats: warnings then requests whose trigger tick is in (prev, T].
    for (const beat of def.eliteBeats) {
      const warnKey = `warn:${beat.id}`;
      if (
        beat.warningTick >= from &&
        beat.warningTick <= T &&
        !state.firedWarnings.includes(warnKey)
      ) {
        const wt = beat.warningTick;
        const bid = beat.id;
        const rt = beat.requestTick;
        pending.push({
          tick: wt,
          prio: PRIO.warning,
          tie: `elitewarn:${bid}`,
          make: (seq, ph) => {
            insertSorted(state.firedWarnings, warnKey);
            return { kind: 'eliteWarning', tick: wt, seq, phase: ph, beatId: bid, requestTick: rt };
          },
        });
      }
      if (
        beat.requestTick >= from &&
        beat.requestTick <= T &&
        !state.firedBeats.includes(beat.id)
      ) {
        const rt = beat.requestTick;
        const bid = beat.id;
        const intent: SpawnIntent = {
          archetypeId: beat.archetypeId,
          count: beat.count,
          formation: beat.formation,
          minDistance: beat.minDistance,
          maxDistance: beat.maxDistance,
          elite: true,
          boss: false,
        };
        pending.push({
          tick: rt,
          prio: PRIO.request,
          tie: `elitereq:${bid}`,
          make: (seq, ph) => {
            insertSorted(state.firedBeats, bid);
            return { kind: 'eliteRequested', tick: rt, seq, phase: ph, beatId: bid, intent };
          },
        });
      }
    }

    // (c) Boss warning + request (each once, guarded by state flags).
    const boss = def.boss;
    if (
      boss.warningTick >= from &&
      boss.warningTick <= T &&
      !state.boss.warned &&
      !state.firedWarnings.includes('warn:boss')
    ) {
      const wt = boss.warningTick;
      const rt = boss.requestTick;
      pending.push({
        tick: wt,
        prio: PRIO.warning,
        tie: 'bosswarn',
        make: (seq, ph) => {
          state.boss.warned = true;
          insertSorted(state.firedWarnings, 'warn:boss');
          return { kind: 'bossWarning', tick: wt, seq, phase: ph, requestTick: rt };
        },
      });
    }
    if (boss.requestTick >= from && boss.requestTick <= T && !state.boss.requested) {
      const rt = boss.requestTick;
      const intent: SpawnIntent = {
        archetypeId: boss.archetypeId,
        count: 1,
        formation: boss.formation,
        minDistance: boss.minDistance,
        maxDistance: boss.maxDistance,
        elite: false,
        boss: true,
      };
      pending.push({
        tick: rt,
        prio: PRIO.request,
        tie: 'bossreq',
        make: (seq, ph) => {
          state.boss.requested = true;
          state.boss.alive = true;
          return { kind: 'bossRequested', tick: rt, seq, phase: ph, intent };
        },
      });
    }

    // (d) Endless-only overtime activation and bounded periodic support. A
    // normal definition never reaches this branch: its deadline is terminal.
    if (def.mode === 'endless') {
      const ot = def.overtime;
      if (ot === undefined) throw new Error('endless definition is missing overtime config');
      const willWinNow = state.boss.requested && metrics.bossDefeatedThisTick;
      if (
        !state.overtime.active &&
        T >= def.durationTicks &&
        state.boss.requested &&
        !state.boss.defeated &&
        !willWinNow
      ) {
        state.overtime.active = true;
        state.overtime.startedTick = def.durationTicks;
        state.overtime.nextSupportTick = def.durationTicks + ot.supportIntervalTicks;
        pending.push({
          tick: def.durationTicks,
          prio: PRIO.overtimeStarted,
          tie: 'overtime',
          make: (seq, ph) => ({ kind: 'overtimeStarted', tick: def.durationTicks, seq, phase: ph }),
        });
      }
      if (state.overtime.active) {
        const phaseHardCap = resolveLiveEnemyCaps(
          phaseAt(def, T),
          def.levelPressure,
          metrics.playerLevel,
        ).hardCap;
        while (
          state.overtime.nextSupportTick >= from &&
          state.overtime.nextSupportTick <= T &&
          state.overtime.wavesEmitted < ot.maxSupportWaves
        ) {
          const st = state.overtime.nextSupportTick;
          // Skip (but still advance the schedule) when congested — bounded, never bursts.
          if (metrics.liveEnemies < phaseHardCap) {
            state.overtime.wavesEmitted += 1;
            const intent: SpawnIntent = {
              archetypeId: ot.archetypeId,
              count: ot.count,
              formation: ot.formation,
              minDistance: ot.minDistance,
              maxDistance: ot.maxDistance,
              elite: false,
              boss: false,
            };
            pending.push({
              tick: st,
              prio: PRIO.support,
              tie: `otsupport:${st}`,
              make: (seq, ph) => ({
                kind: 'spawnRequested',
                tick: st,
                seq,
                phase: ph,
                intent,
                cost: 0,
                delayed: false,
              }),
            });
          }
          state.overtime.nextSupportTick += ot.supportIntervalTicks;
        }
      }
    }

    // (e) Emit all pending events in chronological (tick, prio, tie) order.
    pending.sort((a, b) => a.tick - b.tick || a.prio - b.prio || (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0));
    for (const p of pending) {
      const seq = this.state.seq++;
      const ph = phaseAt(def, p.tick).id;
      this.push(p.make(seq, ph));
    }
  }

  private emitTerminal(kind: 'victory' | 'defeat', tick: number): void {
    const phase = this.phaseAtTerminal(tick);
    const seq = this.state.seq++;
    if (kind === 'victory') {
      this.push({ kind: 'victory', tick, seq, phase });
    } else {
      this.push({ kind: 'defeat', tick, seq, phase });
    }
  }

  private phaseAtTerminal(tick: number): RunPhaseId {
    const phaseTick = this.def.mode === 'normal' && tick >= this.def.durationTicks
      ? this.def.durationTicks - 1
      : tick;
    return phaseAt(this.def, phaseTick).id;
  }

  private push(event: DirectorEvent): void {
    this.buffer.push(event);
  }
}

/** Insert a value into a sorted string array keeping it sorted + unique. */
function insertSorted(arr: string[], value: string): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const v = arr[mid] as string;
    if (v === value) return;
    if (v < value) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, value);
}

// Re-export the public contract surface and helpers for consumers.
export * from './contracts.js';
export * from './ids.js';
export { getDefaultDefinition, phaseDefFor, archetypeDef } from './definitions.js';
export { SALTWIND_RUINS_RUN } from './content/saltwind-ruins.js';
export { validateDefinition } from './validation.js';
export {
  resolveDiscretionaryWaveInterval,
  resolveLevelPressureSteps,
  resolveLiveEnemyCaps,
} from './level-pressure.js';
export { createInitialState, phaseAt, cloneState } from './director-state.js';
export { serializeState, deserializeState } from './serialization.js';
export { hashState, fingerprintDefinition } from './state-hash.js';
export { evaluateOutcome } from './objective-runtime.js';
export { createEventBuffer } from './event-buffer.js';
export type { EventSink } from './event-buffer.js';
export type { ArchetypeDefinition };
