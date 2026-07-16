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
import { createCombatDamageResolver, createCombatPresentationEventBuffer } from '../src/combat-resolution.js';
import { createRng } from '../src/rng.js';
import type { PlayerState } from '../src/types.js';

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

test('targeted projectile bursts prioritize a marked enemy over a closer unmarked candidate', () => {
  const { context, grid } = setup();
  const closerUnmarked = spawnEnemy(context, grid, 5, 0);
  const marked = spawnEnemy(context, grid, 30, 40);
  context.enemies.data.marked[marked] = 1;

  const stats = createTraitCommandExecutor({ projectileSpeedUnit: 10 }).execute(source(command({
    kind: 'spawnProjectileBurst', targeting: 'nearest', count: 1, damage: 2, speed: 1, range: 100,
  })), context);

  assert.equal(stats.projectilesSpawned, 1);
  assert.equal(context.enemies.data.marked[closerUnmarked], 0);
  // (30,40) is the marked target's 3-4-5 direction; a nearest-only selector
  // would have fired directly right at the unmarked candidate instead.
  close(context.projectiles.data.velX[0]!, 6);
  close(context.projectiles.data.velY[0]!, 8);
});

test('directed projectile bursts carry authored pierce instead of the global fallback', () => {
  const { context } = setup();
  const stats = createTraitCommandExecutor({ projectilePierce: 0 }).execute(source(command({
    kind: 'spawnProjectileBurst',
    count: 1,
    damage: 4,
    speed: 3,
    pierce: 2,
  })), context);

  assert.equal(stats.projectilesSpawned, 1);
  assert.equal(context.projectiles.data.pierce[0], 2);
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

test('orbiting damage derives firefly positions from the command tick and never double-hits one target', () => {
  const { context, grid } = setup();
  const north = spawnEnemy(context, grid, 0, 10);
  const south = spawnEnemy(context, grid, 0, -10);
  const contactHits: Array<[number, number, number, number, number, number]> = [];
  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'orbitingDamage',
    tick: 7,
    count: 2,
    damage: 4,
    radius: 10,
    range: 1,
    speed: Math.PI / 2,
  })), {
    ...context,
    onOrbitingDamageHit(commandIndex, hitIndex, flyX, flyY, targetX, targetY): void {
      contactHits.push([commandIndex, hitIndex, flyX, flyY, targetX, targetY]);
    },
  });

  assert.equal(stats.orbitingDamageCommands, 1);
  assert.equal(stats.orbitingDamageHits, 2);
  assert.equal(context.enemies.data.hp[north], 6);
  assert.equal(context.enemies.data.hp[south], 6);
  assert.deepEqual(
    contactHits.map(([commandIndex, hitIndex, _flyX, _flyY, targetX, targetY]) => [commandIndex, hitIndex, targetX, targetY]),
    [[0, 0, 0, -10], [0, 1, 0, 10]],
    'the presentation observer receives every real victim in the same source order as damage',
  );
  close(contactHits[0]![2], 0);
  close(contactHits[0]![3], -10);
  close(contactHits[1]![2], 0);
  close(contactHits[1]![3], 10);

  const repeat = setup();
  const single = spawnEnemy(repeat.context, repeat.grid, 0, 0);
  const repeatStats = createTraitCommandExecutor().execute(source(command({
    kind: 'orbitingDamage',
    tick: 7,
    count: 4,
    damage: 3,
    radius: 5,
    range: 6,
    speed: Math.PI / 2,
  })), repeat.context);
  assert.equal(repeatStats.orbitingDamageHits, 1, 'one pulse cannot hit a target twice');
  assert.equal(repeat.context.enemies.data.hp[single], 7);
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

test('places Residue and Miasma zones at the triggering payload target, not Greg', () => {
  const { context, grid } = setup();
  const byGreg = spawnEnemy(context, grid, 5, 0);
  const payloadTarget = spawnEnemy(context, grid, 80, 0);
  context.enemies.data.hp[payloadTarget] = 100;
  const resolvedOrigins: Array<readonly [number, number, number]> = [];

  const stats = createTraitCommandExecutor().execute(source(
    command({
      kind: 'spawnProjectileBurst', targeting: 'highestHealth', count: 1, damage: 0, speed: 1, range: 100,
    }),
    command({
      kind: 'spawnZone', anchor: 'triggerTarget', targeting: 'none', radius: 12,
      amount: 2, durationTicks: 30, intervalTicks: 10, tag: 'sticky-trail',
    }),
    command({
      kind: 'spawnZone', anchor: 'triggerTarget', targeting: 'none', radius: 14,
      amount: 2, durationTicks: 30, intervalTicks: 10, tag: 'stink-cloud',
    }),
  ), {
    ...context,
    onCommandOriginResolved(commandIndex, originX, originY): void {
      resolvedOrigins.push([commandIndex, originX, originY]);
    },
  });

  assert.equal(stats.zonesSpawned, 2);
  assert.equal(context.zones.data.count, 2);
  for (let index = 0; index < 2; index++) {
    assert.equal(context.zones.data.posX[index], 80);
    assert.equal(context.zones.data.posY[index], 0);
  }
  assert.equal(context.enemies.data.hp[byGreg], 10, 'the source-side enemy was not used as the graft anchor');
  assert.deepEqual(resolvedOrigins, [[0, 0, 0], [1, 80, 0], [2, 80, 0]]);
});

test('places Crab Impact and Eel Arc on the triggering payload target deterministically', () => {
  const { context, grid } = setup();
  const byGreg = spawnEnemy(context, grid, 5, 0);
  const payloadTarget = spawnEnemy(context, grid, 80, 0);
  context.enemies.data.hp[payloadTarget] = 100;

  const stats = createTraitCommandExecutor().execute(source(
    command({
      kind: 'spawnProjectileBurst', targeting: 'highestHealth', count: 1, damage: 0, speed: 1, range: 100,
    }),
    command({
      kind: 'applyAreaDamage', anchor: 'triggerTarget', targeting: 'nearest', radius: 12, damage: 7,
    }),
    command({
      kind: 'chainDamage', anchor: 'triggerTarget', targeting: 'nearest', damage: 9, jumps: 0, range: 20,
    }),
  ), context);

  assert.equal(stats.areaDamageHits, 1);
  assert.equal(stats.chainDamageHits, 1);
  assert.equal(context.enemies.data.hp[payloadTarget], 84, 'Impact and Arc both resolve from the payload target');
  assert.equal(context.enemies.data.hp[byGreg], 10, 'neither dependent command fell back to Greg');
});

test('resolves an auto-aimed melee arc as a real front-sector cleave with deterministic target direction', () => {
  const { context, grid } = setup();
  const anchor = spawnEnemy(context, grid, 20, 0);
  const front = spawnEnemy(context, grid, 40, 0);
  const side = spawnEnemy(context, grid, 0, 20);
  const behind = spawnEnemy(context, grid, -20, 0);
  context.enemies.data.hp[anchor] = 3;
  const resolvedDirections: Array<[number, number, number]> = [];

  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'meleeArc', targeting: 'nearest', damage: 4, arc: 1.2, range: 60,
  })), {
    ...context,
    onMeleeArcResolved(commandIndex, dirX, dirY): void {
      resolvedDirections.push([commandIndex, dirX, dirY]);
    },
  });

  assert.equal(stats.meleeArcCommands, 1);
  assert.equal(stats.meleeArcHits, 2, 'only the anchor and enemy inside the 69° sector are cut');
  assert.equal(stats.enemiesKilled, 1);
  assert.equal(context.enemies.data.count, 3);
  assert.equal(context.enemies.data.hp[front], 6);
  assert.equal(context.enemies.data.hp[side], 10);
  assert.equal(context.enemies.data.hp[behind], 10);
  assert.deepEqual(resolvedDirections, [[0, 1, 0]]);
  assert.equal(grid.nearest(20, 0, 0.1), -1, 'lethal anchor uses the shared simulation cleanup');
});

test('supports an authored untargeted melee direction and skips targeted arcs with no enemy in range', () => {
  const { context, grid } = setup();
  const north = spawnEnemy(context, grid, 0, 20);

  const untargeted = createTraitCommandExecutor().execute(source(command({
    kind: 'meleeArc', targeting: 'none', dirX: 0, dirY: 1, damage: 3, arc: 0.8, range: 30,
  })), context);
  assert.equal(untargeted.meleeArcHits, 1);
  assert.equal(context.enemies.data.hp[north], 7);

  const skipped = createTraitCommandExecutor().execute(source(command({
    kind: 'meleeArc', targeting: 'nearest', damage: 3, arc: 0.8, range: 10,
  })), context);
  assert.equal(skipped.meleeArcsSkippedNoTarget, 1);
  assert.equal(skipped.meleeArcHits, 0);
});

test('resolves chain lightning immediately without spawning a projectile and reports its real endpoint', () => {
  const { context, grid } = setup();
  const target = spawnEnemy(context, grid, 20, 0);
  const hits: Array<[number, number, number, number]> = [];
  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'chainDamage', targeting: 'nearest', damage: 4, jumps: 0, range: 30,
  })), {
    ...context,
    onChainDamageHit(commandIndex, hitIndex, x, y): void {
      hits.push([commandIndex, hitIndex, x, y]);
    },
  });

  assert.equal(stats.chainDamageCommands, 1);
  assert.equal(stats.chainDamageHits, 1);
  assert.equal(stats.projectilesSpawned, 0);
  assert.equal(context.projectiles.data.count, 0, 'lightning never enters the projectile pool or collision path');
  assert.equal(context.enemies.data.hp[target], 6, 'the acquired target takes damage in this same tick');
  assert.deepEqual(hits, [[0, 0, 20, 0]]);
});

test('chains from each struck enemy, including a lethal first strike, instead of repeatedly searching from Greg', () => {
  const { context, grid } = setup();
  const first = spawnEnemy(context, grid, 20, 0);
  const second = spawnEnemy(context, grid, 48, 0);
  const third = spawnEnemy(context, grid, 76, 0);
  const outside = spawnEnemy(context, grid, 125, 0);
  context.enemies.data.hp[first] = 2;

  const stats = createTraitCommandExecutor({ defaultTargetRange: 25 }).execute(source(command({
    kind: 'chainDamage', targeting: 'nearest', damage: 3, jumps: 2, range: 30,
  })), context);

  assert.equal(stats.chainDamageHits, 3);
  assert.equal(stats.enemiesKilled, 1);
  assert.equal(context.enemies.data.count, 3, 'lethal first victim used simulation cleanup');
  assert.equal(grid.nearest(20, 0, 0.1), -1, 'killed victim no longer occupies the grid');
  assert.equal(context.enemies.data.hp[second], 7);
  assert.equal(context.enemies.data.hp[third], 7);
  assert.equal(context.enemies.data.hp[outside], 10, 'a target outside the previous-hop range remains untouched');
});

test('chain lightning picks lowest-id equal-distance hops and never visits a durable target twice', () => {
  const { context, grid } = setup();
  const first = spawnEnemy(context, grid, 20, 0);
  const lowerIdTie = spawnEnemy(context, grid, 30, 0);
  const higherIdTie = spawnEnemy(context, grid, 20, 10);

  const tieStats = createTraitCommandExecutor().execute(source(command({
    kind: 'chainDamage', targeting: 'nearest', damage: 2, jumps: 1, range: 12,
  })), context);
  assert.equal(tieStats.chainDamageHits, 2);
  assert.equal(context.enemies.data.hp[first], 8);
  assert.equal(context.enemies.data.hp[lowerIdTie], 8, 'equal distances resolve to the lower entity id');
  assert.equal(context.enemies.data.hp[higherIdTie], 10);

  const noRepeat = createTraitCommandExecutor().execute(source(command({
    kind: 'chainDamage', targeting: 'nearest', damage: 1, jumps: 7, range: 20,
  })), context);
  assert.equal(noRepeat.chainDamageHits, 3, 'extra jump budget cannot bounce between the same enemies');
  assert.equal(context.enemies.data.hp[first], 7);
  assert.equal(context.enemies.data.hp[lowerIdTie], 7);
  assert.equal(context.enemies.data.hp[higherIdTie], 9);
});

test('chain lightning cleanly skips when no initial target is in acquisition range', () => {
  const { context, grid } = setup();
  spawnEnemy(context, grid, 40, 0);
  const stats = createTraitCommandExecutor({ defaultTargetRange: 20 }).execute(source(command({
    kind: 'chainDamage', targeting: 'nearest', damage: 4, jumps: 3, range: 30,
  })), context);

  assert.equal(stats.chainsSkippedNoTarget, 1);
  assert.equal(stats.chainDamageHits, 0);
  assert.equal(context.projectiles.data.count, 0);
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

test('executes authored marking and rejects a shield command only when no player resolver is supplied', () => {
  const { context, grid } = setup();
  const markedA = spawnEnemy(context, grid, 10, 0);
  const markedB = spawnEnemy(context, grid, 16, 0);
  const stats = createTraitCommandExecutor().execute(source(command({
    kind: 'markTargets',
    targeting: 'densestCluster',
    count: 2,
    radius: 20,
    tag: 'echo-mark',
  })), context);
  assert.equal(stats.markTargetsCommands, 1);
  assert.equal(stats.markedTargets, 2);
  assert.equal(context.enemies.data.marked[markedA], 1);
  assert.equal(context.enemies.data.marked[markedB], 1);
  assert.throws(
    () => createTraitCommandExecutor().execute(source(command({ kind: 'grantShield', amount: 5 })), context),
    /grantShield requires the simulation combat resolver/,
  );
});

test('executes grantShield through the shared simulation combat resolver', () => {
  const { context } = setup();
  const player: PlayerState = {
    x: 0, y: 0, hp: 100, maxHp: 100, speed: 0, radius: 4, pickupRadius: 10,
    xp: 0, level: 1, invulnTicks: 0, alive: true,
    critChance: 0, critMultiplier: 2, dodgeChance: 0, armor: 0,
    shield: 0, shieldMax: 12, shieldRechargeDelayTicks: 0,
    shieldRechargeTicksRemaining: 0, shieldRechargePerTick: 0,
  };
  const withCombat: TraitCommandExecutionContext = {
    ...context,
    combat: createCombatDamageResolver({
      player,
      rng: createRng(7),
      eventBuffer: createCombatPresentationEventBuffer(),
      getTick: () => context.tick,
    }),
  };
  const stats = createTraitCommandExecutor().execute(
    source(command({ kind: 'grantShield', amount: 5 })),
    withCombat,
  );
  assert.equal(stats.shieldGrants, 1);
  assert.equal(player.shield, 5);
});

test('rejects malformed chain data before any command in the batch mutates combat state', () => {
  const { context, grid } = setup();
  const target = spawnEnemy(context, grid, 10, 0);
  const executor = createTraitCommandExecutor({ maxChainJumps: 3 });

  assert.throws(
    () => executor.execute(source(
      command({ kind: 'chainDamage', targeting: 'nearest', damage: 4, jumps: 1, range: 20 }),
      command({ kind: 'chainDamage', targeting: 'nearest', damage: 4, jumps: 4, range: 20 }),
    ), context),
    /command\.jumps must be an integer/,
  );
  assert.equal(context.enemies.data.hp[target], 10, 'the valid first chain cannot partially resolve');
  assert.equal(context.projectiles.data.count, 0);
});

test('rejects malformed melee arcs before an earlier valid command can mutate combat state', () => {
  const { context, grid } = setup();
  const target = spawnEnemy(context, grid, 10, 0);

  assert.throws(
    () => createTraitCommandExecutor().execute(source(
      command({ kind: 'meleeArc', targeting: 'nearest', damage: 4, arc: 1, range: 20 }),
      command({ kind: 'meleeArc', targeting: 'nearest', damage: 4, arc: 0, range: 20 }),
    ), context),
    /command\.arc must be finite/,
  );
  assert.equal(context.enemies.data.hp[target], 10);
});

test('never permits an execution chain longer than the fixed presentation endpoint budget', () => {
  assert.throws(
    () => createTraitCommandExecutor({ maxChainJumps: 8 }),
    /maxChainJumps must be an integer in \[0, 7\]/,
  );
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

test('rejects an unknown command anchor before mutating combat state', () => {
  const { context } = setup();
  assert.throws(
    () => createTraitCommandExecutor().execute(source(command({
      kind: 'spawnProjectileBurst', count: 1, damage: 1, speed: 1,
      anchor: 'not-an-anchor' as never,
    })), context),
    /unsupported command anchor/,
  );
  assert.equal(context.projectiles.data.count, 0);
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
