import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_BINDINGS_STORAGE_KEY,
  KEYBOARD_BINDINGS_VERSION,
  createKeyboardBindingsStore,
  type KeyboardBindingsStorage,
} from '../src/profile/keyboard-bindings';

class MemoryStorage implements KeyboardBindingsStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('keyboard bindings store', () => {
  it('starts with immutable WASD defaults', () => {
    const store = createKeyboardBindingsStore(new MemoryStorage());
    expect(store.bindings()).toEqual({ up: 'w', down: 's', left: 'a', right: 'd' });
    expect(Object.isFrozen(store.bindings())).toBe(true);
  });

  it('persists remapped keys in a separate versioned preference record', () => {
    const storage = new MemoryStorage();
    const store = createKeyboardBindingsStore(storage);
    store.update({ up: 'i', down: 'k', left: 'j', right: 'l' });
    expect(createKeyboardBindingsStore(storage).bindings()).toEqual({ up: 'i', down: 'k', left: 'j', right: 'l' });
    expect(storage.getItem(KEYBOARD_BINDINGS_STORAGE_KEY)).toBe(JSON.stringify({
      version: KEYBOARD_BINDINGS_VERSION,
      up: 'i',
      down: 'k',
      left: 'j',
      right: 'l',
    }));
  });

  it('rejects duplicate keys before changing state', () => {
    const store = createKeyboardBindingsStore(new MemoryStorage());
    expect(() => store.update({ up: 'i', down: 'i' })).toThrow('unique');
    expect(store.bindings()).toEqual({ up: 'w', down: 's', left: 'a', right: 'd' });
  });

  it('recovers incompatible storage and resets cleanly', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEYBOARD_BINDINGS_STORAGE_KEY, JSON.stringify({ version: 99, up: 'i' }));
    const store = createKeyboardBindingsStore(storage);
    expect(store.bindings()).toEqual({ up: 'w', down: 's', left: 'a', right: 'd' });
    store.update({ up: 'i' });
    expect(store.reset()).toEqual({ up: 'w', down: 's', left: 'a', right: 'd' });
  });
});
