/**
 * AGENT A — OWNED.
 *
 * Coverage for getDefaultDefinition() / validateDefinition() over the frozen
 * Greg first-run content, plus targeted mutation fixtures that must fail
 * validation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getDefaultDefinition } from '../src/definitions.js';
import { validateDefinition } from '../src/validation.js';
import { BOSS_ENTRANCE_TICK, NORMAL_RUN_PHASE_ORDER } from '../src/ids.js';
import { OPEN_END, type RunDefinition } from '../src/contracts.js';
import { SALTWIND_RUINS_RUN } from '../src/content/saltwind-ruins.js';

test('getDefaultDefinition() passes validateDefinition', () => {
  const def = getDefaultDefinition();
  assert.doesNotThrow(() => validateDefinition(def));
});

test('each required phase starts at its exact boundary', () => {
  const def = getDefaultDefinition();
  const byId = new Map(def.phases.map((p) => [p.id, p]));
  assert.equal(byId.get('opening')?.startTick, 0);
  assert.equal(byId.get('pressure')?.startTick, 3_600);
  assert.equal(byId.get('adaptation')?.startTick, 10_800);
  assert.equal(byId.get('mutation')?.startTick, 18_000);
  assert.equal(byId.get('boss')?.startTick, 23_400);
  assert.equal(byId.has('overtime'), false);
  assert.equal(def.mode, 'normal');
  assert.equal(def.overtime, undefined);
});

test('normal phases are contiguous through the terminal boss phase', () => {
  const def = getDefaultDefinition();
  const byId = new Map(def.phases.map((p) => [p.id, p]));
  for (let i = 1; i < NORMAL_RUN_PHASE_ORDER.length; i++) {
    const prev = byId.get(NORMAL_RUN_PHASE_ORDER[i - 1]!);
    const curr = byId.get(NORMAL_RUN_PHASE_ORDER[i]!);
    assert.ok(prev);
    assert.ok(curr);
    assert.equal(curr.startTick, prev.endTick + 1);
  }
});

test('elite beats become more frequent in later pre-boss phases', () => {
  const def = getDefaultDefinition();
  assert.equal(def.eliteBeats.length, 6);
  const byPhase = new Map<string, number>();
  for (const beat of def.eliteBeats) byPhase.set(beat.phaseId, (byPhase.get(beat.phaseId) ?? 0) + 1);
  assert.deepEqual([...byPhase.entries()].sort(), [
    ['adaptation', 2],
    ['mutation', 3],
    ['pressure', 1],
  ]);
});

test('boss requestTick === BOSS_ENTRANCE_TICK (23,400 / 6:30)', () => {
  const def = getDefaultDefinition();
  assert.equal(def.boss.requestTick, BOSS_ENTRANCE_TICK);
  assert.equal(def.boss.requestTick, 23_400);
});

test('ordinary waves approach from off-screen while the boss enters quickly enough to fight', () => {
  const def = getDefaultDefinition();
  const fodder = def.archetypes.find((archetype) => archetype.id === 'enemy:fodder');
  assert.ok(fodder);
  assert.deepEqual([fodder.minDistance, fodder.maxDistance], [38, 46]);
  assert.deepEqual([def.boss.minDistance, def.boss.maxDistance], [20, 24]);
});

test('normal-plus spitters arrive after the opening and never crowd the boss entrance', () => {
  const def = getDefaultDefinition();
  const spitter = def.archetypes.find((archetype) => archetype.id === 'enemy:spitter');
  assert.ok(spitter);
  assert.deepEqual(
    [spitter.cost, spitter.weight, spitter.count, spitter.minDistance, spitter.maxDistance],
    [3, 2, 1, 38, 46],
  );
  assert.equal(def.waves.phaseArchetypes.opening?.includes('enemy:spitter'), false);
  assert.equal(def.waves.phaseArchetypes.pressure?.includes('enemy:spitter'), true);
  assert.equal(def.waves.phaseArchetypes.adaptation?.includes('enemy:spitter'), true);
  assert.equal(def.waves.phaseArchetypes.mutation?.includes('enemy:spitter'), true);
  assert.equal(def.waves.phaseArchetypes.boss?.includes('enemy:spitter'), false);
});

test('Forest content exposes Charger and Denial roles only after the opening', () => {
  const def = getDefaultDefinition();
  assert.equal(def.archetypes.some((archetype) => archetype.id === 'enemy:charger'), true);
  assert.equal(def.archetypes.some((archetype) => archetype.id === 'enemy:denial'), true);
  assert.equal(def.waves.phaseArchetypes.opening?.some((id) => id === 'enemy:charger' || id === 'enemy:denial'), false);
  assert.equal(def.waves.phaseArchetypes.adaptation?.includes('enemy:charger'), true);
  assert.equal(def.waves.phaseArchetypes.mutation?.includes('enemy:denial'), true);
});

test('Saltwind Ruins is a valid second-biome definition with distinct encounter grammar', () => {
  assert.doesNotThrow(() => validateDefinition(SALTWIND_RUINS_RUN));
  assert.notEqual(SALTWIND_RUINS_RUN.defaultSeed, getDefaultDefinition().defaultSeed);
  assert.notDeepEqual(
    SALTWIND_RUINS_RUN.waves.phaseArchetypes,
    getDefaultDefinition().waves.phaseArchetypes,
  );
  assert.equal(SALTWIND_RUINS_RUN.waves.phaseArchetypes.opening?.includes('enemy:flanker'), true);
  assert.equal(SALTWIND_RUINS_RUN.waves.phaseArchetypes.boss?.includes('enemy:support'), true);
});

test('a mutated copy with a phase gap fails validation', () => {
  const def = getDefaultDefinition();
  const badPhases = def.phases.map((p) =>
    p.id === 'pressure' ? { ...p, startTick: p.startTick + 1 } : p,
  );
  const bad: RunDefinition = { ...def, phases: badPhases };
  assert.throws(() => validateDefinition(bad));
});

test('duplicate elite beat id fails validation', () => {
  const def = getDefaultDefinition();
  const [first, ...rest] = def.eliteBeats;
  assert.ok(first);
  const badBeats = [{ ...rest[1]!, id: first.id }, first, rest[0]!];
  const bad: RunDefinition = { ...def, eliteBeats: badBeats };
  assert.throws(() => validateDefinition(bad));
});

test('minDistance > maxDistance fails validation', () => {
  const def = getDefaultDefinition();
  const badArchetypes = def.archetypes.map((a) =>
    a.id === 'enemy:fodder' ? { ...a, minDistance: a.maxDistance + 1 } : a,
  );
  const bad: RunDefinition = { ...def, archetypes: badArchetypes };
  assert.throws(() => validateDefinition(bad));
});

test('endless remains an explicit separate definition, not normal-mode fallback', () => {
  const normal = getDefaultDefinition();
  const overtime = {
    supportIntervalTicks: 300,
    archetypeId: 'enemy:fodder' as const,
    count: 2,
    formation: 'arc' as const,
    minDistance: 10,
    maxDistance: 16,
    maxSupportWaves: 40,
  };
  const endless: RunDefinition = {
    ...normal,
    mode: 'endless',
    phases: [
      ...normal.phases,
      {
        id: 'overtime',
        startTick: normal.durationTicks,
        endTick: OPEN_END,
        softCap: 6,
        hardCap: 10,
        threatPerTick: 3,
      },
    ],
    waves: {
      ...normal.waves,
      phaseArchetypes: {
        ...normal.waves.phaseArchetypes,
        overtime: ['enemy:fodder'],
      },
    },
    overtime,
  };

  assert.doesNotThrow(() => validateDefinition(endless));
  assert.throws(() => validateDefinition({ ...normal, overtime }), /normal mode/);
});
