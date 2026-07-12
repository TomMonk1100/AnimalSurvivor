import { describe, expect, it } from 'vitest';
import type { TraitVisualAttachmentView } from '@sim';
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
    expect(loadout.slotCapacity).toBe(5);
    expect(loadout.slotsUsed).toBe(3);
    expect(loadout.cards.map((card) => card.id)).toEqual([
      'greg-auto-fire:starter',
      'porcupine-quills:bud',
      'electric-eel-coil:bud',
    ]);
  });

  it('keeps each Mythic at two active-attack slots', () => {
    const loadout = presentActiveAttackLoadout([
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
      visual({ sourceId: 'thunderbug-dynamo', stage: 'mythic', sockets: ['tail', 'bodyOrbit'], visualKey: 'thunderbug-dynamo:mythic' }),
    ]);
    expect(loadout.slotsUsed).toBe(5);
    expect(loadout.cards.map((card) => card.slotCost)).toEqual([1, 2, 2]);
  });
});
