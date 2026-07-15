import { describe, expect, it } from 'vitest';
import { RUN_START_LOADOUT_VERSION } from '@sim';
import {
  PERMANENT_UPGRADE_CATALOG,
  PROFILE_SCHEMA_VERSION,
  PROFILE_STORAGE_KEY,
  STARTING_VITALITY_BONUS_PER_RANK,
  STARTING_VITALITY_COSTS,
  STARTING_VITALITY_MAX_RANK,
  createProfileStore,
  getPermanentUpgradeDefinition,
  type ProfileStorage,
} from '../src/profile/profile-store';
import { createFieldGuideEntry } from '../src/profile/field-guide';

class MemoryStorage implements ProfileStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function award(store: ReturnType<typeof createProfileStore>, runId: string, essenceAward: number): void {
  store.settleTerminalRun({ runId, outcome: 'defeat', essenceAward });
}

/** A full zero-rank map, matching every catalog id, for exact profile assertions. */
function zeroRanks(): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (const upgrade of PERMANENT_UPGRADE_CATALOG) ranks[upgrade.id] = 0;
  return ranks;
}

const EMPTY_LOADOUT = {
  version: RUN_START_LOADOUT_VERSION,
  heroId: 'greg',
  biomeId: 'forest',
  maxHpBonus: 0,
  damageMultiplierBonus: 0,
  speedMultiplierBonus: 0,
  pickupRadiusBonus: 0,
  xpMultiplierBonus: 0,
  cooldownReductionBonus: 0,
  armorBonus: 0,
  critChanceBonus: 0,
  critMultiplierBonus: 0,
  dodgeChanceBonus: 0,
};

function defaultProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: PROFILE_SCHEMA_VERSION,
    essence: 0,
    startingVitalityRank: 0,
    permanentUpgradeRanks: zeroRanks(),
    selectedHeroId: 'greg',
    settledRunIds: [],
    fieldGuide: [],
    discoveredRecipes: [],
    unlockedBiomeIds: ['forest'],
    unlockedPaletteIds: ['forest'],
    selectedPaletteId: 'forest',
    ...overrides,
  };
}

describe('local profile store', () => {
  it('starts empty and exposes a normalized, immutable run-start loadout', () => {
    const store = createProfileStore(new MemoryStorage());

    expect(store.profile()).toEqual(defaultProfile());
    expect(store.startLoadout()).toEqual(EMPTY_LOADOUT);
    expect(Object.isFrozen(store.profile())).toBe(true);
    expect(Object.isFrozen(store.profile().settledRunIds)).toBe(true);
    expect(Object.isFrozen(store.profile().permanentUpgradeRanks)).toBe(true);
    expect(Object.isFrozen(store.startLoadout())).toBe(true);
    expect(() => {
      (store.startLoadout() as { maxHpBonus: number }).maxHpBonus = 999;
    }).toThrow();
  });

  it('persists Essence and credits each terminal run id at most once', () => {
    const storage = new MemoryStorage();
    const first = createProfileStore(storage);

    expect(first.settleTerminalRun({ runId: 'run:001', outcome: 'victory', essenceAward: 17 })).toMatchObject({
      settled: true,
      awardedEssence: 17,
    });
    expect(first.settleTerminalRun({ runId: 'run:001', outcome: 'defeat', essenceAward: 999 })).toMatchObject({
      settled: false,
      awardedEssence: 0,
    });
    expect(first.settleTerminalRun({ runId: 'run:002', outcome: 'defeat', essenceAward: 3 })).toMatchObject({
      settled: true,
      awardedEssence: 3,
    });
    expect(first.profile()).toMatchObject({ essence: 20, settledRunIds: ['run:001', 'run:002'] });

    const reloaded = createProfileStore(storage);
    expect(reloaded.profile()).toMatchObject({ essence: 20, settledRunIds: ['run:001', 'run:002'] });
    expect(reloaded.settleTerminalRun({ runId: 'run:001', outcome: 'victory', essenceAward: 1 })).toMatchObject({
      settled: false,
      awardedEssence: 0,
    });
    expect(reloaded.profile().essence).toBe(20);
  });

  it('allows one capped permanent Starting Vitality purchase path via the back-compat helper', () => {
    const store = createProfileStore(new MemoryStorage());
    award(store, 'fund-vitality', STARTING_VITALITY_COSTS.reduce((total, cost) => total + cost, 0));

    for (let rank = 0; rank < STARTING_VITALITY_MAX_RANK; rank++) {
      const result = store.purchaseStartingVitality();
      expect(result).toMatchObject({ purchased: true, reason: 'purchased', cost: STARTING_VITALITY_COSTS[rank] });
      expect(result.profile.startingVitalityRank).toBe(rank + 1);
    }

    expect(store.profile()).toMatchObject({ essence: 0, startingVitalityRank: STARTING_VITALITY_MAX_RANK });
    expect(store.startLoadout()).toEqual({
      ...EMPTY_LOADOUT,
      maxHpBonus: STARTING_VITALITY_MAX_RANK * STARTING_VITALITY_BONUS_PER_RANK,
    });
    expect(store.purchaseStartingVitality()).toMatchObject({ purchased: false, reason: 'max-rank', cost: null });
  });

  it('keeps insufficient-funds purchases side-effect free', () => {
    const store = createProfileStore(new MemoryStorage());
    const result = store.purchaseStartingVitality();

    expect(result).toMatchObject({
      purchased: false,
      reason: 'insufficient-essence',
      cost: STARTING_VITALITY_COSTS[0],
    });
    expect(store.profile()).toMatchObject({ essence: 0, startingVitalityRank: 0 });
  });

  describe('purchasePermanentUpgrade (generic shop API)', () => {
    it('buys successive ranks of any catalog upgrade, spending Essence and returning the rank/cost', () => {
      const store = createProfileStore(new MemoryStorage());
      const def = getPermanentUpgradeDefinition('might');
      award(store, 'fund-might', def.costs.reduce((total, cost) => total + cost, 0));

      for (let rank = 0; rank < def.maxRank; rank++) {
        const result = store.purchasePermanentUpgrade('might');
        expect(result).toMatchObject({
          purchased: true,
          reason: 'purchased',
          id: 'might',
          rank: rank + 1,
          cost: def.costs[rank],
        });
        expect(result.profile.permanentUpgradeRanks.might).toBe(rank + 1);
      }

      expect(store.permanentUpgradeRank('might')).toBe(def.maxRank);
      expect(store.purchasePermanentUpgrade('might')).toMatchObject({
        purchased: false, reason: 'max-rank', id: 'might', rank: def.maxRank, cost: null,
      });
    });

    it('reports insufficient-essence without mutating the profile', () => {
      const store = createProfileStore(new MemoryStorage());
      const def = getPermanentUpgradeDefinition('armor');

      const result = store.purchasePermanentUpgrade('armor');
      expect(result).toMatchObject({
        purchased: false, reason: 'insufficient-essence', id: 'armor', rank: 0, cost: def.costs[0],
      });
      expect(store.profile().essence).toBe(0);
      expect(store.permanentUpgradeRank('armor')).toBe(0);
    });

    it('reports unknown-upgrade for an unrecognized id without throwing', () => {
      const store = createProfileStore(new MemoryStorage());
      const result = store.purchasePermanentUpgrade('not-a-real-upgrade');
      expect(result).toMatchObject({
        purchased: false, reason: 'unknown-upgrade', id: 'not-a-real-upgrade', rank: 0, cost: null,
      });
    });

    it('tracks every catalog upgrade independently through permanentUpgradeRank', () => {
      const store = createProfileStore(new MemoryStorage());
      award(store, 'fund-all', 1000);
      expect(store.permanentUpgradeRank('vitality')).toBe(0);
      expect(store.permanentUpgradeRank('swiftness')).toBe(0);
      expect(store.permanentUpgradeRank('unknown-id')).toBe(0);

      store.purchasePermanentUpgrade('swiftness');
      expect(store.permanentUpgradeRank('swiftness')).toBe(1);
      expect(store.permanentUpgradeRank('vitality')).toBe(0);
    });

    it('resolves startLoadout fields from purchased ranks across the whole catalog', () => {
      const store = createProfileStore(new MemoryStorage());
      award(store, 'fund-everything', 2000);
      for (const upgrade of PERMANENT_UPGRADE_CATALOG) {
        store.purchasePermanentUpgrade(upgrade.id);
      }
      const loadout = store.startLoadout();
      expect(loadout).toEqual({
        version: RUN_START_LOADOUT_VERSION,
        heroId: 'greg',
        biomeId: 'forest',
        maxHpBonus: getPermanentUpgradeDefinition('vitality').perRank,
        damageMultiplierBonus: getPermanentUpgradeDefinition('might').perRank,
        speedMultiplierBonus: getPermanentUpgradeDefinition('swiftness').perRank,
        pickupRadiusBonus: getPermanentUpgradeDefinition('magnetism').perRank,
        xpMultiplierBonus: getPermanentUpgradeDefinition('growth').perRank,
        cooldownReductionBonus: getPermanentUpgradeDefinition('haste').perRank,
        armorBonus: getPermanentUpgradeDefinition('armor').perRank,
        critChanceBonus: getPermanentUpgradeDefinition('precision').perRank,
        critMultiplierBonus: getPermanentUpgradeDefinition('ferocity').perRank,
        dodgeChanceBonus: getPermanentUpgradeDefinition('evasion').perRank,
      });
      // Fortune never crosses into the run-start loadout; it only feeds essenceMultiplier.
      expect(Object.keys(loadout)).not.toContain('essenceMultiplier');
    });
  });

  describe('essenceMultiplier (Fortune)', () => {
    it('defaults to a 1x multiplier with no Fortune ranks purchased', () => {
      const store = createProfileStore(new MemoryStorage());
      expect(store.essenceMultiplier()).toBe(1);
    });

    it('grows by 10% per Fortune rank purchased', () => {
      const store = createProfileStore(new MemoryStorage());
      const def = getPermanentUpgradeDefinition('fortune');
      award(store, 'fund-fortune', def.costs.reduce((total, cost) => total + cost, 0));

      for (let rank = 1; rank <= def.maxRank; rank++) {
        store.purchasePermanentUpgrade('fortune');
        expect(store.essenceMultiplier()).toBeCloseTo(1 + rank * def.perRank, 10);
      }
      expect(store.essenceMultiplier()).toBeCloseTo(1.5, 10);
    });

    it('does not change the run-start loadout, only the reward-side multiplier', () => {
      const store = createProfileStore(new MemoryStorage());
      award(store, 'fund-fortune-only', 1000);
      store.purchasePermanentUpgrade('fortune');
      expect(store.startLoadout()).toEqual(EMPTY_LOADOUT);
      expect(store.essenceMultiplier()).toBeCloseTo(1.1, 10);
    });
  });

  it('replaces malformed, incompatible, or unsafe persisted data with a fresh profile', () => {
    for (const payload of [
      '{not json',
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION + 1, essence: 20, startingVitalityRank: 0, settledRunIds: [] }),
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION, essence: -1, startingVitalityRank: 0, settledRunIds: [] }),
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION, essence: 20, startingVitalityRank: 0, settledRunIds: ['run:1', 'run:1'] }),
    ]) {
      const storage = new MemoryStorage();
      storage.setItem(PROFILE_STORAGE_KEY, payload);
      const store = createProfileStore(storage);

      expect(store.profile()).toEqual(defaultProfile());
      expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(JSON.stringify({
        version: PROFILE_SCHEMA_VERSION,
        essence: 0,
        startingVitalityRank: 0,
        permanentUpgradeRanks: zeroRanks(),
        selectedHeroId: 'greg',
        settledRunIds: [],
        fieldGuide: [],
        discoveredRecipes: [],
        unlockedBiomeIds: ['forest'],
        unlockedPaletteIds: ['forest'],
        selectedPaletteId: 'forest',
      }));
    }
  });

  it('rejects non-terminal settlements and invalid awards before mutating the profile', () => {
    const store = createProfileStore(new MemoryStorage());

    expect(() => store.settleTerminalRun({
      runId: 'not-terminal', outcome: 'running' as never, essenceAward: 1,
    })).toThrow('outcome');
    expect(() => store.settleTerminalRun({
      runId: 'negative-award', outcome: 'victory', essenceAward: -1,
    })).toThrow('essenceAward');
    expect(() => store.settleTerminalRun({
      runId: ' untrimmed ', outcome: 'victory', essenceAward: 1,
    })).toThrow('runId');
    expect(store.profile()).toMatchObject({ essence: 0, settledRunIds: [] });
  });

  it('persists hero selection and includes it in the next run loadout', () => {
    const storage = new MemoryStorage();
    const store = createProfileStore(storage);

    expect(store.selectHero('benny')).toMatchObject({ selectedHeroId: 'benny' });
    expect(store.startLoadout()).toEqual({ ...EMPTY_LOADOUT, heroId: 'benny' });
    expect(createProfileStore(storage).profile().selectedHeroId).toBe('benny');
  });

  it('unlocks Mythic palettes idempotently and persists a selected palette', () => {
    const storage = new MemoryStorage();
    const store = createProfileStore(storage);
    expect(() => store.selectPalette('meteor-mauler')).toThrow('locked');
    store.recordFieldGuideEntry(createFieldGuideEntry({
      runId: 'palette-run',
      heroId: 'greg',
      biomeId: 'forest',
      seed: 9,
      outcome: 'victory',
      durationTicks: 100,
      kills: 4,
      essenceEarned: 1,
      visuals: [{ sourceId: 'meteor-mauler', stage: 'mythic', visualKey: 'meteor-mauler:mythic' }],
      universalUpgradeRanks: [],
    }));
    expect(store.profile().unlockedPaletteIds).toEqual(['forest', 'meteor-mauler']);
    expect(store.selectPalette('meteor-mauler').selectedPaletteId).toBe('meteor-mauler');
    expect(createProfileStore(storage).profile().selectedPaletteId).toBe('meteor-mauler');
  });

  it('migrates an older (v1) profile without losing Essence or vitality', () => {
    const storage = new MemoryStorage();
    storage.setItem('animal-survivor.profile.v1', JSON.stringify({
      version: 1,
      essence: 17,
      startingVitalityRank: 2,
      settledRunIds: ['old-run'],
    }));

    const store = createProfileStore(storage);
    expect(store.profile()).toMatchObject({
      version: PROFILE_SCHEMA_VERSION,
      essence: 17,
      startingVitalityRank: 2,
      selectedHeroId: 'greg',
      settledRunIds: ['old-run'],
      fieldGuide: [],
      discoveredRecipes: [],
      unlockedBiomeIds: ['forest'],
      unlockedPaletteIds: ['forest'],
      selectedPaletteId: 'forest',
    });
    expect(store.profile().permanentUpgradeRanks).toEqual({ ...zeroRanks(), vitality: 2 });
  });

  it('migrates every valid v5 Vitality rank without changing the earned maximum-health bonus', () => {
    for (const rank of [0, 1, 2, 3]) {
      const storage = new MemoryStorage();
      storage.setItem('animal-survivor.profile.v5', JSON.stringify({
        version: 5,
        essence: 40,
        startingVitalityRank: rank,
        selectedHeroId: 'gracie',
        settledRunIds: ['v5-run'],
        fieldGuide: [],
        discoveredRecipes: [],
        unlockedBiomeIds: ['forest', 'saltwind'],
        unlockedPaletteIds: ['forest'],
        selectedPaletteId: 'forest',
      }));

      const store = createProfileStore(storage);
      const profile = store.profile();
      expect(profile.version).toBe(PROFILE_SCHEMA_VERSION);
      expect(profile.essence).toBe(40);
      expect(profile.selectedHeroId).toBe('gracie');
      expect(profile.startingVitalityRank).toBe(rank);
      expect(profile.permanentUpgradeRanks.vitality).toBe(rank);
      // Every other upgrade migrates in at rank zero; only Vitality carries over.
      expect(profile.permanentUpgradeRanks).toEqual({ ...zeroRanks(), vitality: rank });
      expect(store.startLoadout().maxHpBonus).toBe(rank * 10);
      // The migrated profile is re-persisted under the current key on next save.
      expect(store.permanentUpgradeRank('vitality')).toBe(rank);
    }
  });

  it('rejects a v5 profile with an impossible legacy Vitality rank', () => {
    const storage = new MemoryStorage();
    storage.setItem('animal-survivor.profile.v5', JSON.stringify({
      version: 5,
      essence: 40,
      startingVitalityRank: 4,
      selectedHeroId: 'gracie',
      settledRunIds: ['forged-v5-run'],
      fieldGuide: [],
      discoveredRecipes: [],
      unlockedBiomeIds: ['forest', 'saltwind'],
      unlockedPaletteIds: ['forest'],
      selectedPaletteId: 'forest',
    }));

    expect(createProfileStore(storage).profile()).toEqual(defaultProfile());
  });

  it('records bounded Field Guide entries idempotently and round-trips exports', () => {
    const storage = new MemoryStorage();
    const store = createProfileStore(storage);
    const entry = createFieldGuideEntry({
      runId: 'guide-run',
      heroId: 'greg',
      seed: 42,
      outcome: 'victory',
      durationTicks: 1200,
      kills: 37,
      essenceEarned: 11,
      visuals: [
        { sourceId: 'owl-pinions', stage: 'adapted', visualKey: 'owl-pinions:adapted', enabled: true },
        { sourceId: 'meteor-mauler', stage: 'mythic', visualKey: 'meteor-mauler:mythic', enabled: true },
      ],
      universalUpgradeRanks: [1, 0, 2],
    });

    expect(store.recordFieldGuideEntry(entry).fieldGuide).toHaveLength(1);
    expect(store.recordFieldGuideEntry(entry).fieldGuide).toHaveLength(1);
    expect(store.profile().discoveredRecipes).toEqual(['meteor-mauler']);
    expect(store.profile().unlockedBiomeIds).toEqual(['forest', 'saltwind']);
    expect(store.profile().unlockedPaletteIds).toEqual(['forest', 'meteor-mauler']);
    expect(Object.isFrozen(store.profile().fieldGuide)).toBe(true);
    expect(Object.isFrozen(store.profile().fieldGuide[0])).toBe(true);

    const exported = store.exportProfile();
    const reloaded = createProfileStore(new MemoryStorage());
    expect(reloaded.importProfile(exported).fieldGuide).toEqual([entry]);
    expect(reloaded.profile()).toEqual(store.profile());
  });

  it('rejects malformed Field Guide imports without mutating the save', () => {
    const store = createProfileStore(new MemoryStorage());
    const before = store.profile();
    expect(() => store.importProfile(JSON.stringify({
      version: PROFILE_SCHEMA_VERSION,
      essence: 99,
      startingVitalityRank: 0,
      selectedHeroId: 'greg',
      settledRunIds: [],
      fieldGuide: [{ id: 'duplicate', heroId: 'greg' }],
    }))).toThrow('profile import');
    expect(store.profile()).toBe(before);
  });

  it('migrates the version-three Field Guide schema with Forest as the starting biome', () => {
    const storage = new MemoryStorage();
    storage.setItem('animal-survivor.profile.v3', JSON.stringify({
      version: 3,
      essence: 12,
      startingVitalityRank: 1,
      selectedHeroId: 'gracie',
      settledRunIds: ['old-run'],
      fieldGuide: [],
      discoveredRecipes: ['meteor-mauler'],
    }));

    expect(createProfileStore(storage).profile()).toMatchObject({
      version: PROFILE_SCHEMA_VERSION,
      essence: 12,
      selectedHeroId: 'gracie',
      discoveredRecipes: ['meteor-mauler'],
      unlockedBiomeIds: ['forest'],
    });
  });

  it('migrates the version-four profile without losing the Saltwind unlock', () => {
    const storage = new MemoryStorage();
    storage.setItem('animal-survivor.profile.v4', JSON.stringify({
      version: 4,
      essence: 21,
      startingVitalityRank: 1,
      selectedHeroId: 'benny',
      settledRunIds: ['v4-run'],
      fieldGuide: [],
      discoveredRecipes: ['meteor-mauler'],
      unlockedBiomeIds: ['forest', 'saltwind'],
    }));

    expect(createProfileStore(storage).profile()).toMatchObject({
      version: PROFILE_SCHEMA_VERSION,
      essence: 21,
      selectedHeroId: 'benny',
      unlockedBiomeIds: ['forest', 'saltwind'],
      unlockedPaletteIds: ['forest'],
      selectedPaletteId: 'forest',
    });
  });

  it('resets all permanent data and Field Guide entries', () => {
    const store = createProfileStore(new MemoryStorage());
    award(store, 'reset-run', 20);
    store.selectHero('benny');
    store.purchasePermanentUpgrade('vitality');
    store.recordFieldGuideEntry(createFieldGuideEntry({
      runId: 'reset-guide',
      heroId: 'benny',
      seed: 1,
      outcome: 'defeat',
      durationTicks: 3,
      kills: 0,
      essenceEarned: 2,
      visuals: [],
      universalUpgradeRanks: [],
    }));
    expect(store.resetProfile()).toEqual(defaultProfile());
  });
});
