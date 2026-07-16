import { describe, expect, it } from 'vitest';
import { RUN_DURATION_TICKS } from '@director';
import { presentRunSummary } from '../src/presentation/run-summary';

describe('run summary', () => {
  it('uses authoritative tick time for victory', () => {
    expect(presentRunSummary('victory', RUN_DURATION_TICKS, 60, 'boss')).toEqual({
      headline: 'Greg survives!', detail: 'The final threat fell after 6:00.', tone: 'victory',
    });
  });

  it('reports defeat phase without fabricating a score', () => {
    expect(presentRunSummary('defeat', 3_900, 60, 'pressure')).toEqual({
      headline: 'Greg was overwhelmed', detail: 'Run ended after 1:05 during pressure.', tone: 'defeat',
    });
  });

  it('states the normal time expiry truthfully instead of calling it an overwhelm', () => {
    expect(presentRunSummary('defeat', RUN_DURATION_TICKS, 60, 'boss')).toEqual({
      headline: 'Time ran out', detail: 'The boss was still standing at 6:00.', tone: 'defeat',
    });
  });

  it('uses the selected hero only for personal outcome copy', () => {
    expect(presentRunSummary('victory', 1_200, 60, 'opening', 'Benny')?.headline).toBe('Benny survives!');
    expect(presentRunSummary('defeat', 1_200, 60, 'pressure', 'Gracie')?.headline).toBe('Gracie was overwhelmed');
    expect(presentRunSummary('defeat', RUN_DURATION_TICKS, 60, 'boss', 'Benny')?.headline).toBe('Time ran out');
  });
});
