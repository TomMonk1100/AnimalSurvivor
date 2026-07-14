import { describe, expect, it } from 'vitest';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  COMBAT_IMPACT_STYLE,
  combatImpactRecipeForStyle,
  createCombatImpactPresentation,
  DEFAULT_NORMAL_IMPACT_LIFETIME_TICKS,
} from '../src/render/combat-impact-presentation';

function event(overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView {
  return {
    kind: 'enemyHit',
    tick: 40,
    x: 120,
    y: 84,
    amount: 16,
    critical: false,
    sourceId: 'greg-fox-swipe',
    targetId: 42,
    pickupKind: null,
    ...overrides,
  };
}

describe('combat impact presentation', () => {
  it('keeps normal and critical hit sparks alive for their distinct fixed-tick windows', () => {
    const presentation = createCombatImpactPresentation({
      capacity: 4,
      normalLifetimeTicks: 6,
      criticalLifetimeTicks: 12,
    });
    const normal = event();
    const critical = event({ targetId: 43, x: 140, critical: true, amount: 28 });

    const start = presentation.update([normal, critical], 40);
    expect(start.impacts.count).toBe(2);
    expect(Array.from(start.impacts.style.slice(0, start.impacts.count))).toEqual([
      COMBAT_IMPACT_STYLE.enemyHit,
      COMBAT_IMPACT_STYLE.criticalEnemyHit,
    ]);
    expect(start.impacts.sparkCount[1]).toBeGreaterThan(start.impacts.sparkCount[0]!);
    expect(start.impacts.coreScale[1]).toBeGreaterThan(start.impacts.coreScale[0]!);

    // The terminal tick remains in the packed prefix with exact zero opacity;
    // it is released only after the renderer has seen the no-pop endpoint.
    const atNormalTerminal = presentation.update([], 46);
    expect(atNormalTerminal.impacts.count).toBe(2);
    expect(atNormalTerminal.impacts.progress[0]).toBe(1);
    expect(atNormalTerminal.impacts.opacity[0]).toBe(0);
    expect(atNormalTerminal.impacts.style[1]).toBe(COMBAT_IMPACT_STYLE.criticalEnemyHit);
    expect(atNormalTerminal.impacts.progress[1]).toBeCloseTo(0.5);

    expect(presentation.update([], 47).impacts.count).toBe(1);
    const atCriticalTerminal = presentation.update([], 52);
    expect(atCriticalTerminal.impacts.count).toBe(1);
    expect(atCriticalTerminal.impacts.opacity[0]).toBe(0);
    expect(presentation.update([], 53).impacts.count).toBe(0);
  });

  it('uses a calm ten-tick normal contact with a true-zero terminal sample', () => {
    const presentation = createCombatImpactPresentation({ capacity: 1 });
    const hit = event({ tick: 100 });
    const releaseOpacities: number[] = [];

    expect(DEFAULT_NORMAL_IMPACT_LIFETIME_TICKS).toBe(10);
    for (let tick = 100; tick <= 110; tick++) {
      const frame = presentation.update(tick === 100 ? [hit] : [], tick);
      expect(frame.impacts.count).toBe(1);
      if (tick >= 106) releaseOpacities.push(frame.impacts.opacity[0]!);
    }

    // No age-based sine modulation remains: after release starts, opacity
    // moves only toward the exact terminal zero.
    for (let index = 1; index < releaseOpacities.length; index++) {
      expect(releaseOpacities[index]!).toBeLessThanOrEqual(releaseOpacities[index - 1]!);
    }
    expect(releaseOpacities.at(-1)).toBe(0);
    expect(presentation.update([], 111).impacts.count).toBe(0);
  });

  it('deduplicates repeated authoritative event arrays and reuses its packed buffer', () => {
    const presentation = createCombatImpactPresentation({ capacity: 2 });
    const hit = event({ tick: 100, targetId: 'slime-8' });

    const first = presentation.update([hit, hit], 100);
    const firstBuffer = first.impacts;
    expect(first.impacts.count).toBe(1);

    const repeated = presentation.update([hit], 101);
    expect(repeated).toBe(first);
    expect(repeated.impacts).toBe(firstBuffer);
    expect(repeated.impacts.count).toBe(1);
    expect(repeated.impacts.eventTick[0]).toBe(100);
    expect(repeated.impacts.progress[0]).toBeGreaterThan(0);
  });

  it('protects critical impacts over routine hits when the bounded pool is saturated', () => {
    const presentation = createCombatImpactPresentation({ capacity: 1 });
    const routine = event({ targetId: 1 });
    const critical = event({ targetId: 2, critical: true, amount: 40 });

    const frame = presentation.update([routine, critical], 40);
    expect(frame.impacts.count).toBe(1);
    expect(frame.impacts.style[0]).toBe(COMBAT_IMPACT_STYLE.criticalEnemyHit);
    expect(frame.impacts.sparkCount[0]).toBe(combatImpactRecipeForStyle(COMBAT_IMPACT_STYLE.criticalEnemyHit)?.sparkCount);
  });

  it('uses a separate coral danger burst for player damage when enabled', () => {
    const playerHit = event({ kind: 'playerHit', targetId: -1, sourceId: 'enemy-contact', critical: false });
    const enabled = createCombatImpactPresentation({ includePlayerHitBursts: true });
    const disabled = createCombatImpactPresentation({ includePlayerHitBursts: false });

    expect(enabled.update([playerHit], 40).impacts.style[0]).toBe(COMBAT_IMPACT_STYLE.playerHit);
    expect(disabled.update([playerHit], 40).impacts.count).toBe(0);
  });
});
