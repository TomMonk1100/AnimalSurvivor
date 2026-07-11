import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONFIG, type SimConfig } from '../src/config.js';
import { createSimulation, runReplay } from '../src/simulation.js';
import type {
  RunDirectorEventView,
  RunDirectorFactory,
  RunDirectorPort,
  RunMetricsView,
  RunOutcomeView,
  RunPhaseView,
} from '../src/run-director-port.js';

const RUN_FP = '12345678';

class FakeRunDirector implements RunDirectorPort {
  outcome: RunOutcomeView = 'running';
  tick = -1;
  phase: RunPhaseView = 'opening';
  readonly metrics: RunMetricsView[] = [];

  step(metrics: RunMetricsView): readonly RunDirectorEventView[] {
    if (metrics.tick <= this.tick) throw new Error('fake director tick order');
    this.tick = metrics.tick;
    this.metrics.push({ ...metrics });
    if (!metrics.playerAlive) this.outcome = 'defeat';
    if (metrics.bossDefeatedThisTick) this.outcome = 'victory';
    if (metrics.tick === 1) {
      return [{
        kind: 'bossRequested', tick: 1, seq: 1, phase: 'opening',
        intent: {
          archetypeId: 'enemy:boss', count: 1, formation: 'ring',
          minDistance: 5, maxDistance: 5, elite: false, boss: true,
        },
      }];
    }
    if (this.outcome !== 'running') {
      return [{ kind: this.outcome, tick: metrics.tick, seq: metrics.tick + 1, phase: this.phase }];
    }
    return [];
  }

  stateHash(): string {
    return (this.tick * 4 + (this.outcome === 'victory' ? 1 : this.outcome === 'defeat' ? 2 : 0))
      .toString(16).padStart(8, '0');
  }

  contentFingerprint(): string {
    return RUN_FP;
  }
}

function factory(log: FakeRunDirector[] = []): RunDirectorFactory {
  return () => {
    const director = new FakeRunDirector();
    log.push(director);
    return director;
  };
}

function quietConfig(): SimConfig {
  return { ...DEFAULT_CONFIG, waves: [] };
}

test('primes tick zero, replaces legacy waves, and executes authored boss placement', () => {
  const log: FakeRunDirector[] = [];
  const sim = createSimulation(quietConfig(), 12, { runDirectorFactory: factory(log) });
  assert.equal(sim.runContentFingerprint, RUN_FP);
  assert.deepEqual(log[0]!.metrics.map((metrics) => metrics.tick), [0]);

  const events = sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.deepEqual(log[0]!.metrics.map((metrics) => metrics.tick), [0, 1]);
  assert.equal(events.enemiesSpawned, 1);
  assert.equal(sim.enemies.data.count, 1);
  const slot = sim.enemies.data.alive.indexOf(1);
  assert.notEqual(slot, -1);
  assert.equal(sim.enemies.data.archetype[slot], 2);
  assert.equal(sim.enemies.data.maxHp[slot], DEFAULT_CONFIG.archetypes[2]!.hp * 30);
});

test('tracks boss identity and reports a same-tick boss kill to the director', () => {
  const sim = createSimulation(quietConfig(), 44, { runDirectorFactory: factory() });
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const enemySlot = sim.enemies.data.alive.indexOf(1);
  assert.notEqual(enemySlot, -1);
  sim.enemies.data.hp[enemySlot] = 1;

  const projectileSlot = sim.projectiles.spawn();
  assert.notEqual(projectileSlot, -1);
  sim.projectiles.data.posX[projectileSlot] = sim.enemies.data.posX[enemySlot]!;
  sim.projectiles.data.posY[projectileSlot] = sim.enemies.data.posY[enemySlot]!;
  sim.projectiles.data.damage[projectileSlot] = 2;
  sim.projectiles.data.lifetime[projectileSlot] = 2;
  sim.projectiles.data.hitRadius[projectileSlot] = 2;
  sim.projectiles.data.faction[projectileSlot] = 0;

  sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(sim.totalKills, 1);
  assert.equal(sim.runOutcome, 'victory');
  assert.equal(sim.directorEvents[0]!.kind, 'victory');
});

test('run content and state participate in deterministic replay and hash', () => {
  const config = quietConfig();
  const sim = createSimulation(config, 99, { runDirectorFactory: factory() });
  sim.step({ moveX: 0.2, moveY: 0, paused: false });
  const replay = sim.getReplay();
  assert.equal(replay.runContentFingerprint, RUN_FP);
  assert.equal(
    runReplay(config, replay, { runDirectorFactory: factory() }).finalHash,
    sim.hash(),
  );
  assert.throws(() => runReplay(config, replay), /run content fingerprint mismatch/);
});
