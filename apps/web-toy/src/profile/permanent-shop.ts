import type { PermanentUpgradeDefinition, PermanentUpgradeRanks } from './profile-store';

/** Pause-screen-friendly view model for one permanent shop row/card. */
export interface PermanentShopCardView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rankLabel: string;
  readonly effectLabel: string;
  readonly buyLabel: string;
  readonly disabled: boolean;
  readonly maxed: boolean;
}

/** Cooldown reduction reads as a subtraction even though it is stored as a positive per-rank value. */
function formatEffect(def: PermanentUpgradeDefinition, rank: number): string {
  const total = def.perRank * rank;
  switch (def.display) {
    case 'flat': {
      const rounded = Math.round(total);
      return rounded >= 0 ? `+${rounded}` : String(rounded);
    }
    case 'percent': {
      const points = Math.round(total * 100);
      return def.field === 'cooldownReductionBonus' ? `-${points}%` : `+${points}%`;
    }
    case 'multiplier': {
      return `+${total.toFixed(2)}x`;
    }
    default:
      return '';
  }
}

/**
 * Projects the catalog, purchased ranks, and current Essence into a pure,
 * DOM-free view model. Kept separate from `renderPermanentShopCards` so the
 * formatting rules (flat/percent/multiplier, MAX, affordability) are testable
 * without constructing any elements.
 */
export function presentPermanentShopCards(
  catalog: readonly PermanentUpgradeDefinition[],
  ranks: PermanentUpgradeRanks,
  essence: number,
): readonly PermanentShopCardView[] {
  return Object.freeze(catalog.map((def) => {
    const storedRank = ranks[def.id] ?? 0;
    const rank = Number.isInteger(storedRank) && storedRank > 0
      ? Math.min(storedRank, def.maxRank)
      : 0;
    const maxed = rank >= def.maxRank;
    const nextCost = maxed ? null : def.costs[rank] ?? null;
    const disabled = maxed || nextCost === null || essence < nextCost;
    return Object.freeze({
      id: def.id,
      title: def.title,
      description: def.description,
      rankLabel: `${rank}/${def.maxRank}`,
      effectLabel: formatEffect(def, rank),
      buyLabel: maxed || nextCost === null ? 'MAX' : `Buy (${nextCost} Essence)`,
      disabled,
      maxed,
    });
  }));
}

/**
 * Rebuilds the shop grid from a view model, wiring one Buy click handler per
 * card. Pure DOM construction (no profile-store or app-state access) so it
 * can be exercised directly in a happy-dom test.
 */
export function renderPermanentShopCards(
  container: HTMLElement,
  cards: readonly PermanentShopCardView[],
  onBuy: (id: string) => void,
): void {
  container.replaceChildren();
  for (const card of cards) {
    const cardEl = document.createElement('div');
    cardEl.className = 'shop-card';
    cardEl.dataset.upgradeId = card.id;
    cardEl.dataset.maxed = String(card.maxed);

    const head = document.createElement('div');
    head.className = 'shop-card-head';
    const title = document.createElement('strong');
    title.textContent = card.title;
    const rankBadge = document.createElement('span');
    rankBadge.className = 'shop-card-rank';
    rankBadge.textContent = card.rankLabel;
    head.append(title, rankBadge);

    const desc = document.createElement('span');
    desc.className = 'shop-card-desc';
    desc.textContent = card.description;

    const effect = document.createElement('span');
    effect.className = 'shop-card-effect';
    effect.textContent = card.rankLabel.startsWith('0/') ? 'Not yet purchased' : `Current bonus: ${card.effectLabel}`;

    const buyButton = document.createElement('button');
    buyButton.type = 'button';
    buyButton.className = 'shop-card-buy';
    buyButton.textContent = card.buyLabel;
    buyButton.disabled = card.disabled;
    buyButton.setAttribute('aria-label', `${card.title}: ${card.buyLabel}`);
    buyButton.addEventListener('click', () => onBuy(card.id));

    cardEl.append(head, desc, effect, buyButton);
    container.appendChild(cardEl);
  }
}
