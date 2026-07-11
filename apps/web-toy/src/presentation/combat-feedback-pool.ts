/**
 * Fixed-capacity active-cue pool for renderer integration. It owns only
 * presentation records produced by projectCombatFeedback; it never stores or
 * mutates simulation state. Overflow drops later, lower-priority projected
 * cues deterministically and never evicts an already-visible cue.
 */
import type { RenderSnapshot } from '../contracts';
import {
  projectCombatFeedback,
  type CombatFeedbackCue,
  type CombatFeedbackProjectorOptions,
  type CombatFeedbackSnapshot,
} from './combat-feedback';

export const DEFAULT_COMBAT_FEEDBACK_POOL_CAPACITY = 24;

export interface CombatFeedbackPoolOptions extends CombatFeedbackProjectorOptions {
  /** Maximum active cue records. Must be a positive safe integer. */
  readonly capacity?: number;
}

export interface CombatFeedbackCuePool {
  readonly capacity: number;
  /** Total cues dropped since the last reset because the active pool was full. */
  readonly overflowCount: number;
  /**
   * Process a current snapshot once, expire old cues by its simulation tick,
   * and return an immutable active-cue view. Repeated render frames at the
   * same tick never duplicate feedback.
   */
  advance(previous: RenderSnapshot, current: RenderSnapshot): CombatFeedbackSnapshot;
  /** Clears active presentation state, for explicit renderer/app restart hooks. */
  reset(): void;
}

function requireCapacity(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('capacity must be a positive safe integer');
  }
}

function freezeActiveSnapshot(tick: number, slots: readonly (CombatFeedbackCue | null)[], count: number): CombatFeedbackSnapshot {
  const cues: CombatFeedbackCue[] = [];
  for (let index = 0; index < count; index++) {
    const cue = slots[index];
    if (cue !== null && cue !== undefined) cues.push(cue);
  }
  return Object.freeze({ tick, cues: Object.freeze(cues) });
}

/**
 * Creates a pool with storage allocated exactly once. At capacity, new cues
 * are dropped in the fixed projection order rather than growing memory or
 * evicting an effect the player is already seeing.
 */
export function createCombatFeedbackPool(options: CombatFeedbackPoolOptions = {}): CombatFeedbackCuePool {
  const capacity = options.capacity ?? DEFAULT_COMBAT_FEEDBACK_POOL_CAPACITY;
  requireCapacity(capacity);
  const slots: Array<CombatFeedbackCue | null> = Array.from({ length: capacity }, () => null);
  let count = 0;
  let lastProcessedTick = -1;
  let overflowCount = 0;

  function prune(tick: number): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < count; readIndex++) {
      const cue = slots[readIndex]!;
      if (cue.expiresAtTick <= tick) continue;
      slots[writeIndex++] = cue;
    }
    for (let index = writeIndex; index < count; index++) {
      slots[index] = null;
    }
    count = writeIndex;
  }

  function reset(): void {
    for (let index = 0; index < count; index++) {
      slots[index] = null;
    }
    count = 0;
    lastProcessedTick = -1;
    overflowCount = 0;
  }

  function advance(previous: RenderSnapshot, current: RenderSnapshot): CombatFeedbackSnapshot {
    // A lower tick means the driver/app was restarted. Treat it like an
    // explicit reset so stale cues can never bleed into the new run.
    if (current.tick < lastProcessedTick) reset();
    prune(current.tick);

    if (current.tick > lastProcessedTick) {
      const emitted = projectCombatFeedback(previous, current, options).cues;
      for (const cue of emitted) {
        if (count === capacity) {
          overflowCount++;
          continue;
        }
        slots[count++] = cue;
      }
      lastProcessedTick = current.tick;
    }

    return freezeActiveSnapshot(current.tick, slots, count);
  }

  return {
    capacity,
    get overflowCount() {
      return overflowCount;
    },
    advance,
    reset,
  };
}
