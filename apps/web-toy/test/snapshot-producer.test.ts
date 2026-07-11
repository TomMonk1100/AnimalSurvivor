import { describe, expect, it } from 'vitest';
import {
  createSimulation,
  DEFAULT_CONFIG,
  RUN_ENEMY_ROLE,
  type RunDirectorEventView,
  type RunDirectorPort,
  type RunMetricsView,
  type RunOutcomeView,
  type RunPhaseView,
  type SimConfig,
} from '@sim';
import { captureSnapshot, createSnapshot } from '../src/sim/snapshot-producer';

const ROLE_TEST_FINGERPRINT = '87654321';

class RoleDirector implements RunDirectorPort {
  outcome: RunOutcomeView = 'running';
  tick = -1;
  phase: RunPhaseView = 'opening';

  step(metrics: RunMetricsView): readonly RunDirectorEventView[] {
    this.tick = metrics.tick;
    if (metrics.tick !== 1) return [];
    return [
      {
        kind: 'spawnRequested', tick: 1, seq: 1, phase: this.phase,
        intent: {
          archetypeId: 'enemy:brute', count: 1, formation: 'ring',
          minDistance: 5, maxDistance: 5, elite: false, boss: false,
        },
      },
      {
        kind: 'eliteRequested', tick: 1, seq: 2, phase: this.phase,
        intent: {
          archetypeId: 'enemy:elite', count: 1, formation: 'ring',
          minDistance: 5, maxDistance: 5, elite: true, boss: false,
        },
      },
      {
        kind: 'bossRequested', tick: 1, seq: 3, phase: this.phase,
        intent: {
          archetypeId: 'enemy:boss', count: 1, formation: 'ring',
          minDistance: 5, maxDistance: 5, elite: false, boss: true,
        },
      },
    ];
  }

  stateHash(): string {
    return this.tick.toString(16).padStart(8, '0');
  }

  contentFingerprint(): string {
    return ROLE_TEST_FINGERPRINT;
  }
}

const QUIET_CONFIG: SimConfig = { ...DEFAULT_CONFIG, waves: [] };

describe('snapshot producer enemy presentation roles', () => {
  it('copies authoritative regular, elite, and boss roles without changing the canonical hash', () => {
    const sim = createSimulation(QUIET_CONFIG, 12, { runDirectorFactory: () => new RoleDirector() });
    sim.step({ moveX: 0, moveY: 0, paused: false });
    const snapshot = createSnapshot(QUIET_CONFIG);
    const hashBeforeCapture = sim.hash();

    captureSnapshot(snapshot, sim);

    expect(snapshot.enemies.count).toBe(3);
    expect(Array.from(snapshot.enemies.role.slice(0, snapshot.enemies.count))).toEqual([
      RUN_ENEMY_ROLE.regular,
      RUN_ENEMY_ROLE.elite,
      RUN_ENEMY_ROLE.boss,
    ]);
    expect(sim.hash()).toBe(hashBeforeCapture);
  });
});
