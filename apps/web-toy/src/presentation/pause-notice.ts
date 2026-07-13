import type { ActiveAdaptationCard } from './active-adaptations';

export interface PauseNotice {
  readonly title: string;
  readonly detail: string;
  readonly actions: readonly PauseAction[];
  /** Current player-owned animal adaptations, copied for the pause panel. */
  readonly upgrades: readonly ActiveAdaptationCard[];
}

export type PauseActionId = 'resume' | 'restart' | 'quit';

export interface PauseAction {
  readonly id: PauseActionId;
  readonly label: string;
}

const PAUSE_COPY = Object.freeze({
  title: 'Paused',
  detail: 'Press Esc or Resume to continue.',
});

const PAUSE_ACTIONS: readonly PauseAction[] = Object.freeze([
  Object.freeze({ id: 'resume', label: 'Resume' }),
  Object.freeze({ id: 'restart', label: 'Restart run' }),
  Object.freeze({ id: 'quit', label: 'Quit to den' }),
]);

/** Presentation-only copy; pause authority remains in the fixed-tick driver. */
export function presentPauseNotice(
  paused: boolean,
  upgrades: readonly ActiveAdaptationCard[] = [],
): PauseNotice | null {
  if (!paused) return null;
  return Object.freeze({
    ...PAUSE_COPY,
    actions: PAUSE_ACTIONS,
    upgrades: Object.freeze([...upgrades]),
  });
}
