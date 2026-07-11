import { describe, expect, it } from 'vitest';
import type { CombatFeedbackCue } from '../src/presentation/combat-feedback';
import { projectCombatFeedbackVisual } from '../src/render/combat-feedback-visuals';

function cue(overrides: Partial<CombatFeedbackCue> = {}): CombatFeedbackCue {
  return {
    tick: 100,
    kind: 'attack',
    x: 0,
    y: 0,
    intensity: 1,
    lifetimeTicks: 10,
    expiresAtTick: 110,
    ...overrides,
  };
}

describe('combat feedback ring visuals', () => {
  it('expands and fades a cue deterministically over its fixed-tick lifetime', () => {
    const start = projectCombatFeedbackVisual(cue(), 100);
    const middle = projectCombatFeedbackVisual(cue(), 105);
    const end = projectCombatFeedbackVisual(cue(), 110);

    expect(start.progress).toBe(0);
    expect(start.radius).toBeCloseTo(7.44);
    expect(start.opacity).toBeCloseTo(0.78);
    expect(middle.progress).toBe(0.5);
    expect(middle.radius).toBeGreaterThan(start.radius);
    expect(middle.opacity).toBeLessThan(start.opacity);
    expect(end).toMatchObject({ progress: 1, opacity: 0 });
    expect(end.radius).toBeGreaterThan(middle.radius);
  });

  it('scales important cues by their existing deterministic intensity', () => {
    const light = projectCombatFeedbackVisual(cue({ kind: 'enemy-death', intensity: 1 }), 100);
    const strong = projectCombatFeedbackVisual(cue({ kind: 'enemy-death', intensity: 4 }), 100);

    expect(strong.radius).toBeCloseTo(light.radius * 4);
    expect(strong.thickness).toBeGreaterThan(light.thickness);
  });

  it('clamps invalid render ages without changing cue data', () => {
    const frozenCue = Object.freeze(cue({ kind: 'pickup', lifetimeTicks: 8 }));

    expect(projectCombatFeedbackVisual(frozenCue, 80).progress).toBe(0);
    expect(projectCombatFeedbackVisual(frozenCue, 200).progress).toBe(1);
    expect(frozenCue).toMatchObject({ tick: 100, lifetimeTicks: 8, kind: 'pickup' });
  });
});
