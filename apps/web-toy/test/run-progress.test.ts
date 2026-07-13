import { describe, expect, it } from 'vitest';
import { formatRunElapsed, formatRunRemaining, presentRunProgress } from '../src/presentation/run-progress';

describe('run progress presentation', () => {
  it('formats the opening clock from authoritative ticks', () => {
    expect(formatRunElapsed(0, 60)).toBe('0:00');
    expect(formatRunElapsed(119, 60)).toBe('0:01');
    expect(formatRunRemaining(390, 0, 60)).toBe('0:06');
    expect(presentRunProgress({ tick: 42 * 60, hz: 60, phase: 'opening' })).toEqual({
      status: 'RUN 0:42 · THE OPENING',
      objective: 'Objective: survive until the Final Threat.',
    });
  });

  it('shows the pressure phase at its two-minute boundary', () => {
    expect(presentRunProgress({ tick: 120 * 60, hz: 60, phase: 'pressure' })).toEqual({
      status: 'RUN 2:00 · PRESSURE RISING',
      objective: 'Objective: survive until the Final Threat.',
    });
  });

  it('shows the boss arrival and normal-run clocks from injected director facts', () => {
    expect(presentRunProgress({
      tick: 6 * 60,
      hz: 60,
      phase: 'opening',
      bossRequestTick: 390 * 60,
      durationTicks: 480 * 60,
    })).toMatchObject({
      status: 'RUN 0:06 · THE OPENING · FINAL THREAT IN 6:24',
    });
    expect(presentRunProgress({
      tick: 370 * 60,
      hz: 60,
      phase: 'adaptation',
      bossRequestTick: 390 * 60,
      durationTicks: 480 * 60,
    }).status).toBe('RUN 6:10 · ADAPTATION · FINAL THREAT IN 0:20');
    expect(presentRunProgress({
      tick: 390 * 60,
      hz: 60,
      phase: 'boss',
      bossRequestTick: 390 * 60,
      durationTicks: 480 * 60,
    })).toEqual({
      status: 'RUN 6:30 · THE FINAL THREAT · 1:30 LEFT',
      objective: 'Objective: defeat the Final Threat before time runs out.',
    });
  });

  it('names the Saltwind apex in the persistent HUD objective', () => {
    expect(presentRunProgress({
      tick: 479 * 60,
      hz: 60,
      phase: 'boss',
      biomeId: 'saltwind',
      bossRequestTick: 390 * 60,
      durationTicks: 480 * 60,
    })).toEqual({
      status: 'RUN 7:59 · THE SANDGLASS SOVEREIGN · 0:01 LEFT',
      objective: 'Objective: defeat the Sandglass Sovereign before time runs out.',
    });
  });

  it('has a truthful preparation fallback and never produces a malformed clock', () => {
    expect(presentRunProgress({ tick: -5, hz: 0, phase: null })).toEqual({
      status: 'RUN 0:00 · PREPARE',
      objective: 'Objective: stay moving and collect green XP motes.',
    });
  });
});
