import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTraitCommandExecutor,
  type TraitCombatCommand,
  type TraitCommandExecutionContext,
  type TraitCommandSource,
} from '../src/trait-command-executor.js';
import { createZonePool } from '../src/pools.js';
import { BruteForceGrid, createEnemyPool, createProjectilePool } from './helpers-c.js';
import { ZONE_TAG } from '../src/zones.js';

function command(overrides: Partial<TraitCombatCommand> = {}): TraitCombatCommand {
  return {
    kind: 'telegraph',
    sourceId: 'test-trait',
    tick: 7,
    targeting: 'none',
    originX: 0,
    originY: 0,
    dirX: 1,
    dirY: 0,
    count: 0,
    damage: 0,
    speed: 0,
    radius: 0,
    strength: 0,
    facing: 0,
    spread: 0,
    range: 0,
    ...overrides,
  };
}

function source(...commands: TraitCombatCommand[]): TraitCommandSource {
  return {
    length: commands.length,
    at(index: number): TraitCombatCommand {
      const value = commands[index];
      if (value === undefined) throw new RangeError(`missing command ${index}`);
      return value;
    },
  };
}

function setup(projectileCapacity = 32, zoneCapacity = 16): {
  context: TraitCommandExecutionContext;
  grid: BruteForceGrid;
} {
  const grid = new BruteForceGrid();
  const enemies = createEnemyPool(16);
  return {
    grid,
    context: {
      tick: 7,
      moveDirX: 1,
      moveDirY: 0,
      worldWidth: 100,
      worldHeight: 100,
      enemies,
      projectiles: createProjectilePool(projectileCapacity),
      zones: createZonePool(zoneCapacity),
      enemyGrid: grid,
      killEnemy(slot): void {
        grid.remove(enemies.idOf(slot));
        enemies.despawn(slot);
      },
    },
  };
}

function spawnEnemy(
  context: TraitCommandExecutionContext,
  grid: BruteForceGrid,
  x: number,
  y: number,
): number {
  const slot = context.enemies.spawn();
  assert.notEqual(slot, -1);
  context.enemies.data.posX[slot] = x;
  context.enemies.data.posY[slot] = y;
  context.enemies.data.velX[slot] = 3;
  context.enemies.data.velY[slot] = -4;
  context.enemies.data.hp[slot] = 10;
  context.enemies.data.maxHp[slot] = 10;
  grid.insert(context.enemies.idOf(slot), x, y);
  return slot;
}

function close(actual: number, expected: number, tolerance = 1e-4): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('executes a directed five-shot spread symmetrically around its direction', () => {
  const { context } = setup();
  const executor = createTraitCommandExecutor({ projectileSpeedUnit: 10 });
  const stats = executor.execute(source(command({
    kind: 'spawnProjectileBurst',
    count: 5,
    damage: 12,
    speed: 2,
    spread: Math.PI / 2,
  })), context);

  assert.equal(stats.projectileBursts, 1);
  assert.equal(stats.projectilesRequested, 5);
  assert.equal(stats.projectilesSpawned, 5);
  assert.equal(context.projectiles.data.count, 5);
  const expectedAngles = [-Math.PI / 4, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4];
  for (let slot = 0; slot < expectedAngles.length; slot++) {
    close(context.projectiles.data.velX[slot]!, Math.cos(expectedAngles[slot]!) * 20);
    close(context.projectiles.data.velY[slot]!, Math.sin(expectedAngles[slot]!) * 20);
    assert.equal(context.projectiles.data.damage[slot], 12);
  }
});

test('directed targeting honors the command-authored range', () => {
  const { context, grid } = setup();
  spawnEnemy(context, grid, 20, 0);
  const stats = createTraitCommandExecutor({ defaultTargetRange: 100 }).execute(source(command({
    kind: 'spawnProjectileBurst',
    targeting: 'nearest',
    count: 1,
    damage: 1,
    speed: 1,
    range: 10,
  })), context);

  assert.equal(stats.burstsSkippedNoTarget, 1);
  assert.equal(stats.projectilesRequested, 0);
  assert.equal(context.projectiles.data.count, 0);
});

test('executes an evenly spaced sixteen-shot radial burst', () => {
  const { context } = setup();
  const executor = createTraitCommandExecutor({ projectileSpeedUnit: 1 });
  const stats = executor.execute(source(command({
    kind: 'radialProjectileBurst',
    count: 16,
    damage: 3,
    speed: 8,
    facing: Math.PI / 8,
  })), context);

  assert.equal(stats.radialBursts, 1);
  assert.equal(stats.projectilesSpawned, 16);
  for (let slot = 0; slot < 16; slot++) {
    const angle = Math.PI / 8 + Math.PI * 2 * slot / 16;
    close(context.projectiles.data.velX[slot]!, Math.cos(angle) * 8);
    close(context.projectiles.data.velY[slot]!, Math.sin(angle) * 8);
  }
});

test('gather pulls only enemies in radius toward the origin and refreshes the grid', () => {
  const { context, grid } = setup();
  const near = spawnEnemy(context, grid, 10, 0);
  const far = spawnEnemy(context, grid, 30, 0);

  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'areaGather',
    radius: 15,
    strength: 4,
  })), context);

  assert.equal(stats.enemiesGathered, 1);
  assert.equal(context.enemies.data.posX[near], 6);
  assert.equal(context.enemies.data.posY[near], 0);
  assert.equal(context.enemies.data.velX[near], 0);
  assert.equal(context.enemies.data.velY[near], 0);
  assert.equal(context.enemies.data.posX[far], 30);
  assert.equal(grid.nearest(6, 0, 0.1), context.enemies.idOf(near));
});

test('knockback pushes away from the origin and clamps at world bounds', () => {
  const { context, grid } = setup();
  const slot = spawnEnemy(context, grid, 98, 50);

  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'areaKnockback',
    originX: 90,
    originY: 50,
    radius: 20,
    strength: 25,
  })), context);

  assert.equal(stats.enemiesKnockedBack, 1);
  assert.equal(context.enemies.data.posX[slot], 100);
  assert.equal(context.enemies.data.posY[slot], 50);
  assert.equal(context.enemies.data.velX[slot], 0);
  assert.equal(context.enemies.data.velY[slot], 0);
  assert.equal(grid.nearest(100, 50, 0.1), context.enemies.idOf(slot));
});

test('applies commands in source order', () => {
  const { context, grid } = setup();
  const slot = spawnEnemy(context, grid, 10, 0);

  createTraitCommandExecutor().execute(source(
    command({ kind: 'areaGather', originX: 0, originY: 0, radius: 50, strength: 5 }),
    command({ kind: 'areaGather', originX: 10, originY: 10, radius: 50, strength: 5 }),
  ), context);

  // First move is (10,0) -> (5,0), then five units toward (10,10).
  close(context.enemies.data.posX[slot]!, 5 + 5 / Math.sqrt(5));
  close(context.enemies.data.posY[slot]!, 10 / Math.sqrt(5));
});

test('counts telegraphs without mutating combat pools', () => {
  const { context } = setup();
  const stats = createTraitCommandExecutor().execute(source(command({ kind: 'telegraph' })), context);

  assert.equal(stats.commandsProcessed, 1);
  assert.equal(stats.telegraphs, 1);
  assert.equal(context.enemies.data.count, 0);
  assert.equal(context.projectiles.data.count, 0);
});

test('applies area damage once per in-range enemy and uses simulation-owned kill cleanup', () => {
  const { context, grid } = setup();
  const killed = spawnEnemy(context, grid, 5, 0);
  const survivor = spawnEnemy(context, grid, 9, 0);
  const outside = spawnEnemy(context, grid, 20, 0);
  context.enemies.data.hp[killed] = 3;

  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'applyAreaDamage', radius: 10, damage: 4,
  })), context);

  assert.equal(stats.areaDamageHits, 2);
  assert.equal(stats.enemiesKilled, 1);
  assert.equal(context.enemies.data.count, 2);
  assert.equal(context.enemies.data.hp[survivor], 6);
  assert.equal(context.enemies.data.hp[outside], 10);
  assert.equal(grid.nearest(5, 0, 0.1), -1);
});

test('counts renderer-only trait cues without mutating combat state', () => {
  const { context } = setup();
  const stats = createTraitCommandExecutor().execute(source(command({ kind: 'playTraitCue' })), context);
  assert.equal(stats.traitCues, 1);
  assert.equal(context.enemies.data.count, 0);
});

test('spawns a compact-tag damaging pad and applies the legacy cadence default only when omitted', () => {
  const { context } = setup();
  const stats = createTraitCommandExecutor({ defaultZoneIntervalTicks: 9 }).execute(source(command({
    kind: 'spawnZone',
    originX: 12,
    originY: 34,
    radius: 20,
    amount: 3.5,
    durationTicks: 42,
    tag: 'gecko-pad',
  })), context);

  assert.equal(stats.zonesRequested, 1);
  assert.equal(stats.zonesSpawned, 1);
  assert.equal(stats.zonesRejected, 0);
  assert.equal(context.zones.data.count, 1);
  assert.equal(context.zones.data.posX[0], 12);
  assert.equal(context.zones.data.posY[0], 34);
  assert.equal(context.zones.data.radius[0], 20);
  assert.equal(context.zones.data.damage[0], 3.5);
  assert.equal(context.zones.data.lifetime[0], 42);
  assert.equal(context.zones.data.intervalTicks[0], 9);
  assert.equal(context.zones.data.pulseCooldown[0], 0);
  assert.equal(context.zones.data.tag[0], ZONE_TAG.geckoPad);
});

test('zone requests reject the newest command deterministically when the fixed pool is full', () => {
  const { context } = setup(32, 1);
  const stats = createTraitCommandExecutor().execute(source(
    command({
      kind: 'spawnZone', originX: 10, radius: 10, amount: 1, durationTicks: 20,
      intervalTicks: 4, tag: 'gecko-pad',
    }),
    command({
      kind: 'spawnZone', originX: 90, radius: 10, amount: 9, durationTicks: 20,
      intervalTicks: 4, tag: 'razorstep-scythe-pad',
    }),
  ), context);

  assert.equal(stats.zonesRequested, 2);
  assert.equal(stats.zonesSpawned, 1);
  assert.equal(stats.zonesRejected, 1);
  assert.equal(context.zones.data.count, 1);
  assert.equal(context.zones.data.posX[0], 10, 'the older accepted pad is never evicted');
  assert.equal(context.zones.data.tag[0], ZONE_TAG.geckoPad);
});

test('explicitly rejects authored commands that still require unsupported persistent state', () => {
  const { context } = setup();
  for (const kind of ['markTargets', 'chainDamage', 'meleeArc', 'grantShield']) {
    assert.throws(
      () => createTraitCommandExecutor().execute(source(command({ kind })), context),
      new RegExp(`unsupported simulation state: ${kind}`),
    );
  }
});

test('degrades gracefully when the projectile pool fills mid-burst', () => {
  const { context } = setup(3);
  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'spawnProjectileBurst',
    count: 5,
    damage: 1,
    speed: 1,
    spread: 0,
  })), context);

  assert.equal(context.projectiles.data.count, 3);
  assert.equal(stats.projectilesRequested, 5);
  assert.equal(stats.projectilesSpawned, 3);
  assert.equal(stats.projectilesRejected, 2);
});

test('counts unsupported commands and continues processing the batch', () => {
  const { context } = setup();
  const stats = createTraitCommandExecutor().execute(source(
    command({ kind: 'futureCommand' }),
    command({ kind: 'telegraph' }),
  ), context);

  assert.equal(stats.commandsProcessed, 2);
  assert.equal(stats.unsupportedCommands, 1);
  assert.equal(stats.telegraphs, 1);
});

test('rejects commands emitted for a different tick', () => {
  const { context } = setup();
  const executor = createTraitCommandExecutor();

  assert.throws(
    () => executor.execute(source(command({ kind: 'telegraph', tick: 6 })), context),
    /does not match execution tick/,
  );
  assert.equal(context.projectiles.data.count, 0);
});

test('validates the whole batch before mutating any pool', () => {
  const { context } = setup();
  const executor = createTraitCommandExecutor({ maxBurstCount: 16 });
  const validFirst = command({
    kind: 'spawnProjectileBurst',
    count: 1,
    damage: 2,
    speed: 3,
  });
  const malformedSecond = command({
    kind: 'radialProjectileBurst',
    count: 17,
    damage: 2,
    speed: 3,
  });

  assert.throws(
    () => executor.execute(source(validFirst, malformedSecond), context),
    /command\.count must be an integer/,
  );
  assert.equal(context.projectiles.data.count, 0, 'the valid first command must not run');
});

test('validates every spawnZone before mutating the zone pool', () => {
  const { context } = setup();
  const executor = createTraitCommandExecutor();
  const validFirst = command({
    kind: 'spawnZone', radius: 10, amount: 2, durationTicks: 30, tag: 'gecko-pad',
  });
  const malformedSecond = command({
    kind: 'spawnZone', radius: 10, amount: 2, durationTicks: 30, tag: 'not-a-pad',
  });

  assert.throws(
    () => executor.execute(source(validFirst, malformedSecond), context),
    /unsupported spawnZone tag/,
  );
  assert.equal(context.zones.data.count, 0, 'the valid first command must not spawn a partial zone');
});

test('fetches each command once so validation and execution use the same object', () => {
  const { context } = setup();
  const valid = command({ kind: 'spawnProjectileBurst', count: 1, damage: 1, speed: 1 });
  const invalid = command({ kind: 'spawnProjectileBurst', count: 9999, damage: 1, speed: 1 });
  let calls = 0;
  const unstableSource: TraitCommandSource = {
    length: 1,
    at() {
      calls++;
      return calls === 1 ? valid : invalid;
    },
  };

  const stats = createTraitCommandExecutor().execute(unstableSource, context);
  assert.equal(calls, 1);
  assert.equal(stats.projectilesSpawned, 1);
});

test('rejects Float32-overflowing projectile data before spawning', () => {
  const { context } = setup();
  assert.throws(
    () => createTraitCommandExecutor().execute(source(command({
      kind: 'spawnProjectileBurst',
      count: 1,
      damage: 1,
      speed: 1e38,
    })), context),
    /derived projectile speed exceeds Float32 range/,
  );
  assert.equal(context.projectiles.data.count, 0);
});
