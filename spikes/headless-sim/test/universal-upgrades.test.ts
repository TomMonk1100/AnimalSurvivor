import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GROWTH,
  HERO_BASIC_ATTACK_UPGRADES,
  RAPID_INSTINCT,
  SHARPENED_INSTINCT,
  STURDY_HIDE,
  SWIFT_PAWS,
  UNIVERSAL_UPGRADE_CATALOG,
  XP_MAGNET,
  applyUniversalUpgrade,
  availableUniversalUpgradeOffers,
  createUniversalUpgradeState,
  fingerprintUniversalUpgradeCatalog,
  getUniversalUpgradeCatalogForHero,
  resolveUniversalUpgradeStats,
  universalUpgradeRank,
  validateUniversalUpgradeCatalog,
  validateUniversalUpgradeState,
  type UniversalUpgradeCatalog,
} from '../src/universal-upgrades.js';

function applyRanks(id: string, count: number) {
  let state = createUniversalUpgradeState();
  for (let rank = 0; rank < count; rank++) {
    const result = applyUniversalUpgrade(UNIVERSAL_UPGRADE_CATALOG, state, id);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected an applicable upgrade');
    state = result.state;
  }
  return state;
}

test('ships six immutable, rank-capped universal upgrades', () => {
  assert.deepEqual(
    UNIVERSAL_UPGRADE_CATALOG.map((definition) => definition.id),
    ['swift-paws', 'xp-magnet', 'sturdy-hide', 'sharpened-instinct', 'rapid-instinct', 'growth'],
  );
  assert.ok(Object.isFrozen(UNIVERSAL_UPGRADE_CATALOG));
  for (const definition of UNIVERSAL_UPGRADE_CATALOG) {
    assert.equal(definition.repeatable, true);
    assert.equal(definition.maxRank, 5);
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.effect));
  }
});

test('offers are catalog ordered, rank once per selection, and disappear only at cap', () => {
  let state = createUniversalUpgradeState();
  assert.deepEqual(
    availableUniversalUpgradeOffers(UNIVERSAL_UPGRADE_CATALOG, state).map((offer) => offer.id),
    ['swift-paws', 'xp-magnet', 'sturdy-hide', 'sharpened-instinct', 'rapid-instinct', 'growth'],
  );

  for (let rank = 1; rank <= SWIFT_PAWS.maxRank; rank++) {
    const result = applyUniversalUpgrade(UNIVERSAL_UPGRADE_CATALOG, state, SWIFT_PAWS.id);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected Swift Paws to remain applicable');
    assert.equal(result.previousRank, rank - 1);
    assert.equal(result.rank, rank);
    assert.equal(universalUpgradeRank(UNIVERSAL_UPGRADE_CATALOG, result.state, SWIFT_PAWS.id), rank);
    state = result.state;
  }

  assert.deepEqual(
    availableUniversalUpgradeOffers(UNIVERSAL_UPGRADE_CATALOG, state).map((offer) => offer.id),
    ['xp-magnet', 'sturdy-hide', 'sharpened-instinct', 'rapid-instinct', 'growth'],
  );
  const capped = applyUniversalUpgrade(UNIVERSAL_UPGRADE_CATALOG, state, SWIFT_PAWS.id);
  assert.deepEqual(capped, { ok: false, reason: 'maxed', state, id: 'swift-paws', rank: 5 });
});

test('application is immutable and unknown choices are atomically rejected', () => {
  const initial = createUniversalUpgradeState();
  const applied = applyUniversalUpgrade(UNIVERSAL_UPGRADE_CATALOG, initial, XP_MAGNET.id);
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error('expected XP Magnet to apply');
  assert.notEqual(applied.state, initial);
  assert.deepEqual(initial.ranks, [0, 0, 0, 0, 0, 0]);
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial.ranks));
  assert.ok(Object.isFrozen(applied.state));
  assert.ok(Object.isFrozen(applied.state.ranks));

  const rejected = applyUniversalUpgrade(UNIVERSAL_UPGRADE_CATALOG, applied.state, 'not-a-real-upgrade');
  assert.deepEqual(rejected, {
    ok: false,
    reason: 'unknownUpgrade',
    state: applied.state,
    id: 'not-a-real-upgrade',
    rank: null,
  });
});

test('projects concrete truthful stat effects from the six independent ranks', () => {
  let state = createUniversalUpgradeState();
  for (const [id, count] of [
    [SWIFT_PAWS.id, 2],
    [XP_MAGNET.id, 3],
    [STURDY_HIDE.id, 4],
    [SHARPENED_INSTINCT.id, 5],
    [RAPID_INSTINCT.id, 2],
    [GROWTH.id, 3],
  ] as const) {
    for (let rank = 0; rank < count; rank++) {
      const result = applyUniversalUpgrade(UNIVERSAL_UPGRADE_CATALOG, state, id);
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error(`expected ${id} to apply`);
      state = result.state;
    }
  }

  const stats = resolveUniversalUpgradeStats(UNIVERSAL_UPGRADE_CATALOG, state);
  assert.deepEqual({ ...stats, xpMultiplier: 0 }, {
    speedMultiplier: 1.16,
    pickupRadiusBonus: 30,
    pickupAttractionRadius: 240,
    pickupAttractionSpeed: 360,
    maxHpBonus: 60,
    weaponDamageMultiplier: 1.6,
    weaponCooldownMultiplier: 0.84,
    xpMultiplier: 0,
    basicAttackDamageMultiplier: 1,
    basicAttackCooldownMultiplier: 1,
    basicAttackProjectileCountBonus: 0,
    basicAttackPierceBonus: 0,
    basicAttackRangeBonus: 0,
  });
  assert.ok(Math.abs(stats.xpMultiplier - 1.36) < 1e-12);
});

test('catalog fingerprints include authored effect values and reject mismatched state', () => {
  const baseFingerprint = fingerprintUniversalUpgradeCatalog();
  const alteredCatalog: UniversalUpgradeCatalog = [
    {
      ...SWIFT_PAWS,
      effect: { kind: 'speedMultiplier', bonusPerRank: 0.09 },
    },
    XP_MAGNET,
    STURDY_HIDE,
    SHARPENED_INSTINCT,
    RAPID_INSTINCT,
    GROWTH,
  ];
  validateUniversalUpgradeCatalog(alteredCatalog);
  assert.notEqual(fingerprintUniversalUpgradeCatalog(alteredCatalog), baseFingerprint);

  const state = applyRanks(SWIFT_PAWS.id, 1);
  assert.throws(
    () => validateUniversalUpgradeState(alteredCatalog, state),
    /catalog fingerprint mismatch/,
  );
});

test('selected hero catalog exposes only that hero mastery and projects its authored path', () => {
  const catalog = getUniversalUpgradeCatalogForHero('greg');
  assert.equal(catalog.at(-1)?.id, HERO_BASIC_ATTACK_UPGRADES[0]?.id);
  assert.equal(catalog.some((definition) => definition.id === HERO_BASIC_ATTACK_UPGRADES[1]?.id), false);
  let state = createUniversalUpgradeState(catalog);
  for (let rank = 0; rank < 3; rank++) {
    const result = applyUniversalUpgrade(catalog, state, 'basic-attack:greg-precision');
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected Greg mastery to remain applicable');
    state = result.state;
  }
  const stats = resolveUniversalUpgradeStats(catalog, state);
  assert.equal(stats.basicAttackDamageMultiplier, 1.3);
  assert.equal(stats.basicAttackCooldownMultiplier, 0.88);
  assert.equal(stats.basicAttackPierceBonus, 1);
  assert.equal(stats.basicAttackProjectileCountBonus, 0);
});

test('validates rank state before projection instead of silently accepting malformed saves', () => {
  const state = createUniversalUpgradeState();
  const malformed = {
    catalogFingerprint: state.catalogFingerprint,
    ranks: [0, 0, 0, 0, 0, 99],
  };
  assert.throws(
    () => resolveUniversalUpgradeStats(UNIVERSAL_UPGRADE_CATALOG, malformed),
    /out of range/,
  );
});
