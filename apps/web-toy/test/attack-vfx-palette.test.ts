import { describe, expect, it } from 'vitest';
import {
  ATTACK_VFX_RESERVED_LANE,
  CRITICAL_IMPACT_GOLD,
  EFFECT_MATERIAL_PALETTE_FAMILY,
  PROCEDURAL_ACCENT_OPACITY_CAP,
  PROCEDURAL_UNDERLAY_OPACITY_CAP,
  PROCEDURAL_UNDERPAINT_COLORS,
  TRAIT_COMMAND_PALETTE_FAMILY_BY_SOURCE,
  hasExplicitTraitSourcePaletteLane,
  isPlayerAttackPaletteLane,
  paletteLaneForEffectMaterial,
  paletteLaneForChimeraSource,
  paletteLaneForTraitSource,
  proceduralAccentOpacity,
  proceduralUnderlayOpacity,
  saturationForRgb,
} from '../src/render/attack-vfx-palette';

describe('attack VFX palette law', () => {
  it('keeps player attacks out of the danger and reward reservations', () => {
    const hostileSources = new Set([
      'boss-charge',
      'boss-volley',
      'saltwind-charge',
      'saltwind-sandstorm',
      'support-pulse',
    ]);

    for (const [sourceId, lane] of Object.entries(TRAIT_COMMAND_PALETTE_FAMILY_BY_SOURCE)) {
      if (hostileSources.has(sourceId)) {
        expect(lane).toBe(ATTACK_VFX_RESERVED_LANE.danger);
      } else {
        expect(isPlayerAttackPaletteLane(lane)).toBe(true);
      }
      expect(lane).not.toBe(ATTACK_VFX_RESERVED_LANE.reward);
    }
  });

  it('maps every procedural role to one of the six families or hostile danger, never rewards', () => {
    for (const lane of Object.values(EFFECT_MATERIAL_PALETTE_FAMILY)) {
      expect(lane).not.toBe(ATTACK_VFX_RESERVED_LANE.reward);
    }
    expect(paletteLaneForEffectMaterial('greg-fox-swipe')).toBe('physical');
    expect(paletteLaneForEffectMaterial('benny-trample-wave')).toBe('earth');
    expect(paletteLaneForEffectMaterial('skunk-cloud')).toBe('venom');
    expect(paletteLaneForEffectMaterial('midnight-radar-sonar')).toBe('arcane');
    expect(paletteLaneForEffectMaterial('owl-volley')).toBe('storm');
    expect(paletteLaneForEffectMaterial('meteor-impact')).toBe('fire');
  });

  it('uses a safe physical fallback for unknown future player traits', () => {
    expect(hasExplicitTraitSourcePaletteLane('not-yet-authored')).toBe(false);
    expect(paletteLaneForTraitSource('not-yet-authored')).toBe('physical');
  });

  it('derives a bounded chassis-and-donor duotone for generated and Perfect Chimeras', () => {
    // Quills outrank Eel as the chassis, while the donor keeps the storm accent.
    expect(paletteLaneForChimeraSource('chimera:porcupine-quills+electric-eel-coil'))
      .toEqual({ primary: 'physical', accent: 'storm' });
    // Mantis is the Razorstep chassis, Gecko remains the venom accent.
    expect(paletteLaneForChimeraSource('razorstep-chimera'))
      .toEqual({ primary: 'physical', accent: 'venom' });
    expect(paletteLaneForTraitSource('chimera:porcupine-quills+electric-eel-coil')).toBe('physical');
    expect(paletteLaneForChimeraSource('chimera:not-a-trait+electric-eel-coil')).toBeNull();
  });

  it('maps canonical emitted source ids instead of stale command-tag aliases', () => {
    const canonicalSources = {
      'electric-eel-coil': 'storm',
      'gecko-pads': 'venom',
      'thunderbug-dynamo': 'storm',
      // Perfect Pairs now use the same chassis-first duotone rule as a
      // generated Wild Splice: Mantis owns the physical core, Gecko the rim.
      'razorstep-chimera': 'physical',
    } as const;

    for (const [sourceId, expectedLane] of Object.entries(canonicalSources)) {
      expect(hasExplicitTraitSourcePaletteLane(sourceId)).toBe(true);
      expect(paletteLaneForTraitSource(sourceId)).toBe(expectedLane);
    }

    // These are tags or pre-canonical names, never an authoritative sourceId.
    for (const staleAlias of ['electric-eel', 'gecko-pad', 'thunderbug', 'razorstep-scythe']) {
      expect(hasExplicitTraitSourcePaletteLane(staleAlias)).toBe(false);
    }
  });

  it('keeps procedural saturation below the non-critical ceiling', () => {
    for (const color of Object.values(PROCEDURAL_UNDERPAINT_COLORS)) {
      expect(saturationForRgb(color)).toBeLessThanOrEqual(0.8);
    }
    expect(saturationForRgb(CRITICAL_IMPACT_GOLD)).toBeGreaterThan(0.8);
  });

  it('caps retained procedural body and accent opacity independently', () => {
    expect(proceduralUnderlayOpacity(1)).toBe(PROCEDURAL_UNDERLAY_OPACITY_CAP);
    expect(proceduralAccentOpacity(1)).toBe(PROCEDURAL_ACCENT_OPACITY_CAP);
    expect(proceduralUnderlayOpacity(-1)).toBe(0);
    expect(proceduralAccentOpacity(Number.NaN)).toBe(0);
  });
});
