import { describe, expect, it } from 'vitest';
import {
  projectTraitCommandEffect,
  resolveTraitCommandEffectRadius,
  type TraitCommandPresentationEvent,
} from '../src/render/trait-command-presentation';

function command(overrides: Partial<TraitCommandPresentationEvent> = {}): TraitCommandPresentationEvent {
  return {
    kind: 'telegraph', sourceId: 'test-trait', tick: 10, targeting: 'none',
    originX: 40, originY: 60, dirX: 0, dirY: 0, count: 0, damage: 0,
    speed: 0, radius: 0, strength: 0, facing: 0, spread: 0, range: 0,
    ...overrides,
  };
}

describe('trait command presentation profiles', () => {
  it('maps each supported command to a distinct readable effect', () => {
    expect(projectTraitCommandEffect(command({ kind: 'telegraph' }))?.kind).toBe('telegraph');
    expect(projectTraitCommandEffect(command({ kind: 'spawnProjectileBurst' }))?.kind).toBe('directed-burst');
    expect(projectTraitCommandEffect(command({ kind: 'radialProjectileBurst' }))?.kind).toBe('radial-burst');
    expect(projectTraitCommandEffect(command({ kind: 'areaGather' }))?.kind).toBe('gather');
    expect(projectTraitCommandEffect(command({ kind: 'areaKnockback' }))?.kind).toBe('knockback');
    expect(projectTraitCommandEffect(command({ kind: 'applyAreaDamage' }))?.kind).toBe('area-damage');
    expect(projectTraitCommandEffect(command({ kind: 'playTraitCue' }))?.kind).toBe('trait-cue');
    expect(projectTraitCommandEffect(command({ kind: 'spawnZone' }))).toBeNull();
  });

  it('uses the authored thornstorm telegraph treatment when its tag is available', () => {
    const profile = projectTraitCommandEffect(command({ tag: 'thornstorm-inhale' }));
    expect(profile?.material).toBe('thornstorm-telegraph');
    expect(profile?.lifetimeTicks).toBeGreaterThan(20);
  });

  it('uses the authored Thunderbug charge treatment when its tag is available', () => {
    const profile = projectTraitCommandEffect(command({ tag: 'thunderbug-charge' }));
    expect(profile?.material).toBe('thunderbug-telegraph');
    expect(profile?.lifetimeTicks).toBe(18);
  });

  it('uses authored radius when present and clamps untrusted visual data', () => {
    const profile = projectTraitCommandEffect(command({ kind: 'areaGather' }))!;
    expect(resolveTraitCommandEffectRadius(command({ kind: 'areaGather', radius: 140 }), profile)).toBe(140);
    expect(resolveTraitCommandEffectRadius(command({ kind: 'areaGather', radius: Number.POSITIVE_INFINITY }), profile))
      .toBe(profile.fallbackRadius);
    expect(resolveTraitCommandEffectRadius(command({ kind: 'areaGather', radius: 100_000 }), profile))
      .toBe(profile.maximumRadius);
  });

  it('scales projectile visual radius from burst count when no area radius exists', () => {
    const profile = projectTraitCommandEffect(command({ kind: 'radialProjectileBurst' }))!;
    const few = resolveTraitCommandEffectRadius(command({ kind: 'radialProjectileBurst', count: 2 }), profile);
    const many = resolveTraitCommandEffectRadius(command({ kind: 'radialProjectileBurst', count: 16 }), profile);
    expect(many).toBeGreaterThan(few);
  });
});
