import { describe, expect, it } from 'vitest';
import {
  FUSION_SLOT_DETAIL,
  formatChimeraTraitName,
  getChimeraPairRoles,
  presentChimeraCopy,
  readChimeraFusionOffer,
} from '../src/presentation/chimera-copy';

describe('chimera fusion copy', () => {
  it('keeps older FusionOfferView values useful with a generic fallback', () => {
    const copy = presentChimeraCopy({
      evolutionId: 'thornstorm-mantle',
      ingredients: ['porcupine-quills', 'puffer-pouch'],
    });

    expect(copy).toMatchObject({
      evolutionId: 'thornstorm-mantle',
      title: 'Thornstorm Mantle',
      ingredients: 'Porcupine Quills + Puffer Pouch',
      description: 'A free fusion combines two Master attacks into one permanent attack slot.',
      detail: FUSION_SLOT_DETAIL,
      pairKind: null,
      usesLegacyFallback: true,
    });
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it('reads the planned optional offer fields without making them required', () => {
    const offer = readChimeraFusionOffer({
      evolutionId: 'chimera:porcupine-quills+owl-pinions:rare',
      ingredients: ['porcupine-quills', 'owl-pinions'],
      displayName: 'TWITCHY QUILLNADO (Rare)',
      rarity: 'rare',
      temperamentId: 'twitchy',
      pairKind: 'wild',
      flavorIndex: 17,
    });

    expect(offer).toEqual({
      evolutionId: 'chimera:porcupine-quills+owl-pinions:rare',
      ingredients: ['porcupine-quills', 'owl-pinions'],
      displayName: 'TWITCHY QUILLNADO (Rare)',
      rarity: 'rare',
      temperamentId: 'twitchy',
      pairKind: 'wild',
      flavorIndex: 17,
    });
    expect(Object.isFrozen(offer)).toBe(true);
  });

  it('uses the highest-priority known parent as chassis and the other as donor', () => {
    expect(getChimeraPairRoles(['porcupine-quills', 'owl-pinions'])).toEqual({
      chassisId: 'porcupine-quills',
      chassisName: 'Porcupine Quills',
      donorId: 'owl-pinions',
      donorName: 'Owl Pinions',
    });
    expect(getChimeraPairRoles(['bat-ears', 'mantis-scythes'])).toMatchObject({
      chassisId: 'mantis-scythes',
      donorId: 'bat-ears',
    });
    expect(getChimeraPairRoles(['unknown', 'bat-ears'])).toBeNull();
  });

  it('builds readable wild and support chassis/donor descriptions', () => {
    const wild = presentChimeraCopy({
      evolutionId: 'quillnado',
      ingredients: ['porcupine-quills', 'owl-pinions'],
      displayName: 'TWITCHY QUILLNADO (Rare)',
      rarity: 'rare',
      temperamentId: 'twitchy',
      pairKind: 'wild',
    });
    const support = presentChimeraCopy({
      evolutionId: 'velvet-rope-security',
      ingredients: ['armadillo-greaves', 'monarch-brood'],
      pairKind: 'support',
    });

    expect(wild).toMatchObject({
      title: 'TWITCHY QUILLNADO (Rare)',
      rarity: 'Rare',
      temperament: 'Twitchy',
      temperamentAside: 'It has had nine espressos. It is not sorry.',
      usesLegacyFallback: false,
    });
    expect(wild.description).toContain('Wild Splice. Porcupine Quills chassis: Piercing quill volleys lead each cycle.');
    expect(wild.description).toContain('Owl Pinions donor: Fan graft widens and doubles the volley.');
    expect(support.description).toContain('Support Chimera. Monarch Brood chassis: Wide guardian escorts lead each cycle.');
    expect(support.description).toContain('Armadillo Greaves donor: Recoil graft shoves the survivors away after the payload.');
  });

  it('degrades malformed future fields to useful generic copy', () => {
    const copy = presentChimeraCopy({
      evolutionId: '  ',
      ingredients: ['one-only'],
      displayName: '',
      rarity: { not: 'text' },
      temperamentId: 3,
      pairKind: 'mystery',
      flavorIndex: 2.5,
    });

    expect(copy).toMatchObject({
      title: 'Master Fusion',
      ingredients: 'Two Master attacks',
      pairKind: null,
      usesLegacyFallback: true,
      rarity: null,
      temperament: null,
    });
    expect(copy.detail).toBe('Fuses 2 Master attacks into 1 slot. Free. Permanent. Enthusiastic.');
    expect(formatChimeraTraitName('mystery-trait')).toBe('Mystery Trait');
  });
});
