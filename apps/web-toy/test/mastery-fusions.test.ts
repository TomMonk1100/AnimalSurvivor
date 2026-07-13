import { describe, expect, it } from 'vitest';
import {
  presentFusion,
  presentMasteryRank,
  readFusionOffers,
} from '../src/presentation/mastery-fusions';

describe('V1.1 mastery fusion presentation', () => {
  it('keeps legacy stage copy only when rank data is absent', () => {
    expect(presentMasteryRank(undefined, undefined, 'Adapted')).toBe('Adapted');
    expect(presentMasteryRank(3, false, 'Adapted')).toBe('Rank 3/5');
    expect(presentMasteryRank(5, false, 'Adapted')).toBe('MASTER · Rank 5/5');
  });

  it('validates externally supplied fusion offers without leaking malformed entries', () => {
    const offers = readFusionOffers([
      { evolutionId: 'thornstorm-mantle', ingredients: ['porcupine-quills', 'puffer-pouch'] },
      { evolutionId: 'thornstorm-mantle', ingredients: ['duplicate', 'duplicate'] },
      { evolutionId: '', ingredients: ['a', 'b'] },
      { evolutionId: 'broken', ingredients: ['only-one'] },
    ]);

    expect(offers).toEqual([{
      evolutionId: 'thornstorm-mantle',
      ingredients: ['porcupine-quills', 'puffer-pouch'],
    }]);
    expect(Object.isFrozen(offers)).toBe(true);
  });

  it('states that every fusion is free and reduces the build to one logical slot', () => {
    const presentation = presentFusion({
      evolutionId: 'razorstep-chimera',
      ingredients: ['mantis-scythes', 'gecko-pads'],
    });
    expect(presentation).toMatchObject({
      title: 'Razorstep Chimera',
      ingredients: 'Mantis Scythes + Gecko Pads',
    });
    expect(presentation.detail).toMatch(/one logical attack slot.*free/i);
  });
});
