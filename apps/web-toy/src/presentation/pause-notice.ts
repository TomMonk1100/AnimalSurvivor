import type { ActiveAdaptationCard } from './active-adaptations';

export interface PauseNotice {
  readonly title: string;
  readonly detail: string;
  /** Current player-owned animal adaptations, copied for the pause panel. */
  readonly upgrades: readonly ActiveAdaptationCard[];
}

const PAUSE_COPY = Object.freeze({
  title: 'Paused',
  detail: 'Press Esc or Resume to continue.',
});

/** Presentation-only copy; pause authority remains in the fixed-tick driver. */
export function presentPauseNotice(
  paused: boolean,
  upgrades: readonly ActiveAdaptationCard[] = [],
): PauseNotice | null {
  if (!paused) return null;
  return Object.freeze({
    ...PAUSE_COPY,
    upgrades: Object.freeze([...upgrades]),
  });
}
