import type { BiomeId, RunDirectorEventView, RunPhaseView } from '@sim';
import { getBiomePresentationCopy } from './biome-copy';

export type DirectorNoticeTone = 'phase' | 'warning' | 'danger' | 'victory' | 'defeat';

export interface DirectorNotice {
  readonly key: string;
  readonly tone: DirectorNoticeTone;
  readonly title: string;
  readonly detail: string;
  /** Null means terminal and persistent. */
  readonly expiresAtTick: number | null;
}

const PHASE_NAMES: Readonly<Record<RunPhaseView, string>> = Object.freeze({
  opening: 'The Opening',
  pressure: 'Pressure Rising',
  adaptation: 'Adaptation',
  mutation: 'Mutation',
  boss: 'The Final Threat',
  overtime: 'Overtime',
});

function notice(
  event: RunDirectorEventView,
  tone: DirectorNoticeTone,
  title: string,
  detail: string,
  durationTicks: number | null,
): DirectorNotice {
  return {
    key: `${event.seq}:${event.kind}`,
    tone,
    title,
    detail,
    expiresAtTick: durationTicks === null ? null : event.tick + durationTicks,
  };
}

/** Pure projection only; it never advances or mutates director/simulation state. */
export function projectDirectorEvent(event: RunDirectorEventView, biomeId: BiomeId = 'forest'): DirectorNotice | null {
  const biomeCopy = getBiomePresentationCopy(biomeId);
  switch (event.kind) {
    case 'phaseStarted': {
      const phase = event.phaseId ?? event.phase;
      const title = phase === 'boss' ? biomeCopy.bossName : PHASE_NAMES[phase];
      return notice(event, 'phase', title, 'The shape of the hunt has changed.', 180);
    }
    case 'eliteWarning':
      return notice(event, 'warning', 'Something formidable approaches', 'Keep moving and make space.', 180);
    case 'eliteRequested':
      return notice(event, 'danger', 'Elite threat arrived', 'Break away before it closes the gap.', 180);
    case 'bossWarning':
      return notice(event, 'warning', biomeCopy.bossWarningTitle, biomeCopy.bossWarningDetail, 300);
    case 'bossRequested':
      return notice(event, 'danger', biomeCopy.bossArrivalTitle, biomeCopy.bossArrivalDetail, 300);
    case 'overtimeStarted':
      return notice(event, 'danger', 'Overtime', 'The wild will keep closing in until the boss falls.', 300);
    case 'victory':
      return notice(event, 'victory', 'Greg survives', 'The run is complete.', null);
    case 'defeat':
      return notice(event, 'defeat', 'Greg was overwhelmed', 'Return stronger and try again.', null);
    default:
      return null;
  }
}
