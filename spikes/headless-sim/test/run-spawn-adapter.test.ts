import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunSpawnAdapter, RUN_ENEMY_ROLE, type DirectedEnemySpawn } from '../src/run-spawn-adapter.js';
import type { RunDirectorEventView } from '../src/run-director-port.js';

function spawnEvent(archetypeId: string, formation: 'ring' | 'arc' | 'lane' | 'cluster', count = 3): RunDirectorEventView {
  return {
    kind: 'spawnRequested', tick: 12, seq: 7, phase: 'opening',
    intent: { archetypeId, count, formation, minDistance: 5, maxDistance: 10, elite: false, boss: false },
  };
}

test('maps authored archetypes and produces byte-identical deterministic placements', () => {
  const execute = () => {
    const out: DirectedEnemySpawn[] = [];
    createRunSpawnAdapter().execute([spawnEvent('enemy:fodder', 'ring')], {
      playerX: 500, playerY: 500, worldWidth: 1000, worldHeight: 1000,
      spawn: (request) => { out.push(request); return true; },
    });
    return out;
  };
  const a = execute();
  assert.deepEqual(a, execute());
  assert.equal(a.length, 3);
  assert.ok(a.every((request) => request.archetype === 0 && request.role === RUN_ENEMY_ROLE.regular));
  assert.equal(new Set(a.map((request) => `${request.x},${request.y}`)).size, 3);
});

test('maps elite and boss roles with explicit health multipliers', () => {
  const out: DirectedEnemySpawn[] = [];
  const adapter = createRunSpawnAdapter({ eliteHpMultiplier: 4, bossHpMultiplier: 20 });
  const elite = { ...spawnEvent('enemy:elite', 'arc', 1), kind: 'eliteRequested', intent: { ...spawnEvent('enemy:elite', 'arc', 1).intent!, elite: true } };
  const boss = { ...spawnEvent('enemy:boss', 'ring', 1), kind: 'bossRequested', intent: { ...spawnEvent('enemy:boss', 'ring', 1).intent!, boss: true } };
  adapter.execute([elite, boss], {
    playerX: 0, playerY: 0, worldWidth: 1000, worldHeight: 1000,
    spawn: (request) => { out.push(request); return true; },
  });
  assert.deepEqual(out.map(({ archetype, hpMultiplier, role }) => ({ archetype, hpMultiplier, role })), [
    { archetype: 2, hpMultiplier: 4, role: RUN_ENEMY_ROLE.elite },
    { archetype: 2, hpMultiplier: 20, role: RUN_ENEMY_ROLE.boss },
  ]);
});

test('reports pool rejection and unsupported content without throwing', () => {
  const adapter = createRunSpawnAdapter();
  const stats = adapter.execute([spawnEvent('enemy:unknown', 'cluster'), spawnEvent('enemy:runner', 'lane', 2)], {
    playerX: 10, playerY: 10, worldWidth: 100, worldHeight: 100,
    spawn: () => false,
  });
  assert.deepEqual(stats, { requested: 2, spawned: 0, rejected: 2, unsupportedArchetypes: 3 });
});
