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
    expect(Object.keys(WILDGUARD_VFX_CLIPS)).toHaveLength(31);
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

  it('keeps signature moves as multi-frame native-color sequences', () => {
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.foxSwipe).sequence.frames).toHaveLength(4);
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.earthWave).sequence.frames).toHaveLength(4);
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.spitComet).sequence.frames).toHaveLength(4);
    expect(wildguardVfxClipDefinition(WILDGUARD_VFX_CLIP.xpOrbit).sequence.loop).toBe(true);
  });

  it('loads dedicated transparent hero and world sheets rather than the old accent atlas', () => {
    expect(WILDGUARD_VFX_SHEET_URLS.signature).toContain('wildguard-signature-frames-v2.png');
    expect(WILDGUARD_VFX_SHEET_URLS.world).toContain('wildguard-world-frames-v2.png');
  });

  it('routes every secondary attack family through one complete four-frame row', () => {
    const expectedRows = {
      pufferPulse: [WILDGUARD_VFX_SHEET.fields, 0],
      geckoPad: [WILDGUARD_VFX_SHEET.fields, 1],
      skunkCloud: [WILDGUARD_VFX_SHEET.fields, 2],
      royalStink: [WILDGUARD_VFX_SHEET.fields, 3],
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
      expect(definition.sequence.frames).toHaveLength(4);
      expect(definition.sequence.frames.map((frame) => frame.column)).toEqual([0, 1, 2, 3]);
      expect(definition.sequence.frames.map((frame) => frame.row)).toEqual([row, row, row, row]);
    }
  });

  it('loads all four dedicated secondary VFX sheets', () => {
    expect(WILDGUARD_VFX_SHEET_URLS.fields).toContain('wildguard-fields-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.melee).toContain('wildguard-melee-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.projectile).toContain('wildguard-projectile-frames-v3.png');
    expect(WILDGUARD_VFX_SHEET_URLS.aura).toContain('wildguard-aura-frames-v3.png');
  });
});
