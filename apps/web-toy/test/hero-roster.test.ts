import { describe, expect, it } from 'vitest';
import { HERO_CATALOG } from '@sim';
import {
  BENNY_CUTOUT_HALF_EXTENT,
  GRACIE_CUTOUT_HALF_EXTENT,
  PROCEDURAL_ANIMAL_ROOT_SCALE,
  SCOUT_CUTOUT_HALF_EXTENT,
} from '../src/hero/procedural-animal-presentation';
import {
  HERO_ANCHOR_BREATH_PERIOD_TICKS,
  HERO_ANCHOR_DAMAGE_PULSE_DURATION_TICKS,
  HERO_ANCHOR_INNER_RING_RADIUS_MULTIPLIER,
  HERO_ANCHOR_IVORY_HEX,
  HERO_ANCHOR_OUTER_RING_RADIUS_MULTIPLIER,
  HERO_ANCHOR_PULSE_IVORY_HEX,
  projectHeroAnchorPose,
  writeHeroAnchorPose,
} from '../src/hero/hero-presentation';
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

  it('projects a reserved-ivory hero anchor and one bounded damage locator pulse', () => {
    expect(HERO_ANCHOR_IVORY_HEX).toBe('#f3ead4');
    expect(HERO_ANCHOR_PULSE_IVORY_HEX).toBe('#fffbe9');
    const idle = projectHeroAnchorPose(8, 0, 0, Number.NEGATIVE_INFINITY);
    expect(idle.innerRingRadius).toBeCloseTo(8 * HERO_ANCHOR_INNER_RING_RADIUS_MULTIPLIER);
    expect(idle.outerRingRadius).toBeCloseTo(8 * HERO_ANCHOR_OUTER_RING_RADIUS_MULTIPLIER);
    // The calm locator must escape the largest scaled hero card; otherwise it
    // becomes invisible beneath the alpha-tested silhouette at play zoom.
    expect(idle.innerRingRadius).toBeGreaterThanOrEqual(
      SCOUT_CUTOUT_HALF_EXTENT * PROCEDURAL_ANIMAL_ROOT_SCALE,
    );
    expect(idle.outerRingRadius).toBeGreaterThan(
      SCOUT_CUTOUT_HALF_EXTENT * PROCEDURAL_ANIMAL_ROOT_SCALE,
    );
    expect(idle.pulseActive).toBe(false);

    const hit = projectHeroAnchorPose(8, 200, 0, 200);
    const fading = projectHeroAnchorPose(8, 209, 0, 200);
    const expired = projectHeroAnchorPose(
      8,
      200 + HERO_ANCHOR_DAMAGE_PULSE_DURATION_TICKS,
      0,
      200,
    );
    expect(hit.pulseActive).toBe(true);
    expect(fading.pulseActive).toBe(true);
    expect(fading.pulseRingRadius).toBeGreaterThan(hit.pulseRingRadius);
    expect(fading.pulseOpacity).toBeLessThan(hit.pulseOpacity);
    expect(expired).toMatchObject({ pulseActive: false, pulseOpacity: 0 });

    const quarterBreath = projectHeroAnchorPose(8, HERO_ANCHOR_BREATH_PERIOD_TICKS / 4, 0, Number.NEGATIVE_INFINITY);
    expect(quarterBreath.breathScale).toBeGreaterThan(1);
  });

  it('writes the anchor projection into a caller-owned reusable pose', () => {
    const pose = {
      breathScale: 0,
      shadowRadius: 0,
      innerRingRadius: 0,
      outerRingRadius: 0,
      pulseRingRadius: 0,
      pulseOpacity: 0,
      pulseActive: false,
    };
    const originalReference = pose;
    writeHeroAnchorPose(pose, 8, 205, 0.5, 200);

    expect(pose).toBe(originalReference);
    expect(pose).toEqual(projectHeroAnchorPose(8, 205, 0.5, 200));
  });

  it('keeps Scout visibly largest while proportionally lifting every founding cutout', () => {
    expect(SCOUT_CUTOUT_HALF_EXTENT).toBe(8.2);
    expect(SCOUT_CUTOUT_HALF_EXTENT).toBeGreaterThan(BENNY_CUTOUT_HALF_EXTENT);
    expect(BENNY_CUTOUT_HALF_EXTENT).toBeGreaterThan(GRACIE_CUTOUT_HALF_EXTENT);
    expect(GRACIE_CUTOUT_HALF_EXTENT).toBeGreaterThanOrEqual(8);
  });
});
