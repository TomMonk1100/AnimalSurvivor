/**
 * AGENT C — OWNED.
 *
 * Behavior scheduler. Advances one fixed tick of every active behavior loop and
 * emits commands into the buffer. Fully deterministic: integer ticks only, no
 * wall clock, no RNG, no per-tick allocation beyond the buffer's reused structs.
 *
 * TIMER RECONCILIATION (ensureTimers):
 *   Timers live in state.timers, one per active owner. An "active owner" is:
 *     - an owned trait that is NOT disabled  (ownerId = trait id), OR
 *     - a resolved evolution                 (ownerId = evolution id).
 *   ensureTimers must:
 *     - add a fresh timer for any active owner lacking one
 *       (phase 0, phaseTicks 0, cooldown 0, charges 0, active true);
 *     - set active=false (or remove) for timers whose owner is now disabled
 *       (a trait consumed by a Mythic) — its loop is REPLACED by the evolution;
 *     - preserve existing timers' progress for owners that persist (e.g. a
 *       Bud->Adapted advance keeps the same ownerId and keeps its timer, so the
 *       new stage's period applies going forward without resetting the phase).
 *   Deterministic order: traits in state.owned order, then evolutions in
 *   state.evolutions order.
 *
 * STEP (stepBehaviors) — for each active timer, in the order above:
 *   Resolve the owner's BehaviorDefinition (trait stage behavior via
 *   getStageBehavior, or evolution behavior via getEvolutionBehavior).
 *   - periodicBurst / periodicPulse / generic:
 *       decrement/advance a period counter; when it fires (every periodTicks),
 *       emit the `emit` template once. Use `cooldown`/`phaseTicks` consistently
 *       so a large catch-up run fires exactly floor(elapsed/period) times with
 *       no double-fire and no skipped phase. A single stepBehaviors call
 *       advances exactly one tick and emits at most the templates due this tick.
 *       generic with no `emit` emits a `playTraitCue` heartbeat at period.
 *   - movementTrail:
 *       quantize `ctx.distanceMovedThisTick` to fixed milliunits, accumulate it
 *       in `timer.charges`, and emit at most one spawnZone after a positive-
 *       movement tick crosses the authored distance threshold. A stationary
 *       tick never emits, even when prior movement left a charged threshold.
 *   - multiPhase (e.g. Thornstorm):
 *       emit the current phase's command at the tick the phase BEGINS, then
 *       wait durationTicks before advancing to the next phase; wrap after the
 *       last phase. Exact Thornstorm order across a cycle: telegraph, gather,
 *       radial exhale. Phase changes must not double-fire on the boundary tick.
 *
 * EMIT: acquire a Command from the buffer (may be null on overflow — skip
 * safely), then copy the template fields over BLANK defaults and stamp
 * sourceId = ownerId, tick = ctx.tick, plus originX/originY defaulting to
 * ctx.playerX/playerY when the template does not specify them.
 *
 * Determinism requirement: same state + same ctx sequence => identical command
 * stream, regardless of how ticks are batched.
 */

import type {
  BehaviorDefinition,
  BehaviorFollowUp,
  BehaviorTimer,
  Catalog,
  CommandBuffer,
  CommandTemplate,
  RuntimeContext,
  RuntimeState,
} from './contracts.js';
import { rankStageFor } from './rank-progression.js';
import { resolveEvolution } from './chimera/resolved-evolution.js';
import { selectChassis } from './chimera/chassis.js';

const MILLIUNITS_PER_WORLD_UNIT = 1_000;

/** Apply neutral attack-speed scaling while preserving a valid fixed-tick interval. */
function scaleCooldownTicks(ticks: number, ctx: RuntimeContext): number {
  const scaled = ticks * (ctx.weaponCooldownMultiplier ?? 1);
  if (!Number.isFinite(scaled) || scaled >= Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(1, Math.round(scaled));
}

/**
 * Convert a finite non-negative world distance to an exact safe integer count
 * of thousandths. Very large hostile inputs saturate rather than overflowing
 * the deterministic timer state.
 */
function quantizeDistanceMilliunits(distance: number): number {
  if (distance <= 0) return 0;
  const scaled = distance * MILLIUNITS_PER_WORLD_UNIT;
  if (!Number.isFinite(scaled) || scaled >= Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(scaled));
}

/** Saturating integer add keeps `BehaviorTimer.charges` serializable and exact. */
function addCharges(current: number, added: number): number {
  if (current >= Number.MAX_SAFE_INTEGER - added) return Number.MAX_SAFE_INTEGER;
  return current + added;
}

/** Saturating trigger counter for patterned synthesized behavior follow-ups. */
function nextCycle(timer: BehaviorTimer): number {
  if (timer.cycles < Number.MAX_SAFE_INTEGER) timer.cycles += 1;
  return timer.cycles;
}

/** Linear scan for the timer owned by `ownerId`. No allocation. */
function findTimer(state: RuntimeState, ownerId: string): BehaviorTimer | undefined {
  const timers = state.timers;
  for (let i = 0; i < timers.length; i++) {
    const t = timers[i];
    if (t !== undefined && t.ownerId === ownerId) return t;
  }
  return undefined;
}

/**
 * Apex Whisper is the one deliberate exception to normal fusion replacement:
 * the lower-priority parent keeps its entire Master scheduler in parallel,
 * while the fused loop remains the chassis plus donor graft. Reusing the
 * already-serialized parent timer gives that schedule independent cadence,
 * movement charges, and phase progress without introducing a second gameplay
 * authority or a new command kind.
 */
function apexEvolutionByDonorId(catalog: Catalog, state: RuntimeState): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const evolution of state.evolutions) {
    if (evolution.variant?.temperamentId !== 'apex-whisper') continue;
    const roles = selectChassis(catalog, evolution.ingredients[0], evolution.ingredients[1]);
    result.set(roles.donor.id, evolution.id);
  }
  return result;
}

/** Reconcile state.timers against active owners. Mutates state.timers. */
export function ensureTimers(_catalog: Catalog, state: RuntimeState): void {
  const apexEvolutionByDonor = apexEvolutionByDonorId(_catalog, state);
  // Deterministic active-owner order: owned (non-disabled) traits, the
  // explicitly parallel Apex donor timers, then fused evolutions.
  const activeOwnerIds: string[] = [];
  for (let i = 0; i < state.owned.length; i++) {
    const trait = state.owned[i];
    if (trait !== undefined && !trait.disabled) {
      activeOwnerIds.push(trait.id);
    }
  }
  for (const donorId of apexEvolutionByDonor.keys()) activeOwnerIds.push(donorId);
  for (let i = 0; i < state.evolutions.length; i++) {
    const evo = state.evolutions[i];
    if (evo !== undefined) {
      activeOwnerIds.push(evo.id);
    }
  }

  // Deactivate timers whose owning trait has been disabled (consumed by a Mythic).
  for (let i = 0; i < state.owned.length; i++) {
    const trait = state.owned[i];
    if (trait !== undefined && trait.disabled && !apexEvolutionByDonor.has(trait.id)) {
      const timer = findTimer(state, trait.id);
      if (timer !== undefined) {
        timer.active = false;
      }
    }
  }

  // Reactivate persisting timers and append fresh ones for active owners lacking one.
  for (let i = 0; i < activeOwnerIds.length; i++) {
    const ownerId = activeOwnerIds[i] as string;
    const existing = findTimer(state, ownerId);
    if (existing !== undefined) {
      existing.active = true;
    } else {
      state.timers.push({
        ownerId,
        active: true,
        phase: 0,
        phaseTicks: 0,
        cooldown: 0,
        charges: 0,
        cycles: 0,
      });
    }
  }

  // A delayed Echo/temperament emission must never outlive an owner that was
  // consumed by a fusion or defensively recovered from a stale save. Compact
  // in place so normal fixed-tick updates remain allocation-free.
  let pendingWrite = 0;
  for (let i = 0; i < state.pendingEmissions.length; i++) {
    const pending = state.pendingEmissions[i];
    if (pending === undefined || !activeOwnerIds.includes(pending.ownerId)) continue;
    state.pendingEmissions[pendingWrite++] = pending;
  }
  state.pendingEmissions.length = pendingWrite;
}

/**
 * Copy the template's set fields over an already-blanked Command, stamping
 * sourceId/tick and defaulting origin to the player position. Skips safely on
 * buffer overflow (acquire() === null).
 */
function emitCommand(
  out: CommandBuffer,
  template: CommandTemplate,
  ownerId: string,
  ctx: RuntimeContext,
  fallbackOriginX = ctx.playerX,
  fallbackOriginY = ctx.playerY,
): void {
  const cmd = out.acquire();
  if (cmd === null) return;

  cmd.kind = template.kind;
  if (template.targeting !== undefined) cmd.targeting = template.targeting;
  cmd.anchor = template.anchor ?? 'player';
  cmd.originX = template.originX !== undefined ? template.originX : fallbackOriginX;
  cmd.originY = template.originY !== undefined ? template.originY : fallbackOriginY;
  if (template.dirX !== undefined) cmd.dirX = template.dirX;
  if (template.dirY !== undefined) cmd.dirY = template.dirY;
  if (template.count !== undefined) cmd.count = template.count;
  if (template.damage !== undefined) {
    cmd.damage = template.damage * (ctx.weaponDamageMultiplier ?? 1);
  }
  if (template.speed !== undefined) cmd.speed = template.speed;
  if (template.radius !== undefined) cmd.radius = template.radius;
  if (template.strength !== undefined) cmd.strength = template.strength;
  if (template.durationTicks !== undefined) cmd.durationTicks = template.durationTicks;
  if (template.arc !== undefined) cmd.arc = template.arc;
  if (template.facing !== undefined) cmd.facing = template.facing;
  if (template.spread !== undefined) cmd.spread = template.spread;
  if (template.jumps !== undefined) cmd.jumps = template.jumps;
  if (template.pierce !== undefined) cmd.pierce = template.pierce;
  if (template.range !== undefined) cmd.range = template.range;
  if (template.amount !== undefined) {
    // `amount` represents damage-per-tick for spawn zones but can represent a
    // non-damage magnitude (for example, shield amount) for other command
    // kinds. Neutral weapon damage must affect only the former.
    cmd.amount = template.kind === 'spawnZone'
      ? template.amount * (ctx.weaponDamageMultiplier ?? 1)
      : template.amount;
  }
  if (template.intervalTicks !== undefined) {
    cmd.intervalTicks = scaleCooldownTicks(template.intervalTicks, ctx);
  }
  if (template.tag !== undefined) cmd.tag = template.tag;

  cmd.sourceId = ownerId;
  cmd.tick = ctx.tick;
}

/** playTraitCue heartbeat used when a periodic/generic behavior has no `emit`. */
function emitHeartbeat(out: CommandBuffer, ownerId: string, ctx: RuntimeContext): void {
  const cmd = out.acquire();
  if (cmd === null) return;
  cmd.kind = 'playTraitCue';
  cmd.tag = ownerId;
  cmd.sourceId = ownerId;
  cmd.tick = ctx.tick;
  cmd.originX = ctx.playerX;
  cmd.originY = ctx.playerY;
}

function appliesThisCycle(followUp: BehaviorFollowUp, cycle: number): boolean {
  const everyCycles = followUp.everyCycles ?? 1;
  return Number.isSafeInteger(everyCycles) && everyCycles >= 1 && cycle % everyCycles === 0;
}

/** Emit or deterministically queue synthesized behavior follow-ups. */
function emitFollowUps(
  out: CommandBuffer,
  followUps: readonly BehaviorFollowUp[] | undefined,
  ownerId: string,
  cycle: number,
  ctx: RuntimeContext,
  state: RuntimeState,
): void {
  if (followUps === undefined) return;
  for (const followUp of followUps) {
    if (!appliesThisCycle(followUp, cycle)) continue;
    const delayTicks = followUp.delayTicks ?? 0;
    if (!Number.isSafeInteger(delayTicks) || delayTicks < 0) continue;
    if (delayTicks === 0) {
      emitCommand(out, followUp.emit, ownerId, ctx);
      continue;
    }
    const dueTick = Math.min(Number.MAX_SAFE_INTEGER, ctx.tick + delayTicks);
    state.pendingEmissions.push({
      ownerId,
      dueTick,
      // Snapshot the template at schedule time so a subsequent rank/content
      // transition cannot rewrite a replay-bound delayed emission.
      emit: { ...followUp.emit },
    });
  }
}

function emitBehaviorTrigger(
  out: CommandBuffer,
  template: CommandTemplate | undefined,
  preludes: readonly BehaviorFollowUp[] | undefined,
  followUps: readonly BehaviorFollowUp[] | undefined,
  ownerId: string,
  timer: BehaviorTimer,
  ctx: RuntimeContext,
  state: RuntimeState,
  payloadOriginX = ctx.playerX,
  payloadOriginY = ctx.playerY,
): void {
  const cycle = nextCycle(timer);
  // Prelude commands intentionally run before the payload in this exact
  // fixed-tick batch. This lets a movement-triggered Undertow gather or
  // Lock-On mark prepare its own payload without renderer timing.
  emitFollowUps(out, preludes, ownerId, cycle, ctx, state);
  if (template !== undefined) {
    emitCommand(out, template, ownerId, ctx, payloadOriginX, payloadOriginY);
  } else {
    emitHeartbeat(out, ownerId, ctx);
  }
  emitFollowUps(out, followUps, ownerId, cycle, ctx, state);
}

/** Emit all delayed existing-vocabulary commands due at this fixed tick. */
function emitDuePending(
  state: RuntimeState,
  ctx: RuntimeContext,
  out: CommandBuffer,
): void {
  let write = 0;
  for (let i = 0; i < state.pendingEmissions.length; i++) {
    const pending = state.pendingEmissions[i];
    if (pending === undefined) continue;
    if (pending.dueTick <= ctx.tick) {
      emitCommand(out, pending.emit, pending.ownerId, ctx);
      continue;
    }
    state.pendingEmissions[write++] = pending;
  }
  state.pendingEmissions.length = write;
}

/**
 * periodicBurst / periodicPulse / generic scheme: `timer.cooldown` counts down
 * to the next fire. When cooldown <= 0, fire now and reset cooldown to
 * periodTicks; then always decrement by 1. With cooldown starting at 0 (fresh
 * timer) this fires on the very first tick processed, then every periodTicks
 * ticks thereafter — exactly floor(elapsed/period)+1 fires with no double-fire
 * and no skip, regardless of how the caller batches ticks (one call here always
 * advances exactly one tick).
 */
function stepPeriodic(
  behavior: BehaviorDefinition,
  timer: BehaviorTimer,
  ownerId: string,
  ctx: RuntimeContext,
  out: CommandBuffer,
  state: RuntimeState,
): void {
  if (timer.cooldown <= 0) {
    timer.cooldown = scaleCooldownTicks(behavior.periodTicks, ctx);
    emitBehaviorTrigger(out, behavior.emit, behavior.preludes, behavior.followUps, ownerId, timer, ctx, state);
  }
  timer.cooldown -= 1;
}

/**
 * multiPhase scheme: `timer.phase` is the current phase index, `timer.phaseTicks`
 * is ticks elapsed within it. The phase's command emits once, exactly when
 * phaseTicks === 0 (phase start). phaseTicks is then incremented; once it
 * reaches the phase's durationTicks, it resets to 0 and phase advances (wrapping
 * to 0 after the last phase) so the next call emits the following phase's
 * command on its own start tick — never on the same tick as the previous phase.
 */
function stepMultiPhase(
  behavior: BehaviorDefinition,
  timer: BehaviorTimer,
  ownerId: string,
  ctx: RuntimeContext,
  out: CommandBuffer,
  state: RuntimeState,
): void {
  const phases = behavior.phases;
  if (phases === undefined || phases.length === 0) return;

  if (timer.phase < 0 || timer.phase >= phases.length) {
    timer.phase = 0;
    timer.phaseTicks = 0;
  }
  const phase = phases[timer.phase];
  if (phase === undefined) return;

  if (timer.phaseTicks === 0) {
    // A multi-phase cycle starts at phase zero. Follow-ups on later phases
    // share that cycle index so the authored sequence stays one behavior.
    const cycle = timer.phase === 0 ? nextCycle(timer) : timer.cycles;
    if (timer.phase === 0) {
      // A behavior-level prelude is the deterministic start of a complete
      // multi-phase cycle, before the first phase's payload.
      emitFollowUps(out, behavior.preludes, ownerId, cycle, ctx, state);
    }
    emitCommand(out, phase.emit, ownerId, ctx);
    emitFollowUps(out, phase.followUps, ownerId, cycle, ctx, state);
  }
  timer.phaseTicks += 1;
  const durationTicks = scaleCooldownTicks(phase.durationTicks, ctx);
  if (timer.phaseTicks >= durationTicks) {
    timer.phaseTicks = 0;
    timer.phase = (timer.phase + 1) % phases.length;
  }
}

/**
 * Movement trails are intentionally distance-driven rather than cooldown-
 * driven: Attack Speed changes zone tick cadence, never how far Greg must
 * travel to leave a pad. The one-emission cap prevents a single large movement
 * sample from flooding the command buffer; any remaining charge carries into
 * later positive-movement ticks.
 */
function stepMovementTrail(
  behavior: BehaviorDefinition,
  timer: BehaviorTimer,
  ownerId: string,
  ctx: RuntimeContext,
  out: CommandBuffer,
  state: RuntimeState,
): void {
  const threshold = behavior.distanceMilliunits;
  const template = behavior.emit;
  if (
    threshold === undefined
    || threshold < 1
    || template === undefined
    || template.kind !== 'spawnZone'
    || ctx.distanceMovedThisTick <= 0
  ) {
    return;
  }

  timer.charges = addCharges(timer.charges, quantizeDistanceMilliunits(ctx.distanceMovedThisTick));
  if (timer.charges < threshold) return;

  timer.charges -= threshold;
  const behindDistance = behavior.trailBehindDistance ?? 0;
  const headingLength = Math.hypot(ctx.moveDirX, ctx.moveDirY);
  const hasUsableHeading = Number.isFinite(headingLength) && headingLength > 1e-9;
  const payloadOriginX = behindDistance > 0 && hasUsableHeading
    ? ctx.playerX - ctx.moveDirX / headingLength * behindDistance
    : ctx.playerX;
  const payloadOriginY = behindDistance > 0 && hasUsableHeading
    ? ctx.playerY - ctx.moveDirY / headingLength * behindDistance
    : ctx.playerY;
  emitBehaviorTrigger(
    out,
    template,
    behavior.preludes,
    behavior.followUps,
    ownerId,
    timer,
    ctx,
    state,
    payloadOriginX,
    payloadOriginY,
  );
}

function advanceTimer(
  behavior: BehaviorDefinition,
  timer: BehaviorTimer,
  ownerId: string,
  ctx: RuntimeContext,
  out: CommandBuffer,
  state: RuntimeState,
): void {
  switch (behavior.kind) {
    case 'periodicBurst':
    case 'periodicPulse':
    case 'generic':
      stepPeriodic(behavior, timer, ownerId, ctx, out, state);
      break;
    case 'multiPhase':
      stepMultiPhase(behavior, timer, ownerId, ctx, out, state);
      break;
    case 'movementTrail':
      stepMovementTrail(behavior, timer, ownerId, ctx, out, state);
      break;
  }
}

/** Advance exactly one tick of all active behaviors, emitting into `out`. */
export function stepBehaviors(
  _catalog: Catalog,
  state: RuntimeState,
  ctx: RuntimeContext,
  out: CommandBuffer,
): void {
  emitDuePending(state, ctx, out);
  const apexEvolutionByDonor = apexEvolutionByDonorId(_catalog, state);
  for (let i = 0; i < state.owned.length; i++) {
    const trait = state.owned[i];
    if (trait === undefined) continue;
    const apexEvolutionId = apexEvolutionByDonor.get(trait.id);
    if (trait.disabled && apexEvolutionId === undefined) continue;
    const timer = findTimer(state, trait.id);
    if (timer === undefined || !timer.active) continue;
    const traitDefinition = _catalog.traits.find((candidate) => candidate.id === trait.id);
    const behavior = traitDefinition === undefined
      ? undefined
      : rankStageFor(traitDefinition, trait.rank).behavior;
    if (behavior === undefined) continue;
    // The donor's intent is authored as a parent behavior, but its commands
    // belong to the fused evolution for combat attribution and presentation.
    advanceTimer(behavior, timer, apexEvolutionId ?? trait.id, ctx, out, state);
  }

  for (let i = 0; i < state.evolutions.length; i++) {
    const evo = state.evolutions[i];
    if (evo === undefined) continue;
    const timer = findTimer(state, evo.id);
    if (timer === undefined || !timer.active) continue;
    const behavior = resolveEvolution(_catalog, evo)?.behavior;
    if (behavior === undefined) continue;
    advanceTimer(behavior, timer, evo.id, ctx, out, state);
  }
}
