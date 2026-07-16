import { describe, expect, it } from 'vitest';
import type { TraitVisualAttachmentView } from '@sim';
import { getHeroBasicAttackDefinition } from '@sim';
import { presentActiveAttackLoadout } from '../src/presentation/active-attacks';

function visual(overrides: Partial<TraitVisualAttachmentView>): TraitVisualAttachmentView {
  return {
    sourceId: 'porcupine-quills',
    stage: 'bud',
    sockets: ['back'],
    visualKey: 'porcupine-quills:bud',
    enabled: true,
    ...overrides,
  };
}

describe('active attack loadout', () => {
  it('keeps the stable starter id while showing Scout\'s public attack copy', () => {
    const loadout = presentActiveAttackLoadout([
      visual({}),
      visual({ sourceId: 'electric-eel-coil', sockets: ['tail'], visualKey: 'electric-eel-coil:bud' }),
    ]);
    expect(loadout.slotCapacity).toBe(5);
    expect(loadout.slotsUsed).toBe(3);
    expect(loadout.cards.map((card) => card.id)).toEqual([
      'greg-auto-fire:starter',
      'porcupine-quills:bud',
      'electric-eel-coil:bud',
    ]);
    expect(loadout.cards[0]).toMatchObject({
      title: 'Scout Swipe',
      effect: expect.stringContaining('Scout commits to a tight forward paw swipe through nearby threats.'),
    });
    expect(loadout.cards[0]?.effect).not.toMatch(/Fox|Greg/);
  });

  it('explains each founding hero instinct in the pause build card', () => {
    expect(presentActiveAttackLoadout([], getHeroBasicAttackDefinition('greg-auto-fire')).cards[0]?.effect)
      .toMatch(/Rush Rake/);
    expect(presentActiveAttackLoadout([], getHeroBasicAttackDefinition('benny-brace-burst')).cards[0]?.effect)
      .toMatch(/Brace Bloom/);
    expect(presentActiveAttackLoadout([], getHeroBasicAttackDefinition('gracie-keen-dart')).cards[0]?.effect)
      .toMatch(/Scout marks/);
  });

  it('counts each fused evolution as one logical attack slot', () => {
    const loadout = presentActiveAttackLoadout([
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
      visual({ sourceId: 'thunderbug-dynamo', stage: 'mythic', sockets: ['tail', 'bodyOrbit'], visualKey: 'thunderbug-dynamo:mythic' }),
    ]);
    expect(loadout.slotsUsed).toBe(3);
    expect(loadout.cards.map((card) => card.slotCost)).toEqual([1, 1, 1]);
  });

  it('frees one logical slot when Razorstep replaces Mantis and Gecko', () => {
    const loadout = presentActiveAttackLoadout([
      visual({
        sourceId: 'mantis-scythes',
        stage: 'adapted',
        sockets: ['leftShoulder'],
        visualKey: 'mantis-scythes:adapted',
      }),
      visual({
        sourceId: 'gecko-pads',
        stage: 'adapted',
        sockets: ['rightShoulder'],
        visualKey: 'gecko-pads:adapted',
      }),
      visual({
        sourceId: 'razorstep-chimera',
        stage: 'mythic',
        sockets: ['leftShoulder', 'rightShoulder'],
        visualKey: 'razorstep-chimera:mythic',
      }),
    ]);

    expect(loadout.slotsUsed).toBe(2);
    expect(loadout.cards.map((card) => card.id)).toEqual([
      'greg-auto-fire:starter',
      'razorstep-chimera:mythic',
    ]);
    expect(loadout.cards.map((card) => card.slotCost)).toEqual([1, 1]);
  });

  it('adds a dynamic Chimera card with a braid and excludes its visual-only parents', () => {
    const loadout = presentActiveAttackLoadout([
      visual({
        sourceId: 'chimera:porcupine-quills+owl-pinions',
        stage: 'mythic',
        sockets: ['back', 'leftShoulder', 'rightShoulder'],
        visualKey: 'chimera:porcupine-quills+owl-pinions:mythic',
        chimeraParents: ['porcupine-quills', 'owl-pinions'],
        displayName: 'TWITCHY QUILLNADO (Rare)',
        rarity: 'rare',
        temperamentId: 'twitchy',
        pairKind: 'wild',
      }),
      visual({
        sourceId: 'porcupine-quills',
        stage: 'adapted',
        sockets: ['back'],
        visualKey: 'porcupine-quills:adapted',
        visualOnly: true,
        chimeraParents: ['porcupine-quills', 'owl-pinions'],
      }),
      visual({
        sourceId: 'owl-pinions',
        stage: 'adapted',
        sockets: ['leftShoulder', 'rightShoulder'],
        visualKey: 'owl-pinions:adapted',
        visualOnly: true,
        chimeraParents: ['porcupine-quills', 'owl-pinions'],
      }),
    ]);

    expect(loadout.slotsUsed).toBe(2);
    expect(loadout.cards.map((card) => card.id)).toEqual([
      'greg-auto-fire:starter',
      'chimera:porcupine-quills+owl-pinions:mythic',
    ]);
    expect(loadout.cards[1]).toMatchObject({
      title: 'TWITCHY QUILLNADO (Rare)',
      stageLabel: 'Wild Splice · 1 slot',
      effect: expect.stringContaining('Porcupine Quills chassis'),
      chimeraBraid: {
        icon: 'braid',
        parentRows: ['Porcupine Quills', 'Owl Pinions'],
      },
    });
  });

  it('keeps authored Perfect Pair behavior copy while adding its dynamic braid rows', () => {
    const loadout = presentActiveAttackLoadout([
      visual({
        sourceId: 'thornstorm-mantle',
        stage: 'mythic',
        sockets: ['head', 'back'],
        visualKey: 'thornstorm-mantle:mythic',
        chimeraParents: ['porcupine-quills', 'puffer-pouch'],
        displayName: 'STEADY THORNSTORM MANTLE (Common)',
        pairKind: 'perfect',
      }),
    ]);

    expect(loadout.cards[1]).toMatchObject({
      title: 'STEADY THORNSTORM MANTLE (Common)',
      stageLabel: 'Perfect Pair · 1 slot',
      effect: expect.stringContaining('Draws enemies in, then releases a radial quill storm.'),
      chimeraBraid: {
        icon: 'braid',
        parentRows: ['Porcupine Quills', 'Puffer Pouch'],
      },
    });
  });

  it('falls back to canonical dynamic ids when legacy visual metadata lacks parent rows', () => {
    const loadout = presentActiveAttackLoadout([
      visual({
        sourceId: 'chimera:electric-eel-coil+crab-pincers',
        stage: 'mythic',
        sockets: ['tail', 'leftShoulder', 'rightShoulder'],
        visualKey: 'chimera:electric-eel-coil+crab-pincers:mythic',
        pairKind: 'wild',
      }),
    ]);

    expect(loadout.cards[1]?.chimeraBraid).toEqual({
      icon: 'braid',
      parentRows: ['Electric Eel Coil', 'Crab Pincers'],
    });
  });
});
