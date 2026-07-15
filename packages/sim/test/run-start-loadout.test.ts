import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RUN_START_LOADOUT,
  HERO_CATALOG,
  RUN_START_BONUS_LIMITS,
  RUN_START_LOADOUT_VERSION,
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
  const loadout = normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'benny', maxHpBonus: 20 });
  assert.deepEqual(loadout, {
    version: RUN_START_LOADOUT_VERSION,
    heroId: 'benny',
    biomeId: 'forest',
    maxHpBonus: 20,
    damageMultiplierBonus: 0,
    speedMultiplierBonus: 0,
    pickupRadiusBonus: 0,
    xpMultiplierBonus: 0,
    cooldownReductionBonus: 0,
    armorBonus: 0,
    critChanceBonus: 0,
    critMultiplierBonus: 0,
    dodgeChanceBonus: 0,
  });
  assert.ok(Object.isFrozen(loadout));
  assert.notEqual(fingerprintRunStartLoadout(loadout), fingerprintRunStartLoadout(DEFAULT_RUN_START_LOADOUT));
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'gracie', maxHpBonus: 20 })),
    fingerprintRunStartLoadout(loadout),
  );
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'benny', biomeId: 'saltwind', maxHpBonus: 20 })),
    fingerprintRunStartLoadout(loadout),
  );
  assert.notEqual(
    fingerprintRunStartLoadout(normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'benny', maxHpBonus: 21 })),
    fingerprintRunStartLoadout(loadout),
  );
});

test('rejects malformed permanent loadouts at the simulation boundary', () => {
  assert.throws(() => normalizeRunStartLoadout({ version: 2, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: 3, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: 4, maxHpBonus: 0 } as never), /version/);
  assert.throws(() => normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'otter', maxHpBonus: 0 } as never), /heroId/);
  assert.throws(() => normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: -1 } as never), /maxHpBonus/);
  assert.throws(() => normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0.5 } as never), /maxHpBonus/);
});

test('version-five loadouts without a hero retain Greg as the deterministic default', () => {
  assert.deepEqual(normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, maxHpBonus: 5 }), {
    version: RUN_START_LOADOUT_VERSION,
    heroId: 'greg',
    biomeId: 'forest',
    maxHpBonus: 5,
    damageMultiplierBonus: 0,
    speedMultiplierBonus: 0,
    pickupRadiusBonus: 0,
    xpMultiplierBonus: 0,
    cooldownReductionBonus: 0,
    armorBonus: 0,
    critChanceBonus: 0,
    critMultiplierBonus: 0,
    dodgeChanceBonus: 0,
  });
});

test('normalizeRunStartLoadout fills every omitted permanent bonus field with zero', () => {
  const loadout = normalizeRunStartLoadout({ version: RUN_START_LOADOUT_VERSION, heroId: 'greg', maxHpBonus: 0 });
  assert.equal(loadout.damageMultiplierBonus, 0);
  assert.equal(loadout.speedMultiplierBonus, 0);
  assert.equal(loadout.pickupRadiusBonus, 0);
  assert.equal(loadout.xpMultiplierBonus, 0);
  assert.equal(loadout.cooldownReductionBonus, 0);
  assert.equal(loadout.armorBonus, 0);
  assert.equal(loadout.critChanceBonus, 0);
  assert.equal(loadout.critMultiplierBonus, 0);
  assert.equal(loadout.dodgeChanceBonus, 0);
});

test('normalizeRunStartLoadout accepts valid fractional and flat integer bonuses', () => {
  const loadout = normalizeRunStartLoadout({
    version: RUN_START_LOADOUT_VERSION,
    heroId: 'greg',
    maxHpBonus: 0,
    damageMultiplierBonus: 0.3,
    speedMultiplierBonus: 0.15,
    xpMultiplierBonus: 1.5,
    cooldownReductionBonus: 0.2,
    critChanceBonus: 0.1,
    critMultiplierBonus: 0.5,
    dodgeChanceBonus: 0.05,
    armorBonus: 5,
    pickupRadiusBonus: 40,
  });
  assert.equal(loadout.damageMultiplierBonus, 0.3);
  assert.equal(loadout.speedMultiplierBonus, 0.15);
  assert.equal(loadout.xpMultiplierBonus, 1.5);
  assert.equal(loadout.cooldownReductionBonus, 0.2);
  assert.equal(loadout.critChanceBonus, 0.1);
  assert.equal(loadout.critMultiplierBonus, 0.5);
  assert.equal(loadout.dodgeChanceBonus, 0.05);
  assert.equal(loadout.armorBonus, 5);
  assert.equal(loadout.pickupRadiusBonus, 40);
});

test('normalizeRunStartLoadout throws for negative, non-finite, and out-of-limit bonuses', () => {
  const base = { version: RUN_START_LOADOUT_VERSION, heroId: 'greg' as const, maxHpBonus: 0 };
  assert.throws(
    () => normalizeRunStartLoadout({ ...base, damageMultiplierBonus: -0.1 } as never),
    /damageMultiplierBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({ ...base, speedMultiplierBonus: Number.NaN } as never),
    /speedMultiplierBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({ ...base, xpMultiplierBonus: Number.POSITIVE_INFINITY } as never),
    /xpMultiplierBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({
      ...base, damageMultiplierBonus: RUN_START_BONUS_LIMITS.damageMultiplierBonus + 0.001,
    } as never),
    /damageMultiplierBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({
      ...base, cooldownReductionBonus: RUN_START_BONUS_LIMITS.cooldownReductionBonus + 0.001,
    } as never),
    /cooldownReductionBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({
      ...base, critChanceBonus: RUN_START_BONUS_LIMITS.critChanceBonus + 0.001,
    } as never),
    /critChanceBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({ ...base, armorBonus: -1 } as never),
    /armorBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({ ...base, armorBonus: RUN_START_BONUS_LIMITS.armorBonus + 1 } as never),
    /armorBonus/,
  );
  assert.throws(
    () => normalizeRunStartLoadout({ ...base, pickupRadiusBonus: 0.5 } as never),
    /pickupRadiusBonus/,
  );
});

test('fingerprintRunStartLoadout distinguishes each new bonus field but ignores omitted-vs-explicit-zero', () => {
  const base = { version: RUN_START_LOADOUT_VERSION, heroId: 'greg' as const, maxHpBonus: 0 };
  const baseFingerprint = fingerprintRunStartLoadout(base);

  const bonusFields: Array<[keyof typeof RUN_START_BONUS_LIMITS, number]> = [
    ['damageMultiplierBonus', 0.3],
    ['speedMultiplierBonus', 0.2],
    ['pickupRadiusBonus', 10],
    ['xpMultiplierBonus', 0.4],
    ['cooldownReductionBonus', 0.1],
    ['armorBonus', 3],
    ['critChanceBonus', 0.1],
    ['critMultiplierBonus', 0.2],
    ['dodgeChanceBonus', 0.05],
  ];

  for (const [field, value] of bonusFields) {
    const fingerprint = fingerprintRunStartLoadout({ ...base, [field]: value } as never);
    assert.notEqual(fingerprint, baseFingerprint, `${field} must change the fingerprint`);
  }

  // Every field differing from every other single-field variant too.
  const fingerprints = bonusFields.map(([field, value]) =>
    fingerprintRunStartLoadout({ ...base, [field]: value } as never));
  const uniqueFingerprints = new Set(fingerprints);
  assert.equal(uniqueFingerprints.size, fingerprints.length, 'each distinct bonus field must yield a distinct fingerprint');

  // Omitted field and explicit zero must fingerprint identically.
  const explicitZero = {
    ...base,
    damageMultiplierBonus: 0,
    speedMultiplierBonus: 0,
    pickupRadiusBonus: 0,
    xpMultiplierBonus: 0,
    cooldownReductionBonus: 0,
    armorBonus: 0,
    critChanceBonus: 0,
    critMultiplierBonus: 0,
    dodgeChanceBonus: 0,
  };
  assert.equal(fingerprintRunStartLoadout(explicitZero), baseFingerprint);
});
