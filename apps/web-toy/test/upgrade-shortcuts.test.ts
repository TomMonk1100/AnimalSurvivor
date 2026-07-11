import { describe, expect, it } from 'vitest';
import {
  upgradeShortcutIndex,
  type UpgradeShortcutKeyEvent,
} from '../src/presentation/upgrade-shortcuts';

function keyEvent(key: string, overrides: Partial<UpgradeShortcutKeyEvent> = {}): UpgradeShortcutKeyEvent {
  return {
    key,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  };
}

describe('upgrade keyboard shortcuts', () => {
  it('maps the visible 1/2/3 choices to zero-based offer indexes', () => {
    expect(upgradeShortcutIndex(keyEvent('1'), 3)).toBe(0);
    expect(upgradeShortcutIndex(keyEvent('2'), 3)).toBe(1);
    expect(upgradeShortcutIndex(keyEvent('3'), 3)).toBe(2);
  });

  it('never selects an offer that is not currently visible', () => {
    expect(upgradeShortcutIndex(keyEvent('2'), 1)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('3'), 2)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1'), 0)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1'), -1)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1'), 1.5)).toBeNull();
  });

  it('ignores non-choice, repeated, composed, and modified keystrokes', () => {
    expect(upgradeShortcutIndex(keyEvent('4'), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('ArrowRight'), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1', { repeat: true }), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1', { isComposing: true }), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1', { altKey: true }), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1', { ctrlKey: true }), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1', { metaKey: true }), 3)).toBeNull();
    expect(upgradeShortcutIndex(keyEvent('1', { shiftKey: true }), 3)).toBeNull();
  });
});
