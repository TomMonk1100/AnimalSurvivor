import { describe, expect, it } from 'vitest';
import { presentFieldGuideChallenges } from '../src/profile/challenges';
import { createFieldGuideEntry, type FieldGuideVisualInput } from '../src/profile/field-guide';

function entry(
  id: string,
  heroId: 'greg' | 'benny' | 'gracie',
  biomeId: 'forest' | 'saltwind',
  visuals: readonly FieldGuideVisualInput[] = [],
) {
  return createFieldGuideEntry({
    runId: id,
    heroId,
    biomeId,
    seed: id.length,
    outcome: 'victory',
    durationTicks: 28_800,
    kills: 100,
    essenceEarned: 10,
    visuals,
    universalUpgradeRanks: [],
  });
}

describe('Field Guide challenge projection', () => {
  it('derives deterministic horizontal badges without adding save fields or currency', () => {
    const runs = [
      entry('forest-greg', 'greg', 'forest'),
      entry('saltwind-benny', 'benny', 'saltwind', [
        { sourceId: 'meteor-mauler', stage: 'mythic' as const, visualKey: 'meteor-mauler:mythic' },
      ]),
      entry('saltwind-gracie', 'gracie', 'saltwind'),
    ];
    const first = presentFieldGuideChallenges(runs);
    const second = presentFieldGuideChallenges(runs);
    expect(first).toEqual(second);
    expect(first.map((challenge) => challenge.unlocked)).toEqual([true, true, true, true, true]);
    expect(first.map((challenge) => challenge.title)).toEqual([
      'First Light', 'Forest Clearer', 'Saltwind Survivor', 'Mythic Maker', 'Roster Scout',
    ]);
    expect(first.find((challenge) => challenge.id === 'roster-scout')).toMatchObject({
      description: 'Win with Scout, Benny, and Gracie.',
    });
  });

  it('keeps unfinished challenges explicitly locked', () => {
    const challenges = presentFieldGuideChallenges([createFieldGuideEntry({
      runId: 'defeat',
      heroId: 'greg',
      biomeId: 'forest',
      seed: 0,
      outcome: 'defeat',
      durationTicks: 60,
      kills: 1,
      essenceEarned: 0,
      visuals: [],
      universalUpgradeRanks: [],
    })]);
    expect(challenges.every((challenge) => !challenge.unlocked)).toBe(true);
  });
});
