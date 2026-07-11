/**
 * AGENT C — OWNED.
 *
 * Stable, versioned JSON (de)serialization of DirectorState. serializeState
 * writes fields in a fixed, explicit key order (never relying on input key
 * iteration order) so byte-identical output is guaranteed for equal states.
 * deserializeState is strict: it validates shape, value ranges, enum
 * membership, and semantic consistency (phase/tick agreement, forged
 * terminal/boss/overtime combinations) before rebuilding a fresh
 * DirectorState. Any violation throws.
 */

import type {
  ArchetypeId,
  Formation,
  RunOutcome,
  RunPhaseId,
} from './ids.js';
import { ARCHETYPE_IDS, FORMATIONS, RUN_PHASE_ORDER, STATE_VERSION } from './ids.js';
import type { DelayedWave, DirectorState, RunDefinition } from './contracts.js';
import { phaseAt } from './director-state.js';

/* ============================================================================
 * Serialize
 * ==========================================================================*/

interface SerializedDelayedWave {
  readonly archetypeId: ArchetypeId;
  readonly count: number;
  readonly formation: Formation;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
  readonly cost: number;
  readonly enqueuedTick: number;
  readonly phase: RunPhaseId;
}

interface SerializedState {
  readonly version: number;
  readonly tick: number;
  readonly outcome: RunOutcome;
  readonly seq: number;
  readonly phase: RunPhaseId;
  readonly threat: { readonly budget: number; readonly ticksSinceSpawn: number };
  readonly spawn: {
    readonly delayed: readonly SerializedDelayedWave[];
    readonly maxDelayed: number;
    readonly droppedWaves: number;
  };
  readonly boss: {
    readonly warned: boolean;
    readonly requested: boolean;
    readonly alive: boolean;
    readonly defeated: boolean;
  };
  readonly overtime: {
    readonly active: boolean;
    readonly startedTick: number;
    readonly nextSupportTick: number;
    readonly wavesEmitted: number;
  };
  readonly rng: { readonly s: readonly [number, number, number, number] };
  readonly firedBeats: readonly string[];
  readonly firedWarnings: readonly string[];
  readonly terminalEmitted: boolean;
  readonly lastPhaseAnnounced: RunPhaseId | null;
}

function assertFiniteInt(n: number, label: string): void {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`serializeState: ${label} must be a finite integer, got ${String(n)}`);
  }
}

/**
 * Serialize `state` to a stable, versioned JSON string. Field order is
 * explicit and fixed. firedBeats/firedWarnings are (re-)sorted defensively.
 * Throws if any numeric field is not a finite integer.
 */
export function serializeState(state: DirectorState): string {
  assertFiniteInt(state.tick, 'tick');
  assertFiniteInt(state.seq, 'seq');
  assertFiniteInt(state.threat.budget, 'threat.budget');
  assertFiniteInt(state.threat.ticksSinceSpawn, 'threat.ticksSinceSpawn');
  assertFiniteInt(state.spawn.maxDelayed, 'spawn.maxDelayed');
  assertFiniteInt(state.spawn.droppedWaves, 'spawn.droppedWaves');
  assertFiniteInt(state.overtime.startedTick, 'overtime.startedTick');
  assertFiniteInt(state.overtime.nextSupportTick, 'overtime.nextSupportTick');
  assertFiniteInt(state.overtime.wavesEmitted, 'overtime.wavesEmitted');
  state.spawn.delayed.forEach((w, i) => {
    assertFiniteInt(w.count, `spawn.delayed[${i}].count`);
    assertFiniteInt(w.minDistance, `spawn.delayed[${i}].minDistance`);
    assertFiniteInt(w.maxDistance, `spawn.delayed[${i}].maxDistance`);
    assertFiniteInt(w.cost, `spawn.delayed[${i}].cost`);
    assertFiniteInt(w.enqueuedTick, `spawn.delayed[${i}].enqueuedTick`);
  });
  state.rng.s.forEach((word, i) => assertFiniteInt(word, `rng.s[${i}]`));

  const rngWords = state.rng.s;

  const serialized: SerializedState = {
    version: state.version,
    tick: state.tick,
    outcome: state.outcome,
    seq: state.seq,
    phase: state.phase,
    threat: {
      budget: state.threat.budget,
      ticksSinceSpawn: state.threat.ticksSinceSpawn,
    },
    spawn: {
      delayed: state.spawn.delayed.map((w) => ({
        archetypeId: w.archetypeId,
        count: w.count,
        formation: w.formation,
        minDistance: w.minDistance,
        maxDistance: w.maxDistance,
        elite: w.elite,
        boss: w.boss,
        cost: w.cost,
        enqueuedTick: w.enqueuedTick,
        phase: w.phase,
      })),
      maxDelayed: state.spawn.maxDelayed,
      droppedWaves: state.spawn.droppedWaves,
    },
    boss: {
      warned: state.boss.warned,
      requested: state.boss.requested,
      alive: state.boss.alive,
      defeated: state.boss.defeated,
    },
    overtime: {
      active: state.overtime.active,
      startedTick: state.overtime.startedTick,
      nextSupportTick: state.overtime.nextSupportTick,
      wavesEmitted: state.overtime.wavesEmitted,
    },
    rng: { s: [rngWords[0], rngWords[1], rngWords[2], rngWords[3]] },
    firedBeats: [...state.firedBeats].sort(),
    firedWarnings: [...state.firedWarnings].sort(),
    terminalEmitted: state.terminalEmitted,
    lastPhaseAnnounced: state.lastPhaseAnnounced,
  };

  return JSON.stringify(serialized);
}

/* ============================================================================
 * Deserialize
 * ==========================================================================*/

function fail(msg: string): never {
  throw new Error(`deserializeState: ${msg}`);
}

function expectPlainObject(v: unknown, label: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    fail(`${label} must be an object`);
  }
  return v as Record<string, unknown>;
}

function expectFiniteInt(v: unknown, label: string, min?: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    fail(`${label} must be a finite integer`);
  }
  if (min !== undefined && v < min) {
    fail(`${label} must be >= ${min}`);
  }
  return v;
}

function expectUint32(v: unknown, label: string): number {
  const n = expectFiniteInt(v, label, 0);
  if (n > 0xffffffff) {
    fail(`${label} must be a uint32`);
  }
  return n;
}

function expectBoolean(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') {
    fail(`${label} must be a boolean`);
  }
  return v;
}

function expectRunOutcome(v: unknown, label: string): RunOutcome {
  if (v !== 'running' && v !== 'victory' && v !== 'defeat') {
    fail(`${label} must be one of 'running' | 'victory' | 'defeat'`);
  }
  return v;
}

function expectRunPhaseId(v: unknown, label: string): RunPhaseId {
  if (typeof v !== 'string' || !(RUN_PHASE_ORDER as readonly string[]).includes(v)) {
    fail(`${label} must be a valid RunPhaseId`);
  }
  return v as RunPhaseId;
}

function expectArchetypeId(v: unknown, label: string): ArchetypeId {
  if (typeof v !== 'string' || !(ARCHETYPE_IDS as readonly string[]).includes(v)) {
    fail(`${label} must be a valid ArchetypeId`);
  }
  return v as ArchetypeId;
}

function expectFormation(v: unknown, label: string): Formation {
  if (typeof v !== 'string' || !(FORMATIONS as readonly string[]).includes(v)) {
    fail(`${label} must be a valid Formation`);
  }
  return v as Formation;
}

function expectStringArray(v: unknown, label: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    fail(`${label} must be an array of strings`);
  }
  return v as string[];
}

function parseDelayedWave(raw: unknown, index: number, def: RunDefinition): DelayedWave {
  const w = expectPlainObject(raw, `spawn.delayed[${index}]`);
  const archetypeId = expectArchetypeId(w.archetypeId, `spawn.delayed[${index}].archetypeId`);
  const count = expectFiniteInt(w.count, `spawn.delayed[${index}].count`, 1);
  const formation = expectFormation(w.formation, `spawn.delayed[${index}].formation`);
  const minDistance = expectFiniteInt(w.minDistance, `spawn.delayed[${index}].minDistance`, 0);
  const maxDistance = expectFiniteInt(
    w.maxDistance,
    `spawn.delayed[${index}].maxDistance`,
    minDistance,
  );
  const elite = expectBoolean(w.elite, `spawn.delayed[${index}].elite`);
  const boss = expectBoolean(w.boss, `spawn.delayed[${index}].boss`);
  const cost = expectFiniteInt(w.cost, `spawn.delayed[${index}].cost`, 0);
  const enqueuedTick = expectFiniteInt(w.enqueuedTick, `spawn.delayed[${index}].enqueuedTick`, 0);
  const phase = expectRunPhaseId(w.phase, `spawn.delayed[${index}].phase`);
  if (def.mode === 'normal' && phase === 'overtime') {
    fail(`spawn.delayed[${index}].phase cannot be overtime in normal mode`);
  }
  return {
    archetypeId,
    count,
    formation,
    minDistance,
    maxDistance,
    elite,
    boss,
    cost,
    enqueuedTick,
    phase,
  };
}

/**
 * Parse and strictly validate a serialized DirectorState. `def` is required
 * to cross-check the phase/tick consistency of the serialized state against
 * the authored content. Throws on any structural, range, enum, or semantic
 * (forged-state) violation. Never returns a partially-valid state.
 */
export function deserializeState(json: string, def: RunDefinition): DirectorState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`deserializeState: invalid JSON (${(err as Error).message})`);
  }

  const root = expectPlainObject(parsed, 'root');
  for (const key of [
    'version',
    'tick',
    'outcome',
    'seq',
    'phase',
    'threat',
    'spawn',
    'boss',
    'overtime',
    'rng',
    'firedBeats',
    'firedWarnings',
    'terminalEmitted',
    'lastPhaseAnnounced',
  ]) {
    if (!(key in root)) fail(`missing required key '${key}'`);
  }

  if (root.version !== STATE_VERSION) {
    fail(`unsupported version ${String(root.version)} (expected ${STATE_VERSION})`);
  }

  const tick = expectFiniteInt(root.tick, 'tick', -1);
  const outcome = expectRunOutcome(root.outcome, 'outcome');
  const seq = expectFiniteInt(root.seq, 'seq', 0);
  const phase = expectRunPhaseId(root.phase, 'phase');

  const threatRaw = expectPlainObject(root.threat, 'threat');
  const threatBudget = expectFiniteInt(threatRaw.budget, 'threat.budget');
  const threatTicksSinceSpawn = expectFiniteInt(
    threatRaw.ticksSinceSpawn,
    'threat.ticksSinceSpawn',
    0,
  );

  const spawnRaw = expectPlainObject(root.spawn, 'spawn');
  if (!Array.isArray(spawnRaw.delayed)) fail('spawn.delayed must be an array');
  const maxDelayed = expectFiniteInt(spawnRaw.maxDelayed, 'spawn.maxDelayed', 0);
  const droppedWaves = expectFiniteInt(spawnRaw.droppedWaves, 'spawn.droppedWaves', 0);
  if (spawnRaw.delayed.length > maxDelayed) {
    fail('spawn.delayed length exceeds spawn.maxDelayed');
  }
  const delayed = spawnRaw.delayed.map((raw, i) => parseDelayedWave(raw, i, def));

  const bossRaw = expectPlainObject(root.boss, 'boss');
  const bossWarned = expectBoolean(bossRaw.warned, 'boss.warned');
  const bossRequested = expectBoolean(bossRaw.requested, 'boss.requested');
  const bossAlive = expectBoolean(bossRaw.alive, 'boss.alive');
  const bossDefeated = expectBoolean(bossRaw.defeated, 'boss.defeated');

  const overtimeRaw = expectPlainObject(root.overtime, 'overtime');
  const overtimeActive = expectBoolean(overtimeRaw.active, 'overtime.active');
  const overtimeStartedTick = expectFiniteInt(
    overtimeRaw.startedTick,
    'overtime.startedTick',
    -1,
  );
  const overtimeNextSupportTick = expectFiniteInt(
    overtimeRaw.nextSupportTick,
    'overtime.nextSupportTick',
    -1,
  );
  const overtimeWavesEmitted = expectFiniteInt(
    overtimeRaw.wavesEmitted,
    'overtime.wavesEmitted',
    0,
  );

  const rngRaw = expectPlainObject(root.rng, 'rng');
  if (!Array.isArray(rngRaw.s) || rngRaw.s.length !== 4) {
    fail('rng.s must be an array of exactly 4 numbers');
  }
  const w0 = expectUint32(rngRaw.s[0], 'rng.s[0]');
  const w1 = expectUint32(rngRaw.s[1], 'rng.s[1]');
  const w2 = expectUint32(rngRaw.s[2], 'rng.s[2]');
  const w3 = expectUint32(rngRaw.s[3], 'rng.s[3]');

  const firedBeats = expectStringArray(root.firedBeats, 'firedBeats');
  const firedWarnings = expectStringArray(root.firedWarnings, 'firedWarnings');
  const terminalEmitted = expectBoolean(root.terminalEmitted, 'terminalEmitted');
  const lastPhaseAnnounced =
    root.lastPhaseAnnounced === null
      ? null
      : expectRunPhaseId(root.lastPhaseAnnounced, 'lastPhaseAnnounced');

  if (def.mode === 'normal' && (phase === 'overtime' || lastPhaseAnnounced === 'overtime')) {
    fail('normal mode cannot serialize an overtime phase');
  }

  /* ---- semantic / forged-state checks --------------------------------- */

  if (tick >= 0) {
    if (def.mode === 'normal' && tick >= def.durationTicks && outcome === 'running') {
      fail('normal mode cannot remain running at or after durationTicks');
    }
    const phaseTick = def.mode === 'normal' && tick >= def.durationTicks
      ? def.durationTicks - 1
      : tick;
    const expectedPhase = phaseAt(def, phaseTick).id;
    if (phase !== expectedPhase) {
      fail(
        `phase/tick mismatch: serialized phase '${phase}' does not match phaseAt(def, ${tick}) = '${expectedPhase}'`,
      );
    }
  } else if (phase !== 'opening') {
    fail(`phase/tick mismatch: tick=-1 requires phase='opening', got '${phase}'`);
  }

  if (outcome === 'victory' && bossRequested !== true) {
    fail('forged state: outcome is victory but boss.requested is false');
  }
  if (bossDefeated === true && bossRequested !== true) {
    fail('forged state: boss.defeated is true but boss.requested is false');
  }
  if (bossDefeated === true && bossAlive === true) {
    fail('forged state: boss.defeated and boss.alive cannot both be true');
  }
  if (overtimeActive === true && overtimeStartedTick < 0) {
    fail('forged state: overtime.active is true but overtime.startedTick < 0');
  }
  if (def.mode === 'normal' && overtimeActive === true) {
    fail('normal mode cannot activate overtime');
  }

  return {
    version: STATE_VERSION,
    tick,
    outcome,
    seq,
    phase,
    threat: {
      budget: threatBudget,
      ticksSinceSpawn: threatTicksSinceSpawn,
    },
    spawn: {
      delayed,
      maxDelayed,
      droppedWaves,
    },
    boss: {
      warned: bossWarned,
      requested: bossRequested,
      alive: bossAlive,
      defeated: bossDefeated,
    },
    overtime: {
      active: overtimeActive,
      startedTick: overtimeStartedTick,
      nextSupportTick: overtimeNextSupportTick,
      wavesEmitted: overtimeWavesEmitted,
    },
    rng: { s: [w0, w1, w2, w3] },
    firedBeats: [...firedBeats].sort(),
    firedWarnings: [...firedWarnings].sort(),
    terminalEmitted,
    lastPhaseAnnounced,
  };
}
