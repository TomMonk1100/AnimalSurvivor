import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GREG_FOREST_ARSENAL_CATALOG,
  TraitRuntime,
  type Catalog,
  type RuntimeContext,
} from '../src/index.js';

function context(tick: number, overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    tick,
    playerX: 100,
    playerY: 100,
    moveDirX: 0,
    moveDirY: 0,
    distanceMovedThisTick: 0,
    ...overrides,
  };
}

function upgrade(runtime: TraitRuntime, id: string): void {
  const result = runtime.applyUpgrade(id);
  assert.equal(result.outcome.ok, true, `${id} should be a legal upgrade`);
}

test('Forest Arsenal exposes four real non-starter attacks and two supported Mythics', () => {
  assert.equal(GREG_FOREST_ARSENAL_CATALOG.maxActiveTraits, 4);
  assert.deepEqual(
    GREG_FOREST_ARSENAL_CATALOG.traits.map((trait) => trait.id),
    ['porcupine-quills', 'puffer-pouch', 'electric-eel-coil', 'firefly-colony'],
  );
  assert.deepEqual(
    GREG_FOREST_ARSENAL_CATALOG.evolutions.map((evolution) => evolution.id),
    ['thornstorm-mantle', 'thunderbug-dynamo'],
  );

  const coil = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(coil, 'electric-eel-coil');
  const coilCommands = coil.update(context(1));
  assert.equal(coilCommands.length, 1);
  assert.deepEqual(
    {
      kind: coilCommands.at(0).kind,
      count: coilCommands.at(0).count,
      damage: coilCommands.at(0).damage,
      speed: coilCommands.at(0).speed,
    },
    { kind: 'spawnProjectileBurst', count: 2, damage: 4, speed: 8 },
  );

  const colony = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(colony, 'firefly-colony');
  const colonyCommands = colony.update(context(1));
  assert.equal(colonyCommands.at(0).kind, 'radialProjectileBurst');
  assert.equal(colonyCommands.at(0).count, 6);

  const mythic = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(mythic, 'electric-eel-coil');
  upgrade(mythic, 'electric-eel-coil');
  upgrade(mythic, 'firefly-colony');
  const result = mythic.applyUpgrade('firefly-colony');
  assert.equal(result.evolved, 'thunderbug-dynamo');
  assert.equal(mythic.update(context(1)).at(0).tag, 'thunderbug-charge');
  for (let tick = 2; tick <= 18; tick++) assert.equal(mythic.update(context(tick)).length, 0);
  const radial = mythic.update(context(19));
  assert.equal(radial.at(0).kind, 'radialProjectileBurst');
  assert.equal(radial.at(0).count, 18);
});

test('active attack cap blocks direct fifth-trait acquisition and leaves existing upgrades legal', () => {
  const fifth = {
    ...GREG_FOREST_ARSENAL_CATALOG.traits[0]!,
    id: 'test-fifth-attack',
    sockets: ['rightShoulder'] as const,
    stages: {
      bud: {
        ...GREG_FOREST_ARSENAL_CATALOG.traits[0]!.stages.bud,
        visualKey: 'test-fifth-attack:bud',
      },
      adapted: {
        ...GREG_FOREST_ARSENAL_CATALOG.traits[0]!.stages.adapted,
        visualKey: 'test-fifth-attack:adapted',
      },
    },
  };
  const catalog: Catalog = {
    ...GREG_FOREST_ARSENAL_CATALOG,
    traits: [...GREG_FOREST_ARSENAL_CATALOG.traits, fifth],
  };
  const runtime = new TraitRuntime({ catalog });
  for (const trait of GREG_FOREST_ARSENAL_CATALOG.traits) upgrade(runtime, trait.id);

  assert.ok(!runtime.offers(99).some((offer) => offer.traitId === 'test-fifth-attack'));
  assert.deepEqual(runtime.applyUpgrade('test-fifth-attack').outcome, {
    ok: false,
    kind: 'loadoutFull',
    traitId: 'test-fifth-attack',
    capacity: 4,
  });
  assert.equal(runtime.applyUpgrade('electric-eel-coil').outcome.ok, true, 'an owned Bud can still adapt');
});

test('neutral damage and attack-speed multipliers apply to trait commands', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'electric-eel-coil');
  const first = runtime.update(context(1, {
    weaponDamageMultiplier: 1.12,
    weaponCooldownMultiplier: 0.92,
  }));
  assert.equal(first.at(0).damage, 4.48);
  for (let tick = 2; tick <= 74; tick++) {
    assert.equal(runtime.update(context(tick, {
      weaponDamageMultiplier: 1.12,
      weaponCooldownMultiplier: 0.92,
    })).length, 0);
  }
  assert.equal(runtime.update(context(75, {
    weaponDamageMultiplier: 1.12,
    weaponCooldownMultiplier: 0.92,
  })).length, 1);
});
