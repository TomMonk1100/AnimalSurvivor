import type { BiomeId, RunPhaseView } from '@sim';
import { getBiomePresentationCopy } from './biome-copy';

export interface RunProgress {
  /** Compact, persistent status intended for the player HUD. */
  readonly status: string;
  /** The one meaningful goal for the current authoritative run phase. */
  readonly objective: string;
}

export interface RunProgressInput {
  readonly tick: number;
  readonly hz: number;
  readonly phase: RunPhaseView | null;
  readonly biomeId?: BiomeId;
}

interface PhaseCopy {
  readonly label: string;
  readonly objective: string;
}

const PHASE_COPY: Readonly<Record<RunPhaseView, PhaseCopy>> = Object.freeze({
  opening: {
    label: 'The Opening',
    objective: 'Objective: survive until the Final Threat.',
  },
  pressure: {
    label: 'Pressure Rising',
    objective: 'Objective: survive until the Final Threat.',
  },
  adaptation: {
    label: 'Adaptation',
    objective: 'Objective: build adaptations and survive.',
  },
  mutation: {
    label: 'Mutation',
    objective: 'Objective: survive until the Final Threat.',
  },
  boss: {
    label: 'The Final Threat',
    objective: 'Objective: defeat the Final Threat.',
  },
  overtime: {
    label: 'Overtime',
    objective: 'Objective: defeat the Final Threat to escape.',
  },
});

const PREPARING: PhaseCopy = Object.freeze({
  label: 'Prepare',
  objective: 'Objective: stay moving and collect green XP motes.',
});

/** Formats an authoritative tick count into a stable, player-readable clock. */
export function formatRunElapsed(tick: number, hz: number): string {
  const safeTick = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  const safeHz = Number.isFinite(hz) && hz > 0 ? hz : 1;
  const seconds = Math.floor(safeTick / safeHz);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Projects only authoritative tick and phase facts into persistent player copy.
 * It intentionally does not predict waves, timing, or outcomes.
 */
export function presentRunProgress(input: RunProgressInput): RunProgress {
  const biomeCopy = getBiomePresentationCopy(input.biomeId);
  const baseCopy = input.phase === null ? PREPARING : PHASE_COPY[input.phase];
  const copy = {
    label: input.phase === 'boss' ? biomeCopy.bossName : baseCopy.label,
    objective: baseCopy.objective.replace('Final Threat', biomeCopy.bossName.slice(4)),
  };
  return {
    status: `RUN ${formatRunElapsed(input.tick, input.hz)} · ${copy.label.toUpperCase()}`,
    objective: copy.objective,
  };
}
