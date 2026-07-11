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

test('getDefaultDefinition() passes validateDefinition', () => {
  const def = getDefaultDefinition();
  assert.doesNotThrow(() => validateDefinition(def));
});

test('each required phase starts at its exact boundary', () => {
  const def = getDefaultDefinition();
  const byId = new Map(def.phases.map((p) => [p.id, p]));
  assert.equal(byId.get('opening')?.startTick, 0);
  assert.equal(byId.get('pressure')?.startTick, 7_200);
  assert.equal(byId.get('adaptation')?.startTick, 18_000);
  assert.equal(byId.get('mutation')?.startTick, 28_800);
  assert.equal(byId.get('boss')?.startTick, 36_000);
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

test('exactly 3 elite beats, one per pressure/adaptation/mutation', () => {
  const def = getDefaultDefinition();
  assert.equal(def.eliteBeats.length, 3);
  const phases = def.eliteBeats.map((b) => b.phaseId).sort();
  assert.deepEqual(phases, ['adaptation', 'mutation', 'pressure']);
});

test('boss requestTick === BOSS_ENTRANCE_TICK (36,000)', () => {
  const def = getDefaultDefinition();
  assert.equal(def.boss.requestTick, BOSS_ENTRANCE_TICK);
  assert.equal(def.boss.requestTick, 36_000);
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
