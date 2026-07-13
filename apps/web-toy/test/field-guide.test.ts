import { describe, expect, it } from 'vitest';
import {
  createFieldGuideEntry,
  getHeroPortraitAsset,
  presentFieldGuideEvolutionTree,
  presentFieldGuidePortrait,
  presentFieldGuideRecipes,
} from '../src/profile/field-guide';

describe('Field Guide entry projection', () => {
  it('shares stable authored portrait assets with hero selection', () => {
    expect(getHeroPortraitAsset('gracie')).toEqual({
      assetUrl: expect.stringContaining('gracie-final-form-v1.png'),
      assetAlt: 'Gracie founding hero portrait',
    });
  });

  it('creates deterministic, player-readable build names and ecology notes', () => {
    const input = {
      runId: 'guide:1',
      heroId: 'greg' as const,
      seed: 0,
      outcome: 'victory' as const,
      durationTicks: 600,
      kills: 21,
      essenceEarned: 8,
      visuals: [
        { sourceId: 'owl-pinions', stage: 'adapted' as const, visualKey: 'owl-pinions:adapted', enabled: true },
        { sourceId: 'midnight-radar', stage: 'mythic' as const, visualKey: 'midnight-radar:mythic', enabled: true },
        { sourceId: 'unused', stage: 'bud' as const, visualKey: 'unused:bud', enabled: false },
      ],
      universalUpgradeRanks: [1, 0, 0],
    };

    const first = createFieldGuideEntry(input);
    const second = createFieldGuideEntry(input);
    expect(first).toEqual(second);
    expect(first.buildName).toBe('Moonlit Greg Mythic Hunt: Owl Pinions + Midnight Radar');
    expect(first.ecologyNote).toContain('The final threat fell');
    expect(first.ecologyNote).toContain('a Mythic transformation');
    expect(first.visuals).toEqual([
      { sourceId: 'owl-pinions', stage: 'adapted', visualKey: 'owl-pinions:adapted' },
      { sourceId: 'midnight-radar', stage: 'mythic', visualKey: 'midnight-radar:mythic' },
    ]);
    expect(presentFieldGuidePortrait(first)).toEqual({
      key: 'greg:midnight-radar:mythic',
      glyph: 'G',
      accent: '#f1c27d',
      assetUrl: expect.stringContaining('greg-final-form-v1.png'),
      assetAlt: 'Greg final-form portrait',
      title: 'Greg portrait',
      formLabel: 'Mythic · Midnight Radar',
    });
    expect(presentFieldGuideEvolutionTree(first)).toEqual([
      {
        sourceId: 'owl-pinions',
        title: 'Owl Pinions',
        ingredients: [],
        steps: [
          { label: 'Bud', unlocked: true },
          { label: 'Adapted', unlocked: true },
          { label: 'Mythic', unlocked: false },
        ],
      },
      {
        sourceId: 'midnight-radar',
        title: 'Midnight Radar',
        ingredients: ['Owl Pinions', 'Bat Ears'],
        steps: [
          { label: 'Bud', unlocked: true },
          { label: 'Adapted', unlocked: true },
          { label: 'Mythic', unlocked: true },
        ],
      },
    ]);
  });

  it('keeps a no-adaptation defeat legible', () => {
    const entry = createFieldGuideEntry({
      runId: 'guide:2',
      heroId: 'benny',
      seed: 1,
      outcome: 'defeat',
      durationTicks: 10,
      kills: 0,
      essenceEarned: 0,
      visuals: [],
      universalUpgradeRanks: [],
    });
    expect(entry.buildName).toBe('Mossbound Benny First Forage');
    expect(entry.ecologyNote).toBe('The colony was overrun before any adaptation took hold.');
    expect(presentFieldGuidePortrait(entry).formLabel).toBe('Founding form');
  });

  it('presents the full Mythic recipe catalog with deterministic discovery state', () => {
    const recipes = presentFieldGuideRecipes(['midnight-radar', 'unknown-recipe']);
    expect(recipes).toHaveLength(6);
    expect(recipes.map((recipe) => recipe.discovered)).toEqual([false, false, false, true, false, false]);
    expect(recipes[0]).toEqual({
      id: 'thornstorm-mantle',
      title: 'Thornstorm Mantle',
      ingredients: ['Porcupine Quills', 'Puffer Pouch'],
      discovered: false,
    });
    expect(recipes[3]).toEqual({
      id: 'midnight-radar',
      title: 'Midnight Radar',
      ingredients: ['Owl Pinions', 'Bat Ears'],
      discovered: true,
    });
  });
});
