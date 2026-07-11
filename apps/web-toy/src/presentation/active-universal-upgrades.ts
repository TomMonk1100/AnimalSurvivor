import { UNIVERSAL_UPGRADE_CATALOG } from '@sim';

export interface ActiveUniversalUpgradeCard {
  readonly id: string;
  readonly title: string;
  readonly rank: number;
  readonly maxRank: number;
  readonly effect: string;
}

function percent(value: number): string {
  return String(Math.round(value * 100));
}

/** Project authoritative universal ranks into direct, pause-screen-friendly copy. */
export function presentActiveUniversalUpgrades(ranks: readonly number[]): readonly ActiveUniversalUpgradeCard[] {
  const cards: ActiveUniversalUpgradeCard[] = [];
  for (let index = 0; index < UNIVERSAL_UPGRADE_CATALOG.length; index++) {
    const definition = UNIVERSAL_UPGRADE_CATALOG[index]!;
    const rank = ranks[index] ?? 0;
    if (!Number.isSafeInteger(rank) || rank <= 0) continue;

    let effect: string;
    switch (definition.effect.kind) {
      case 'speedMultiplier':
        effect = `+${percent(definition.effect.bonusPerRank * rank)}% movement speed.`;
        break;
      case 'xpMagnet':
        effect = `+${definition.effect.pickupRadiusBonusPerRank * rank} pickup radius; XP motes pull from ${definition.effect.attractionRadiusBonusPerRank * rank} range at ${definition.effect.attractionSpeedBonusPerRank * rank}/sec.`;
        break;
      case 'maxHp':
        effect = `+${definition.effect.bonusPerRank * rank} maximum health.`;
        break;
      case 'weaponDamageMultiplier':
        effect = `+${percent(definition.effect.bonusPerRank * rank)}% base weapon damage.`;
        break;
      case 'weaponCooldownMultiplier':
        effect = `-${percent(definition.effect.reductionPerRank * rank)}% base auto-fire cooldown (rounded to fixed ticks).`;
        break;
      case 'xpMultiplier':
        effect = `+${percent(definition.effect.bonusPerRank * rank)}% XP gained.`;
        break;
    }
    cards.push(Object.freeze({
      id: definition.id,
      title: definition.title,
      rank: Math.min(rank, definition.maxRank),
      maxRank: definition.maxRank,
      effect,
    }));
  }
  return Object.freeze(cards);
}
