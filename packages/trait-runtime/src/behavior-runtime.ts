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
  BehaviorTimer,
  Catalog,
  CommandBuffer,
  CommandTemplate,
  RuntimeContext,
  RuntimeState,
} from './contracts.js';

/** Linear scan for the timer owned by `ownerId`. No allocation. */
function findTimer(state: RuntimeState, ownerId: string): BehaviorTimer | undefined {
  const timers = state.timers;
  for (let i = 0; i < timers.length; i++) {
    const t = timers[i];
    if (t !== undefined && t.ownerId === ownerId) return t;
  }
  return undefined;
}

/** Reconcile state.timers against active owners. Mutates state.timers. */
export function ensureTimers(_catalog: Catalog, state: RuntimeState): void {
  // Deterministic active-owner order: owned (non-disabled) traits, then evolutions.
  const activeOwnerIds: string[] = [];
  for (let i = 0; i < state.owned.length; i++) {
    const trait = state.owned[i];
    if (trait !== undefined && !trait.disabled) {
      activeOwnerIds.push(trait.id);
    }
  }
  for (let i = 0; i < state.evolutions.length; i++) {
    const evo = state.evolutions[i];
    if (evo !== undefined) {
      activeOwnerIds.push(evo.id);
    }
  }

  // Deactivate timers whose owning trait has been disabled (consumed by a Mythic).
  for (let i = 0; i < state.owned.length; i++) {
    const trait = state.owned[i];
    if (trait !== undefined && trait.disabled) {
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
      });
    }
  }
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
): void {
  const cmd = out.acquire();
  if (cmd === null) return;

  cmd.kind = template.kind;
  if (template.targeting !== undefined) cmd.targeting = template.targeting;
  cmd.originX = template.originX !== undefined ? template.originX : ctx.playerX;
  cmd.originY = template.originY !== undefined ? template.originY : ctx.playerY;
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
  if (template.range !== undefined) cmd.range = template.range;
  if (template.amount !== undefined) cmd.amount = template.amount;
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
): void {
  if (timer.cooldown <= 0) {
    timer.cooldown = Math.max(1, Math.round(behavior.periodTicks * (ctx.weaponCooldownMultiplier ?? 1)));
    if (behavior.emit !== undefined) {
      emitCommand(out, behavior.emit, ownerId, ctx);
    } else {
      emitHeartbeat(out, ownerId, ctx);
    }
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
    emitCommand(out, phase.emit, ownerId, ctx);
  }
  timer.phaseTicks += 1;
  const durationTicks = Math.max(1, Math.round(phase.durationTicks * (ctx.weaponCooldownMultiplier ?? 1)));
  if (timer.phaseTicks >= durationTicks) {
    timer.phaseTicks = 0;
    timer.phase = (timer.phase + 1) % phases.length;
  }
}

function advanceTimer(
  behavior: BehaviorDefinition,
  timer: BehaviorTimer,
  ownerId: string,
  ctx: RuntimeContext,
  out: CommandBuffer,
): void {
  switch (behavior.kind) {
    case 'periodicBurst':
    case 'periodicPulse':
    case 'generic':
      stepPeriodic(behavior, timer, ownerId, ctx, out);
      break;
    case 'multiPhase':
      stepMultiPhase(behavior, timer, ownerId, ctx, out);
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
  for (let i = 0; i < state.owned.length; i++) {
    const trait = state.owned[i];
    if (trait === undefined || trait.disabled) continue;
    const timer = findTimer(state, trait.id);
    if (timer === undefined || !timer.active) continue;
    const traitDefinition = _catalog.traits.find((candidate) => candidate.id === trait.id);
    const behavior = traitDefinition?.stages[trait.stage].behavior;
    if (behavior === undefined) continue;
    advanceTimer(behavior, timer, trait.id, ctx, out);
  }

  for (let i = 0; i < state.evolutions.length; i++) {
    const evo = state.evolutions[i];
    if (evo === undefined) continue;
    const timer = findTimer(state, evo.id);
    if (timer === undefined || !timer.active) continue;
    const evolutionDefinition = _catalog.evolutions.find((candidate) => candidate.id === evo.id);
    const behavior = evolutionDefinition?.behavior;
    if (behavior === undefined) continue;
    advanceTimer(behavior, timer, evo.id, ctx, out);
  }
}
