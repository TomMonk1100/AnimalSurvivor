import type { TraitPresentationEventView } from '@sim';
import type { CombatPresentationEventView } from './combat-presentation-events';

/**
 * Renderer-only bridge for defensive outcomes. Combat remains authoritative:
 * this module only turns already-resolved event records into short visual cues
 * and never derives, changes, or feeds a result back to the simulation.
 */
export const MAX_COMBAT_DEFENSE_PRESENTATION_EVENTS = 16;

const EMPTY_COMMANDS: readonly TraitPresentationEventView[] = Object.freeze([]);
const EMPTY_HIT_COORDINATES = new Float32Array(0);

function sourceFor(event: CombatPresentationEventView): string | null {
  switch (event.kind) {
    case 'shieldAbsorb':
    case 'shieldBreak':
      return 'fluffy-shield';
    case 'armorBlock':
      return 'armor-block';
    case 'dodge':
      return 'fox-dodge';
    default:
      return null;
  }
}

/**
 * Project only high-signal defensive events into the existing bounded trait
 * effect renderer. Non-defensive hit/heal/pickup records intentionally remain
 * damage-number feedback, avoiding duplicate visual noise on dense swarms.
 */
export function projectCombatDefensePresentationEvents(
  events: readonly CombatPresentationEventView[],
): readonly TraitPresentationEventView[] {
  if (events.length === 0) return EMPTY_COMMANDS;
  const commands: TraitPresentationEventView[] = [];
  for (const event of events) {
    const sourceId = sourceFor(event);
    if (sourceId === null) continue;
    commands.push(Object.freeze({
      kind: 'playTraitCue',
      sourceId,
      tick: event.tick,
      targeting: 'none',
      originX: event.x,
      originY: event.y,
      dirX: 1,
      dirY: 0,
      count: 1,
      damage: event.amount,
      speed: 0,
      radius: 0,
      strength: Math.max(1, event.amount),
      facing: 0,
      spread: 0,
      jumps: 0,
      range: 0,
      tag: sourceId,
      durationTicks: 0,
      intervalTicks: 0,
      amount: 0,
      arc: 0,
      meleeArcResolved: false,
      resolvedHitCount: 0,
      resolvedHitX: EMPTY_HIT_COORDINATES,
      resolvedHitY: EMPTY_HIT_COORDINATES,
      resolvedOrbitHitCount: 0,
      resolvedOrbitHitX: EMPTY_HIT_COORDINATES,
      resolvedOrbitHitY: EMPTY_HIT_COORDINATES,
      resolvedOrbitSourceX: EMPTY_HIT_COORDINATES,
      resolvedOrbitSourceY: EMPTY_HIT_COORDINATES,
    }));
    if (commands.length >= MAX_COMBAT_DEFENSE_PRESENTATION_EVENTS) break;
  }
  return commands.length === 0 ? EMPTY_COMMANDS : Object.freeze(commands);
}
