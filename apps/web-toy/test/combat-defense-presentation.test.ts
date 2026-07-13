import { describe, expect, it } from 'vitest';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  MAX_COMBAT_DEFENSE_PRESENTATION_EVENTS,
  projectCombatDefensePresentationEvents,
} from '../src/presentation/combat-defense-presentation';

function event(kind: CombatPresentationEventView['kind']): CombatPresentationEventView {
  return {
    kind,
    tick: 42,
    x: 120,
    y: 80,
    amount: 9,
    critical: false,
    sourceId: 'enemy-contact',
    targetId: -1,
    pickupKind: null,
  };
}

describe('combat defense presentation bridge', () => {
  it('projects only resolved defensive outcomes into explicit physical cues', () => {
    expect(projectCombatDefensePresentationEvents([
      event('enemyHit'),
      event('shieldAbsorb'),
      event('armorBlock'),
      event('dodge'),
      event('shieldBreak'),
    ]).map((cue) => ({ sourceId: cue.sourceId, tag: cue.tag, kind: cue.kind }))).toEqual([
      { sourceId: 'fluffy-shield', tag: 'fluffy-shield', kind: 'playTraitCue' },
      { sourceId: 'armor-block', tag: 'armor-block', kind: 'playTraitCue' },
      { sourceId: 'fox-dodge', tag: 'fox-dodge', kind: 'playTraitCue' },
      { sourceId: 'fluffy-shield', tag: 'fluffy-shield', kind: 'playTraitCue' },
    ]);
  });

  it('keeps a bounded renderer-only cue list under repeated impacts', () => {
    const cues = projectCombatDefensePresentationEvents(
      Array.from({ length: MAX_COMBAT_DEFENSE_PRESENTATION_EVENTS + 5 }, () => event('armorBlock')),
    );
    expect(cues).toHaveLength(MAX_COMBAT_DEFENSE_PRESENTATION_EVENTS);
  });
});
