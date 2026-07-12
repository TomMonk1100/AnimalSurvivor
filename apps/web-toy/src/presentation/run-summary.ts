import type { RunOutcomeView, RunPhaseView } from '@sim';

export interface RunSummary { readonly headline: string; readonly detail: string; readonly tone: 'victory' | 'defeat'; }

function formatDuration(tick: number, hz: number): string {
  const seconds = Math.floor(tick / hz);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const NORMAL_RUN_SECONDS = 8 * 60;

/** Formats only existing authoritative run facts; it never invents score data. */
export function presentRunSummary(outcome: RunOutcomeView | null, tick: number, hz: number, phase: RunPhaseView | null): RunSummary | null {
  if (outcome !== 'victory' && outcome !== 'defeat') return null;
  const duration = formatDuration(tick, hz);
  return outcome === 'victory'
    ? { headline: 'Greg survives!', detail: `The final threat fell after ${duration}.`, tone: 'victory' }
    : phase === 'boss' && tick >= NORMAL_RUN_SECONDS * hz
      ? { headline: 'Time ran out', detail: `The boss was still standing at ${duration}.`, tone: 'defeat' }
    : { headline: 'Greg was overwhelmed', detail: `Run ended after ${duration}${phase === null ? '.' : ` during ${phase}.`}`, tone: 'defeat' };
}
