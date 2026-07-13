import { describe, expect, it } from 'vitest';
import { presentActiveUniversalUpgrades } from '../src/presentation/active-universal-upgrades';

describe('active universal upgrade copy', () => {
  it('lists only chosen ranks with their concrete run effects', () => {
    expect(presentActiveUniversalUpgrades([2, 1, 0, 3, 2, 1])).toEqual([
      { id: 'swift-paws', title: 'Swift Paws', kind: 'neutral', rank: 2, maxRank: 5, effect: '+16% movement speed.' },
      { id: 'xp-magnet', title: 'Mote Draw', kind: 'neutral', rank: 1, maxRank: 5, effect: '+10 pickup radius; XP motes pull from 80 range at 120/sec.' },
      { id: 'sharpened-instinct', title: 'Sharpened Instinct', kind: 'neutral', rank: 3, maxRank: 5, effect: '+36% damage for every attack.' },
      { id: 'rapid-instinct', title: 'Rapid Instinct', kind: 'neutral', rank: 2, maxRank: 5, effect: '-16% cooldown for every attack (rounded to fixed ticks).' },
      { id: 'growth', title: 'Growth', kind: 'neutral', rank: 1, maxRank: 5, effect: '+12% XP gained.' },
    ]);
  });
});
