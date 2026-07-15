import { describe, expect, it } from 'vitest';
import {
  PERMANENT_UPGRADE_CATALOG,
  type PermanentUpgradeRanks,
} from '../src/profile/profile-store';
import { presentPermanentShopCards, renderPermanentShopCards } from '../src/profile/permanent-shop';

function zeroRanks(): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (const upgrade of PERMANENT_UPGRADE_CATALOG) ranks[upgrade.id] = 0;
  return ranks;
}

describe('permanent shop presentation', () => {
  it('projects one card per catalog upgrade with an affordable, unranked buy label by default', () => {
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, zeroRanks(), 0);
    expect(cards).toHaveLength(PERMANENT_UPGRADE_CATALOG.length);
    expect(cards.map((card) => card.id)).toEqual(PERMANENT_UPGRADE_CATALOG.map((def) => def.id));

    const vitality = cards.find((card) => card.id === 'vitality')!;
    expect(vitality).toMatchObject({
      title: 'Vitality',
      description: '+10 starting max health per rank.',
      rankLabel: '0/5',
      effectLabel: '+0',
      buyLabel: 'Buy (10 Essence)',
      disabled: true, // 0 essence available
      maxed: false,
    });
  });

  it('formats a flat display as a rounded signed integer at the current rank', () => {
    const ranks: PermanentUpgradeRanks = { ...zeroRanks(), vitality: 2 };
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, 100);
    const vitality = cards.find((card) => card.id === 'vitality')!;
    expect(vitality.rankLabel).toBe('2/5');
    expect(vitality.effectLabel).toBe('+20');
    expect(vitality.buyLabel).toBe('Buy (35 Essence)');
    expect(vitality.disabled).toBe(false);
  });

  it('formats a percent display, e.g. Might, as a rounded signed percentage', () => {
    const ranks: PermanentUpgradeRanks = { ...zeroRanks(), might: 3 };
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, 0);
    const might = cards.find((card) => card.id === 'might')!;
    expect(might.effectLabel).toBe('+18%'); // 3 * 6%
  });

  it('formats Haste (cooldownReductionBonus) as a negative percentage even though the stored value is positive', () => {
    const ranks: PermanentUpgradeRanks = { ...zeroRanks(), haste: 2 };
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, 0);
    const haste = cards.find((card) => card.id === 'haste')!;
    expect(haste.effectLabel).toBe('-8%'); // 2 * 4%
  });

  it('formats a multiplier display, e.g. Ferocity, with two decimals and an x suffix', () => {
    const ranks: PermanentUpgradeRanks = { ...zeroRanks(), ferocity: 2 };
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, 0);
    const ferocity = cards.find((card) => card.id === 'ferocity')!;
    expect(ferocity.effectLabel).toBe('+0.30x'); // 2 * 0.15
  });

  it('shows MAX and disables the buy once a catalog upgrade hits its cap', () => {
    const ranks: PermanentUpgradeRanks = { ...zeroRanks(), ferocity: 4 };
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, 100000);
    const ferocity = cards.find((card) => card.id === 'ferocity')!;
    expect(ferocity).toMatchObject({ rankLabel: '4/4', buyLabel: 'MAX', disabled: true, maxed: true });
  });

  it('disables buy exactly when Essence is below the next rank cost, and enables it once affordable', () => {
    const cards9 = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, zeroRanks(), 9);
    expect(cards9.find((card) => card.id === 'vitality')!.disabled).toBe(true); // costs[0] = 10
    const cards10 = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, zeroRanks(), 10);
    expect(cards10.find((card) => card.id === 'vitality')!.disabled).toBe(false);
  });
});

describe('permanent shop DOM rendering', () => {
  it('renders one .shop-card per catalog upgrade with a title, rank, and buy button', () => {
    const container = document.createElement('div');
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, zeroRanks(), 500);
    renderPermanentShopCards(container, cards, () => {});

    const cardEls = container.querySelectorAll('.shop-card');
    expect(cardEls).toHaveLength(PERMANENT_UPGRADE_CATALOG.length);
    const first = cardEls[0]!;
    expect(first.querySelector('strong')?.textContent).toBe(PERMANENT_UPGRADE_CATALOG[0]!.title);
    expect(first.querySelector('.shop-card-buy')).not.toBeNull();
  });

  it('calls onBuy with the upgrade id when its Buy button is clicked', () => {
    const container = document.createElement('div');
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, zeroRanks(), 500);
    const bought: string[] = [];
    renderPermanentShopCards(container, cards, (id) => bought.push(id));

    const vitalityCard = container.querySelector('[data-upgrade-id="vitality"]')!;
    const buyButton = vitalityCard.querySelector<HTMLButtonElement>('.shop-card-buy')!;
    buyButton.click();
    expect(bought).toEqual(['vitality']);
  });

  it('re-renders with an incremented rank and a fresh cost after a simulated purchase', () => {
    const container = document.createElement('div');
    let ranks = zeroRanks();
    let essence = 100;

    function rerender(): void {
      const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, essence);
      renderPermanentShopCards(container, cards, (id) => {
        const def = PERMANENT_UPGRADE_CATALOG.find((upgrade) => upgrade.id === id)!;
        const rank = ranks[id] ?? 0;
        if (rank >= def.maxRank) return;
        const cost = def.costs[rank]!;
        if (essence < cost) return;
        essence -= cost;
        ranks = { ...ranks, [id]: rank + 1 };
        rerender();
      });
    }
    rerender();

    const vitalityButtonBefore = container.querySelector<HTMLButtonElement>('[data-upgrade-id="vitality"] .shop-card-buy')!;
    expect(vitalityButtonBefore.textContent).toBe('Buy (10 Essence)');
    vitalityButtonBefore.click();

    const vitalityCardAfter = container.querySelector('[data-upgrade-id="vitality"]')!;
    expect(vitalityCardAfter.querySelector('.shop-card-rank')?.textContent).toBe('1/5');
    const vitalityButtonAfter = vitalityCardAfter.querySelector<HTMLButtonElement>('.shop-card-buy')!;
    expect(vitalityButtonAfter.textContent).toBe('Buy (20 Essence)');
    expect(essence).toBe(90);
  });

  it('disables the button and shows MAX once a rendered upgrade reaches its cap', () => {
    const container = document.createElement('div');
    const ranks: PermanentUpgradeRanks = { ...zeroRanks(), ferocity: 4 };
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, ranks, 100000);
    renderPermanentShopCards(container, cards, () => {});

    const ferocityButton = container.querySelector<HTMLButtonElement>('[data-upgrade-id="ferocity"] .shop-card-buy')!;
    expect(ferocityButton.disabled).toBe(true);
    expect(ferocityButton.textContent).toBe('MAX');
  });

  it('disables the button when Essence is insufficient for the next rank', () => {
    const container = document.createElement('div');
    const cards = presentPermanentShopCards(PERMANENT_UPGRADE_CATALOG, zeroRanks(), 0);
    renderPermanentShopCards(container, cards, () => {});

    const vitalityButton = container.querySelector<HTMLButtonElement>('[data-upgrade-id="vitality"] .shop-card-buy')!;
    expect(vitalityButton.disabled).toBe(true);
  });
});
