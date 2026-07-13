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
  it('counts Greg starter fire and shows ordinary attack footprints', () => {
    const loadout = presentActiveAttackLoadout([
      visual({}),
      visual({ sourceId: 'electric-eel-coil', sockets: ['tail'], visualKey: 'electric-eel-coil:bud' }),
    ]);
    expect(loadout.slotCapacity).toBe(4);
    expect(loadout.slotsUsed).toBe(3);
    expect(loadout.cards.map((card) => card.id)).toEqual([
      'greg-auto-fire:starter',
      'porcupine-quills:bud',
      'electric-eel-coil:bud',
    ]);
  });

  it('explains each founding hero instinct in the pause build card', () => {
    expect(presentActiveAttackLoadout([], getHeroBasicAttackDefinition('greg-auto-fire')).cards[0]?.effect)
      .toMatch(/Rush Rake/);
    expect(presentActiveAttackLoadout([], getHeroBasicAttackDefinition('benny-brace-burst')).cards[0]?.effect)
      .toMatch(/Brace Bloom/);
    expect(presentActiveAttackLoadout([], getHeroBasicAttackDefinition('gracie-keen-dart')).cards[0]?.effect)
      .toMatch(/Scout marks/);
  });

  it('keeps each Mythic at two active-attack slots', () => {
    const loadout = presentActiveAttackLoadout([
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
      visual({ sourceId: 'thunderbug-dynamo', stage: 'mythic', sockets: ['tail', 'bodyOrbit'], visualKey: 'thunderbug-dynamo:mythic' }),
    ]);
    expect(loadout.slotsUsed).toBe(4);
    expect(loadout.cards.map((card) => card.slotCost)).toEqual([1, 2, 2]);
  });

  it('counts Razorstep as two slots after it consumes Mantis and Gecko', () => {
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

    expect(loadout.slotsUsed).toBe(3);
    expect(loadout.cards.map((card) => card.id)).toEqual([
      'greg-auto-fire:starter',
      'razorstep-chimera:mythic',
    ]);
    expect(loadout.cards.map((card) => card.slotCost)).toEqual([1, 2]);
  });
});
