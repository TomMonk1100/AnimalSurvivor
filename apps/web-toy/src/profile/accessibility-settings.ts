/**
 * Versioned, presentation-only accessibility preferences.
 *
 * These settings intentionally live beside, rather than inside, the gameplay
 * profile. They may change DOM/renderer presentation without changing a run's
 * seed, loadout, timing, RNG, rewards, or canonical hash.
 */

export const ACCESSIBILITY_SETTINGS_VERSION = 1 as const;
export const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'animal-survivor.accessibility.v1';

export interface AccessibilitySettings {
  readonly reducedMotion: boolean;
  readonly reducedFlashes: boolean;
  readonly highContrast: boolean;
  readonly qualityTier: 'standard' | 'reduced';
}

export interface AccessibilitySettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AccessibilitySettingsStore {
  settings(): AccessibilitySettings;
  update(patch: Partial<AccessibilitySettings>): AccessibilitySettings;
  reset(): AccessibilitySettings;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = Object.freeze({
  reducedMotion: false,
  reducedFlashes: false,
  highContrast: false,
  qualityTier: 'standard',
});

function freezeSettings(settings: AccessibilitySettings): AccessibilitySettings {
  return Object.freeze({
    reducedMotion: settings.reducedMotion,
    reducedFlashes: settings.reducedFlashes,
    highContrast: settings.highContrast,
    qualityTier: settings.qualityTier,
  });
}

function parseSettings(raw: string): AccessibilitySettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== ACCESSIBILITY_SETTINGS_VERSION
    || typeof value.reducedMotion !== 'boolean'
    || typeof value.reducedFlashes !== 'boolean'
    || typeof value.highContrast !== 'boolean'
    || (value.qualityTier !== 'standard' && value.qualityTier !== 'reduced')) {
    return null;
  }
  return freezeSettings({
    reducedMotion: value.reducedMotion,
    reducedFlashes: value.reducedFlashes,
    highContrast: value.highContrast,
    qualityTier: value.qualityTier,
  });
}

function serializeSettings(settings: AccessibilitySettings): string {
  return JSON.stringify({ version: ACCESSIBILITY_SETTINGS_VERSION, ...settings });
}

export function createAccessibilitySettingsStore(
  storage: AccessibilitySettingsStorage,
  storageKey = ACCESSIBILITY_SETTINGS_STORAGE_KEY,
): AccessibilitySettingsStore {
  if (storageKey.trim().length === 0) throw new RangeError('accessibility settings storageKey must not be blank');

  function persist(settings: AccessibilitySettings): AccessibilitySettings {
    const frozen = freezeSettings(settings);
    storage.setItem(storageKey, serializeSettings(frozen));
    state = frozen;
    return state;
  }

  let state = DEFAULT_ACCESSIBILITY_SETTINGS;
  try {
    const raw = storage.getItem(storageKey);
    if (raw !== null) {
      const parsed = parseSettings(raw);
      if (parsed !== null) state = parsed;
      else storage.setItem(storageKey, serializeSettings(state));
    }
  } catch {
    // Private/restricted storage must not prevent the game from booting.
    state = DEFAULT_ACCESSIBILITY_SETTINGS;
  }

  return {
    settings() {
      return state;
    },
    update(patch) {
      if (typeof patch !== 'object' || patch === null) throw new TypeError('accessibility settings patch must be an object');
      const next = { ...state };
      for (const key of ['reducedMotion', 'reducedFlashes', 'highContrast'] as const) {
        const value = patch[key];
        if (value !== undefined) {
          if (typeof value !== 'boolean') throw new TypeError(`accessibility setting ${key} must be boolean`);
          next[key] = value;
        }
      }
      if (patch.qualityTier !== undefined) {
        if (patch.qualityTier !== 'standard' && patch.qualityTier !== 'reduced') {
          throw new TypeError('accessibility setting qualityTier must be standard or reduced');
        }
        next.qualityTier = patch.qualityTier;
      }
      return persist(next);
    },
    reset() {
      return persist(DEFAULT_ACCESSIBILITY_SETTINGS);
    },
  };
}
