import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCombatDamageResolver, createCombatPresentationEventBuffer } from '../src/combat-resolution.js';
import { createRng } from '../src/rng.js';
import { createEnemyPool, createPickupPool, createPowerPickupPool } from '../src/pools.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSimulation } from '../src/simulation.js';
import {
  collectPowerPickups,
  powerPickupCapacityForXpCap,
  powerPickupKindForDeathRoll,
  spawnPowerPickup,
} from '../src/power-pickups.js';
import type { PlayerState, SimEvents } from '../src/types.js';

function player(): PlayerState {
  return {
    x: 50, y: 50, hp: 50, maxHp: 100, speed: 0, radius: 4, pickupRadius: 30,
    xp: 0, level: 1, invulnTicks: 0, alive: true,
    critChance: 0, critMultiplier: 2, dodgeChance: 0, armor: 0,
    shield: 0, shieldMax: 0, shieldRechargeDelayTicks: 0,
    shieldRechargeTicksRemaining: 0, shieldRechargePerTick: 0,
  };
}

function events(): SimEvents {
  return {
    levelUps: [], kills: 0, pickupsCollected: 0, enemiesSpawned: 0,
    enemyProjectilesFired: 0, projectilesFired: 0,
    powerPickupsCollected: 0, bombsTriggered: 0, magnetsTriggered: 0, foodCollected: 0,
  };
}

function addEnemy(enemies: ReturnType<typeof createEnemyPool>, hp: number): number {
  const slot = enemies.spawn();
  assert.notEqual(slot, -1);
  enemies.data.hp[slot] = hp;
  enemies.data.maxHp[slot] = hp;
  enemies.data.posX[slot] = 80 + slot;
  enemies.data.posY[slot] = 50;
  return slot;
}

test('Magnet collects all live XP exactly once and Food heals without overheal', () => {
  const actor = player();
  const xp = createPickupPool(4);
  const power = createPowerPickupPool(8);
  const enemies = createEnemyPool(2);
  const gameEvents = events();
  const resolver = createCombatDamageResolver({
    player: actor, rng: createRng(1), eventBuffer: createCombatPresentationEventBuffer(), getTick: () => 1,
  });
  for (const amount of [2, 3]) {
    const slot = xp.spawn();
    assert.notEqual(slot, -1);
    xp.data.xp[slot] = amount;
    xp.data.radius[slot] = 4;
  }
  assert.equal(spawnPowerPickup(power, 'magnet', actor.x, actor.y), true);
  assert.equal(spawnPowerPickup(power, 'food', actor.x, actor.y), true);

  collectPowerPickups({
    powerPickups: power,
    xpPickups: xp,
    player: actor,
    enemies,
    killEnemy(slot): void { enemies.despawn(slot); },
    combat: resolver,
    events: gameEvents,
  });

  assert.equal(actor.xp, 5);
  assert.equal(xp.data.count, 0);
  assert.equal(actor.hp, 75, 'default food restores 25% max HP');
  assert.equal(gameEvents.magnetsTriggered, 1);
  assert.equal(gameEvents.foodCollected, 1);
  assert.equal(gameEvents.pickupsCollected, 2);
});

test('Bomb kills normal enemies but applies capped max-HP damage to bosses', () => {
  const actor = player();
  const power = createPowerPickupPool(8);
  const enemies = createEnemyPool(4);
  const normal = addEnemy(enemies, 10);
  const boss = addEnemy(enemies, 100);
  const lowBoss = addEnemy(enemies, 100);
  enemies.data.hp[lowBoss] = 10;
  const gameEvents = events();
  const resolver = createCombatDamageResolver({
    player: actor, rng: createRng(2), eventBuffer: createCombatPresentationEventBuffer(), getTick: () => 2,
  });
  assert.equal(spawnPowerPickup(power, 'bomb', actor.x, actor.y), true);

  collectPowerPickups({
    powerPickups: power,
    xpPickups: createPickupPool(1),
    player: actor,
    enemies,
    killEnemy(slot): void { enemies.despawn(slot); },
    isBoss: (slot) => slot === boss || slot === lowBoss,
    combat: resolver,
    events: gameEvents,
  });

  assert.equal(enemies.data.alive[normal], 0);
  assert.equal(enemies.data.alive[boss], 1);
  assert.equal(enemies.data.hp[boss], 80);
  assert.equal(enemies.data.alive[lowBoss], 1, 'Bomb never executes a boss at low health');
  assert.equal(enemies.data.hp[lowBoss], 1, 'low-health boss keeps one health after its capped hit');
  assert.equal(gameEvents.bombsTriggered, 1);
});

test('overlapping Bomb then Magnet resolves by token priority, not sparse pool slot order', () => {
  const actor = player();
  const xp = createPickupPool(4);
  const power = createPowerPickupPool(8);
  const enemies = createEnemyPool(2);
  const normal = addEnemy(enemies, 10);
  const gameEvents = events();
  const resolver = createCombatDamageResolver({
    player: actor, rng: createRng(2), eventBuffer: createCombatPresentationEventBuffer(), getTick: () => 2,
  });
  // Allocate Magnet first so this test proves collection is not raw slot order.
  assert.equal(spawnPowerPickup(power, 'magnet', actor.x, actor.y), true);
  assert.equal(spawnPowerPickup(power, 'bomb', actor.x, actor.y), true);

  collectPowerPickups({
    powerPickups: power,
    xpPickups: xp,
    player: actor,
    enemies,
    killEnemy(slot): void {
      enemies.despawn(slot);
      const xpSlot = xp.spawn();
      assert.notEqual(xpSlot, -1);
      xp.data.xp[xpSlot] = 7;
      xp.data.radius[xpSlot] = 4;
    },
    combat: resolver,
    events: gameEvents,
  });

  assert.equal(enemies.data.alive[normal], 0);
  assert.equal(xp.data.count, 0, 'Magnet vacuums XP created by the same-tick Bomb');
  assert.equal(actor.xp, 7);
});

test('death-drop table and separate power-pickup capacity are deterministic and bounded', () => {
  assert.equal(powerPickupCapacityForXpCap(1), 8);
  assert.equal(powerPickupCapacityForXpCap(300), 19);
  assert.equal(powerPickupCapacityForXpCap(10_000), 32);
  assert.equal(powerPickupKindForDeathRoll(0), 'bomb');
  assert.equal(powerPickupKindForDeathRoll(4), 'magnet');
  assert.equal(powerPickupKindForDeathRoll(12), 'food');
  assert.equal(powerPickupKindForDeathRoll(32), null);
  assert.equal(powerPickupKindForDeathRoll(999, true), 'magnet');
});

test('a normal deterministic enemy death can spawn and collect a real bounded world token', () => {
  const sim = createSimulation({ ...DEFAULT_CONFIG, waves: [] }, 385);
  const slot = sim.enemies.spawn();
  assert.notEqual(slot, -1);
  const data = sim.enemies.data;
  data.posX[slot] = sim.player.x + 5;
  data.posY[slot] = sim.player.y;
  data.velX[slot] = 0;
  data.velY[slot] = 0;
  data.hp[slot] = 1;
  data.maxHp[slot] = 1;
  data.speed[slot] = 0;
  data.radius[slot] = 1;
  data.touchDamage[slot] = 0;
  data.contactCooldown[slot] = 0;
  data.zoneDamageCooldown[slot] = 0;
  data.archetype[slot] = 0;
  data.xpDrop[slot] = 1;
  data.marked[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), data.posX[slot]!, data.posY[slot]!);

  const tickEvents = sim.step({ moveX: 0, moveY: 0, paused: false });
  assert.equal(tickEvents.kills, 1);
  assert.equal(tickEvents.bombsTriggered, 1, 'seeded death table emits a real Bomb in normal simulation flow');
  assert.equal(tickEvents.powerPickupsCollected, 1, 'the nearby world token is collected through the normal pickup pass');
  assert.ok(sim.combatPresentationEvents.some((event) => event.pickupKind === 'bomb'));
});
