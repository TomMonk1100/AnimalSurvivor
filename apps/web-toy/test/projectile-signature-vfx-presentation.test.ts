import { describe, expect, it } from 'vitest';
import { COMBAT_DAMAGE_SOURCE, makeId } from '@sim';
import type { CategorySnapshot } from '../src/contracts';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  HERO_SPIT_BODY_VISUAL_FOOTPRINT,
  HERO_SPIT_BODY_MIN_FORWARD_SCALE,
  HERO_SPIT_BODY_MIN_LATERAL_SCALE,
  HERO_SPIT_BODY_OPACITY,
  HERO_SPIT_CRITICAL_DROPLET_COUNT,
  HERO_SPIT_CONTACT_KIND,
  HERO_SPIT_CORE_LIFETIME_TICKS,
  HERO_SPIT_CORE_OPACITY_CAP,
  HERO_SPIT_GROUND_CONTACT_OPACITY_CAP,
  HERO_SPIT_MUZZLE_OFFSET_RATIO,
  HERO_SPIT_ROUTINE_DROPLET_COUNT,
  HERO_SPIT_TRAVEL_CONTACT_LEAD_RATIO,
  createHeroSpitProjectileSignaturePresentation,
  heroSpitBodyForwardScaleForRadius,
} from '../src/render/projectile-signature-vfx-presentation';

interface ProjectileEntry {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly role?: number;
  readonly source?: number;
  readonly critical?: boolean;
}

function projectiles(entries: readonly ProjectileEntry[]): CategorySnapshot {
  const capacity = entries.length;
  const snapshot: CategorySnapshot = {
    category: 'projectile',
    count: capacity,
    id: new Int32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    value: new Float32Array(capacity),
    velocityX: new Float32Array(capacity),
    velocityY: new Float32Array(capacity),
    hp: new Float32Array(capacity),
    maxHp: new Float32Array(capacity),
    archetype: new Uint8Array(capacity),
    role: new Uint8Array(capacity),
    source: new Uint8Array(capacity),
    critical: new Uint8Array(capacity),
    marked: new Uint8Array(capacity),
    attackCharge: new Float32Array(capacity),
  };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    snapshot.id[index] = entry.id;
    snapshot.x[index] = entry.x;
    snapshot.y[index] = entry.y;
    snapshot.radius[index] = entry.radius ?? 12;
    snapshot.velocityX[index] = entry.velocityX ?? 480;
    snapshot.velocityY[index] = entry.velocityY ?? 0;
    snapshot.role[index] = entry.role ?? 0;
    snapshot.source[index] = entry.source ?? COMBAT_DAMAGE_SOURCE.heroSpit;
    snapshot.critical[index] = entry.critical ? 1 : 0;
  }
  return snapshot;
}

function spitImpact(tick: number, overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView {
  return {
    kind: 'enemyHit',
    tick,
    x: 146,
    y: 88,
    amount: 18,
    critical: false,
    sourceId: 'gracie-spit',
    targetId: makeId(31, 2),
    pickupKind: null,
    ...overrides,
  };
}

describe('heroSpit projectile signature VFX presentation', () => {
  it('keeps Gracie’s real projectile prominent without letting its pale body dominate the flash budget', () => {
    expect(HERO_SPIT_BODY_MIN_LATERAL_SCALE).toBeGreaterThanOrEqual(30);
    expect(HERO_SPIT_BODY_MIN_FORWARD_SCALE).toBeGreaterThanOrEqual(42);
    expect(HERO_SPIT_BODY_OPACITY).toBeGreaterThanOrEqual(0.5);
    expect(HERO_SPIT_BODY_OPACITY).toBeLessThanOrEqual(0.6);
    expect(HERO_SPIT_CORE_OPACITY_CAP).toBeLessThanOrEqual(0.66);
  });

  it('derives compact anatomy only from a real current heroSpit projectile snapshot', () => {
    const projection = createHeroSpitProjectileSignaturePresentation({ projectileCapacity: 16 });
    const live = projectiles([{ id: makeId(2, 1), x: 108, y: 76 }]);
    const frame = projection.update(projectiles([]), live, 0.5, 40);
    const visualFootprint = heroSpitBodyForwardScaleForRadius(12);

    expect(frame.cores.count).toBe(1);
    expect(frame.debris.count).toBe(HERO_SPIT_ROUTINE_DROPLET_COUNT);
    expect(frame.groundContacts.count).toBe(1);
    expect(frame.groundContacts.kind[0]).toBe(HERO_SPIT_CONTACT_KIND.travel);
    expect(frame.groundContacts.x[0]).toBeCloseTo(
      frame.cores.x[0]! + visualFootprint * HERO_SPIT_TRAVEL_CONTACT_LEAD_RATIO,
    );
    expect(frame.groundContacts.y[0]).toBeCloseTo(frame.cores.y[0]!);
    expect(frame.cores.scale[0]).toBeLessThan(HERO_SPIT_BODY_VISUAL_FOOTPRINT * 0.31);
    // The hot core is a compact muzzle treatment ahead of the true snapshot;
    // the body remains on x=108/y=76 while the core/contact share the real
    // snapshot-owned head offset.
    expect(frame.cores.x[0]).toBeGreaterThan(108 + visualFootprint * 0.25);
    expect(frame.cores.x[0]).toBeLessThanOrEqual(108 + visualFootprint * HERO_SPIT_MUZZLE_OFFSET_RATIO + 0.001);
    for (let index = 0; index < frame.debris.count; index++) {
      expect(frame.debris.x[index]).toBeLessThan(108 - visualFootprint * 0.5);
    }
    const tailDistance = Math.hypot(
      frame.debris.x[0]! - frame.debris.x[1]!,
      frame.debris.y[0]! - frame.debris.y[1]!,
    );
    expect(tailDistance).toBeGreaterThan(9);
    expect(frame.groundContacts.scale[0]).toBeLessThan(visualFootprint * 0.31);
    expect(frame.groundContacts.opacity[0]).toBeLessThanOrEqual(HERO_SPIT_GROUND_CONTACT_OPACITY_CAP);

    const coreBuffer = frame.cores;
    const debrisBuffer = frame.debris;
    const contactBuffer = frame.groundContacts;
    const next = projection.update(live, live, 1, 41);
    expect(next).toBe(frame);
    expect(next.cores).toBe(coreBuffer);
    expect(next.debris).toBe(debrisBuffer);
    expect(next.groundContacts).toBe(contactBuffer);

    const rejected = createHeroSpitProjectileSignaturePresentation({ projectileCapacity: 16 }).update(
      projectiles([]),
      projectiles([{ id: makeId(3, 1), x: 20, y: 30, source: COMBAT_DAMAGE_SOURCE.traitProjectile }]),
      1,
      40,
    );
    expect(rejected.cores.count).toBe(0);
    expect(rejected.debris.count).toBe(0);
    expect(rejected.groundContacts.count).toBe(0);
  });

  it('interpolates only matching generations and treats a reused slot as a fresh projectile', () => {
    const projection = createHeroSpitProjectileSignaturePresentation({ projectileCapacity: 16 });
    const visualFootprint = heroSpitBodyForwardScaleForRadius(12);
    // Packed id zero is a legal slot/generation combination, so the retained
    // projector must use an explicit active bit rather than treating id=0 as
    // an absent predecessor.
    const generationOne = makeId(0, 0);
    const previous = projectiles([{ id: generationOne, x: 100, y: 70 }]);
    const current = projectiles([{ id: generationOne, x: 108, y: 70 }]);
    const first = projection.update(previous, current, 0.5, 50);
    expect(first.groundContacts.x[0]).toBeCloseTo(
      104 + visualFootprint * (HERO_SPIT_MUZZLE_OFFSET_RATIO + HERO_SPIT_TRAVEL_CONTACT_LEAD_RATIO),
    );

    const reused = projectiles([{ id: makeId(0, 1), x: 300, y: 200 }]);
    const fresh = projection.update(current, reused, 0.5, 51);
    // The generation guard rejects the old slot position instead of drawing a
    // fabricated 104 -> 300 trail, and the short core restarts at age zero.
    expect(fresh.groundContacts.x[0]).toBeCloseTo(
      300 + visualFootprint * (HERO_SPIT_MUZZLE_OFFSET_RATIO + HERO_SPIT_TRAVEL_CONTACT_LEAD_RATIO),
    );
    expect(fresh.cores.count).toBe(1);
    expect(fresh.cores.opacity[0]).toBeGreaterThan(0.3);
  });

  it('keeps the core to four ticks while the real projectile retains its normal-blend tail', () => {
    const projection = createHeroSpitProjectileSignaturePresentation({ projectileCapacity: 16 });
    const live = projectiles([{ id: makeId(8, 1), x: 42, y: 66, critical: true }]);
    projection.update(projectiles([]), live, 1, 60);
    const afterCore = projection.update(live, live, 1, 60 + HERO_SPIT_CORE_LIFETIME_TICKS);

    expect(afterCore.cores.count).toBe(0);
    expect(afterCore.debris.count).toBe(HERO_SPIT_CRITICAL_DROPLET_COUNT);
    expect(afterCore.groundContacts.kind[0]).toBe(HERO_SPIT_CONTACT_KIND.travel);
  });

  it('anchors impact contact only to copied resolved gracie-spit hit evidence and deduplicates it', () => {
    const projection = createHeroSpitProjectileSignaturePresentation({ projectileCapacity: 16 });
    const impact = spitImpact(70);
    const first = projection.update(projectiles([]), projectiles([]), 1, 70, [impact]);
    const buffers = first.groundContacts;
    expect(first.cores.count).toBe(1);
    expect(first.cores.x[0]).toBeCloseTo(146);
    expect(first.cores.y[0]).toBeCloseTo(88);
    expect(first.cores.opacity[0]).toBeGreaterThan(0.3);
    expect(first.debris.count).toBe(2);
    expect(Math.hypot(
      first.debris.x[0]! - first.debris.x[1]!,
      first.debris.y[0]! - first.debris.y[1]!,
    )).toBeGreaterThan(8);
    expect(first.groundContacts.count).toBe(1);
    expect(first.groundContacts.kind[0]).toBe(HERO_SPIT_CONTACT_KIND.impact);
    expect(first.groundContacts.x[0]).toBeCloseTo(146);
    expect(first.groundContacts.y[0]).toBeCloseTo(88);
    expect(first.groundContacts.opacity[0]).toBeGreaterThan(0);
    expect(first.groundContacts.opacity[0]).toBeLessThanOrEqual(HERO_SPIT_GROUND_CONTACT_OPACITY_CAP);

    const repeatedAndForeign = projection.update(projectiles([]), projectiles([]), 1, 71, [
      impact,
      spitImpact(71, { sourceId: 'thornstorm-mantle', x: 330, y: 220 }),
    ]);
    expect(repeatedAndForeign).toBe(first);
    expect(repeatedAndForeign.groundContacts).toBe(buffers);
    expect(repeatedAndForeign.cores.count).toBe(1);
    expect(repeatedAndForeign.debris.count).toBe(2);
    expect(repeatedAndForeign.groundContacts.count).toBe(1);
    expect(repeatedAndForeign.groundContacts.kind[0]).toBe(HERO_SPIT_CONTACT_KIND.impact);

    const terminal = projection.update(projectiles([]), projectiles([]), 1, 80);
    expect(terminal.groundContacts.count).toBe(1);
    expect(terminal.groundContacts.opacity[0]).toBe(0);
    expect(projection.update(projectiles([]), projectiles([]), 1, 81).groundContacts.count).toBe(0);
  });
});
