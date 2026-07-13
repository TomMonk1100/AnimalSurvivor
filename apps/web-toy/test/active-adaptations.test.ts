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
    expect(cards[0]?.effect).toMatch(/pierce/i);
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
    expect(mythics[1]?.effect).toMatch(/larger chain discharge/i);
  });

  it('describes Coil as a guaranteed strike-and-chain attack, not projectiles', () => {
    const bud = presentActiveAdaptations([
      visual({
        sourceId: 'electric-eel-coil',
        stage: 'bud',
        sockets: ['tail'],
        visualKey: 'electric-eel-coil:bud',
      }),
    ]);
    const adapted = presentActiveAdaptations([
      visual({
        sourceId: 'electric-eel-coil',
        stage: 'adapted',
        sockets: ['tail'],
        visualKey: 'electric-eel-coil:adapted',
      }),
    ]);

    expect(bud[0]).toMatchObject({
      effect: 'Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.',
      cadence: 'Every 1.3 seconds',
    });
    expect(adapted[0]).toMatchObject({
      effect: 'Instantly strikes the nearest enemy, then chains to 3 nearby unhit foes.',
      cadence: 'Every 0.9 seconds',
    });
  });

  it('shows Mantis Scythes as a truthful auto-aimed directional attack', () => {
    const cards = presentActiveAdaptations([
      visual({
        sourceId: 'mantis-scythes',
        stage: 'adapted',
        sockets: ['leftShoulder'],
        visualKey: 'mantis-scythes:adapted',
      }),
    ]);

    expect(cards).toEqual([
      expect.objectContaining({
        id: 'mantis-scythes:adapted',
        title: 'Mantis Scythes',
        stageLabel: 'Adapted',
        cadence: 'Every 0.5 seconds',
      }),
    ]);
    expect(cards[0]?.effect).toMatch(/auto-aims a wider.*scythe sweep/i);
  });

  it('shows Gecko Pads as movement-trail damage at each authored threshold', () => {
    const bud = presentActiveAdaptations([
      visual({
        sourceId: 'gecko-pads',
        stage: 'bud',
        sockets: ['rightShoulder'],
        visualKey: 'gecko-pads:bud',
      }),
    ]);
    expect(bud).toEqual([
      expect.objectContaining({
        id: 'gecko-pads:bud',
        title: 'Gecko Pads',
        effect: "After moving, leaves a damaging pad at Greg's feet.",
        cadence: 'Placement: after travelling 150 units',
      }),
    ]);

    const adapted = presentActiveAdaptations([
      visual({
        sourceId: 'gecko-pads',
        stage: 'adapted',
        sockets: ['rightShoulder'],
        visualKey: 'gecko-pads:adapted',
      }),
    ]);
    expect(adapted[0]).toMatchObject({
      effect: "After moving, leaves larger, stronger damaging pads at Greg's feet.",
      cadence: 'Placement: after travelling 110 units',
    });
  });

  it('presents the newly activated V1 trait families and their Mythic fusion', () => {
    const cards = presentActiveAdaptations([
      visual({ sourceId: 'owl-pinions', stage: 'adapted', sockets: ['leftShoulder', 'rightShoulder'], visualKey: 'owl-pinions:adapted' }),
      visual({ sourceId: 'bat-ears', stage: 'bud', sockets: ['head'], visualKey: 'bat-ears:bud' }),
      visual({ sourceId: 'crab-pincers', stage: 'adapted', sockets: ['leftShoulder', 'rightShoulder'], visualKey: 'crab-pincers:adapted' }),
      visual({ sourceId: 'armadillo-greaves', stage: 'bud', sockets: ['back'], visualKey: 'armadillo-greaves:bud' }),
      visual({ sourceId: 'skunk-brush', stage: 'bud', sockets: ['tail'], visualKey: 'skunk-brush:bud' }),
      visual({ sourceId: 'monarch-brood', stage: 'adapted', sockets: ['bodyOrbit'], visualKey: 'monarch-brood:adapted' }),
    ]);

    expect(cards.map((card) => card.id)).toEqual([
      'owl-pinions:adapted', 'bat-ears:bud', 'crab-pincers:adapted',
      'armadillo-greaves:bud', 'skunk-brush:bud', 'monarch-brood:adapted',
    ]);
    expect(cards.find((card) => card.id === 'bat-ears:bud')?.effect).toMatch(/mark/i);
    expect(cards.find((card) => card.id === 'monarch-brood:adapted')?.effect).toMatch(/sting nearby enemies/i);

    const royal = presentActiveAdaptations([
      visual({ sourceId: 'royal-stinkcloud', stage: 'mythic', sockets: ['tail', 'bodyOrbit'], visualKey: 'royal-stinkcloud:mythic' }),
      visual({ sourceId: 'skunk-brush', stage: 'adapted', sockets: ['tail'], visualKey: 'skunk-brush:adapted' }),
      visual({ sourceId: 'monarch-brood', stage: 'adapted', sockets: ['bodyOrbit'], visualKey: 'monarch-brood:adapted' }),
    ]);
    expect(royal).toHaveLength(1);
    expect(royal[0]).toMatchObject({ id: 'royal-stinkcloud:mythic', title: 'Royal Stinkcloud' });
  });

  it('replaces Mantis and Gecko with their two-slot Razorstep Mythic card', () => {
    const cards = presentActiveAdaptations([
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

    expect(cards).toEqual([
      expect.objectContaining({
        id: 'razorstep-chimera:mythic',
        title: 'Razorstep Chimera',
        stageLabel: 'Mythic',
        effect: "Movement leaves stronger scythe pads at Greg's feet.",
        cadence: 'Placement: after travelling 90 units',
      }),
    ]);
  });
});
