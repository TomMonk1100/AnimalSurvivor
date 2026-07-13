import { describe, expect, it } from 'vitest';
import {
  ACCESSIBILITY_SETTINGS_STORAGE_KEY,
  ACCESSIBILITY_SETTINGS_VERSION,
  createAccessibilitySettingsStore,
  type AccessibilitySettingsStorage,
} from '../src/profile/accessibility-settings';

class MemoryStorage implements AccessibilitySettingsStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('accessibility settings store', () => {
  it('starts with immutable presentation defaults', () => {
    const store = createAccessibilitySettingsStore(new MemoryStorage());
    expect(store.settings()).toEqual({
      reducedMotion: false,
      reducedFlashes: false,
      highContrast: false,
      showDamageNumbers: true,
      qualityTier: 'standard',
    });
    expect(Object.isFrozen(store.settings())).toBe(true);
  });

  it('persists independent settings without changing gameplay profile data', () => {
    const storage = new MemoryStorage();
    const store = createAccessibilitySettingsStore(storage);
    expect(store.update({ reducedMotion: true, highContrast: true, qualityTier: 'reduced' })).toEqual({
      reducedMotion: true,
      reducedFlashes: false,
      highContrast: true,
      showDamageNumbers: true,
      qualityTier: 'reduced',
    });
    expect(createAccessibilitySettingsStore(storage).settings()).toEqual(store.settings());
    expect(storage.getItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY)).toBe(JSON.stringify({
      version: ACCESSIBILITY_SETTINGS_VERSION,
      reducedMotion: true,
      reducedFlashes: false,
      highContrast: true,
      showDamageNumbers: true,
      qualityTier: 'reduced',
    }));
  });

  it('rejects invalid patches before mutation', () => {
    const store = createAccessibilitySettingsStore(new MemoryStorage());
    expect(() => store.update({ reducedFlashes: 'yes' as never })).toThrow('boolean');
    expect(store.settings().reducedFlashes).toBe(false);
  });

  it('recovers incompatible storage and supports reset', () => {
    const storage = new MemoryStorage();
    storage.setItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 99, reducedMotion: true }));
    const store = createAccessibilitySettingsStore(storage);
    expect(store.settings()).toEqual({
      reducedMotion: false,
      reducedFlashes: false,
      highContrast: false,
      showDamageNumbers: true,
      qualityTier: 'standard',
    });
    store.update({ reducedFlashes: true });
    expect(store.reset()).toEqual({
      reducedMotion: false,
      reducedFlashes: false,
      highContrast: false,
      showDamageNumbers: true,
      qualityTier: 'standard',
    });
  });

  it('migrates version 1 settings and persists the new damage-number preference', () => {
    const storage = new MemoryStorage();
    storage.setItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      reducedMotion: true,
      reducedFlashes: false,
      highContrast: false,
      qualityTier: 'standard',
    }));

    const store = createAccessibilitySettingsStore(storage);
    expect(store.settings().showDamageNumbers).toBe(true);
    expect(store.update({ showDamageNumbers: false }).showDamageNumbers).toBe(false);
    expect(storage.getItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY)).toContain('"showDamageNumbers":false');
  });
});
