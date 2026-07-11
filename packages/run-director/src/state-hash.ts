/**
 * AGENT C — OWNED.
 *
 * Canonical hashing for DirectorState and RunDefinition, via FNV-1a (32-bit,
 * pure integer ops, zero deps). Both hash inputs are built as explicit,
 * fixed-order strings — never by iterating object properties — so the result
 * is independent of JS engine property-enumeration order and covers every
 * gameplay-affecting field.
 */

import type { DirectorState, RunDefinition } from './contracts.js';
import { NORMAL_RUN_PHASE_ORDER, RUN_PHASE_ORDER } from './ids.js';

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** FNV-1a 32-bit over a string's UTF-16 code units. Returns 8-hex-digit string. */
function fnv1a32(input: string): string {
  let hash = FNV_OFFSET_BASIS_32;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const SEP = '|';
const FIELD_SEP = ',';
const ITEM_SEP = ';';

function delayedWaveField(w: {
  readonly archetypeId: string;
  readonly count: number;
  readonly formation: string;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
  readonly cost: number;
  readonly enqueuedTick: number;
  readonly phase: string;
}): string {
  return [
    w.archetypeId,
    w.count,
    w.formation,
    w.minDistance,
    w.maxDistance,
    w.elite,
    w.boss,
    w.cost,
    w.enqueuedTick,
    w.phase,
  ].join(FIELD_SEP);
}

/** Build the canonical, fixed-order string representation of `state`. */
function canonicalStateString(state: DirectorState): string {
  const delayedStr = state.spawn.delayed.map(delayedWaveField).join(ITEM_SEP);
  const rngWords = state.rng.s;

  return [
    state.version,
    state.tick,
    state.outcome,
    state.seq,
    state.phase,
    state.threat.budget,
    state.threat.ticksSinceSpawn,
    delayedStr,
    state.spawn.maxDelayed,
    state.spawn.droppedWaves,
    state.boss.warned,
    state.boss.requested,
    state.boss.alive,
    state.boss.defeated,
    state.overtime.active,
    state.overtime.startedTick,
    state.overtime.nextSupportTick,
    state.overtime.wavesEmitted,
    rngWords[0],
    rngWords[1],
    rngWords[2],
    rngWords[3],
    state.firedBeats.join(FIELD_SEP),
    state.firedWarnings.join(FIELD_SEP),
    state.terminalEmitted,
    state.lastPhaseAnnounced ?? 'null',
  ].join(SEP);
}

/** Canonical hex hash of the full gameplay-affecting DirectorState. */
export function hashState(state: DirectorState): string {
  return fnv1a32(canonicalStateString(state));
}

function phaseField(p: {
  readonly id: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly softCap: number;
  readonly hardCap: number;
  readonly threatPerTick: number;
}): string {
  return [p.id, p.startTick, p.endTick, p.softCap, p.hardCap, p.threatPerTick].join(FIELD_SEP);
}

function archetypeField(a: {
  readonly id: string;
  readonly cost: number;
  readonly weight: number;
  readonly formation: string;
  readonly count: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly elite: boolean;
  readonly boss: boolean;
}): string {
  return [
    a.id,
    a.cost,
    a.weight,
    a.formation,
    a.count,
    a.minDistance,
    a.maxDistance,
    a.elite,
    a.boss,
  ].join(FIELD_SEP);
}

function eliteBeatField(e: {
  readonly id: string;
  readonly phaseId: string;
  readonly warningTick: number;
  readonly requestTick: number;
  readonly archetypeId: string;
  readonly count: number;
  readonly formation: string;
  readonly minDistance: number;
  readonly maxDistance: number;
}): string {
  return [
    e.id,
    e.phaseId,
    e.warningTick,
    e.requestTick,
    e.archetypeId,
    e.count,
    e.formation,
    e.minDistance,
    e.maxDistance,
  ].join(FIELD_SEP);
}

/** Build the canonical, fixed-order string representation of `def`. */
function canonicalDefinitionString(def: RunDefinition): string {
  const phasesStr = def.phases.map(phaseField).join(ITEM_SEP);
  const archetypesStr = def.archetypes.map(archetypeField).join(ITEM_SEP);
  const eliteBeatsStr = def.eliteBeats.map(eliteBeatField).join(ITEM_SEP);

  const bossStr = [
    def.boss.warningTick,
    def.boss.requestTick,
    def.boss.archetypeId,
    def.boss.formation,
    def.boss.minDistance,
    def.boss.maxDistance,
  ].join(FIELD_SEP);

  const threatStr = [def.threat.initialBudget, def.threat.maxBudget].join(FIELD_SEP);
  const levelPressureStr = def.levelPressure === undefined
    ? 'none'
    : [
      def.levelPressure.startLevel,
      def.levelPressure.levelsPerStep,
      def.levelPressure.maxSteps,
      def.levelPressure.softCapPerStep,
      def.levelPressure.hardCapPerStep,
      def.levelPressure.intervalTicksReductionPerStep,
    ].join(FIELD_SEP);

  const phaseOrder = def.mode === 'normal' ? NORMAL_RUN_PHASE_ORDER : RUN_PHASE_ORDER;
  const phaseArchetypesStr = phaseOrder.map((id) =>
    (def.waves.phaseArchetypes[id] ?? []).join(FIELD_SEP),
  ).join(ITEM_SEP);
  const wavesStr = [def.waves.intervalTicks, phaseArchetypesStr].join(SEP);

  const overtimeStr = def.overtime === undefined
    ? 'none'
    : [
      def.overtime.supportIntervalTicks,
      def.overtime.archetypeId,
      def.overtime.count,
      def.overtime.formation,
      def.overtime.minDistance,
      def.overtime.maxDistance,
      def.overtime.maxSupportWaves,
    ].join(FIELD_SEP);

  return [
    def.contentVersion,
    def.mode,
    def.durationTicks,
    phasesStr,
    archetypesStr,
    eliteBeatsStr,
    bossStr,
    threatStr,
    levelPressureStr,
    wavesStr,
    overtimeStr,
    def.eventBufferCapacity,
    def.defaultSeed,
  ].join(SEP);
}

/**
 * Canonical hex fingerprint of every gameplay-affecting field of `def`.
 * Equivalent definitions (deep-equal content) always produce identical
 * fingerprints; any authored change to timing, archetypes, beats, boss,
 * threat, level pressure, waves, mode/overtime, buffer capacity, or default
 * seed changes it.
 */
export function fingerprintDefinition(def: RunDefinition): string {
  return fnv1a32(canonicalDefinitionString(def));
}
