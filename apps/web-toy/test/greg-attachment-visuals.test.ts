import { describe, expect, it } from 'vitest';
import {
  GREG_ATTACHMENT_VISUAL_KEYS,
  getGregAttachmentVisualRecipe,
  isGregAttachmentVisualKey,
  validateGregAttachmentVisualRecipe,
} from '../src/hero/greg-attachment-visuals';

describe('Greg attachment visual recipes', () => {
  it('covers every Forest Arsenal stage-aware key', () => {
    expect(GREG_ATTACHMENT_VISUAL_KEYS).toEqual([
      'porcupine-quills:bud',
      'porcupine-quills:adapted',
      'puffer-pouch:bud',
      'puffer-pouch:adapted',
      'thornstorm-mantle:mythic',
      'electric-eel-coil:bud',
      'electric-eel-coil:adapted',
      'firefly-colony:bud',
      'firefly-colony:adapted',
      'mantis-scythes:bud',
      'mantis-scythes:adapted',
      'gecko-pads:bud',
      'gecko-pads:adapted',
      'thunderbug-dynamo:mythic',
      'razorstep-chimera:mythic',
      'owl-pinions:bud',
      'owl-pinions:adapted',
      'bat-ears:bud',
      'bat-ears:adapted',
      'midnight-radar:mythic',
      'crab-pincers:bud',
      'crab-pincers:adapted',
      'armadillo-greaves:bud',
      'armadillo-greaves:adapted',
      'meteor-mauler:mythic',
      'skunk-brush:bud',
      'skunk-brush:adapted',
      'monarch-brood:bud',
      'monarch-brood:adapted',
      'royal-stinkcloud:mythic',
    ]);
    for (const key of GREG_ATTACHMENT_VISUAL_KEYS) {
      const recipe = getGregAttachmentVisualRecipe(key);
      const [family, stage] = key.split(':');
      expect(recipe.family).toBe(family);
      expect(recipe.stage).toBe(stage);
      expect(recipe.parts.length).toBeGreaterThan(0);
    }
    expect(getGregAttachmentVisualRecipe('porcupine-quills:bud').parts).toHaveLength(5);
    expect(getGregAttachmentVisualRecipe('porcupine-quills:adapted').parts).toHaveLength(9);
  });

  it('makes evolved recipes visibly denser than their bud recipes', () => {
    expect(getGregAttachmentVisualRecipe('porcupine-quills:adapted').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('porcupine-quills:bud').parts.length);
    expect(getGregAttachmentVisualRecipe('puffer-pouch:adapted').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('puffer-pouch:bud').parts.length);
    expect(getGregAttachmentVisualRecipe('electric-eel-coil:adapted').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('electric-eel-coil:bud').parts.length);
    expect(getGregAttachmentVisualRecipe('firefly-colony:adapted').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('firefly-colony:bud').parts.length);
    expect(getGregAttachmentVisualRecipe('mantis-scythes:adapted').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('mantis-scythes:bud').parts.length);
    expect(getGregAttachmentVisualRecipe('gecko-pads:adapted').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('gecko-pads:bud').parts.length);
    expect(getGregAttachmentVisualRecipe('thornstorm-mantle:mythic').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('porcupine-quills:adapted').parts.length);
    expect(getGregAttachmentVisualRecipe('razorstep-chimera:mythic').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('mantis-scythes:adapted').parts.length);
    expect(getGregAttachmentVisualRecipe('midnight-radar:mythic').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('owl-pinions:adapted').parts.length);
    expect(getGregAttachmentVisualRecipe('meteor-mauler:mythic').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('crab-pincers:adapted').parts.length);
    expect(getGregAttachmentVisualRecipe('royal-stinkcloud:mythic').parts.length)
      .toBeGreaterThan(getGregAttachmentVisualRecipe('skunk-brush:adapted').parts.length);
  });

  it('uses dedicated Gecko and Razorstep material roles', () => {
    expect(getGregAttachmentVisualRecipe('gecko-pads:bud').parts.map((part) => part.materialRole))
      .toEqual(expect.arrayContaining(['geckoPrimary', 'geckoAccent']));
    expect(getGregAttachmentVisualRecipe('razorstep-chimera:mythic').parts.map((part) => part.materialRole))
      .toEqual(expect.arrayContaining(['razorstepPrimary', 'razorstepAccent']));
  });

  it('returns deeply immutable recipes and stable recipe identities', () => {
    const first = getGregAttachmentVisualRecipe('porcupine-quills:bud');
    const second = getGregAttachmentVisualRecipe('porcupine-quills:bud');
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    expect(Object.isFrozen(first.parts[0])).toBe(true);
    expect(Object.isFrozen(first.parts[0]?.transform)).toBe(true);
    expect(Object.isFrozen(first.parts[0]?.transform.position)).toBe(true);
  });

  it('rejects unknown lookup keys and identifies known keys', () => {
    expect(isGregAttachmentVisualKey('puffer-pouch:bud')).toBe(true);
    expect(isGregAttachmentVisualKey('puffer-pouch:legendary')).toBe(false);
    expect(() => getGregAttachmentVisualRecipe('puffer-pouch:legendary')).toThrow(/Unknown Greg attachment visual key/);
  });

  it('rejects malformed transforms, duplicate ids, and key metadata mismatches', () => {
    const basePart = {
      id: 'quill', shape: 'cone', materialRole: 'quillPrimary',
      transform: { position: [0, 0, 0], euler: [0, 0, 0], scale: [1, 1, 1] },
    };
    const base = {
      key: 'porcupine-quills:bud',
      family: 'porcupine-quills',
      stage: 'bud',
      parts: [basePart],
    };
    expect(() => validateGregAttachmentVisualRecipe({ ...base, family: 'puffer-pouch' })).toThrow(/family must match/);
    expect(() => validateGregAttachmentVisualRecipe({
      ...base,
      parts: [basePart, { ...basePart }],
    })).toThrow(/duplicate part id/);
    expect(() => validateGregAttachmentVisualRecipe({
      ...base,
      parts: [{ ...basePart, transform: { ...basePart.transform, scale: [1, 0, 1] } }],
    })).toThrow(/positive finite/);
    expect(() => validateGregAttachmentVisualRecipe({
      ...base,
      parts: [{ ...basePart, transform: { ...basePart.transform, position: [0, Number.NaN, 0] } }],
    })).toThrow(/three finite/);
  });

  it('uses only finite transforms, positive scales, and unique part ids', () => {
    for (const key of GREG_ATTACHMENT_VISUAL_KEYS) {
      const recipe = getGregAttachmentVisualRecipe(key);
      expect(new Set(recipe.parts.map((part) => part.id)).size).toBe(recipe.parts.length);
      for (const item of recipe.parts) {
        expect([...item.transform.position, ...item.transform.euler, ...item.transform.scale].every(Number.isFinite)).toBe(true);
        expect(item.transform.scale.every((axis) => axis > 0)).toBe(true);
      }
    }
  });
});
