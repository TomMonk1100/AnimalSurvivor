import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RUN_START_LOADOUT,
  HERO_CATALOG,
  fingerprintRunStartLoadout,
  getHeroBasicAttackDefinition,
  normalizeRunStartLoadout,
} from '../src/run-start-loadout.js';

test('each founding hero owns a distinct V1.1 starter attack and defensive baseline', () => {
  const attacks = HERO_CATALOG.map((hero) => getHeroBasicAttackDefinition(hero.basicAttackId));
  assert.deepEqual(attacks.map((attack) => ({
    id: attack.id,
    title: attack.title,
    pattern: attack.pattern,
    targeting: attack.targeting,
  })), [
    { id: 'greg-auto-fire', title: 'Fox Swipe', pattern: 'meleeArc', targeting: 'nearest' },
    { id: 'benny-brace-burst', title: 'Trample', pattern: 'groundWave', targeting: 'nearest' },
    { id: 'gracie-keen-dart', title: 'Spit Volley', pattern: 'projectile', targeting: 'highestHealth' },
  ]);
  assert.deepEqual(attacks.map((attack) => ({
    projectileCount: attack.projectileCount,
    arcRadians: attack.arcRadians,
    groundWaveCount: attack.groundWaveCount,
    groundWaveSpacingTicks: attack.groundWaveSpacingTicks,
  })), [
    { projectileCount: 0, arcRadians: 1.72, groundWaveCount: 0, groundWaveSpacingTicks: 0 },
    { projectileCount: 0, arcRadians: 0, groundWaveCount: 2, groundWaveSpacingTicks: 7 },
    { projectileCount: 1, arcRadians: 0, groundWaveCount: 0, groundWaveSpacingTicks: 0 },
  ]);
  assert.deepEqual(HERO_CATALOG.map((hero) => ({
    id: hero.id,
    critChance: hero.critChance,
    dodgeChance: hero.dodgeChance,
    armor: hero.armor,
    shieldMax: hero.shieldMax,
    meleeDamageMultiplier: hero.meleeDamageMultiplier,
  })), [
    { id: 'greg', critChance: 0.05, dodgeChance: 0.08, armor: 0, shieldMax: 0, meleeDamageMultiplier: 1.22 },
    { id: 'benny', critChance: 0.05, dodgeChance: 0, armor: 20, shieldMax: 0, meleeDamageMultiplier: 1 },
    { id: 'gracie', critChance: 0.05, dodgeChance: 0, armor: 0, shieldMax: 34, meleeDamageMultiplier: 1 },
  ]);
});

test('normalizes immutable permanent loadouts and fingerprints their actual effects', () => {
  const loadout = normalizeRunStartLoadout({ version: 4, heroId: 'benny', maxHpBonus: 20 });
  assert.deepEqual(loadout, { version: 4, heroId: 'benny', biomeId: 'forest', maxHpBonus: 20 });
  assert.ok(Object.isFrozen(loadout));
  assert.notEqual(fingerprintRunStartLoadout(loadout), fingerprintRunStartLoadout(DEFAULT_RUN_START_LOADOUT));
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: 4, heroId: 'gracie', maxHpBonus: 20 })),
    fingerprintRunStartLoadout(loadout),
  );
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: 4, heroId: 'benny', biomeId: 'saltwind', maxHpBonus: 20 })),
    fingerprintRunStartLoadout(loadout),
  );
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: 4, heroId: 'benny', maxHpBonus: 21 })),
    fingerprintRunStartLoadout(loadout),
  );
});

test('rejects malformed permanent loadouts at the simulation boundary', () => {
  assert.throws(() => normalizeRunStartLoadout({ version: 2, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: 3, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: 4, heroId: 'otter', maxHpBonus: 0 } as never), /heroId/);
  assert.throws(() => normalizeRunStartLoadout({ version: 4, heroId: 'greg', maxHpBonus: -1 } as never), /maxHpBonus/);
  assert.throws(() => normalizeRunStartLoadout({ version: 4, heroId: 'greg', maxHpBonus: 0.5 } as never), /maxHpBonus/);
});

test('version-four loadouts without a hero retain Greg as the deterministic default', () => {
  assert.deepEqual(normalizeRunStartLoadout({ version: 4, maxHpBonus: 5 }), {
    version: 4,
    heroId: 'greg',
    biomeId: 'forest',
    maxHpBonus: 5,
  });
});
