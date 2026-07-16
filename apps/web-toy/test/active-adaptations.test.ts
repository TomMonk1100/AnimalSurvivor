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
    expect(Object.keys(cards[0] ?? {})).toEqual(['id', 'title', 'stageLabel', 'effect', 'cadence', 'impactCategory', 'impact']);
    expect(cards[0]).toMatchObject({ impactCategory: 'Direct damage' });
    expect(cards[1]).toMatchObject({ impactCategory: 'Crowd control' });
    expect(cards[1]?.impact).toMatch(/no direct damage/i);
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
        id: 'thornstorm-mantle:mythic', title: 'Thornstorm Mantle', stageLabel: 'Fused · 1 slot',
      }),
    ]);
    expect(cards[0]?.effect).toMatch(/radial quill storm/i);
    expect(cards[0]?.cadence).toContain('telegraph → gather → radial quill storm');
    expect(cards[0]?.cadence).toContain('One slot');
  });

  it('keeps body-relative attack copy correct for every selected hero', () => {
    const cards = presentActiveAdaptations([
      visual({ sourceId: 'puffer-pouch', stage: 'bud', sockets: ['head'], visualKey: 'puffer-pouch:bud' }),
      visual({ sourceId: 'firefly-colony', stage: 'bud', sockets: ['bodyOrbit'], visualKey: 'firefly-colony:bud' }),
      visual({ sourceId: 'gecko-pads', stage: 'bud', sockets: ['feet'], visualKey: 'gecko-pads:bud' }),
      visual({ sourceId: 'monarch-brood', stage: 'bud', sockets: ['bodyOrbit'], visualKey: 'monarch-brood:bud' }),
    ]);
    const effects = cards.map((card) => card.effect).join(' ');

    expect(effects).toMatch(/you/i);
    expect(effects).not.toMatch(/Greg/);
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
        effect: 'After moving, leaves a damaging pad at your feet.',
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
      effect: 'After moving, leaves larger, stronger damaging pads at your feet.',
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

  it('replaces Mantis and Gecko with their one-slot fused Razorstep card', () => {
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
        stageLabel: 'Fused · 1 slot',
        effect: 'Movement leaves stronger scythe pads at your feet. Fused form; occupies one slot.',
        cadence: 'Placement: after travelling 90 units · One slot',
      }),
    ]);
  });

  it('uses optional rank data for Rank 1–5 and MASTER while legacy visuals keep Bud/Adapted labels', () => {
    const legacy = presentActiveAdaptations([
      visual({ sourceId: 'porcupine-quills', stage: 'bud', visualKey: 'porcupine-quills:bud' }),
    ]);
    expect(legacy[0]?.stageLabel).toBe('Bud');

    const ranks = presentActiveAdaptations([
      visual({ sourceId: 'porcupine-quills', stage: 'bud', visualKey: 'porcupine-quills:bud', rank: 1 }),
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'puffer-pouch:adapted', rank: 3 }),
      visual({ sourceId: 'electric-eel-coil', stage: 'adapted', sockets: ['tail'], visualKey: 'electric-eel-coil:adapted', rank: 5, isMaster: true }),
    ]);

    expect(ranks).toEqual([
      expect.objectContaining({ title: 'Porcupine Quills', stageLabel: 'Rank 1', cadence: 'Every 1.5 seconds' }),
      expect.objectContaining({ title: 'Puffer Pouch', stageLabel: 'Rank 3', cadence: 'Every 1.2 seconds' }),
      expect.objectContaining({ title: 'Electric Eel Coil', stageLabel: 'MASTER · Rank 5', cadence: 'Every 0.6 seconds' }),
    ]);
    expect(ranks[1]?.effect).toMatch(/farther pulse/i);
    expect(ranks[2]?.effect).toMatch(/Master chain/i);
  });

  it('gives all twelve attack families a distinct Master readout despite shared Adapted art keys', () => {
    const masters = presentActiveAdaptations([
      visual({ sourceId: 'porcupine-quills', stage: 'adapted', visualKey: 'porcupine-quills:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'puffer-pouch', stage: 'adapted', sockets: ['head'], visualKey: 'puffer-pouch:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'electric-eel-coil', stage: 'adapted', sockets: ['tail'], visualKey: 'electric-eel-coil:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'firefly-colony', stage: 'adapted', sockets: ['bodyOrbit'], visualKey: 'firefly-colony:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'mantis-scythes', stage: 'adapted', sockets: ['leftShoulder'], visualKey: 'mantis-scythes:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'gecko-pads', stage: 'adapted', sockets: ['rightShoulder'], visualKey: 'gecko-pads:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'owl-pinions', stage: 'adapted', sockets: ['leftShoulder', 'rightShoulder'], visualKey: 'owl-pinions:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'bat-ears', stage: 'adapted', sockets: ['head'], visualKey: 'bat-ears:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'crab-pincers', stage: 'adapted', sockets: ['leftShoulder', 'rightShoulder'], visualKey: 'crab-pincers:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'armadillo-greaves', stage: 'adapted', sockets: ['back'], visualKey: 'armadillo-greaves:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'skunk-brush', stage: 'adapted', sockets: ['tail'], visualKey: 'skunk-brush:adapted', rank: 5, isMaster: true }),
      visual({ sourceId: 'monarch-brood', stage: 'adapted', sockets: ['bodyOrbit'], visualKey: 'monarch-brood:adapted', rank: 5, isMaster: true }),
    ]);

    expect(masters).toHaveLength(12);
    expect(masters.every((card) => card.stageLabel === 'MASTER · Rank 5')).toBe(true);
    expect(new Set(masters.map((card) => card.effect)).size).toBe(12);
    expect(masters.find((card) => card.title === 'Gecko Pads')?.cadence).toContain('70 units');
    expect(masters.find((card) => card.title === 'Monarch Brood')?.effect).toMatch(/Six Master monarchs/i);
  });
});
