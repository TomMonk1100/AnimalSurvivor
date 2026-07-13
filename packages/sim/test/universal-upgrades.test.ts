import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GROWTH,
  HERO_BASIC_ATTACK_UPGRADES,
  HERO_DEFENSIVE_UPGRADES,
  KEEN_EYE,
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

function applyRanks(
  id: string,
  count: number,
  catalog: UniversalUpgradeCatalog = UNIVERSAL_UPGRADE_CATALOG,
) {
  let state = createUniversalUpgradeState(catalog);
  for (let rank = 0; rank < count; rank++) {
    const result = applyUniversalUpgrade(catalog, state, id);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected an applicable upgrade');
    state = result.state;
  }
  return state;
}

test('ships seven immutable, rank-capped universal upgrades including Mote Draw and Keen Eye', () => {
  assert.deepEqual(
    UNIVERSAL_UPGRADE_CATALOG.map((definition) => definition.id),
    ['swift-paws', 'xp-magnet', 'sturdy-hide', 'sharpened-instinct', 'rapid-instinct', 'growth', 'keen-eye'],
  );
  assert.equal(XP_MAGNET.title, 'Mote Draw');
  assert.equal(KEEN_EYE.title, 'Keen Eye');
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
    ['swift-paws', 'xp-magnet', 'sturdy-hide', 'sharpened-instinct', 'rapid-instinct', 'growth', 'keen-eye'],
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
    ['xp-magnet', 'sturdy-hide', 'sharpened-instinct', 'rapid-instinct', 'growth', 'keen-eye'],
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
  assert.deepEqual(initial.ranks, [0, 0, 0, 0, 0, 0, 0]);
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

test('projects concrete truthful stat effects from the seven independent ranks', () => {
  let state = createUniversalUpgradeState();
  for (const [id, count] of [
    [SWIFT_PAWS.id, 2],
    [XP_MAGNET.id, 3],
    [STURDY_HIDE.id, 4],
    [SHARPENED_INSTINCT.id, 5],
    [RAPID_INSTINCT.id, 2],
    [GROWTH.id, 3],
    [KEEN_EYE.id, 2],
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
    critChanceBonus: 0.06,
    dodgeChanceBonus: 0,
    armorBonus: 0,
    shieldMaxBonus: 0,
    shieldRechargePerTickBonus: 0,
    basicAttackDamageMultiplier: 1,
    basicAttackCooldownMultiplier: 1,
    basicAttackProjectileCountBonus: 0,
    basicAttackPierceBonus: 0,
    basicAttackRangeBonus: 0,
    basicAttackMasteryRank: 0,
  });
  assert.ok(Math.abs(stats.xpMultiplier - 1.36) < 1e-12);
});

test('catalog fingerprints include Keen Eye authored effect values and reject mismatched state', () => {
  const baseFingerprint = fingerprintUniversalUpgradeCatalog();
  const alteredCatalog: UniversalUpgradeCatalog = [
    SWIFT_PAWS,
    XP_MAGNET,
    STURDY_HIDE,
    SHARPENED_INSTINCT,
    RAPID_INSTINCT,
    GROWTH,
    { ...KEEN_EYE, effect: { kind: 'critChance', bonusPerRank: 0.04 } },
  ];
  validateUniversalUpgradeCatalog(alteredCatalog);
  assert.notEqual(fingerprintUniversalUpgradeCatalog(alteredCatalog), baseFingerprint);

  const state = applyRanks(SWIFT_PAWS.id, 1);
  assert.throws(
    () => validateUniversalUpgradeState(alteredCatalog, state),
    /catalog fingerprint mismatch/,
  );
});

test('selected hero catalog exposes only that hero Mastery plus defense and projects rank five', () => {
  const catalog = getUniversalUpgradeCatalogForHero('greg');
  assert.equal(catalog.at(-2)?.id, HERO_BASIC_ATTACK_UPGRADES[0]?.id);
  assert.equal(catalog.at(-1)?.id, HERO_DEFENSIVE_UPGRADES[0]?.id);
  assert.equal(catalog.some((definition) => definition.id === HERO_BASIC_ATTACK_UPGRADES[1]?.id), false);
  assert.equal(catalog.some((definition) => definition.id === HERO_DEFENSIVE_UPGRADES[1]?.id), false);
  assert.match(HERO_BASIC_ATTACK_UPGRADES[0]!.description, /Master/);
  const state = applyRanks('basic-attack:greg-precision', 5, catalog);
  const stats = resolveUniversalUpgradeStats(catalog, state);
  assert.equal(stats.basicAttackMasteryRank, 5);
  assert.equal(stats.basicAttackDamageMultiplier, 1.55);
  assert.equal(stats.basicAttackCooldownMultiplier, 0.8);
  assert.equal(stats.basicAttackRangeBonus, 25);
  assert.equal(stats.basicAttackPierceBonus, 0);
  assert.equal(stats.basicAttackProjectileCountBonus, 0);
  assert.deepEqual(
    applyUniversalUpgrade(catalog, state, 'basic-attack:greg-precision'),
    { ok: false, reason: 'maxed', state, id: 'basic-attack:greg-precision', rank: 5 },
  );
});

test('hero defensive cards project the authored rank-five V1.1 stat paths', () => {
  const greg = resolveUniversalUpgradeStats(
    getUniversalUpgradeCatalogForHero('greg'),
    applyRanks('hero-trait:greg-clever-footwork', 5, getUniversalUpgradeCatalogForHero('greg')),
  );
  assert.equal(greg.dodgeChanceBonus, 0.25);

  const benny = resolveUniversalUpgradeStats(
    getUniversalUpgradeCatalogForHero('benny'),
    applyRanks('hero-trait:benny-thick-skin', 5, getUniversalUpgradeCatalogForHero('benny')),
  );
  assert.equal(benny.armorBonus, 75);

  const gracie = resolveUniversalUpgradeStats(
    getUniversalUpgradeCatalogForHero('gracie'),
    applyRanks('hero-trait:gracie-fluffy-shield', 5, getUniversalUpgradeCatalogForHero('gracie')),
  );
  assert.equal(gracie.shieldMaxBonus, 50);
  assert.equal(gracie.shieldRechargePerTickBonus, 0.2);
});

test('validates rank state before projection instead of silently accepting malformed saves', () => {
  const state = createUniversalUpgradeState();
  const malformed = {
    catalogFingerprint: state.catalogFingerprint,
    ranks: [0, 0, 0, 0, 0, 0, 99],
  };
  assert.throws(
    () => resolveUniversalUpgradeStats(UNIVERSAL_UPGRADE_CATALOG, malformed),
    /out of range/,
  );
});
