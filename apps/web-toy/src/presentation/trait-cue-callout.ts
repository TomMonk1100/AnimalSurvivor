/**
 * The minimal command fields needed for a player-facing trait callout.
 *
 * This stays structural so it can accept the simulation's renderer-facing
 * command copy without making the HUD depend on the trait-runtime package.
 */
export interface TraitCueCalloutEvent {
  readonly kind: string;
  readonly sourceId: string;
  readonly tick: number;
  readonly tag?: string;
}

export type TraitCueCalloutTone = 'quills' | 'gather' | 'knockback' | 'mythic';

/** A short-lived, plain-language explanation of a real Greg trait action. */
export interface TraitCueCallout {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: TraitCueCalloutTone;
  readonly expiresAtTick: number;
}

function callout(
  event: TraitCueCalloutEvent,
  tone: TraitCueCalloutTone,
  title: string,
  detail: string,
  durationTicks: number,
): TraitCueCallout {
  return {
    // Greg's authored behaviors emit at most one matching command per source
    // on a tick, making this deterministic key sufficient for HUD replacement.
    key: `trait:${event.tick}:${event.sourceId}:${event.kind}:${event.tag ?? ''}`,
    title,
    detail,
    tone,
    expiresAtTick: event.tick + durationTicks,
  };
}

/**
 * Turns only the current playable Greg-slice commands into clear HUD copy.
 * Unknown commands intentionally stay invisible instead of inventing feedback
 * for catalog content that is not part of this playtest slice.
 */
export function projectTraitCueCallout(event: TraitCueCalloutEvent): TraitCueCallout | null {
  if (event.sourceId === 'porcupine-quills' && event.kind === 'spawnProjectileBurst') {
    return callout(event, 'quills', 'Porcupine Quills', 'Quills fire toward the nearest enemy.', 36);
  }

  if (event.sourceId === 'puffer-pouch') {
    if (event.kind === 'areaGather') {
      return callout(event, 'gather', 'Puffer Pouch', 'Inhale pulls nearby enemies toward Greg.', 72);
    }
    if (event.kind === 'areaKnockback') {
      return callout(event, 'knockback', 'Puffer Pouch', 'Blast pushes nearby enemies away.', 72);
    }
    return null;
  }

  if (event.sourceId === 'thornstorm-mantle') {
    if (event.kind === 'telegraph' && event.tag === 'thornstorm-inhale') {
      return callout(event, 'mythic', 'Thornstorm Mantle', 'Inhale: enemies will be pulled in.', 90);
    }
    if (event.kind === 'areaGather') {
      return callout(event, 'gather', 'Thornstorm Mantle', 'Gathering enemies for the quill storm.', 72);
    }
    if (event.kind === 'radialProjectileBurst') {
      return callout(event, 'mythic', 'Thornstorm Mantle', 'Quill storm bursts in every direction.', 90);
    }
  }

  return null;
}
