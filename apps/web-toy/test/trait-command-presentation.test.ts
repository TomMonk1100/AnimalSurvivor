import { describe, expect, it } from 'vitest';
import {
  hasResolvedOrbitContact,
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
    expect(projectTraitCommandEffect(command({ kind: 'spawnProjectileBurst', tag: 'greg-rush-rake' }))?.material)
      .toBe('rush-rake');
    expect(projectTraitCommandEffect(command({ kind: 'radialProjectileBurst' }))?.kind).toBe('radial-burst');
    expect(projectTraitCommandEffect(command({
      kind: 'orbitingDamage', count: 2, radius: 50, range: 18, speed: 0.05,
    }))?.kind).toBe('orbiting-damage');
    expect(projectTraitCommandEffect(command({ kind: 'areaGather' }))?.kind).toBe('gather');
    expect(projectTraitCommandEffect(command({ kind: 'areaKnockback' }))?.kind).toBe('knockback');
    expect(projectTraitCommandEffect(command({ kind: 'applyAreaDamage' }))?.kind).toBe('area-damage');
    expect(projectTraitCommandEffect(command({
      kind: 'meleeArc', dirX: 1, dirY: 0, arc: 1.2, range: 68, meleeArcResolved: true,
    }))?.kind).toBe('melee-arc');
    expect(projectTraitCommandEffect(command({ kind: 'spawnZone' }))?.kind).toBe('zone-spawn');
    expect(projectTraitCommandEffect(command({ kind: 'playTraitCue' }))?.kind).toBe('trait-cue');
    expect(projectTraitCommandEffect(command({ kind: 'markTargets' }))?.kind).toBe('mark-pulse');
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

  it('gives the hero instincts dedicated readable treatments', () => {
    expect(projectTraitCommandEffect(command({ tag: 'benny-brace', kind: 'areaKnockback' }))?.material)
      .toBe('benny-brace');
    expect(projectTraitCommandEffect(command({ tag: 'gracie-scout' }))?.material)
      .toBe('gracie-scout');
  });

  it('projects Bat Ears echo marks as a violet sonar pulse and Midnight Radar as cyan', () => {
    const batEarsMark = command({
      kind: 'markTargets', sourceId: 'bat-ears', tag: 'echo-mark', count: 5, radius: 260,
    });
    const batEarsProfile = projectTraitCommandEffect(batEarsMark);
    expect(batEarsProfile).toMatchObject({
      kind: 'mark-pulse', material: 'bat-ears-sonar', motion: 'pulse', directed: false,
    });
    expect(resolveTraitCommandEffectRadius(batEarsMark, batEarsProfile!)).toBe(260);

    expect(projectTraitCommandEffect(command({
      kind: 'markTargets', sourceId: 'midnight-radar', tag: 'night-vision', radius: 320,
    }))?.material).toBe('midnight-radar-sonar');
  });

  it('renders Monarch Brood as a gold orbit while preserving generic Firefly visuals', () => {
    const monarchBrood = command({
      kind: 'orbitingDamage', sourceId: 'monarch-brood', count: 4, radius: 72, speed: 0.04,
    });
    const monarchProfile = projectTraitCommandEffect(monarchBrood);
    expect(monarchProfile).toMatchObject({
      kind: 'orbiting-damage', material: 'monarch-brood-orbit', motion: 'pulse', directed: false,
    });
    expect(resolveTraitCommandEffectRadius(monarchBrood, monarchProfile!)).toBe(72);

    expect(projectTraitCommandEffect(command({
      kind: 'orbitingDamage', sourceId: 'firefly-colony', count: 4, radius: 72, speed: 0.04,
    }))?.material).toBe('orbiting-damage');
  });

  it('only treats Firefly contact as damage feedback after the executor exposes exact endpoints', () => {
    const genericOrbit = command({
      kind: 'orbitingDamage', sourceId: 'firefly-colony', count: 2, radius: 50, speed: 0.05,
    });
    expect(hasResolvedOrbitContact(genericOrbit)).toBe(false);

    expect(hasResolvedOrbitContact(command({
      kind: 'orbitingDamage',
      resolvedOrbitHitCount: 1,
      resolvedOrbitSourceX: new Float32Array([42]),
      resolvedOrbitSourceY: new Float32Array([55]),
      resolvedOrbitHitX: new Float32Array([47]),
      resolvedOrbitHitY: new Float32Array([58]),
    }))).toBe(true);

    // A count without all endpoint buffers must never invent a contact flash.
    expect(hasResolvedOrbitContact(command({
      kind: 'orbitingDamage', resolvedOrbitHitCount: 1,
      resolvedOrbitHitX: new Float32Array([47]), resolvedOrbitHitY: new Float32Array([58]),
    }))).toBe(false);
  });

  it('gives each current weapon family a distinct source-aware command treatment', () => {
    expect(projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', count: 3,
    }))?.material).toBe('quill-volley');
    expect(projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'owl-pinions', count: 4,
    }))?.material).toBe('owl-volley');
    expect(projectTraitCommandEffect(command({
      kind: 'areaKnockback', sourceId: 'puffer-pouch', radius: 140,
    }))?.material).toBe('puffer-blast');
    expect(projectTraitCommandEffect(command({
      kind: 'areaKnockback', sourceId: 'armadillo-greaves', radius: 90,
    }))?.material).toBe('armadillo-roll');
    expect(projectTraitCommandEffect(command({
      kind: 'applyAreaDamage', sourceId: 'crab-pincers', radius: 62,
    }))?.material).toBe('crab-crush');
    expect(projectTraitCommandEffect(command({
      kind: 'applyAreaDamage', sourceId: 'meteor-mauler', radius: 100,
    }))?.material).toBe('meteor-impact');
    expect(projectTraitCommandEffect(command({
      kind: 'spawnZone', sourceId: 'skunk-brush', tag: 'stink-cloud', radius: 72,
    }))?.material).toBe('skunk-cloud');
    expect(projectTraitCommandEffect(command({
      kind: 'spawnZone', sourceId: 'royal-stinkcloud', tag: 'royal-stink', radius: 110,
    }))?.material).toBe('royal-stink-cloud');
    expect(projectTraitCommandEffect(command({
      kind: 'radialProjectileBurst', sourceId: 'thornstorm-mantle', count: 16,
    }))?.material).toBe('thornstorm-volley');
  });

  it('uses the authored Thunderbug charge treatment when its tag is available', () => {
    const profile = projectTraitCommandEffect(command({ tag: 'thunderbug-charge' }));
    expect(profile?.material).toBe('thunderbug-telegraph');
    expect(profile?.lifetimeTicks).toBe(18);
  });

  it('uses distinct apex-boss telegraph treatments for charge and volley beats', () => {
    expect(projectTraitCommandEffect(command({ tag: 'boss-charge', dirX: 1, dirY: 0 }))?.material)
      .toBe('boss-charge');
    expect(projectTraitCommandEffect(command({ tag: 'boss-volley', radius: 240 }))?.material)
      .toBe('boss-volley');
    expect(projectTraitCommandEffect(command({ tag: 'saltwind-charge', dirX: 1, dirY: 0 }))?.material)
      .toBe('saltwind-charge');
    expect(projectTraitCommandEffect(command({ tag: 'saltwind-sandstorm', radius: 240 }))?.material)
      .toBe('saltwind-sandstorm');
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
