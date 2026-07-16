/**
 * AGENT A — OWNED.
 *
 * Pure content validation. `validateDefinition` throws an Error with a clear
 * message on the FIRST violation found (fail-fast, deterministic order).
 * Never mutates its input.
 */

import type {
  ArchetypeDefinition,
  BossCombatProfile,
  EliteBeatDefinition,
  PhaseDefinition,
  RunDefinition,
} from './contracts.js';
import { OPEN_END } from './contracts.js';
import {
  BOSS_ENTRANCE_TICK,
  NORMAL_RUN_PHASE_ORDER,
  RUN_DURATION_TICKS,
  RUN_PHASE_ORDER,
  type ArchetypeId,
  type RunPhaseId,
} from './ids.js';

/* ============================================================================
 * Small numeric helpers
 * ==========================================================================*/

function isPosInt(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/** Boss timing values are copied into Uint16Arrays by the simulation. */
function isPosUint16(value: number): boolean {
  return isPosInt(value) && value <= 0xffff;
}

function isNonNegInt(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/* ============================================================================
 * Public entry point
 * ==========================================================================*/

export function validateDefinition(def: RunDefinition): void {
  validateMode(def);
  validateDuration(def);
  const phaseById = validatePhases(def);
  const archetypeIds = validateArchetypes(def);
  validateEliteBeats(def, phaseById, archetypeIds);
  validateBoss(def, phaseById, archetypeIds);
  validateThreat(def);
  validateLevelPressure(def);
  validateWaves(def, archetypeIds);
  validateOvertime(def, archetypeIds);
  validateEventBuffer(def);
}

function validateMode(def: RunDefinition): void {
  if (def.mode !== 'normal' && def.mode !== 'endless') {
    throw new Error(`validateDefinition: mode must be 'normal' or 'endless', got ${String(def.mode)}`);
  }
}

function phaseOrderFor(def: RunDefinition): readonly RunPhaseId[] {
  return def.mode === 'normal' ? NORMAL_RUN_PHASE_ORDER : RUN_PHASE_ORDER;
}

/* ============================================================================
 * Duration
 * ==========================================================================*/

function validateDuration(def: RunDefinition): void {
  if (def.durationTicks !== RUN_DURATION_TICKS) {
    throw new Error(
      `validateDefinition: durationTicks must equal RUN_DURATION_TICKS (${RUN_DURATION_TICKS}), got ${def.durationTicks}`,
    );
  }
}

/* ============================================================================
 * Phases
 * ==========================================================================*/

function validatePhases(def: RunDefinition): ReadonlyMap<RunPhaseId, PhaseDefinition> {
  const phaseOrder = phaseOrderFor(def);
  if (def.phases.length !== phaseOrder.length) {
    throw new Error(
      `validateDefinition: expected exactly ${phaseOrder.length} phases for ${def.mode} mode, got ${def.phases.length}`,
    );
  }

  const byId = new Map<RunPhaseId, PhaseDefinition>();
  for (const phase of def.phases) {
    if (byId.has(phase.id)) {
      throw new Error(`validateDefinition: duplicate phase id "${phase.id}"`);
    }
    byId.set(phase.id, phase);
  }

  for (const id of phaseOrder) {
    if (!byId.has(id)) {
      throw new Error(`validateDefinition: missing required phase "${id}"`);
    }
  }

  let previous: PhaseDefinition | null = null;
  for (const id of phaseOrder) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const phase = byId.get(id)!;

    if (!Number.isFinite(phase.startTick) || !Number.isInteger(phase.startTick)) {
      throw new Error(`validateDefinition: phase "${id}" startTick must be an integer`);
    }
    if (phase.endTick !== OPEN_END && (!Number.isFinite(phase.endTick) || !Number.isInteger(phase.endTick))) {
      throw new Error(`validateDefinition: phase "${id}" endTick must be an integer or OPEN_END`);
    }
    if (phase.startTick > phase.endTick) {
      throw new Error(`validateDefinition: phase "${id}" startTick must be <= endTick`);
    }
    if (!isPosInt(phase.softCap)) {
      throw new Error(`validateDefinition: phase "${id}" softCap must be a positive integer`);
    }
    if (!isPosInt(phase.hardCap)) {
      throw new Error(`validateDefinition: phase "${id}" hardCap must be a positive integer`);
    }
    if (phase.softCap >= phase.hardCap) {
      throw new Error(`validateDefinition: phase "${id}" softCap must be < hardCap`);
    }
    if (!isPosInt(phase.threatPerTick)) {
      throw new Error(`validateDefinition: phase "${id}" threatPerTick must be a positive integer`);
    }

    if (previous === null) {
      if (phase.startTick !== 0) {
        throw new Error(`validateDefinition: first phase "${id}" must start at tick 0`);
      }
    } else {
      if (phase.startTick !== previous.endTick + 1) {
        throw new Error(
          `validateDefinition: phase "${id}" must start immediately after previous phase ends (expected startTick ${
            previous.endTick + 1
          }, got ${phase.startTick})`,
        );
      }
    }
    previous = phase;
  }

  if (def.mode === 'normal') {
    const boss = byId.get('boss');
    if (!boss || boss.endTick !== def.durationTicks - 1) {
      throw new Error('validateDefinition: normal boss phase must end at durationTicks - 1');
    }
  } else {
    const overtime = byId.get('overtime');
    if (!overtime || overtime.endTick !== OPEN_END) {
      throw new Error('validateDefinition: endless overtime phase endTick must equal OPEN_END');
    }
  }

  return byId;
}

/* ============================================================================
 * Archetypes
 * ==========================================================================*/

function validateArchetypes(def: RunDefinition): ReadonlySet<ArchetypeId> {
  const ids = new Set<ArchetypeId>();
  for (const archetype of def.archetypes) {
    if (ids.has(archetype.id)) {
      throw new Error(`validateDefinition: duplicate archetype id "${archetype.id}"`);
    }
    ids.add(archetype.id);
    validateArchetypeFields(archetype);
  }
  return ids;
}

function validateArchetypeFields(archetype: ArchetypeDefinition): void {
  const subject = `archetype "${archetype.id}"`;
  if (!isPosInt(archetype.cost)) {
    throw new Error(`validateDefinition: ${subject} cost must be a positive integer`);
  }
  if (!isPosInt(archetype.weight)) {
    throw new Error(`validateDefinition: ${subject} weight must be a positive integer`);
  }
  if (!isPosInt(archetype.count)) {
    throw new Error(`validateDefinition: ${subject} count must be a positive integer`);
  }
  if (!isNonNegInt(archetype.minDistance)) {
    throw new Error(`validateDefinition: ${subject} minDistance must be a non-negative integer`);
  }
  if (!isNonNegInt(archetype.maxDistance)) {
    throw new Error(`validateDefinition: ${subject} maxDistance must be a non-negative integer`);
  }
  if (archetype.minDistance > archetype.maxDistance) {
    throw new Error(`validateDefinition: ${subject} minDistance must be <= maxDistance`);
  }
}

/* ============================================================================
 * Elite beats
 * ==========================================================================*/

const REQUIRED_ELITE_PHASES: readonly RunPhaseId[] = ['pressure', 'adaptation', 'mutation'];

function validateEliteBeats(
  def: RunDefinition,
  phaseById: ReadonlyMap<RunPhaseId, PhaseDefinition>,
  archetypeIds: ReadonlySet<ArchetypeId>,
): void {
  if (def.eliteBeats.length < REQUIRED_ELITE_PHASES.length) {
    throw new Error(
      `validateDefinition: expected at least ${REQUIRED_ELITE_PHASES.length} elite beats, got ${def.eliteBeats.length}`,
    );
  }

  const seenIds = new Set<string>();
  const seenRequiredPhases = new Set<RunPhaseId>();

  for (const beat of def.eliteBeats) {
    if (seenIds.has(beat.id)) {
      throw new Error(`validateDefinition: duplicate elite beat id "${beat.id}"`);
    }
    seenIds.add(beat.id);

    validateEliteBeatFields(beat, phaseById, archetypeIds);

    if (!REQUIRED_ELITE_PHASES.includes(beat.phaseId)) {
      throw new Error(
        `validateDefinition: elite beat "${beat.id}" phaseId must be one of ${REQUIRED_ELITE_PHASES.join(', ')}`,
      );
    }
    seenRequiredPhases.add(beat.phaseId);
  }

  for (const id of REQUIRED_ELITE_PHASES) {
    if (!seenRequiredPhases.has(id)) {
      throw new Error(`validateDefinition: missing elite beat for phase "${id}"`);
    }
  }
}

function validateEliteBeatFields(
  beat: EliteBeatDefinition,
  phaseById: ReadonlyMap<RunPhaseId, PhaseDefinition>,
  archetypeIds: ReadonlySet<ArchetypeId>,
): void {
  const subject = `elite beat "${beat.id}"`;
  const phase = phaseById.get(beat.phaseId);
  if (!phase) {
    throw new Error(`validateDefinition: ${subject} references unknown phase "${beat.phaseId}"`);
  }
  if (!Number.isFinite(beat.warningTick) || !Number.isInteger(beat.warningTick)) {
    throw new Error(`validateDefinition: ${subject} warningTick must be an integer`);
  }
  if (!Number.isFinite(beat.requestTick) || !Number.isInteger(beat.requestTick)) {
    throw new Error(`validateDefinition: ${subject} requestTick must be an integer`);
  }
  if (beat.warningTick >= beat.requestTick) {
    throw new Error(`validateDefinition: ${subject} warningTick must be < requestTick`);
  }
  if (beat.warningTick < phase.startTick || beat.warningTick > phase.endTick) {
    throw new Error(`validateDefinition: ${subject} warningTick must lie inside phase "${beat.phaseId}"`);
  }
  if (beat.requestTick < phase.startTick || beat.requestTick > phase.endTick) {
    throw new Error(`validateDefinition: ${subject} requestTick must lie inside phase "${beat.phaseId}"`);
  }
  if (!archetypeIds.has(beat.archetypeId)) {
    throw new Error(`validateDefinition: ${subject} references unknown archetype "${beat.archetypeId}"`);
  }
  if (!isPosInt(beat.count)) {
    throw new Error(`validateDefinition: ${subject} count must be a positive integer`);
  }
  if (!isNonNegInt(beat.minDistance)) {
    throw new Error(`validateDefinition: ${subject} minDistance must be a non-negative integer`);
  }
  if (!isNonNegInt(beat.maxDistance)) {
    throw new Error(`validateDefinition: ${subject} maxDistance must be a non-negative integer`);
  }
  if (beat.minDistance > beat.maxDistance) {
    throw new Error(`validateDefinition: ${subject} minDistance must be <= maxDistance`);
  }
}

/* ============================================================================
 * Boss
 * ==========================================================================*/

function validateBoss(
  def: RunDefinition,
  phaseById: ReadonlyMap<RunPhaseId, PhaseDefinition>,
  archetypeIds: ReadonlySet<ArchetypeId>,
): void {
  const boss = def.boss;
  if (!Number.isFinite(boss.warningTick) || !Number.isInteger(boss.warningTick)) {
    throw new Error('validateDefinition: boss warningTick must be an integer');
  }
  if (!Number.isFinite(boss.requestTick) || !Number.isInteger(boss.requestTick)) {
    throw new Error('validateDefinition: boss requestTick must be an integer');
  }
  if (boss.requestTick !== BOSS_ENTRANCE_TICK) {
    throw new Error(
      `validateDefinition: boss requestTick must equal BOSS_ENTRANCE_TICK (${BOSS_ENTRANCE_TICK}), got ${boss.requestTick}`,
    );
  }
  if (boss.warningTick >= boss.requestTick) {
    throw new Error('validateDefinition: boss warningTick must be < requestTick');
  }
  if (boss.warningTick < 0) {
    throw new Error('validateDefinition: boss warningTick must be >= 0');
  }
  const bossPhase = phaseById.get('boss');
  if (!bossPhase || boss.requestTick < bossPhase.startTick || boss.requestTick > bossPhase.endTick) {
    throw new Error('validateDefinition: boss requestTick must lie inside the boss phase');
  }
  if (!archetypeIds.has(boss.archetypeId)) {
    throw new Error(`validateDefinition: boss references unknown archetype "${boss.archetypeId}"`);
  }
  if (!isNonNegInt(boss.minDistance)) {
    throw new Error('validateDefinition: boss minDistance must be a non-negative integer');
  }
  if (!isNonNegInt(boss.maxDistance)) {
    throw new Error('validateDefinition: boss maxDistance must be a non-negative integer');
  }
  if (boss.minDistance > boss.maxDistance) {
    throw new Error('validateDefinition: boss minDistance must be <= maxDistance');
  }
  validateBossProfile(boss.profile);
}

function validateBossProfile(profile: BossCombatProfile): void {
  if (typeof profile.id !== 'string' || !/^[a-z0-9][a-z0-9:-]*$/.test(profile.id)) {
    throw new Error('validateDefinition: boss profile id must be a non-empty lowercase stable id');
  }
  for (const [name, value] of Object.entries({
    hpMultiplier: profile.hpMultiplier,
    xpMultiplier: profile.xpMultiplier,
    speedMultiplier: profile.speedMultiplier,
    touchDamageMultiplier: profile.touchDamageMultiplier,
    preferredRange: profile.preferredRange,
    chargeSpeedMultiplier: profile.chargeSpeedMultiplier,
    projectileSpeed: profile.projectileSpeed,
    projectileDamage: profile.projectileDamage,
  })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`validateDefinition: boss profile ${name} must be finite and positive`);
    }
  }
  for (const [name, value] of Object.entries({
    rangeBand: profile.rangeBand,
    projectileHitRadius: profile.projectileHitRadius,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`validateDefinition: boss profile ${name} must be finite and non-negative`);
    }
  }
  for (const [name, value] of Object.entries({
    cycleTicks: profile.cycleTicks,
    chargeWindupTicks: profile.chargeWindupTicks,
    chargeDurationTicks: profile.chargeDurationTicks,
    volleyTick: profile.volleyTick,
    projectileLifetimeTicks: profile.projectileLifetimeTicks,
  })) {
    if (!isPosUint16(value)) {
      throw new Error(`validateDefinition: boss profile ${name} must be a positive uint16`);
    }
  }
  if (!isPosInt(profile.volleyCount) || profile.volleyCount > 32) {
    throw new Error('validateDefinition: boss profile volleyCount must be an integer in [1, 32]');
  }
  if (profile.volleyTick >= profile.cycleTicks) {
    throw new Error('validateDefinition: boss profile volleyTick must be inside cycleTicks');
  }
  if (profile.chargeWindupTicks + profile.chargeDurationTicks >= profile.volleyTick) {
    throw new Error('validateDefinition: boss profile charge must resolve before volleyTick');
  }
}

/* ============================================================================
 * Threat
 * ==========================================================================*/

function validateThreat(def: RunDefinition): void {
  const threat = def.threat;
  if (!isNonNegInt(threat.initialBudget)) {
    throw new Error('validateDefinition: threat.initialBudget must be a non-negative integer');
  }
  if (!isPosInt(threat.maxBudget)) {
    throw new Error('validateDefinition: threat.maxBudget must be a positive integer');
  }
  if (threat.maxBudget < threat.initialBudget) {
    throw new Error('validateDefinition: threat.maxBudget must be >= threat.initialBudget');
  }
}

function validateLevelPressure(def: RunDefinition): void {
  const levelPressure = def.levelPressure;
  if (levelPressure === undefined) return;
  if (!isPosInt(levelPressure.startLevel)) {
    throw new Error('validateDefinition: levelPressure.startLevel must be a positive integer');
  }
  if (!isPosInt(levelPressure.levelsPerStep)) {
    throw new Error('validateDefinition: levelPressure.levelsPerStep must be a positive integer');
  }
  if (!isPosInt(levelPressure.maxSteps) || levelPressure.maxSteps > 3) {
    throw new Error('validateDefinition: levelPressure.maxSteps must be an integer in [1, 3]');
  }
  if (!isPosInt(levelPressure.softCapPerStep) || levelPressure.softCapPerStep > 1) {
    throw new Error('validateDefinition: levelPressure.softCapPerStep must be 1');
  }
  if (!isPosInt(levelPressure.hardCapPerStep) || levelPressure.hardCapPerStep > 2) {
    throw new Error('validateDefinition: levelPressure.hardCapPerStep must be in [1, 2]');
  }
  if (levelPressure.hardCapPerStep < levelPressure.softCapPerStep) {
    throw new Error('validateDefinition: levelPressure.hardCapPerStep must be >= softCapPerStep');
  }
  if (!isPosInt(levelPressure.intervalTicksReductionPerStep)) {
    throw new Error('validateDefinition: levelPressure.intervalTicksReductionPerStep must be a positive integer');
  }
  for (const phase of def.phases) {
    const phaseInterval = def.waves.phaseIntervalTicks?.[phase.id] ?? def.waves.intervalTicks;
    if (phaseInterval - levelPressure.maxSteps * levelPressure.intervalTicksReductionPerStep < 1) {
      throw new Error(`validateDefinition: levelPressure reduces wave interval below 1 tick in phase "${phase.id}"`);
    }
    const maxSoftCap = phase.softCap + levelPressure.maxSteps * levelPressure.softCapPerStep;
    const maxHardCap = phase.hardCap + levelPressure.maxSteps * levelPressure.hardCapPerStep;
    if (maxSoftCap >= maxHardCap) {
      throw new Error(`validateDefinition: levelPressure collapses the cap gap in phase "${phase.id}"`);
    }
  }
}

/* ============================================================================
 * Waves
 * ==========================================================================*/

function validateWaves(def: RunDefinition, archetypeIds: ReadonlySet<ArchetypeId>): void {
  const waves = def.waves;
  if (!isPosInt(waves.intervalTicks)) {
    throw new Error('validateDefinition: waves.intervalTicks must be a positive integer');
  }
  for (const id of phaseOrderFor(def)) {
    const phaseInterval = waves.phaseIntervalTicks?.[id];
    if (phaseInterval !== undefined && !isPosInt(phaseInterval)) {
      throw new Error(`validateDefinition: waves.phaseIntervalTicks["${id}"] must be a positive integer`);
    }
    const eligible = waves.phaseArchetypes[id];
    if (!eligible || eligible.length === 0) {
      throw new Error(`validateDefinition: waves.phaseArchetypes["${id}"] must be a non-empty array`);
    }
    for (const archetypeId of eligible) {
      if (!archetypeIds.has(archetypeId)) {
        throw new Error(
          `validateDefinition: waves.phaseArchetypes["${id}"] references unknown archetype "${archetypeId}"`,
        );
      }
    }
  }
}

/* ============================================================================
 * Overtime
 * ==========================================================================*/

function validateOvertime(def: RunDefinition, archetypeIds: ReadonlySet<ArchetypeId>): void {
  if (def.mode === 'normal') {
    if (def.overtime !== undefined) {
      throw new Error('validateDefinition: normal mode must not define overtime');
    }
    if (def.waves.phaseArchetypes.overtime !== undefined) {
      throw new Error('validateDefinition: normal mode must not define overtime waves');
    }
    return;
  }
  const overtime = def.overtime;
  if (overtime === undefined) {
    throw new Error('validateDefinition: endless mode requires overtime config');
  }
  if (!isPosInt(overtime.supportIntervalTicks)) {
    throw new Error('validateDefinition: overtime.supportIntervalTicks must be a positive integer');
  }
  if (!archetypeIds.has(overtime.archetypeId)) {
    throw new Error(`validateDefinition: overtime references unknown archetype "${overtime.archetypeId}"`);
  }
  if (!isPosInt(overtime.count)) {
    throw new Error('validateDefinition: overtime.count must be a positive integer');
  }
  if (!isNonNegInt(overtime.minDistance)) {
    throw new Error('validateDefinition: overtime.minDistance must be a non-negative integer');
  }
  if (!isNonNegInt(overtime.maxDistance)) {
    throw new Error('validateDefinition: overtime.maxDistance must be a non-negative integer');
  }
  if (overtime.minDistance > overtime.maxDistance) {
    throw new Error('validateDefinition: overtime.minDistance must be <= overtime.maxDistance');
  }
  if (!isPosInt(overtime.maxSupportWaves)) {
    throw new Error('validateDefinition: overtime.maxSupportWaves must be a positive integer');
  }
}

/* ============================================================================
 * Event buffer
 * ==========================================================================*/

function validateEventBuffer(def: RunDefinition): void {
  if (!isPosInt(def.eventBufferCapacity) || def.eventBufferCapacity < 64) {
    throw new Error('validateDefinition: eventBufferCapacity must be a positive integer >= 64');
  }
}
