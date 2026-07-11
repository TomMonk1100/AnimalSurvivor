import type { RunOutcomeView } from '@sim';

export interface TerminalEssenceReward {
  readonly base: number;
  readonly killBonus: number;
  readonly cacheBonus: number;
  readonly total: number;
}

/**
 * First-alpha currency rule: every completed attempt funds one initial
 * permanent purchase, victory gives a meaningful bump, kills reward survival,
 * and fallback Essence Cache cards are honored exactly once at settlement.
 */
export function calculateTerminalEssenceReward(
  outcome: Exclude<RunOutcomeView, 'running' | null>,
  totalKills: number,
  cacheBonus: number,
): TerminalEssenceReward {
  if (outcome !== 'victory' && outcome !== 'defeat') throw new RangeError('terminal Essence requires victory or defeat');
  if (!Number.isSafeInteger(totalKills) || totalKills < 0) throw new RangeError('total kills must be a non-negative safe integer');
  if (!Number.isSafeInteger(cacheBonus) || cacheBonus < 0) throw new RangeError('cache bonus must be a non-negative safe integer');
  const base = outcome === 'victory' ? 25 : 10;
  const killBonus = Math.floor(totalKills / 20);
  const total = base + killBonus + cacheBonus;
  if (!Number.isSafeInteger(total)) throw new RangeError('terminal Essence total exceeds safe integer range');
  return Object.freeze({ base, killBonus, cacheBonus, total });
}
