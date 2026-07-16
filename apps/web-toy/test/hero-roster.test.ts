import { describe, expect, it } from 'vitest';
import { HERO_CATALOG } from '@sim';
import { HERO_VISUAL_PROFILES, getHeroVisualProfile } from '../src/hero/hero-roster';

describe('founding hero roster', () => {
  it('exposes three authored founding silhouettes in stable order', () => {
    expect(HERO_VISUAL_PROFILES.map((hero) => hero.id)).toEqual(['greg', 'benny', 'gracie']);
    expect(HERO_VISUAL_PROFILES.every((hero) => hero.palette.length === 3)).toBe(true);
  });

  it('keeps selected hero presentation data aligned with the deterministic catalog', () => {
    expect(getHeroVisualProfile('benny')).toMatchObject({
      displayName: 'Benny',
      species: 'Bull',
      silhouette: 'horns · broad shoulders',
      characterLine: 'A gentle giant whose Trample turns a clear lane into a rolling earthwave.',
      statLine: '+28 starting HP · Thick Skin armor · slower movement and cadence',
    });
    expect(() => getHeroVisualProfile('otter' as never)).toThrow(/Unknown hero id/);
  });

  it('keeps simulation roster ids stable while allowing Scout’s presentation alias', () => {
    expect(HERO_VISUAL_PROFILES.map(({ id }) => id)).toEqual(HERO_CATALOG.map(({ id }) => id));
    expect(getHeroVisualProfile('greg')).toMatchObject({
      id: 'greg',
      displayName: 'Scout',
      species: 'Dog',
      epithet: 'The Pouncer',
      description: expect.stringMatching(/Scout Swipe/i),
      silhouette: 'floppy ears · wagging tail',
    });

    for (const heroId of ['benny', 'gracie'] as const) {
      const simulationHero = HERO_CATALOG.find((hero) => hero.id === heroId)!;
      const visualHero = getHeroVisualProfile(heroId);
      expect({
        displayName: visualHero.displayName,
        species: visualHero.species,
        epithet: visualHero.epithet,
        description: visualHero.description,
      }).toEqual({
        displayName: simulationHero.displayName,
        species: simulationHero.species,
        epithet: simulationHero.epithet,
        description: simulationHero.description,
      });
    }
  });

  it('gives each stable roster id its player-facing combat identity', () => {
    expect(getHeroVisualProfile('greg')).toMatchObject({
      displayName: 'Scout', species: 'Dog', characterLine: expect.stringMatching(/Scout Swipe/i), statLine: expect.stringMatching(/Melee Affinity/i),
    });
    expect(getHeroVisualProfile('benny')).toMatchObject({
      displayName: 'Benny', species: 'Bull', characterLine: expect.stringMatching(/Trample/i), statLine: expect.stringMatching(/Thick Skin/i),
    });
    expect(getHeroVisualProfile('gracie')).toMatchObject({
      displayName: 'Gracie', species: 'Alpaca', characterLine: expect.stringMatching(/Spit/i), statLine: expect.stringMatching(/Fluffy Shield/i),
    });
  });
});
