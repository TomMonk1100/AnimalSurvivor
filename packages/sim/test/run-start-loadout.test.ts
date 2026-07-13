import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RUN_START_LOADOUT,
  HERO_CATALOG,
  fingerprintRunStartLoadout,
  getHeroBasicAttackDefinition,
  normalizeRunStartLoadout,
} from '../src/run-start-loadout.js';

test('each founding hero owns a distinct authored basic attack', () => {
  const attacks = HERO_CATALOG.map((hero) => getHeroBasicAttackDefinition(hero.basicAttackId));
  assert.deepEqual(attacks.map((attack) => attack.id), [
    'greg-auto-fire', 'benny-brace-burst', 'gracie-keen-dart',
  ]);
  assert.equal(attacks[0]?.pattern, 'single');
  assert.equal(attacks[1]?.pattern, 'spread');
  assert.equal(attacks[2]?.targeting, 'highestHealth');
});

test('normalizes immutable permanent loadouts and fingerprints their actual effects', () => {
  const loadout = normalizeRunStartLoadout({ version: 3, heroId: 'benny', maxHpBonus: 20 });
  assert.deepEqual(loadout, { version: 3, heroId: 'benny', biomeId: 'forest', maxHpBonus: 20 });
  assert.ok(Object.isFrozen(loadout));
  assert.notEqual(fingerprintRunStartLoadout(loadout), fingerprintRunStartLoadout(DEFAULT_RUN_START_LOADOUT));
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: 3, heroId: 'gracie', maxHpBonus: 20 })),
    fingerprintRunStartLoadout(loadout),
  );
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: 3, heroId: 'benny', biomeId: 'saltwind', maxHpBonus: 20 })),
    fingerprintRunStartLoadout(loadout),
  );
});

test('rejects malformed permanent loadouts at the simulation boundary', () => {
  assert.throws(() => normalizeRunStartLoadout({ version: 2, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: 3, heroId: 'otter', maxHpBonus: 0 } as never), /heroId/);
  assert.throws(() => normalizeRunStartLoadout({ version: 3, heroId: 'greg', maxHpBonus: -1 } as never), /maxHpBonus/);
  assert.throws(() => normalizeRunStartLoadout({ version: 3, heroId: 'greg', maxHpBonus: 0.5 } as never), /maxHpBonus/);
});

test('legacy-shaped version-three loadouts normalize to Greg', () => {
  assert.deepEqual(normalizeRunStartLoadout({ version: 3, maxHpBonus: 5 }), {
    version: 3,
    heroId: 'greg',
    biomeId: 'forest',
    maxHpBonus: 5,
  });
});
