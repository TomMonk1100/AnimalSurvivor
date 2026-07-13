import {
  DEFAULT_KEYBOARD_BINDINGS,
  normalizeKeyboardBindings,
  type KeyboardBindings,
} from '../input/keyboard';

export const KEYBOARD_BINDINGS_VERSION = 1 as const;
export const KEYBOARD_BINDINGS_STORAGE_KEY = 'animal-survivor.keyboard-bindings.v1';

export interface KeyboardBindingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface KeyboardBindingsStore {
  bindings(): KeyboardBindings;
  update(patch: Partial<KeyboardBindings>): KeyboardBindings;
  reset(): KeyboardBindings;
}

function serialize(bindings: KeyboardBindings): string {
  return JSON.stringify({ version: KEYBOARD_BINDINGS_VERSION, ...bindings });
}

function parse(raw: string): KeyboardBindings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== KEYBOARD_BINDINGS_VERSION) return null;
  try {
    return normalizeKeyboardBindings({
      up: value.up as string,
      down: value.down as string,
      left: value.left as string,
      right: value.right as string,
    });
  } catch {
    return null;
  }
}

export function createKeyboardBindingsStore(
  storage: KeyboardBindingsStorage,
  storageKey = KEYBOARD_BINDINGS_STORAGE_KEY,
): KeyboardBindingsStore {
  if (storageKey.trim().length === 0) throw new RangeError('keyboard bindings storageKey must not be blank');

  let state = DEFAULT_KEYBOARD_BINDINGS;
  try {
    const raw = storage.getItem(storageKey);
    if (raw !== null) {
      const parsed = parse(raw);
      if (parsed !== null) state = parsed;
      else storage.setItem(storageKey, serialize(state));
    }
  } catch {
    state = DEFAULT_KEYBOARD_BINDINGS;
  }

  function persist(next: KeyboardBindings): KeyboardBindings {
    state = normalizeKeyboardBindings(next);
    try {
      storage.setItem(storageKey, serialize(state));
    } catch {
      // Restricted/private storage remains nonfatal; the in-memory setting works.
    }
    return state;
  }

  return {
    bindings(): KeyboardBindings {
      return state;
    },
    update(patch: Partial<KeyboardBindings>): KeyboardBindings {
      if (typeof patch !== 'object' || patch === null) throw new TypeError('keyboard bindings patch must be an object');
      return persist({ ...state, ...patch });
    },
    reset(): KeyboardBindings {
      return persist(DEFAULT_KEYBOARD_BINDINGS);
    },
  };
}
