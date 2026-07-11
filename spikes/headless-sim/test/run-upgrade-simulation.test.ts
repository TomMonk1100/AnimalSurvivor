import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CONFIG,
  UNIVERSAL_UPGRADE_CATALOG,
  createSimulation,
  runReplay,
  type SimConfig,
  type Simulation,
} from '../src/index.js';

const QUIET_UPGRADE_CONFIG: SimConfig = {
  ...DEFAULT_CONFIG,
  waves: [],
  xpThresholds: [0],
};

function startUniversalRun(offerCount = 3): Simulation {
  const sim = createSimulation(QUIET_UPGRADE_CONFIG, 71, {
    universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
    traitOfferCount: offerCount,
  });
  sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(sim.upgradeSelectionPending, true);
  return sim;
}

function addStationaryEnemy(sim: Simulation, distance = 100): void {
  const slot = sim.enemies.spawn();
  assert.notEqual(slot, -1);
  const data = sim.enemies.data;
  data.posX[slot] = sim.player.x + distance;
  data.posY[slot] = sim.player.y;
  data.hp[slot] = 100;
  data.maxHp[slot] = 100;
  data.speed[slot] = 0;
  data.radius[slot] = 6;
  data.touchDamage[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), data.posX[slot]!, data.posY[slot]!);
}

test('universal cards change the authoritative player stats and make XP Magnet physically pull motes', () => {
  const magnet = startUniversalRun();
  assert.deepEqual(magnet.pendingUpgradeOffers.map((offer) => offer.id), [
    'universal:swift-paws', 'universal:xp-magnet', 'universal:sturdy-hide',
  ]);
  assert.deepEqual(magnet.selectUpgrade('universal:xp-magnet'), {
    tick: 1, kind: 'universal', id: 'universal:xp-magnet',
  });
  assert.equal(magnet.player.pickupRadius, DEFAULT_CONFIG.player.pickupRadius + 10);

  const pickupSlot = magnet.pickups.spawn();
  assert.notEqual(pickupSlot, -1);
  magnet.pickups.data.posX[pickupSlot] = magnet.player.x + 60;
  magnet.pickups.data.posY[pickupSlot] = magnet.player.y;
  magnet.pickups.data.xp[pickupSlot] = 1;
  magnet.pickups.data.radius[pickupSlot] = 4;
  const pickupId = magnet.pickups.idOf(pickupSlot);
  for (let tick = 0; tick < 3; tick++) magnet.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(magnet.pickups.isLive(pickupId), false, 'mote moves into collection range instead of teleporting XP');
  assert.equal(magnet.player.xp, 1);

  const hide = startUniversalRun();
  hide.selectUpgrade('universal:sturdy-hide');
  assert.equal(hide.player.maxHp, DEFAULT_CONFIG.player.maxHp + 15);
  assert.equal(hide.player.hp, DEFAULT_CONFIG.player.maxHp + 15, 'health gain is immediately usable');

  const swift = startUniversalRun();
  swift.selectUpgrade('universal:swift-paws');
  assert.equal(swift.player.speed, DEFAULT_CONFIG.player.speed * 1.08);
});

test('sharpened instinct changes real projectile damage and universal selections replay exactly', () => {
  const sim = startUniversalRun(4);
  assert.ok(sim.pendingUpgradeOffers.some((offer) => offer.id === 'universal:sharpened-instinct'));
  sim.selectUpgrade('universal:sharpened-instinct');
  const replay = sim.getReplay();
  const replayHash = sim.hash();
  assert.equal(replay.universalUpgradeCatalogFingerprint === null, false);
  assert.deepEqual(runReplay(QUIET_UPGRADE_CONFIG, replay, {
    universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
    traitOfferCount: 4,
  }), { finalHash: replayHash, ticks: sim.tick });
  assert.throws(() => runReplay(QUIET_UPGRADE_CONFIG, replay), /universal upgrade catalog fingerprint mismatch/);

  // Directly seeded test data is intentionally outside replay recording; use it
  // only for the physical projectile assertion after replay parity is proven.
  addStationaryEnemy(sim);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(sim.projectiles.data.count, 1);
  assert.ok(Math.abs(sim.projectiles.data.damage[0]! - DEFAULT_CONFIG.weapon.damage * 1.12) < 1e-5);
});

test('Rapid Instinct and Growth change real attack cadence and collected XP', () => {
  const rapid = startUniversalRun(6);
  rapid.selectUpgrade('universal:rapid-instinct');
  addStationaryEnemy(rapid, 340);
  rapid.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(rapid.projectiles.data.count, 1);
  for (let tick = 0; tick < 17; tick++) rapid.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(rapid.projectiles.data.count, 1);
  rapid.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(rapid.projectiles.data.count, 2, 'rank-one cooldown reduction lowers the 20-tick cadence to 18 ticks');

  const growth = startUniversalRun(6);
  growth.selectUpgrade('universal:growth');
  const pickupSlot = growth.pickups.spawn();
  assert.notEqual(pickupSlot, -1);
  growth.pickups.data.posX[pickupSlot] = growth.player.x;
  growth.pickups.data.posY[pickupSlot] = growth.player.y;
  growth.pickups.data.xp[pickupSlot] = 5;
  growth.pickups.data.radius[pickupSlot] = 1;
  growth.step({ moveX: 0, moveY: 0, paused: false });
  assert.ok(Math.abs(growth.player.xp - 5.6) < 1e-9);
});

test('permanent starting vitality is applied at startup and replay rejects a mismatched loadout', () => {
  const loadout = { version: 1 as const, maxHpBonus: 20 };
  const sim = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 55, { runStartLoadout: loadout });
  assert.equal(sim.player.maxHp, DEFAULT_CONFIG.player.maxHp + 20);
  assert.equal(sim.player.hp, DEFAULT_CONFIG.player.maxHp + 20);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const replay = sim.getReplay();
  assert.deepEqual(runReplay({ ...DEFAULT_CONFIG, waves: [] }, replay, { runStartLoadout: loadout }), {
    finalHash: sim.hash(), ticks: sim.tick,
  });
  assert.throws(() => runReplay({ ...DEFAULT_CONFIG, waves: [] }, replay), /run start loadout fingerprint mismatch/);
});
