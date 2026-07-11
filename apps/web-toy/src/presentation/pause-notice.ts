export interface PauseNotice {
  readonly title: string;
  readonly detail: string;
}

const PAUSE_NOTICE: PauseNotice = Object.freeze({
  title: 'Paused',
  detail: 'Press Esc or Resume to continue.',
});

/** Presentation-only copy; pause authority remains in the fixed-tick driver. */
export function presentPauseNotice(paused: boolean): PauseNotice | null {
  return paused ? PAUSE_NOTICE : null;
}
