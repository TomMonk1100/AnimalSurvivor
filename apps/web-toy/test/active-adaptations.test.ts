import { describe, expect, it } from 'vitest';
import type { TraitVisualAttachmentView } from '@sim';
import { presentActiveAdaptations } from '../src/presentation/active-adaptations';

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

describe('active adaptation presentation', () => {
  it('explains the supported Bud and Adapted cards in plain language', () => {
    const cards = presentActiveAdaptations([
      visual({ sourceId: 'porcupine-quills', stage: 'bud', visualKey: 'porcupine-quills:bud' }),
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'puffer-pouch:adapted' }),
    ]);

    expect(cards).toEqual([
      expect.objectContaining({
        id: 'porcupine-quills:bud', title: 'Porcupine Quills', stageLabel: 'Bud', cadence: 'Every 1.5 seconds',
      }),
      expect.objectContaining({
        id: 'puffer-pouch:adapted', title: 'Puffer Pouch', stageLabel: 'Adapted', cadence: 'Every 1.3 seconds',
      }),
    ]);
    expect(cards[0]?.effect).toMatch(/quill burst/i);
    expect(cards[1]?.effect).toMatch(/Pushes nearby enemies away/i);
    expect(Object.keys(cards[0] ?? {})).toEqual(['id', 'title', 'stageLabel', 'effect', 'cadence']);
  });

  it('uses canonical order, ignores disabled or malformed visuals, and keeps only the highest active stage', () => {
    const cards = presentActiveAdaptations([
      visual({ sourceId: 'puffer-pouch', stage: 'bud', sockets: ['head'], visualKey: 'puffer-pouch:bud' }),
      visual({ sourceId: 'porcupine-quills', stage: 'bud', visualKey: 'porcupine-quills:bud' }),
      visual({ sourceId: 'porcupine-quills', stage: 'adapted', visualKey: 'porcupine-quills:adapted' }),
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'puffer-pouch:adapted', enabled: false }),
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'wrong:key' }),
      visual({ sourceId: 'unknown', stage: 'bud', visualKey: 'unknown:bud' }),
    ]);

    expect(cards.map((card) => card.id)).toEqual([
      'porcupine-quills:adapted',
      'puffer-pouch:bud',
    ]);
  });

  it('presents Thornstorm as a single Mythic card with its authored sequence', () => {
    const cards = presentActiveAdaptations([
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'puffer-pouch:adapted' }),
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
      visual({ sourceId: 'porcupine-quills', stage: 'adapted', visualKey: 'porcupine-quills:adapted' }),
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
    ]);

    expect(cards).toEqual([
      expect.objectContaining({
        id: 'thornstorm-mantle:mythic', title: 'Thornstorm Mantle', stageLabel: 'Mythic',
      }),
    ]);
    expect(cards[0]?.effect).toMatch(/radial quill storm/i);
    expect(cards[0]?.cadence).toContain('telegraph → gather → radial quill storm');
  });

  it('keeps unrelated attacks visible beside a Mythic and supports a second Mythic', () => {
    const cards = presentActiveAdaptations([
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
      visual({ sourceId: 'electric-eel-coil', stage: 'adapted', sockets: ['tail'], visualKey: 'electric-eel-coil:adapted' }),
      visual({ sourceId: 'firefly-colony', stage: 'bud', sockets: ['bodyOrbit'], visualKey: 'firefly-colony:bud' }),
    ]);

    expect(cards.map((card) => card.id)).toEqual([
      'thornstorm-mantle:mythic',
      'electric-eel-coil:adapted',
      'firefly-colony:bud',
    ]);

    const mythics = presentActiveAdaptations([
      visual({ sourceId: 'thornstorm-mantle', stage: 'mythic', sockets: ['head', 'back'], visualKey: 'thornstorm-mantle:mythic' }),
      visual({ sourceId: 'thunderbug-dynamo', stage: 'mythic', sockets: ['tail', 'bodyOrbit'], visualKey: 'thunderbug-dynamo:mythic' }),
    ]);
    expect(mythics.map((card) => card.id)).toEqual([
      'thornstorm-mantle:mythic',
      'thunderbug-dynamo:mythic',
    ]);
    expect(mythics[1]?.effect).toMatch(/lightning storm/i);
  });
});
