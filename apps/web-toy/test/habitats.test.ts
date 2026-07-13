import { describe, expect, it } from 'vitest';
import { HABITAT_IDS, presentFieldGuideHabitats } from '../src/profile/habitats';
import { createFieldGuideEntry, type FieldGuideVisualInput } from '../src/profile/field-guide';

function entry(
  id: string,
  heroId: 'greg' | 'benny' | 'gracie',
  biomeId: 'forest' | 'saltwind',
  outcome: 'victory' | 'defeat' = 'victory',
  visuals: readonly FieldGuideVisualInput[] = [],
) {
  return createFieldGuideEntry({
    runId: id,
    heroId,
    biomeId,
    seed: id.length,
    outcome,
    durationTicks: 28_800,
    kills: 100,
    essenceEarned: outcome === 'victory' ? 10 : 0,
    visuals,
    universalUpgradeRanks: [],
  });
}

describe('Field Guide Habitat Atlas', () => {
  it('starts with only the Forest habitat and preserves catalog order', () => {
    const habitats = presentFieldGuideHabitats([]);
    expect(HABITAT_IDS).toHaveLength(6);
    expect(habitats.map((habitat) => habitat.id)).toEqual([...HABITAT_IDS]);
    expect(habitats.map((habitat) => habitat.unlocked)).toEqual([true, false, false, false, false, false]);
    expect(Object.isFrozen(habitats)).toBe(true);
  });

  it('unlocks biome, hero, and Mythic habitats from victories and archive forms', () => {
    const habitats = presentFieldGuideHabitats([
      entry('forest-greg', 'greg', 'forest'),
      entry('saltwind-benny', 'benny', 'saltwind'),
      entry('forest-gracie', 'gracie', 'forest'),
      entry('mythic-defeat', 'greg', 'forest', 'defeat', [
        { sourceId: 'meteor-mauler', stage: 'mythic', visualKey: 'meteor-mauler:mythic' },
      ]),
    ]);
    expect(habitats.map((habitat) => habitat.unlocked)).toEqual([true, true, true, true, true, true]);
  });

  it('does not unlock victory habitats from defeats, while preserving Mythic discovery', () => {
    const habitats = presentFieldGuideHabitats([
      entry('saltwind-defeat', 'benny', 'saltwind', 'defeat'),
      entry('greg-defeat', 'greg', 'forest', 'defeat'),
      entry('mythic-defeat', 'gracie', 'forest', 'defeat', [
        { sourceId: 'royal-stinkcloud', stage: 'mythic', visualKey: 'royal-stinkcloud:mythic' },
      ]),
    ]);
    expect(habitats.map((habitat) => habitat.unlocked)).toEqual([true, false, false, false, false, true]);
  });

  it('is deterministic for identical archive snapshots', () => {
    const runs = [entry('forest', 'greg', 'forest')];
    expect(presentFieldGuideHabitats(runs)).toEqual(presentFieldGuideHabitats(runs));
  });
});
