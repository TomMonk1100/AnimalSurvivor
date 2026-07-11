import { describe, expect, it } from 'vitest';
import {
  PROFILE_SCHEMA_VERSION,
  PROFILE_STORAGE_KEY,
  STARTING_VITALITY_BONUS_PER_RANK,
  STARTING_VITALITY_COSTS,
  STARTING_VITALITY_MAX_RANK,
  createProfileStore,
  type ProfileStorage,
} from '../src/profile/profile-store';

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

describe('local profile store', () => {
  it('starts empty and exposes a normalized, immutable run-start loadout', () => {
    const store = createProfileStore(new MemoryStorage());

    expect(store.profile()).toEqual({
      version: PROFILE_SCHEMA_VERSION,
      essence: 0,
      startingVitalityRank: 0,
      settledRunIds: [],
    });
    expect(store.startLoadout()).toEqual({ version: PROFILE_SCHEMA_VERSION, maxHpBonus: 0 });
    expect(Object.isFrozen(store.profile())).toBe(true);
    expect(Object.isFrozen(store.profile().settledRunIds)).toBe(true);
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

  it('allows one capped permanent Starting Vitality purchase path', () => {
    const store = createProfileStore(new MemoryStorage());
    award(store, 'fund-vitality', STARTING_VITALITY_COSTS.reduce((total, cost) => total + cost, 0));

    for (let rank = 0; rank < STARTING_VITALITY_MAX_RANK; rank++) {
      const result = store.purchaseStartingVitality();
      expect(result).toMatchObject({ purchased: true, reason: 'purchased', cost: STARTING_VITALITY_COSTS[rank] });
      expect(result.profile.startingVitalityRank).toBe(rank + 1);
    }

    expect(store.profile()).toMatchObject({ essence: 0, startingVitalityRank: STARTING_VITALITY_MAX_RANK });
    expect(store.startLoadout()).toEqual({
      version: PROFILE_SCHEMA_VERSION,
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

  it('replaces malformed, incompatible, or unsafe persisted data with a fresh profile', () => {
    for (const payload of [
      '{not json',
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION + 1, essence: 20, startingVitalityRank: 0, settledRunIds: [] }),
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION, essence: -1, startingVitalityRank: 0, settledRunIds: [] }),
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION, essence: 20, startingVitalityRank: 99, settledRunIds: [] }),
      JSON.stringify({ version: PROFILE_SCHEMA_VERSION, essence: 20, startingVitalityRank: 0, settledRunIds: ['run:1', 'run:1'] }),
    ]) {
      const storage = new MemoryStorage();
      storage.setItem(PROFILE_STORAGE_KEY, payload);
      const store = createProfileStore(storage);

      expect(store.profile()).toEqual({
        version: PROFILE_SCHEMA_VERSION,
        essence: 0,
        startingVitalityRank: 0,
        settledRunIds: [],
      });
      expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(JSON.stringify({
        version: PROFILE_SCHEMA_VERSION,
        essence: 0,
        startingVitalityRank: 0,
        settledRunIds: [],
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
});
