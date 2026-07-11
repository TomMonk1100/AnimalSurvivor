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
        kind: 'spawnRequested', tick: 1, seq: 2, phase: this.phase,
        intent: {
          archetypeId: 'enemy:spitter', count: 1, formation: 'ring',
          minDistance: 5, maxDistance: 5, elite: false, boss: false,
        },
      },
      {
        kind: 'eliteRequested', tick: 1, seq: 3, phase: this.phase,
        intent: {
          archetypeId: 'enemy:elite', count: 1, formation: 'ring',
          minDistance: 5, maxDistance: 5, elite: true, boss: false,
        },
      },
      {
        kind: 'bossRequested', tick: 1, seq: 4, phase: this.phase,
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
  it('copies authoritative regular, ranged, elite, and boss roles without changing the canonical hash', () => {
    const sim = createSimulation(QUIET_CONFIG, 12, { runDirectorFactory: () => new RoleDirector() });
    sim.step({ moveX: 0, moveY: 0, paused: false });
    const snapshot = createSnapshot(QUIET_CONFIG);
    const hashBeforeCapture = sim.hash();

    captureSnapshot(snapshot, sim);

    expect(snapshot.enemies.count).toBe(4);
    expect(Array.from(snapshot.enemies.role.slice(0, snapshot.enemies.count))).toEqual([
      RUN_ENEMY_ROLE.regular,
      RUN_ENEMY_ROLE.ranged,
      RUN_ENEMY_ROLE.elite,
      RUN_ENEMY_ROLE.boss,
    ]);
    const bruteHp = DEFAULT_CONFIG.archetypes[2]!.hp;
    const spitterHp = DEFAULT_CONFIG.archetypes[3]!.hp;
    expect(Array.from(snapshot.enemies.hp.slice(0, snapshot.enemies.count))).toEqual([
      bruteHp,
      spitterHp,
      bruteHp * 5,
      bruteHp * 18,
    ]);
    expect(Array.from(snapshot.enemies.maxHp.slice(0, snapshot.enemies.count))).toEqual([
      bruteHp,
      spitterHp,
      bruteHp * 5,
      bruteHp * 18,
    ]);
    expect(sim.hash()).toBe(hashBeforeCapture);
    const bossIndex = Array.from(snapshot.enemies.role.slice(0, snapshot.enemies.count))
      .indexOf(RUN_ENEMY_ROLE.boss);
    const bossSlot = sim.enemies.slotOf(snapshot.enemies.id[bossIndex]!);
    expect(bossSlot).toBeGreaterThanOrEqual(0);
    sim.enemies.data.hp[bossSlot] = 1;
    expect(snapshot.enemies.hp[bossIndex]).toBe(bruteHp * 18);
  });

  it('keeps health fields zero for non-enemy categories and copies projectile faction for rendering', () => {
    const sim = createSimulation(QUIET_CONFIG, 12);
    const projectileSlot = sim.projectiles.spawn();
    const pickupSlot = sim.pickups.spawn();
    expect(projectileSlot).toBeGreaterThanOrEqual(0);
    expect(pickupSlot).toBeGreaterThanOrEqual(0);
    sim.projectiles.data.posX[projectileSlot] = 10;
    sim.projectiles.data.posY[projectileSlot] = 20;
    sim.projectiles.data.faction[projectileSlot] = 1;
    sim.pickups.data.posX[pickupSlot] = 30;
    sim.pickups.data.posY[pickupSlot] = 40;
    sim.pickups.data.radius[pickupSlot] = 4;

    const snapshot = createSnapshot(QUIET_CONFIG);
    captureSnapshot(snapshot, sim);

    expect(snapshot.projectiles.count).toBe(1);
    expect(snapshot.pickups.count).toBe(1);
    expect(snapshot.projectiles.hp[0]).toBe(0);
    expect(snapshot.projectiles.maxHp[0]).toBe(0);
    expect(snapshot.projectiles.role[0]).toBe(1);
    expect(snapshot.pickups.hp[0]).toBe(0);
    expect(snapshot.pickups.maxHp[0]).toBe(0);
  });
});

describe('snapshot producer player progression', () => {
  it('copies player XP and level at the capture boundary', () => {
    const sim = createSimulation(QUIET_CONFIG, 12);
    const snapshot = createSnapshot(QUIET_CONFIG);
    sim.player.xp = 47;
    sim.player.level = 3;
    sim.player.maxHp = 145;

    captureSnapshot(snapshot, sim);

    expect(snapshot.playerXp).toBe(47);
    expect(snapshot.playerLevel).toBe(3);
    expect(snapshot.playerMaxHp).toBe(145);

    sim.player.xp = 99;
    sim.player.level = 4;
    sim.player.maxHp = 200;
    expect(snapshot.playerXp).toBe(47);
    expect(snapshot.playerLevel).toBe(3);
    expect(snapshot.playerMaxHp).toBe(145);
  });
});
