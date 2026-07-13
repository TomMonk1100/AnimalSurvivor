import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRunSpawnAdapter,
  RUN_ENEMY_CONTENT,
  RUN_ENEMY_ROLE,
  validateRunEnemyContent,
  type DirectedEnemySpawn,
} from '../src/run-spawn-adapter.js';
import type { RunDirectorEventView } from '../src/run-director-port.js';

function spawnEvent(archetypeId: string, formation: 'ring' | 'arc' | 'lane' | 'cluster', count = 3): RunDirectorEventView {
  return {
    kind: 'spawnRequested', tick: 12, seq: 7, phase: 'opening',
    intent: { archetypeId, count, formation, minDistance: 5, maxDistance: 10, elite: false, boss: false },
  };
}

test('keeps the authored archetype bridge complete and descriptive', () => {
  validateRunEnemyContent(RUN_ENEMY_CONTENT.map((entry) => entry.archetypeId));
  assert.equal(RUN_ENEMY_CONTENT.length, 10);
  assert.deepEqual(
    RUN_ENEMY_CONTENT.map((entry) => ({
      id: entry.archetypeId,
      archetype: entry.simulationArchetype,
      behavior: entry.behavior,
      reward: entry.reward,
      visual: entry.visual,
    })),
    [
      { id: 'enemy:fodder', archetype: 0, behavior: 'approach', reward: 'standard', visual: 'regular' },
      { id: 'enemy:runner', archetype: 1, behavior: 'weave', reward: 'standard', visual: 'regular' },
      { id: 'enemy:brute', archetype: 2, behavior: 'brute', reward: 'standard', visual: 'regular' },
      { id: 'enemy:spitter', archetype: 3, behavior: 'ranged', reward: 'standard', visual: 'ranged' },
      { id: 'enemy:charger', archetype: 4, behavior: 'charger', reward: 'standard', visual: 'charger' },
      { id: 'enemy:denial', archetype: 5, behavior: 'denial', reward: 'standard', visual: 'denial' },
      { id: 'enemy:flanker', archetype: 6, behavior: 'flanker', reward: 'standard', visual: 'flanker' },
      { id: 'enemy:support', archetype: 7, behavior: 'support', reward: 'standard', visual: 'support' },
      { id: 'enemy:elite', archetype: 2, behavior: 'elite', reward: 'elite', visual: 'elite' },
      { id: 'enemy:boss', archetype: 2, behavior: 'boss', reward: 'boss', visual: 'boss' },
    ],
  );
});

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

test('maps Charger and Denial content to their distinct simulation archetypes', () => {
  const requests: DirectedEnemySpawn[] = [];
  createRunSpawnAdapter().execute([
    spawnEvent('enemy:charger', 'lane', 1),
    spawnEvent('enemy:denial', 'cluster', 1),
  ], {
    playerX: 500, playerY: 500, worldWidth: 2_000, worldHeight: 2_000,
    spawn(request) { requests.push(request); return true; },
  });
  assert.deepEqual(requests.map((request) => ({ archetype: request.archetype, role: request.role })), [
    { archetype: 4, role: RUN_ENEMY_ROLE.charger },
    { archetype: 5, role: RUN_ENEMY_ROLE.denial },
  ]);
});

test('maps Flanker and Support content to distinct simulation roles', () => {
  const requests: DirectedEnemySpawn[] = [];
  createRunSpawnAdapter().execute([
    spawnEvent('enemy:flanker', 'arc', 2),
    spawnEvent('enemy:support', 'cluster', 1),
  ], {
    playerX: 500, playerY: 500, worldWidth: 2_000, worldHeight: 2_000,
    spawn(request) { requests.push(request); return true; },
  });
  assert.deepEqual(requests.map((request) => ({ archetype: request.archetype, role: request.role })), [
    { archetype: 6, role: RUN_ENEMY_ROLE.flanker },
    { archetype: 6, role: RUN_ENEMY_ROLE.flanker },
    { archetype: 7, role: RUN_ENEMY_ROLE.support },
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
      minDistance: 22, maxDistance: 26, elite: false, boss: false,
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
    assert.ok(distance >= 440 && distance <= 520, `spawn distance ${distance} stays in the authored opening band`);
  }
});

test('scales cluster separation with the configured distance scale', () => {
  const out: DirectedEnemySpawn[] = [];
  createRunSpawnAdapter({ distanceScale: 10 }).execute([spawnEvent('enemy:fodder', 'cluster')], {
    playerX: 500, playerY: 500, worldWidth: 2_000, worldHeight: 2_000,
    spawn: (request) => { out.push(request); return true; },
  });

  const distances = out.map((request) => Math.hypot(request.x - 500, request.y - 500));
  assert.deepEqual(distances.map((distance) => Number(distance.toFixed(6))), [50, 54, 58]);
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
