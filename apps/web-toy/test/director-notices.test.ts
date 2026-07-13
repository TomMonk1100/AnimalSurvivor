import { describe, expect, it } from 'vitest';
import type { RunDirectorEventView } from '@sim';
import { projectDirectorEvent } from '../src/presentation/director-notices';

function event(kind: string, extra: Partial<RunDirectorEventView> = {}): RunDirectorEventView {
  return { kind, tick: 120, seq: 4, phase: 'pressure', ...extra };
}

describe('director notice projection', () => {
  it('projects phase, warning, arrival, and terminal events', () => {
    expect(projectDirectorEvent(event('phaseStarted', { phaseId: 'mutation' }))).toMatchObject({
      title: 'Mutation', tone: 'phase', expiresAtTick: 300,
    });
    expect(projectDirectorEvent(event('eliteWarning'))?.tone).toBe('warning');
    expect(projectDirectorEvent(event('bossRequested'))?.title).toBe('The final threat has arrived');
    expect(projectDirectorEvent(event('victory'))).toMatchObject({ tone: 'victory', expiresAtTick: null });
    expect(projectDirectorEvent(event('defeat'))).toMatchObject({ tone: 'defeat', expiresAtTick: null });
  });

  it('uses selected-hero names for terminal notices', () => {
    expect(projectDirectorEvent(event('victory'), 'forest', 'Benny')?.title).toBe('Benny survives');
    expect(projectDirectorEvent(event('defeat'), 'forest', 'Gracie')?.title).toBe('Gracie was overwhelmed');
  });

  it('ignores routine spawn events and derives stable keys from sequence', () => {
    expect(projectDirectorEvent(event('spawnRequested'))).toBeNull();
    expect(projectDirectorEvent(event('bossWarning'))?.key).toBe('4:bossWarning');
  });

  it('gives Saltwind its own apex warning and arrival copy', () => {
    expect(projectDirectorEvent(event('bossWarning'), 'saltwind')).toMatchObject({
      title: 'The ruins begin to sing',
      detail: 'The Sandglass Sovereign is approaching.',
    });
    expect(projectDirectorEvent(event('bossRequested'), 'saltwind')).toMatchObject({
      title: 'The Sandglass Sovereign has awakened',
      detail: 'Outlast the sandstorm and break the sovereign.',
    });
  });
});
