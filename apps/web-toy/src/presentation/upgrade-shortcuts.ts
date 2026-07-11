/** The keyboard fields needed to safely classify a player-facing shortcut. */
export interface UpgradeShortcutKeyEvent {
  readonly key: string;
  readonly repeat: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}

/**
 * Escape is a deliberate toggle rather than a held control. Ignore repeated
 * and composing key events so one press can never pause and immediately resume.
 */
export function isPauseShortcut(event: UpgradeShortcutKeyEvent): boolean {
  return event.key === 'Escape' && !event.repeat && !event.isComposing;
}

/**
 * Maps an unmodified 1/2/3 key to a currently visible upgrade index. The
 * caller still owns the actual selection; this helper never reads simulation
 * state or handles arbitrary keyboard input.
 */
export function upgradeShortcutIndex(
  event: UpgradeShortcutKeyEvent,
  offerCount: number,
): number | null {
  if (!Number.isInteger(offerCount) || offerCount < 1) return null;
  if (
    event.repeat
    || event.isComposing
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
  ) return null;
  if (!/^[1-3]$/.test(event.key)) return null;

  const index = Number(event.key) - 1;
  return index < offerCount ? index : null;
}
