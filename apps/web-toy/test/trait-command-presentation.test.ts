import { describe, expect, it } from 'vitest';
import {
  hasResolvedOrbitContact,
  hasResolvedMeleeArc,
  projectHeroCombatFeedbackEffect,
  projectHeroDefenseEffect,
  projectTraitCommandEffect,
  resolveMeleeArcVariantIndex,
  resolveTraitCommandVisualBlueprint,
  resolveTraitCommandVisualConcurrencyCap,
  resolveTraitCommandVisualIntensity,
  resolveTraitCommandPaletteMaterialKey,
  resolveTraitCommandPaletteLane,
  resolveTraitCommandVisualStage,
  resolveIllustratedHeroUnderlayOpacityMultiplier,
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
    // The renderer deliberately caps this decorative sector below the
    // authoritative 88-unit combat range so a wide cleave stays readable.
    expect(resolveTraitCommandEffectRadius(command({
      kind: 'meleeArc', dirX: 1, dirY: 0, arc: 1.6, range: 88, radius: 999, meleeArcResolved: true,
    }), profile)).toBe(52);
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

  it('gives V1.1 hero signatures source-aware attack and defense profiles', () => {
    expect(projectTraitCommandEffect(command({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe',
      arc: 1.72, range: 96, meleeArcResolved: true,
    }))).toMatchObject({ kind: 'melee-arc', material: 'greg-fox-swipe', directed: true });
    expect(projectTraitCommandEffect(command({
      kind: 'meleeArc', sourceId: 'greg-rush-rake', tag: 'greg-rush-rake',
      arc: 1.5, range: 76, meleeArcResolved: true,
    }))).toMatchObject({ kind: 'melee-arc', material: 'greg-rush-rake', directed: true });
    expect(projectTraitCommandEffect(command({
      kind: 'telegraph', sourceId: 'benny-trample', tag: 'benny-trample-wave', radius: 48,
    }))).toMatchObject({ kind: 'telegraph', material: 'benny-trample-wave', directed: true });
    expect(projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'gracie-spit', tag: 'gracie-spit', count: 3,
    }))).toMatchObject({ kind: 'directed-burst', material: 'gracie-spit', directed: true });
    expect(projectTraitCommandEffect(command({
      kind: 'telegraph', sourceId: 'gracie-spit', tag: 'gracie-spit', count: 3,
    }))).toMatchObject({ kind: 'directed-burst', material: 'gracie-spit', directed: true });

    expect(projectHeroDefenseEffect('fluffy-shield')).toMatchObject({
      kind: 'trait-cue', material: 'fluffy-shield', motion: 'pulse',
    });
    expect(projectHeroDefenseEffect('unknown', 'armor-block')).toMatchObject({
      kind: 'trait-cue', material: 'armor-block', motion: 'pulse',
    });
    expect(projectHeroCombatFeedbackEffect('unknown', 'fox-dodge')).toMatchObject({
      kind: 'trait-cue', material: 'fox-dodge', motion: 'expand',
    });
    expect(projectHeroDefenseEffect('fox-dodge')?.material).toBe('fox-dodge');
    expect(projectTraitCommandEffect(command({ kind: 'grantShield', sourceId: 'fluffy-shield' }))?.material)
      .toBe('fluffy-shield');
  });

  it('routes source-aware procedural underlays through the shared palette law', () => {
    const fox = command({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe',
      arc: 1.72, range: 96, meleeArcResolved: true,
    });
    const foxProfile = projectTraitCommandEffect(fox)!;
    expect(resolveTraitCommandPaletteLane(fox, foxProfile)).toBe('physical');

    const skunk = command({ kind: 'spawnZone', sourceId: 'skunk-brush', tag: 'stink-cloud' });
    expect(resolveTraitCommandPaletteLane(skunk, projectTraitCommandEffect(skunk)!)).toBe('venom');

    const boss = command({ kind: 'telegraph', sourceId: 'boss-charge', tag: 'boss-charge' });
    expect(resolveTraitCommandPaletteLane(boss, projectTraitCommandEffect(boss)!)).toBe('danger');
  });

  it('selects the finite live material key from the source family, including the Razorstep compatibility route', () => {
    const fox = command({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe',
      arc: 1.72, range: 96, meleeArcResolved: true,
    });
    const foxProfile = projectTraitCommandEffect(fox)!;
    expect(resolveTraitCommandPaletteMaterialKey(fox, foxProfile)).toBe('greg-fox-swipe:physical');

    const trample = command({
      kind: 'telegraph', sourceId: 'benny-trample', tag: 'benny-trample-wave', radius: 48,
    });
    const trampleProfile = projectTraitCommandEffect(trample)!;
    expect(resolveTraitCommandPaletteMaterialKey(trample, trampleProfile)).toBe('benny-trample-wave:earth');

    // Current Razorstep is a venom zone; this verifies the bounded prebuilt
    // fallback lane retained for older deterministic melee replays as well.
    const razorstep = command({
      kind: 'meleeArc', sourceId: 'razorstep-chimera', arc: 2, range: 72, meleeArcResolved: true,
    });
    const razorstepProfile = projectTraitCommandEffect(razorstep)!;
    expect(resolveTraitCommandPaletteMaterialKey(razorstep, razorstepProfile)).toBe('melee-arc:venom');
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

  it('keeps rapid Porcupine Quills as one compact launch cue while its real projectiles carry range', () => {
    const quills = projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', count: 5,
    }))!;
    const genericBurst = projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'test-burst', count: 5,
    }))!;

    const quillRadius = resolveTraitCommandEffectRadius(command({
      kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills', count: 5,
    }), quills);
    const genericRadius = resolveTraitCommandEffectRadius(command({
      kind: 'spawnProjectileBurst', sourceId: 'test-burst', count: 5,
    }), genericBurst);

    expect(quills).toMatchObject({ material: 'quill-volley', lifetimeTicks: 7, maximumRadius: 28 });
    expect(quillRadius).toBeLessThanOrEqual(28);
    expect(quillRadius).toBeLessThan(genericRadius);
    expect(resolveTraitCommandVisualConcurrencyCap(quills)).toBe(1);
    expect(resolveTraitCommandVisualConcurrencyCap(genericBurst)).toBeNull();
    expect(resolveTraitCommandVisualBlueprint(quills)).toMatchObject({
      accent: 'comet', travelDistance: 0.38, aftermathOpacity: 0.08,
    });
  });

  it('keeps Mantis Scythes as one localized wide cleave instead of a screen-sized sector', () => {
    const mantis = projectTraitCommandEffect(command({
      kind: 'meleeArc', sourceId: 'mantis-scythes', arc: 1.6, range: 999, meleeArcResolved: true,
    }))!;

    expect(mantis).toMatchObject({ material: 'melee-arc', lifetimeTicks: 6, maximumRadius: 52 });
    expect(resolveTraitCommandEffectRadius(command({
      kind: 'meleeArc', sourceId: 'mantis-scythes', arc: 1.6, range: 999, meleeArcResolved: true,
    }), mantis)).toBe(52);
    expect(resolveTraitCommandVisualConcurrencyCap(mantis)).toBe(1);
    expect(resolveTraitCommandVisualBlueprint(mantis)).toMatchObject({
      accent: 'slash', travelDistance: 0.32, impactScale: 0.8, aftermathOpacity: 0.1,
    });
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

  it('projects source-aware cast, travel, impact, and aftermath visual language', () => {
    const foxProfile = projectTraitCommandEffect(command({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe',
      arc: 1.72, range: 96, meleeArcResolved: true,
    }))!;
    const trampleProfile = projectTraitCommandEffect(command({
      kind: 'telegraph', sourceId: 'benny-trample', tag: 'benny-trample-wave', radius: 48,
    }))!;
    const spitProfile = projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'gracie-spit', tag: 'gracie-spit', count: 3,
    }))!;
    const warningProfile = projectTraitCommandEffect(command({ tag: 'boss-charge', dirX: 1 }))!;

    expect(resolveTraitCommandVisualBlueprint(foxProfile)).toMatchObject({
      accent: 'slash', travelDistance: expect.any(Number), impactScale: expect.any(Number),
    });
    expect(resolveTraitCommandVisualBlueprint(trampleProfile)).toMatchObject({ accent: 'ridge' });
    expect(resolveTraitCommandVisualBlueprint(spitProfile)).toMatchObject({ accent: 'comet' });
    expect(resolveTraitCommandVisualBlueprint(warningProfile)).toMatchObject({ accent: 'halo' });

    expect(resolveTraitCommandVisualStage(0.08, foxProfile)).toBe('cast');
    expect(resolveTraitCommandVisualStage(0.36, foxProfile)).toBe('travel');
    expect(resolveTraitCommandVisualStage(0.7, foxProfile)).toBe('impact');
    expect(resolveTraitCommandVisualStage(0.92, foxProfile)).toBe('aftermath');
    // Trample keeps its simulation compatibility tag but still attacks on the
    // fast visual timeline instead of reading as an enemy warning.
    expect(resolveTraitCommandVisualStage(0.7, trampleProfile)).toBe('impact');
    // Telegraphs deliberately hold their warning language longer than attacks.
    expect(resolveTraitCommandVisualStage(0.36, warningProfile)).toBe('travel');
    expect(resolveTraitCommandVisualStage(0.8, warningProfile)).toBe('impact');
  });

  it('uses only bounded existing command signals to scale upgraded visual silhouettes', () => {
    const profile = projectTraitCommandEffect(command({ kind: 'spawnProjectileBurst' }))!;
    const baseline = resolveTraitCommandVisualIntensity(command({
      kind: 'spawnProjectileBurst', count: 1, damage: 0, strength: 0,
    }), profile);
    const upgraded = resolveTraitCommandVisualIntensity(command({
      kind: 'spawnProjectileBurst', count: 12, damage: 100, strength: 12,
    }), profile);
    const malformed = resolveTraitCommandVisualIntensity(command({
      kind: 'spawnProjectileBurst', count: Number.NaN, damage: Number.POSITIVE_INFINITY, strength: -1,
    }), profile);

    expect(upgraded).toBeGreaterThan(baseline);
    expect(upgraded).toBeLessThanOrEqual(1.36);
    expect(malformed).toBe(baseline);
  });

  it('keeps all authored player geometry as quiet underlays for illustrated primary effects', () => {
    const fox = projectTraitCommandEffect(command({
      kind: 'meleeArc', sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe',
      arc: 1.72, range: 96, meleeArcResolved: true,
    }))!;
    const trample = projectTraitCommandEffect(command({
      kind: 'telegraph', sourceId: 'benny-trample', tag: 'benny-trample-wave', radius: 48,
    }))!;
    const spit = projectTraitCommandEffect(command({
      kind: 'spawnProjectileBurst', sourceId: 'gracie-spit', tag: 'gracie-spit', count: 3,
    }))!;
    const shield = projectHeroDefenseEffect('fluffy-shield')!;
    const puffer = projectTraitCommandEffect(command({
      kind: 'areaKnockback', sourceId: 'puffer-pouch', tag: 'puffer-pouch',
    }))!;
    const skunk = projectTraitCommandEffect(command({
      kind: 'spawnZone', sourceId: 'skunk-brush', tag: 'stink-cloud',
    }))!;
    const enemyWarning = projectTraitCommandEffect(command({ kind: 'telegraph', tag: 'boss-charge' }))!;

    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(fox)).toBe(0.12);
    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(trample)).toBe(0.14);
    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(spit)).toBe(0.12);
    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(shield)).toBe(0.18);
    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(puffer)).toBe(0.14);
    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(skunk)).toBe(0.12);
    expect(resolveIllustratedHeroUnderlayOpacityMultiplier(enemyWarning)).toBe(1);
  });
});
