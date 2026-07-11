/**
 * AGENT B — OWNED.
 *
 * Decides DISCRETIONARY spawn waves for the current tick and manages the
 * bounded delayed-wave queue. Authored one-shot beats (elite/boss/overtime
 * support) are NOT handled here — those live in the orchestrator.
 *
 * Delayed-queue policy:
 *   - At most ONE delayed wave is released per tick (bounded — congestion
 *     clearing never produces an unbounded burst).
 *   - FIFO: only the head of the queue is ever considered. If the head is
 *     unaffordable or the phase is at/over softCap, draining stops for this
 *     tick and the queue is left intact (no reordering, no partial pops).
 *   - Discretionary picks are enqueued (not dropped) when unaffordable, up to
 *     `state.spawn.maxDelayed`; beyond that `state.spawn.droppedWaves` counts
 *     the loss.
 *   - `ticksSinceSpawn` is reset to 0 both when a discretionary wave is
 *     RELEASED and when one is ENQUEUED (deferred). Resetting on enqueue is a
 *     deliberate choice: without it, an unaffordable phase would retry the
 *     discretionary check (and burn an RNG draw) every single tick until
 *     budget catches up, spamming the delayed queue with duplicate attempts.
 *     The single enqueued wave already represents the pending intent; the
 *     drain step above is what services it as soon as caps/budget allow.
 */

import type {
  ArchetypeDefinition,
  DelayedWave,
  DirectorState,
  PhaseDefinition,
  RunDefinition,
  RunMetrics,
  SpawnDecision,
} from './contracts.js';
import type { ArchetypeId } from './ids.js';
import { canAfford, spend } from './threat-budget.js';
import { rngWeightedIndex } from './rng.js';

/** Find an archetype definition by id, iterating by index only. Throws if absent. */
function findArchetype(def: RunDefinition, id: ArchetypeId): ArchetypeDefinition {
  const archetypes = def.archetypes;
  for (let i = 0; i < archetypes.length; i++) {
    const a = archetypes[i];
    if (a !== undefined && a.id === id) return a;
  }
  throw new Error(`serviceSpawns: no archetype definition for id "${id}"`);
}

function toDecision(
  source: {
    readonly archetypeId: ArchetypeId;
    readonly count: number;
    readonly formation: DelayedWave['formation'];
    readonly minDistance: number;
    readonly maxDistance: number;
    readonly elite: boolean;
    readonly boss: boolean;
  },
  cost: number,
  delayed: boolean,
): SpawnDecision {
  return {
    archetypeId: source.archetypeId,
    count: source.count,
    formation: source.formation,
    minDistance: source.minDistance,
    maxDistance: source.maxDistance,
    elite: source.elite,
    boss: source.boss,
    cost,
    delayed,
  };
}

export function serviceSpawns(
  state: DirectorState,
  def: RunDefinition,
  phase: PhaseDefinition,
  metrics: RunMetrics,
  tick: number,
): SpawnDecision[] {
  const liveEnemies = metrics.liveEnemies;

  // Congestion: release nothing at all this tick. Delayed queue left intact.
  if (liveEnemies >= phase.hardCap) {
    return [];
  }

  const decisions: SpawnDecision[] = [];
  let releasedDelayed = false;

  // 1) Drain at most one delayed wave (FIFO head only) this tick.
  if (state.spawn.delayed.length > 0) {
    const head = state.spawn.delayed[0];
    if (head !== undefined && liveEnemies < phase.softCap && canAfford(state.threat, head.cost)) {
      spend(state.threat, head.cost);
      state.spawn.delayed.shift();
      decisions.push(toDecision(head, head.cost, true));
      releasedDelayed = true;
    }
    // else: head unaffordable or softCap reached — stop draining, queue intact.
  }

  // 2) Discretionary pick — only when nothing was released from the delayed
  //    queue this tick, the interval has elapsed, and we're under softCap.
  if (
    !releasedDelayed &&
    state.threat.ticksSinceSpawn >= def.waves.intervalTicks &&
    liveEnemies < phase.softCap
  ) {
    const eligibleIds = def.waves.phaseArchetypes[phase.id];
    const eligibleArchetypes: ArchetypeDefinition[] = [];
    for (let i = 0; i < eligibleIds.length; i++) {
      const id = eligibleIds[i];
      if (id === undefined) continue;
      eligibleArchetypes.push(findArchetype(def, id));
    }

    if (eligibleArchetypes.length > 0) {
      const weights: number[] = [];
      for (let i = 0; i < eligibleArchetypes.length; i++) {
        const a = eligibleArchetypes[i];
        if (a !== undefined) weights.push(a.weight);
      }

      // Only draw from rng when a discretionary pick is genuinely happening.
      const [nextRng, idx] = rngWeightedIndex(state.rng, weights);
      state.rng = nextRng;
      const archetype = eligibleArchetypes[idx];

      if (archetype !== undefined) {
        const cost = archetype.cost * archetype.count;

        if (canAfford(state.threat, cost)) {
          spend(state.threat, cost);
          state.threat.ticksSinceSpawn = 0;
          decisions.push(
            toDecision(
              {
                archetypeId: archetype.id,
                count: archetype.count,
                formation: archetype.formation,
                minDistance: archetype.minDistance,
                maxDistance: archetype.maxDistance,
                elite: archetype.elite,
                boss: archetype.boss,
              },
              cost,
              false,
            ),
          );
        } else {
          const wave: DelayedWave = {
            archetypeId: archetype.id,
            count: archetype.count,
            formation: archetype.formation,
            minDistance: archetype.minDistance,
            maxDistance: archetype.maxDistance,
            elite: archetype.elite,
            boss: archetype.boss,
            cost,
            enqueuedTick: tick,
            phase: phase.id,
          };
          if (state.spawn.delayed.length < state.spawn.maxDelayed) {
            state.spawn.delayed.push(wave);
          } else {
            state.spawn.droppedWaves += 1;
          }
          // See module doc: reset on enqueue too, to avoid retry-spam.
          state.threat.ticksSinceSpawn = 0;
        }
      }
    }
  }

  return decisions;
}
