/** Presentation-owned page visibility pause policy. */

export interface VisibilityPauseContext {
  readonly runStarted: boolean;
  readonly runEnded: boolean;
  readonly upgradeSelectionPending: boolean;
  readonly paused: boolean;
}

export interface VisibilityPauseState {
  readonly pausedByVisibility: boolean;
}

export interface VisibilityPauseDecision {
  readonly state: VisibilityPauseState;
  readonly pauseNow: boolean;
}

export interface VisibilityResumeDecision {
  readonly state: VisibilityPauseState;
  readonly resumeNow: boolean;
}

/** Pauses only an actively running, player-controlled run. */
export function pauseForHiddenPage(
  _state: VisibilityPauseState,
  context: VisibilityPauseContext,
): VisibilityPauseDecision {
  const pauseNow = context.runStarted
    && !context.runEnded
    && !context.upgradeSelectionPending
    && !context.paused;
  return Object.freeze({
    state: Object.freeze({ pausedByVisibility: pauseNow }),
    pauseNow,
  });
}

/** Resumes only a pause that this policy owns; manual pauses remain paused. */
export function resumeFromVisiblePage(state: VisibilityPauseState): VisibilityResumeDecision {
  return Object.freeze({
    state: Object.freeze({ pausedByVisibility: false }),
    resumeNow: state.pausedByVisibility,
  });
}
