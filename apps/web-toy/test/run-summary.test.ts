import { describe, expect, it } from 'vitest';
import { presentRunSummary } from '../src/presentation/run-summary';

describe('run summary', () => {
  it('uses authoritative tick time for victory', () => {
    expect(presentRunSummary('victory', 43_200, 60, 'boss')).toEqual({
      headline: 'Greg survives!', detail: 'The final threat fell after 12:00.', tone: 'victory',
    });
  });

  it('reports defeat phase without fabricating a score', () => {
    expect(presentRunSummary('defeat', 3_900, 60, 'pressure')).toEqual({
      headline: 'Greg was overwhelmed', detail: 'Run ended after 1:05 during pressure.', tone: 'defeat',
    });
  });
});
