import { describe, expect, it } from 'vitest';
import { calculateTerminalEssenceReward } from '../src/presentation/terminal-essence';

describe('terminal Essence reward', () => {
  it('always gives a completed attempt a useful base reward and honors cache/kill bonuses', () => {
    expect(calculateTerminalEssenceReward('defeat', 47, 5)).toEqual({
      base: 10, killBonus: 2, cacheBonus: 5, total: 17,
    });
    expect(calculateTerminalEssenceReward('victory', 0, 0)).toEqual({
      base: 25, killBonus: 0, cacheBonus: 0, total: 25,
    });
  });
});
