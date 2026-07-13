import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnemyPool, createZonePool } from '../src/pools.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSpatialGrid } from '../src/spatial-grid.js';
import { createSimulation } from '../src/simulation.js';
import { createZoneStepper, ZONE_TAG, zoneTagFromCommandTag } from '../src/zones.js';

function addEnemy(
  enemies: ReturnType<typeof createEnemyPool>,
  grid: ReturnType<typeof createSpatialGrid>,
  x: number,
  y: number,
  hp: number,
): number {
  const slot = enemies.spawn();
  assert.notEqual(slot, -1);
  const data = enemies.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.hp[slot] = hp;
  data.maxHp[slot] = hp;
  data.velX[slot] = 9;
  data.velY[slot] = -3;
  grid.insert(enemies.idOf(slot), x, y);
  return slot;
}

function addZone(
  zones: ReturnType<typeof createZonePool>,
  x: number,
  y: number,
  radius: number,
  damage: number,
  lifetime: number,
  intervalTicks: number,
  tag: number = ZONE_TAG.geckoPad,
): number {
  const slot = zones.spawn();
  assert.notEqual(slot, -1);
  const data = zones.data;
  data.posX[slot] = x;
  data.posY[slot] = y;
  data.radius[slot] = radius;
  data.damage[slot] = damage;
  data.lifetime[slot] = lifetime;
  data.intervalTicks[slot] = intervalTicks;
  data.pulseCooldown[slot] = 0;
  data.tag[slot] = tag;
  return slot;
}

test('zone pulses in fixed cadence, expires deterministically, and never changes movement state', () => {
  const zones = createZonePool(2);
  const enemies = createEnemyPool(4);
  const grid = createSpatialGrid(200, 200, 25, 4);
  const enemy = addEnemy(enemies, grid, 10, 0, 10);
  const zone = addZone(zones, 0, 0, 20, 4, 4, 2);
  const stepper = createZoneStepper();
  const context = {
    enemies,
    enemyGrid: grid,
    killEnemy(slot: number): void {
      grid.remove(enemies.idOf(slot));
      enemies.despawn(slot);
    },
  };

  const first = stepper.step(zones, context);
  assert.deepEqual(first, {
    zonesStepped: 1, zonesExpired: 0, pulses: 1, areaDamageHits: 1, enemiesKilled: 0,
  });
  assert.equal(enemies.data.hp[enemy], 6);
  assert.equal(enemies.data.zoneDamageCooldown[enemy], 2);
  assert.equal(zones.data.lifetime[zone], 3);
  assert.equal(zones.data.pulseCooldown[zone], 1);
  assert.equal(enemies.data.velX[enemy], 9, 'damage pads do not slow or otherwise alter velocity');
  assert.equal(enemies.data.velY[enemy], -3, 'damage pads do not slow or otherwise alter velocity');

  const second = stepper.step(zones, context);
  assert.equal(second.pulses, 0);
  assert.equal(enemies.data.hp[enemy], 6);
  assert.equal(enemies.data.zoneDamageCooldown[enemy], 1);
  assert.equal(zones.data.pulseCooldown[zone], 0);

  const third = stepper.step(zones, context);
  assert.equal(third.pulses, 1);
  assert.equal(enemies.data.hp[enemy], 2);
  assert.equal(enemies.data.zoneDamageCooldown[enemy], 2);

  const fourth = stepper.step(zones, context);
  assert.equal(fourth.zonesExpired, 1);
  assert.equal(zones.data.count, 0);
});

test('overlapping zones deal one deterministic hit per target at the winning pad cadence', () => {
  const zones = createZonePool(2);
  const enemies = createEnemyPool(4);
  const grid = createSpatialGrid(200, 200, 25, 4);
  const enemy = addEnemy(enemies, grid, 5, 0, 20);
  // The lower-slot Gecko pad wins when both zones pulse together. The faster
  // Razorstep pad still pulses at ticks 8 and 16, but cannot multiply damage
  // before Gecko's authored 24-tick cadence window completes.
  addZone(zones, 0, 0, 20, 3, 30, 24, ZONE_TAG.geckoPad);
  addZone(zones, 0, 0, 20, 4, 30, 8, ZONE_TAG.razorstepScythePad);
  const killedSlots: number[] = [];
  const stepper = createZoneStepper();
  const context = {
    enemies,
    enemyGrid: grid,
    killEnemy(slot: number): void {
      killedSlots.push(slot);
      grid.remove(enemies.idOf(slot));
      enemies.despawn(slot);
    },
  };

  const first = stepper.step(zones, context);
  assert.equal(first.pulses, 2);
  assert.equal(first.areaDamageHits, 1, 'same-tick overlapping pads cannot stack their damage');
  assert.equal(first.enemiesKilled, 0);
  assert.equal(enemies.data.hp[enemy], 17, 'fixed slot order selects the Gecko pad damage');
  assert.equal(enemies.data.zoneDamageCooldown[enemy], 24);

  for (let tick = 1; tick < 24; tick++) {
    const stats = stepper.step(zones, context);
    assert.equal(stats.areaDamageHits, 0, `Razorstep pulse at tick ${tick} cannot bypass the target cooldown`);
  }

  const nextGeckoPulse = stepper.step(zones, context);
  assert.equal(nextGeckoPulse.pulses, 2, 'both authored pads still pulse on their normal shared tick');
  assert.equal(nextGeckoPulse.areaDamageHits, 1, 'the target accepts only one overlapping zone hit');
  assert.equal(enemies.data.hp[enemy], 14);
  assert.equal(enemies.data.zoneDamageCooldown[enemy], 24);
  assert.deepEqual(killedSlots, []);
  assert.equal(enemies.data.count, 1);
  assert.notEqual(grid.nearest(5, 0, 1), -1);
});

test('single Gecko and Razorstep pads retain authored 24/18/14/8-tick cadences', () => {
  for (const intervalTicks of [24, 18, 14, 8]) {
    const zones = createZonePool(1);
    const enemies = createEnemyPool(1);
    const grid = createSpatialGrid(200, 200, 25, 1);
    const enemy = addEnemy(enemies, grid, 5, 0, 20);
    addZone(zones, 0, 0, 20, 1, intervalTicks * 2 + 1, intervalTicks);
    const stepper = createZoneStepper();
    const hitTicks: number[] = [];

    for (let tick = 0; tick <= intervalTicks * 2; tick++) {
      const stats = stepper.step(zones, {
        enemies,
        enemyGrid: grid,
        killEnemy(slot): void {
          grid.remove(enemies.idOf(slot));
          enemies.despawn(slot);
        },
      });
      if (stats.areaDamageHits > 0) hitTicks.push(tick);
    }

    assert.deepEqual(hitTicks, [0, intervalTicks, intervalTicks * 2], `interval ${intervalTicks}`);
    assert.equal(enemies.data.hp[enemy], 17, `interval ${intervalTicks} keeps every authored pulse`);
  }
});

test('per-enemy zone damage cooldown participates in the canonical simulation hash', () => {
  const sim = createSimulation(DEFAULT_CONFIG, 717);
  const enemy = sim.enemies.spawn();
  assert.notEqual(enemy, -1);
  const before = sim.hash();

  sim.enemies.data.zoneDamageCooldown[enemy] = 8;
  assert.notEqual(sim.hash(), before);
});

test('authored Gecko/Razorstep tags map to stable compact roles', () => {
  assert.equal(zoneTagFromCommandTag('gecko-pad'), ZONE_TAG.geckoPad);
  assert.equal(zoneTagFromCommandTag('sticky-trail'), ZONE_TAG.geckoPad);
  assert.equal(zoneTagFromCommandTag('razorstep-scythe-pad'), ZONE_TAG.razorstepScythePad);
  assert.equal(zoneTagFromCommandTag('stink-cloud'), ZONE_TAG.stinkCloud);
  assert.equal(zoneTagFromCommandTag('royal-stink'), ZONE_TAG.royalStink);
  assert.equal(zoneTagFromCommandTag('unknown-pad'), null);
});
