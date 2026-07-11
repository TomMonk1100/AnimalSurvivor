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
  const adapter = createRunSpawnAdapter({
    eliteHpMultiplier: 4, eliteXpMultiplier: 7, bossHpMultiplier: 20, bossXpMultiplier: 2,
  });
  const elite = { ...spawnEvent('enemy:elite', 'arc', 1), kind: 'eliteRequested', intent: { ...spawnEvent('enemy:elite', 'arc', 1).intent!, elite: true } };
  const boss = { ...spawnEvent('enemy:boss', 'ring', 1), kind: 'bossRequested', intent: { ...spawnEvent('enemy:boss', 'ring', 1).intent!, boss: true } };
  adapter.execute([elite, boss], {
    playerX: 0, playerY: 0, worldWidth: 1000, worldHeight: 1000,
    spawn: (request) => { out.push(request); return true; },
  });
  assert.deepEqual(out.map(({ archetype, hpMultiplier, xpMultiplier, role }) => ({ archetype, hpMultiplier, xpMultiplier, role })), [
    { archetype: 2, hpMultiplier: 4, xpMultiplier: 7, role: RUN_ENEMY_ROLE.elite },
    { archetype: 2, hpMultiplier: 20, xpMultiplier: 2, role: RUN_ENEMY_ROLE.boss },
  ]);
});

test('maps the normal-plus spitter to its distinct simulation archetype and presentation role', () => {
  const out: DirectedEnemySpawn[] = [];
  createRunSpawnAdapter().execute([spawnEvent('enemy:spitter', 'arc', 1)], {
    playerX: 1_000, playerY: 1_000, worldWidth: 2_000, worldHeight: 2_000,
    spawn: (request) => { out.push(request); return true; },
  });

  assert.deepEqual(out.map(({ archetype, hpMultiplier, xpMultiplier, role }) => ({ archetype, hpMultiplier, xpMultiplier, role })), [
    { archetype: 3, hpMultiplier: 1, xpMultiplier: 1, role: RUN_ENEMY_ROLE.ranged },
  ]);
});

test('uses the tuned default boss multiplier when content does not override it', () => {
  const out: DirectedEnemySpawn[] = [];
  const boss = {
    ...spawnEvent('enemy:boss', 'ring', 1),
    kind: 'bossRequested' as const,
    intent: { ...spawnEvent('enemy:boss', 'ring', 1).intent!, boss: true },
  };
  createRunSpawnAdapter().execute([boss], {
    playerX: 0, playerY: 0, worldWidth: 1_000, worldHeight: 1_000,
    spawn: (request) => { out.push(request); return true; },
  });

  assert.equal(out[0]?.hpMultiplier, 18);
  assert.equal(out[0]?.xpMultiplier, 1);
});

test('keeps off-screen approach formations at their authored radius near a world edge', () => {
  const out: DirectedEnemySpawn[] = [];
  const event: RunDirectorEventView = {
    kind: 'spawnRequested', tick: 27, seq: 3, phase: 'opening',
    intent: {
      archetypeId: 'enemy:fodder', count: 4, formation: 'arc',
      minDistance: 38, maxDistance: 46, elite: false, boss: false,
    },
  };
  const stats = createRunSpawnAdapter().execute([event], {
    playerX: 50, playerY: 50, worldWidth: 2_000, worldHeight: 2_000,
    spawn: (request) => { out.push(request); return true; },
  });

  assert.deepEqual(stats, { requested: 4, spawned: 4, rejected: 0, unsupportedArchetypes: 0 });
  assert.ok(out.every((request) => request.x >= 0 && request.x <= 2_000 && request.y >= 0 && request.y <= 2_000));
  for (const request of out) {
    const distance = Math.hypot(request.x - 50, request.y - 50);
    assert.ok(distance >= 760 && distance <= 920, `spawn distance ${distance} stays in authored off-screen band`);
  }
});

test('rejects an unplaceable far formation instead of clamping it beside an edge-bound player', () => {
  const stats = createRunSpawnAdapter().execute([spawnEvent('enemy:fodder', 'ring')], {
    playerX: 0, playerY: 0, worldWidth: 200, worldHeight: 200,
    spawn: () => { throw new Error('unplaceable wave must not call spawn'); },
  });
  assert.deepEqual(stats, { requested: 3, spawned: 0, rejected: 3, unsupportedArchetypes: 0 });
});

test('reports pool rejection and unsupported content without throwing', () => {
  const adapter = createRunSpawnAdapter();
  const stats = adapter.execute([spawnEvent('enemy:unknown', 'cluster'), spawnEvent('enemy:runner', 'lane', 2)], {
    playerX: 10, playerY: 10, worldWidth: 100, worldHeight: 100,
    spawn: () => false,
  });
  assert.deepEqual(stats, { requested: 2, spawned: 0, rejected: 2, unsupportedArchetypes: 3 });
});
