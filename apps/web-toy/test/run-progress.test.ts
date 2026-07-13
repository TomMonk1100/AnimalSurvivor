import { describe, expect, it } from 'vitest';
import { formatRunElapsed, presentRunProgress } from '../src/presentation/run-progress';

describe('run progress presentation', () => {
  it('formats the opening clock from authoritative ticks', () => {
    expect(formatRunElapsed(0, 60)).toBe('0:00');
    expect(formatRunElapsed(119, 60)).toBe('0:01');
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

  it('makes defeating the Final Threat explicit during boss and overtime', () => {
    expect(presentRunProgress({ tick: 660 * 60, hz: 60, phase: 'boss' })).toMatchObject({
      status: 'RUN 11:00 · THE FINAL THREAT',
      objective: 'Objective: defeat the Final Threat.',
    });
    expect(presentRunProgress({ tick: 721 * 60, hz: 60, phase: 'overtime' })).toMatchObject({
      status: 'RUN 12:01 · OVERTIME',
      objective: 'Objective: defeat the Final Threat to escape.',
    });
  });

  it('names the Saltwind apex in the persistent HUD objective', () => {
    expect(presentRunProgress({ tick: 660 * 60, hz: 60, phase: 'boss', biomeId: 'saltwind' })).toEqual({
      status: 'RUN 11:00 · THE SANDGLASS SOVEREIGN',
      objective: 'Objective: defeat the Sandglass Sovereign.',
    });
  });

  it('has a truthful preparation fallback and never produces a malformed clock', () => {
    expect(presentRunProgress({ tick: -5, hz: 0, phase: null })).toEqual({
      status: 'RUN 0:00 · PREPARE',
      objective: 'Objective: stay moving and collect green XP motes.',
    });
  });
});
