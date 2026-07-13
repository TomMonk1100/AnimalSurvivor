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

  it('derives identity copy from the simulation catalog instead of duplicating it', () => {
    expect(HERO_VISUAL_PROFILES.map(({ id, displayName, species, epithet, description }) => ({
      id, displayName, species, epithet, description,
    }))).toEqual(HERO_CATALOG.map(({ id, displayName, species, epithet, description }) => ({
      id, displayName, species, epithet, description,
    })));
  });

  it('gives each stable roster name its V1.1 combat identity', () => {
    expect(getHeroVisualProfile('greg')).toMatchObject({
      displayName: 'Greg', species: 'Fox', characterLine: expect.stringMatching(/Fox Swipe/i), statLine: expect.stringMatching(/Melee Affinity/i),
    });
    expect(getHeroVisualProfile('benny')).toMatchObject({
      displayName: 'Benny', species: 'Bull', characterLine: expect.stringMatching(/Trample/i), statLine: expect.stringMatching(/Thick Skin/i),
    });
    expect(getHeroVisualProfile('gracie')).toMatchObject({
      displayName: 'Gracie', species: 'Alpaca', characterLine: expect.stringMatching(/Spit/i), statLine: expect.stringMatching(/Fluffy Shield/i),
    });
  });
});
