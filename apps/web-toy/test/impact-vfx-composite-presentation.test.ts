import { describe, expect, it } from 'vitest';
import {
  COMBAT_IMPACT_STYLE,
  createCombatImpactPresentation,
} from '../src/render/combat-impact-presentation';
import { createImpactVfxCompositePresentation } from '../src/render/impact-vfx-composite-presentation';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';

function hit(overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView {
  return {
    kind: 'enemyHit',
    tick: 20,
    x: 96,
    y: 72,
    amount: 24,
    critical: false,
    sourceId: 'greg-fox-swipe',
    targetId: 1,
    pickupKind: null,
    ...overrides,
  };
}

describe('impact VFX composite presentation', () => {
  it('builds a short textured core, three routine shards, and one fading ground ring', () => {
    const impacts = createCombatImpactPresentation({ capacity: 4 });
    const composite = createImpactVfxCompositePresentation({ capacity: 4, coreLifetimeTicks: 4 });

    const start = composite.update(impacts.update([hit()], 20));
    expect(start.cores.count).toBe(1);
    expect(start.cores.opacity[0]).toBeGreaterThan(0);
    expect(start.cores.scale[0]).toBeLessThanOrEqual(start.rings.scale[0]! * 0.7);
    expect(start.debris.count).toBe(3);
    expect(start.rings.count).toBe(1);
    expect(start.rings.opacity[0]).toBeGreaterThan(0);
    const startCoreOpacity = start.cores.opacity[0]!;
    const startDebrisLift = start.debris.lift[0]!;

    const ageTwo = composite.update(impacts.update([], 22));
    expect(ageTwo.cores.count).toBe(1);
    expect(ageTwo.cores.opacity[0]).toBeLessThan(startCoreOpacity);
    expect(ageTwo.debris.lift[0]).toBeLessThan(startDebrisLift);

    const afterCore = composite.update(impacts.update([], 24));
    expect(afterCore.cores.count).toBe(0);
  });

  it('emits seven deterministic shards for a critical impact', () => {
    const impacts = createCombatImpactPresentation({ capacity: 4 });
    const composite = createImpactVfxCompositePresentation({ capacity: 4 });
    const event = hit({ critical: true, targetId: 2, amount: 60 });

    const first = composite.update(impacts.update([event], 21));
    const firstX = Array.from(first.debris.x.slice(0, first.debris.count));
    const firstY = Array.from(first.debris.y.slice(0, first.debris.count));
    expect(first.debris.count).toBe(7);
    expect(first.debris.style[0]).toBe(COMBAT_IMPACT_STYLE.criticalEnemyHit);

    const repeated = composite.update(impacts.update([], 21));
    expect(Array.from(repeated.debris.x.slice(0, repeated.debris.count))).toEqual(firstX);
    expect(Array.from(repeated.debris.y.slice(0, repeated.debris.count))).toEqual(firstY);
  });

  it('spends constrained visual capacity on critical impacts before routine hits', () => {
    const impacts = createCombatImpactPresentation({ capacity: 3 });
    const composite = createImpactVfxCompositePresentation({ capacity: 1, debrisCapacity: 7 });
    const normal = hit({ targetId: 3 });
    const critical = hit({ targetId: 4, x: 120, critical: true, amount: 64 });

    const frame = composite.update(impacts.update([normal, critical], 20));
    expect(frame.cores.count).toBe(1);
    expect(frame.cores.style[0]).toBe(COMBAT_IMPACT_STYLE.criticalEnemyHit);
    expect(frame.debris.count).toBe(7);
    expect(frame.rings.style[0]).toBe(COMBAT_IMPACT_STYLE.criticalEnemyHit);
  });

  it('reuses bounded descriptor buffers across frames', () => {
    const impacts = createCombatImpactPresentation({ capacity: 2 });
    const composite = createImpactVfxCompositePresentation({ capacity: 2 });
    const first = composite.update(impacts.update([hit()], 20));
    const cores = first.cores;
    const debris = first.debris;
    const rings = first.rings;

    const second = composite.update(impacts.update([], 21));
    expect(second).toBe(first);
    expect(second.cores).toBe(cores);
    expect(second.debris).toBe(debris);
    expect(second.rings).toBe(rings);
  });
});
