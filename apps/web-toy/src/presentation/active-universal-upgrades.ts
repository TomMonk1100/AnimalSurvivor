import { UNIVERSAL_UPGRADE_CATALOG } from '@sim';
import type { UniversalUpgradeCatalog } from '@sim';

export interface ActiveUniversalUpgradeCard {
  readonly id: string;
  readonly title: string;
  readonly kind: 'neutral' | 'starterMastery';
  readonly rank: number;
  readonly maxRank: number;
  readonly effect: string;
}

function percent(value: number): string {
  return String(Math.round(value * 100));
}

/** Project authoritative universal ranks into direct, pause-screen-friendly copy. */
export function presentActiveUniversalUpgrades(
  ranks: readonly number[],
  catalog: UniversalUpgradeCatalog = UNIVERSAL_UPGRADE_CATALOG,
): readonly ActiveUniversalUpgradeCard[] {
  const cards: ActiveUniversalUpgradeCard[] = [];
  for (let index = 0; index < catalog.length; index++) {
    const definition = catalog[index]!;
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
        effect = `+${percent(definition.effect.bonusPerRank * rank)}% damage for every attack.`;
        break;
      case 'weaponCooldownMultiplier':
        effect = `-${percent(definition.effect.reductionPerRank * rank)}% cooldown for every attack (rounded to fixed ticks).`;
        break;
      case 'xpMultiplier':
        effect = `+${percent(definition.effect.bonusPerRank * rank)}% XP gained.`;
        break;
      case 'basicAttack':
        effect = `+${percent(definition.effect.damageBonusPerRank * rank)}% ${definition.effect.heroId} starter damage; -${percent(definition.effect.cooldownReductionPerRank * rank)}% starter cooldown.`;
        if (definition.effect.projectileCountAtRank !== undefined && rank >= definition.effect.projectileCountAtRank) {
          effect += ' Extra starter projectile unlocked.';
        }
        if (definition.effect.pierceAtRank !== undefined && rank >= definition.effect.pierceAtRank) {
          effect += ' Starter shot pierces once.';
        }
        break;
    }
    cards.push(Object.freeze({
      id: definition.id,
      title: definition.title,
      kind: definition.effect.kind === 'basicAttack' ? 'starterMastery' : 'neutral',
      rank: Math.min(rank, definition.maxRank),
      maxRank: definition.maxRank,
      effect,
    }));
  }
  return Object.freeze(cards);
}
