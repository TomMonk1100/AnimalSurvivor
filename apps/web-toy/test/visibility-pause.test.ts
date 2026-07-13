import { describe, expect, it } from 'vitest';
import { pauseForHiddenPage, resumeFromVisiblePage } from '../src/presentation/visibility-pause';

const activeRun = {
  runStarted: true,
  runEnded: false,
  upgradeSelectionPending: false,
  paused: false,
};

describe('page visibility pause policy', () => {
  it('pauses an active run and resumes only its own pause', () => {
    const hidden = pauseForHiddenPage({ pausedByVisibility: false }, activeRun);
    expect(hidden).toEqual({ state: { pausedByVisibility: true }, pauseNow: true });
    expect(resumeFromVisiblePage(hidden.state)).toEqual({
      state: { pausedByVisibility: false },
      resumeNow: true,
    });
  });

  it('does not take ownership of prep, terminal, upgrade, or manual pauses', () => {
    for (const context of [
      { ...activeRun, runStarted: false },
      { ...activeRun, runEnded: true },
      { ...activeRun, upgradeSelectionPending: true },
      { ...activeRun, paused: true },
    ]) {
      const hidden = pauseForHiddenPage({ pausedByVisibility: false }, context);
      expect(hidden).toEqual({ state: { pausedByVisibility: false }, pauseNow: false });
      expect(resumeFromVisiblePage(hidden.state).resumeNow).toBe(false);
    }
  });

  it('clears stale ownership when the page becomes visible', () => {
    const visible = resumeFromVisiblePage({ pausedByVisibility: true });
    expect(visible.state.pausedByVisibility).toBe(false);
    expect(visible.resumeNow).toBe(true);
    expect(resumeFromVisiblePage(visible.state).resumeNow).toBe(false);
  });
});
