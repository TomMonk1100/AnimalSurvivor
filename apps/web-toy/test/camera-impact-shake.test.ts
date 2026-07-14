import { describe, expect, it } from 'vitest';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  CAMERA_IMPACT_SHAKE_DURATION_TICKS,
  CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS,
  CAMERA_IMPACT_SHAKE_MAX_WORLD_UNITS,
  createCameraImpactShakePresentation,
} from '../src/render/camera-impact-shake';

function event(overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView {
  return {
    kind: 'enemyHit', tick: 20, x: 100, y: 80, amount: 12, critical: false,
    sourceId: 'greg-fox-swipe', targetId: 7, pickupKind: null,
    ...overrides,
  };
}

describe('camera impact shake presentation', () => {
  it('does not move the camera for a run of ordinary enemy contacts', () => {
    const presentation = createCameraImpactShakePresentation();
    for (let tick = 0; tick < 80; tick += 4) {
      const ordinaryHit = event({
        tick,
        amount: 4 + tick / 10,
        critical: false,
        targetId: tick + 1,
        sourceId: `ordinary-${tick}`,
      });
      expect(presentation.update([ordinaryHit], tick)).toMatchObject({ active: false, x: 0, y: 0 });
    }
  });

  it('triggers only qualifying impacts, stays under two world units, and expires in five ticks', () => {
    const presentation = createCameraImpactShakePresentation();
    expect(presentation.update([event()], 20).active).toBe(false);

    const playerHit = event({
      kind: 'playerHit', tick: 40, targetId: -1, sourceId: 'enemy-contact', amount: 4,
    });
    const started = presentation.update([playerHit], 40);
    expect(started.active).toBe(true);
    expect(Math.hypot(started.x, started.y)).toBeLessThanOrEqual(CAMERA_IMPACT_SHAKE_MAX_WORLD_UNITS);

    const late = presentation.update([], 40 + CAMERA_IMPACT_SHAKE_DURATION_TICKS);
    expect(late).toMatchObject({ active: false, x: 0, y: 0 });
  });

  it('admits only the top quartile of known critical amounts after the history warms', () => {
    const presentation = createCameraImpactShakePresentation();
    for (const [tick, amount] of [[0, 10], [20, 20], [40, 30], [60, 40]] as const) {
      expect(presentation.update([event({ tick, amount, critical: true, targetId: tick + 1 })], tick).active)
        .toBe(true);
    }

    // The retained 75th-percentile threshold is 30. A smaller crit still
    // receives its local white flash, but does not disturb camera framing.
    expect(presentation.update([event({ tick: 80, amount: 29, critical: true, targetId: 81 })], 80).active)
      .toBe(false);
    expect(presentation.update([event({ tick: 100, amount: 30, critical: true, targetId: 101 })], 100).active)
      .toBe(true);
  });

  it('globally rate-limits shakes while keeping the result deterministic', () => {
    const first = createCameraImpactShakePresentation();
    const second = createCameraImpactShakePresentation();
    const firstHit = event({ kind: 'playerHit', tick: 12, sourceId: 'enemy-contact', targetId: -2 });
    const tooSoon = event({ kind: 'playerHit', tick: 12 + CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS - 1, sourceId: 'enemy-contact', targetId: -3 });
    const allowed = event({ kind: 'playerHit', tick: 12 + CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS, sourceId: 'enemy-contact', targetId: -4 });

    const a = first.update([firstHit], 12);
    const b = second.update([firstHit], 12);
    expect(a).toMatchObject({ active: true, x: b.x, y: b.y });
    expect(first.update([tooSoon], tooSoon.tick).active).toBe(false);
    expect(first.update([allowed], allowed.tick).active).toBe(true);
  });

  it('clears duplicate history on a presentation-tick rewind', () => {
    const presentation = createCameraImpactShakePresentation();
    const playerHit = event({ kind: 'playerHit', tick: 30, sourceId: 'enemy-contact', targetId: -9 });
    expect(presentation.update([playerHit], 30).active).toBe(true);
    presentation.update([], 29);
    expect(presentation.update([playerHit], 30).active).toBe(true);
  });
});
