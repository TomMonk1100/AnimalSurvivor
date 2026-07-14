import { describe, expect, it } from 'vitest';
import {
  WILDGUARD_VFX_CLIP,
  WILDGUARD_VFX_CLIPS,
  WILDGUARD_VFX_SHEET,
  WILDGUARD_VFX_SHEET_URLS,
  wildguardVfxClipDefinition,
} from '../src/render/wildguard-vfx-atlas';

describe('Wildguard animated VFX routing', () => {
  it('routes every semantic effect into an authored four-by-four sheet', () => {
    expect(Object.keys(WILDGUARD_VFX_CLIPS)).toHaveLength(32);
    for (const definition of Object.values(WILDGUARD_VFX_CLIPS)) {
      expect(definition.sequence.frames.length).toBeGreaterThan(0);
      expect(definition.sequence.ticksPerFrame).toBeGreaterThan(0);
      for (const cell of definition.sequence.frames) {
        expect(cell.column).toBeGreaterThanOrEqual(0);
        expect(cell.column).toBeLessThan(4);
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(4);
      }
    }
  });

  it('enables deterministic half-frame crossfades for every multi-cell card sequence', () => {
    for (const definition of Object.values(WILDGUARD_VFX_CLIPS)) {
      const { sequence } = definition;
      if (sequence.frames.length < 2) {
        expect(sequence.crossfadeTicks).toBeUndefined();
        continue;
      }
      expect(sequence.crossfadeTicks).toBe(Math.ceil(sequence.ticksPerFrame / 2));
    }
  });

  it('uses one selected body frame for each signature and animates it by transform', () => {
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.foxSwipe).sequence.frames).toHaveLength(1);
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.earthWave).sequence.frames).toHaveLength(1);
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.spitComet).sequence.frames).toHaveLength(1);
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.xpOrbit).sequence.loop).toBe(true);
  });

  it('routes P2 hero signatures to dedicated body cells and keeps Saltwind on the old threat glyph', () => {
    const earth = wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.earthWave);
    const spit = wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.spitComet);
    const saltwind = wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.saltwindEarthTelegraph);
    expect(earth.sheet).toBe(WILDGUARD_VFX_SHEET.signatureBodies);
    expect(earth.sequence.frames[0]).toMatchObject({ column: 0, row: 0 });
    expect(spit.sheet).toBe(WILDGUARD_VFX_SHEET.signatureBodies);
    expect(spit.sequence.frames[0]).toMatchObject({ column: 1, row: 0 });
    expect(saltwind.sheet).toBe(WILDGUARD_VFX_SHEET.signature);
    expect(saltwind.sequence.frames[0]).toMatchObject({ column: 1, row: 1 });
  });

  it('loads dedicated transparent hero and world sheets rather than the old accent atlas', () => {
    expect(WILDGUARD_VFX_SHEET_URLS.signature).toContain('wildguard-signature-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.signatureBodies).toContain('wildguard-signature-bodies-v1.png');
    expect(WILDGUARD_VFX_SHEET_URLS.world).toContain('wildguard-world-frames-v2.png');
  });

  it('routes every secondary attack family through its deliberately selected coherent body frame', () => {
    const expectedRows = {
      pufferPulse: [WILDGUARD_VFX_SHEET.fields, 0],
      mantisSweep: [WILDGUARD_VFX_SHEET.melee, 0],
      crabCrush: [WILDGUARD_VFX_SHEET.melee, 1],
      armadilloRoll: [WILDGUARD_VFX_SHEET.melee, 2],
      meteorImpact: [WILDGUARD_VFX_SHEET.melee, 3],
      quillVolley: [WILDGUARD_VFX_SHEET.projectile, 0],
      owlPinions: [WILDGUARD_VFX_SHEET.projectile, 1],
      thornstorm: [WILDGUARD_VFX_SHEET.projectile, 2],
      thunderbug: [WILDGUARD_VFX_SHEET.projectile, 3],
      fireflyOrbit: [WILDGUARD_VFX_SHEET.aura, 0],
      monarchOrbit: [WILDGUARD_VFX_SHEET.aura, 1],
      batSonar: [WILDGUARD_VFX_SHEET.aura, 2],
      midnightRadar: [WILDGUARD_VFX_SHEET.aura, 3],
    } as const;

    for (const [clip, [sheet, row]] of Object.entries(expectedRows)) {
      const definition = wildguardVfxClipDefinition(clip as keyof typeof WILDGUARD_VFX_CLIP);
      expect(definition.sheet).toBe(sheet);
      expect(definition.sequence.frames).toHaveLength(1);
      expect(definition.sequence.frames[0]!.row).toBe(row);
      expect(definition.sequence.crossfadeTicks).toBeUndefined();
    }
  });

  it('uses compact coherent erosion sequences for clouds, pads, and the fluffy shield', () => {
    const expected = {
      geckoPad: WILDGUARD_VFX_SHEET.geckoDissolve,
      skunkCloud: WILDGUARD_VFX_SHEET.skunkDissolve,
      royalStink: WILDGUARD_VFX_SHEET.royalStinkDissolve,
      fluffyShield: WILDGUARD_VFX_SHEET.fluffyShieldDissolve,
    } as const;

    for (const [clip, sheet] of Object.entries(expected)) {
      const definition = wildguardVfxClipDefinition(clip as keyof typeof WILDGUARD_VFX_CLIP);
      expect(definition.sheet).toBe(sheet);
      expect(definition.sequence.loop).toBe(false);
      expect(definition.sequence.frames).toHaveLength(8);
      expect(definition.sequence.ticksPerFrame).toBe(2);
      expect(definition.sequence.crossfadeTicks).toBe(1);
      expect(definition.sequence.frames[0]).toMatchObject({ column: 0, row: 0 });
      expect(definition.sequence.frames[7]).toMatchObject({ column: 3, row: 1 });
    }
  });

  it('loads all four dedicated secondary VFX sheets', () => {
    expect(WILDGUARD_VFX_SHEET_URLS.fields).toContain('wildguard-fields-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.melee).toContain('wildguard-melee-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.projectile).toContain('wildguard-projectile-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.aura).toContain('wildguard-aura-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.geckoDissolve).toContain('wildguard-gecko-dissolve-frames-v1.png');
    expect(WILDGUARD_VFX_SHEET_URLS.skunkDissolve).toContain('wildguard-skunk-dissolve-frames-v1.png');
    expect(WILDGUARD_VFX_SHEET_URLS.royalStinkDissolve).toContain('wildguard-royal-stink-dissolve-frames-v1.png');
    expect(WILDGUARD_VFX_SHEET_URLS.fluffyShieldDissolve).toContain('wildguard-fluffy-shield-dissolve-frames-v1.png');
  });
});
