import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RUN_START_LOADOUT,
  fingerprintRunStartLoadout,
  normalizeRunStartLoadout,
} from '../src/run-start-loadout.js';

test('normalizes immutable permanent loadouts and fingerprints their actual effects', () => {
  const loadout = normalizeRunStartLoadout({ version: 1, maxHpBonus: 20 });
  assert.deepEqual(loadout, { version: 1, maxHpBonus: 20 });
  assert.ok(Object.isFrozen(loadout));
  assert.notEqual(fingerprintRunStartLoadout(loadout), fingerprintRunStartLoadout(DEFAULT_RUN_START_LOADOUT));
});

test('rejects malformed permanent loadouts at the simulation boundary', () => {
  assert.throws(() => normalizeRunStartLoadout({ version: 2, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: 1, maxHpBonus: -1 } as never), /maxHpBonus/);
  assert.throws(() => normalizeRunStartLoadout({ version: 1, maxHpBonus: 0.5 } as never), /maxHpBonus/);
});
