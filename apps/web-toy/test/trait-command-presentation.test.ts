import { describe, expect, it } from 'vitest';
import {
  hasResolvedMeleeArc,
  projectTraitCommandEffect,
  resolveMeleeArcVariantIndex,
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
    expect(projectTraitCommandEffect(command({
      kind: 'meleeArc', dirX: 1, dirY: 0, arc: 1.2, range: 68, meleeArcResolved: true,
    }))?.kind).toBe('melee-arc');
    expect(projectTraitCommandEffect(command({ kind: 'spawnZone' }))?.kind).toBe('zone-spawn');
    expect(projectTraitCommandEffect(command({ kind: 'playTraitCue' }))?.kind).toBe('trait-cue');
    expect(projectTraitCommandEffect(command({
      kind: 'chainDamage',
      resolvedHitCount: 2,
      resolvedHitX: new Float32Array([52, 78]),
      resolvedHitY: new Float32Array([61, 83]),
    }))?.kind).toBe('chain-lightning');
  });

  it('does not create a chain-lightning effect before simulation resolves a hit', () => {
    expect(projectTraitCommandEffect(command({ kind: 'chainDamage', resolvedHitCount: 0 }))).toBeNull();
    expect(projectTraitCommandEffect(command({
      kind: 'chainDamage',
      resolvedHitCount: 2,
      resolvedHitX: new Float32Array([52]),
      resolvedHitY: new Float32Array([61]),
    }))?.kind).toBe('chain-lightning');
  });

  it('shows a Mantis sector only after authoritative auto-aim resolves a real target', () => {
    // A targetless nearest attack may still carry an authored/fallback direction.
    // That direction alone must never render a false forward slash.
    expect(hasResolvedMeleeArc(command({
      kind: 'meleeArc', dirX: 1, dirY: 0, arc: 1.2, meleeArcResolved: false,
    }))).toBe(false);
    expect(projectTraitCommandEffect(command({
      kind: 'meleeArc', dirX: 1, dirY: 0, arc: 1.2, meleeArcResolved: false,
    }))).toBeNull();

    const resolved = command({
      kind: 'meleeArc', dirX: -0.5, dirY: 0.5, arc: 1.6, range: 88, meleeArcResolved: true,
    });
    expect(hasResolvedMeleeArc(resolved)).toBe(true);
    const profile = projectTraitCommandEffect(resolved)!;
    expect(profile.kind).toBe('melee-arc');
    expect(resolveTraitCommandEffectRadius(command({
      kind: 'meleeArc', dirX: 1, dirY: 0, arc: 1.6, range: 88, radius: 999, meleeArcResolved: true,
    }), profile)).toBe(88);
  });

  it('uses exact fixed Mantis sectors and safely routes arbitrary arcs to the generic slash fallback', () => {
    expect(resolveMeleeArcVariantIndex(1.2)).toBe(0);
    expect(resolveMeleeArcVariantIndex(1.6)).toBe(1);
    expect(resolveMeleeArcVariantIndex(2.4)).toBeNull();
    expect(resolveMeleeArcVariantIndex(Number.NaN)).toBeNull();
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

  it('distinguishes Gecko and Razorstep pad spawn pulses by their authored tags', () => {
    expect(projectTraitCommandEffect(command({ kind: 'spawnZone', tag: 'gecko-pad' }))?.material)
      .toBe('gecko-zone-spawn');
    expect(projectTraitCommandEffect(command({ kind: 'spawnZone', tag: 'razorstep-scythe-pad' }))?.material)
      .toBe('razorstep-zone-spawn');
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
