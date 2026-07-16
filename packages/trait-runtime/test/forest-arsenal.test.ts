import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GREG_FOREST_ARSENAL_CATALOG,
  TraitRuntime,
  getCatalog,
  rankStagesFor,
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

function master(runtime: TraitRuntime, id: string): void {
  for (let rank = 1; rank <= 5; rank++) upgrade(runtime, id);
}

test('Forest Arsenal exposes twelve launch attack families and six supported Mythics', () => {
  assert.equal(GREG_FOREST_ARSENAL_CATALOG.maxActiveTraits, 4);
  assert.deepEqual(
    GREG_FOREST_ARSENAL_CATALOG.traits.map((trait) => trait.id),
    [
      'porcupine-quills',
      'puffer-pouch',
      'electric-eel-coil',
      'firefly-colony',
      'mantis-scythes',
      'gecko-pads',
      'owl-pinions',
      'bat-ears',
      'crab-pincers',
      'armadillo-greaves',
      'skunk-brush',
      'monarch-brood',
    ],
  );
  assert.deepEqual(
    GREG_FOREST_ARSENAL_CATALOG.evolutions.map((evolution) => evolution.id),
    ['thornstorm-mantle', 'thunderbug-dynamo', 'razorstep-chimera', 'midnight-radar', 'meteor-mauler', 'royal-stinkcloud'],
  );

  const quills = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(quills, 'porcupine-quills');
  const quillCommand = quills.update(context(1)).at(0);
  assert.deepEqual(
    {
      kind: quillCommand.kind,
      count: quillCommand.count,
      pierce: quillCommand.pierce,
    },
    { kind: 'spawnProjectileBurst', count: 3, pierce: 1 },
  );

  const coil = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(coil, 'electric-eel-coil');
  const coilCommands = coil.update(context(1));
  assert.equal(coilCommands.length, 1);
  assert.deepEqual(
    {
      kind: coilCommands.at(0).kind,
      damage: coilCommands.at(0).damage,
      jumps: coilCommands.at(0).jumps,
      range: coilCommands.at(0).range,
    },
    { kind: 'chainDamage', damage: 4, jumps: 1, range: 120 },
  );
  const adaptedCoilRuntime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(adaptedCoilRuntime, 'electric-eel-coil');
  upgrade(adaptedCoilRuntime, 'electric-eel-coil');
  const adaptedCoil = adaptedCoilRuntime.update(context(1));
  assert.deepEqual(
    {
      kind: adaptedCoil.at(0).kind,
      damage: adaptedCoil.at(0).damage,
      jumps: adaptedCoil.at(0).jumps,
      range: adaptedCoil.at(0).range,
    },
    { kind: 'chainDamage', damage: 5, jumps: 3, range: 150 },
  );

  const colony = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(colony, 'firefly-colony');
  const colonyCommands = colony.update(context(1));
  assert.equal(colonyCommands.at(0).kind, 'orbitingDamage');
  assert.equal(colonyCommands.at(0).count, 2);
  assert.equal(colonyCommands.at(0).damage, 3);
  assert.equal(colonyCommands.at(0).radius, 50);
  assert.equal(colonyCommands.at(0).range, 18);

  const mantis = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(mantis, 'mantis-scythes');
  const mantisCommands = mantis.update(context(1));
  assert.equal(mantisCommands.length, 1);
  assert.deepEqual(
    {
      sourceId: mantisCommands.at(0).sourceId,
      kind: mantisCommands.at(0).kind,
      damage: mantisCommands.at(0).damage,
      arc: mantisCommands.at(0).arc,
      range: mantisCommands.at(0).range,
    },
    { sourceId: 'mantis-scythes', kind: 'meleeArc', damage: 6, arc: 1.2, range: 68 },
  );
  const adaptedMantis = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(adaptedMantis, 'mantis-scythes');
  upgrade(adaptedMantis, 'mantis-scythes');
  const adaptedMantisCommand = adaptedMantis.update(context(1)).at(0);
  assert.deepEqual(
    {
      kind: adaptedMantisCommand.kind,
      damage: adaptedMantisCommand.damage,
      arc: adaptedMantisCommand.arc,
      range: adaptedMantisCommand.range,
    },
    { kind: 'meleeArc', damage: 10, arc: 1.6, range: 88 },
  );

  const mythic = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  master(mythic, 'electric-eel-coil');
  master(mythic, 'firefly-colony');
  assert.equal(mythic.availableFusions()[0]?.evolutionId, 'thunderbug-dynamo');
  const result = mythic.fuseEvolution('thunderbug-dynamo');
  assert.equal(result.outcome.ok, true);
  assert.ok(mythic.getState().evolutions[0]?.variant !== undefined);
  const mythicReplay = TraitRuntime.deserialize(mythic.serialize(), {
    catalog: GREG_FOREST_ARSENAL_CATALOG,
  });
  const collectThunderbug = (runtime: TraitRuntime): Array<[number, string, string]> => {
    const emitted: Array<[number, string, string]> = [];
    for (let tick = 1; tick <= 120; tick++) {
      const commands = runtime.update(context(tick));
      for (let index = 0; index < commands.length; index++) {
        const command = commands.at(index);
        emitted.push([tick, command.sourceId, command.kind]);
      }
    }
    return emitted;
  };
  const thunderbugEmissions = collectThunderbug(mythic);
  assert.ok(thunderbugEmissions.length > 0);
  assert.ok(thunderbugEmissions.every(([, sourceId]) => sourceId === 'thunderbug-dynamo'));
  assert.deepEqual(
    collectThunderbug(mythicReplay),
    thunderbugEmissions,
  );

  const owl = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(owl, 'owl-pinions');
  assert.equal(owl.update(context(1)).at(0).kind, 'spawnProjectileBurst');
  const bat = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(bat, 'bat-ears');
  assert.equal(bat.update(context(1)).at(0).kind, 'markTargets');
  const crab = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(crab, 'crab-pincers');
  assert.equal(crab.update(context(1)).at(0).kind, 'applyAreaDamage');
  const skunk = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(skunk, 'skunk-brush');
  assert.equal(skunk.update(context(1)).at(0).tag, 'stink-cloud');

  const monarch = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(monarch, 'monarch-brood');
  const monarchCommand = monarch.update(context(1)).at(0);
  assert.deepEqual(
    {
      kind: monarchCommand.kind,
      count: monarchCommand.count,
      damage: monarchCommand.damage,
      speed: monarchCommand.speed,
      radius: monarchCommand.radius,
      range: monarchCommand.range,
    },
    {
      kind: 'orbitingDamage',
      count: 2,
      damage: 2,
      speed: (Math.PI * 2) / 180,
      radius: 72,
      range: 14,
    },
  );

  const adaptedMonarch = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(adaptedMonarch, 'monarch-brood');
  upgrade(adaptedMonarch, 'monarch-brood');
  const adaptedMonarchCommand = adaptedMonarch.update(context(1)).at(0);
  assert.deepEqual(
    {
      kind: adaptedMonarchCommand.kind,
      count: adaptedMonarchCommand.count,
      damage: adaptedMonarchCommand.damage,
      speed: adaptedMonarchCommand.speed,
      radius: adaptedMonarchCommand.radius,
      range: adaptedMonarchCommand.range,
    },
    {
      kind: 'orbitingDamage',
      count: 3,
      damage: 3,
      speed: (Math.PI * 2) / 150,
      radius: 84,
      range: 16,
    },
  );

  assert.deepEqual(
    GREG_FOREST_ARSENAL_CATALOG.traits.find((trait) => trait.id === 'monarch-brood')?.tags,
    ['companion', 'orbit', 'contact'],
  );
});

test('the default catalog keeps Firefly Colony on its real orbit/contact attack', () => {
  const firefly = getCatalog().traits.find((trait) => trait.id === 'firefly-colony');
  assert.ok(firefly);
  const bud = firefly.stages.bud.behavior;
  const adapted = firefly.stages.adapted.behavior;
  assert.equal(bud.kind, 'periodicBurst');
  assert.equal(bud.emit?.kind, 'orbitingDamage');
  assert.equal(adapted.kind, 'periodicBurst');
  assert.equal(adapted.emit?.kind, 'orbitingDamage');
});

test('every Forest attack has five executable ranks and a distinct Master behavior', () => {
  for (const trait of GREG_FOREST_ARSENAL_CATALOG.traits) {
    const ranks = rankStagesFor(trait);
    for (const rank of [1, 2, 3, 4, 5] as const) {
      assert.ok(ranks[rank], `${trait.id} rank ${rank} must exist`);
    }
    const behaviors = [2, 3, 4, 5].map((rank) => JSON.stringify(ranks[rank as 2 | 3 | 4 | 5].behavior));
    assert.notEqual(behaviors[0], behaviors[1], `${trait.id} rank 3 must change behavior`);
    assert.notEqual(behaviors[1], behaviors[2], `${trait.id} rank 4 must change behavior`);
    assert.notEqual(behaviors[2], behaviors[3], `${trait.id} Master rank must change behavior`);
  }
});

test('twelve candidates make the four-acquired-attack cap a real choice while upgrades stay legal', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG });
  assert.deepEqual(
    runtime.offers(99).map((offer) => offer.traitId),
    [
      'porcupine-quills',
      'puffer-pouch',
      'electric-eel-coil',
      'firefly-colony',
      'mantis-scythes',
      'gecko-pads',
      'owl-pinions',
      'bat-ears',
      'crab-pincers',
      'armadillo-greaves',
      'skunk-brush',
      'monarch-brood',
    ],
  );
  for (const traitId of ['porcupine-quills', 'puffer-pouch', 'electric-eel-coil', 'firefly-colony']) {
    upgrade(runtime, traitId);
  }

  for (const traitId of ['mantis-scythes', 'gecko-pads']) {
    assert.ok(!runtime.offers(99).some((offer) => offer.traitId === traitId));
    assert.deepEqual(runtime.applyUpgrade(traitId).outcome, {
      ok: false,
      kind: 'loadoutFull',
      traitId,
      capacity: 4,
    });
  }
  assert.equal(runtime.applyUpgrade('electric-eel-coil').outcome.ok, true, 'an owned Bud can still adapt');
});

test('a Master fusion frees one acquired logical slot', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG });
  master(runtime, 'electric-eel-coil');
  master(runtime, 'firefly-colony');
  upgrade(runtime, 'porcupine-quills');
  upgrade(runtime, 'puffer-pouch');
  assert.equal(runtime.activeAttackSlots(), 4);

  const fusion = runtime.fuseEvolution('thunderbug-dynamo');
  assert.equal(fusion.outcome.ok, true);
  assert.equal(runtime.activeAttackSlots(), 3);

  // The tail/body-orbit attachment footprint remains occupied by the fused
  // attack, but a new head attack can use the freed logical slot.
  assert.equal(runtime.applyUpgrade('mantis-scythes').outcome.ok, true);
  assert.equal(runtime.activeAttackSlots(), 4);
  assert.equal(runtime.applyUpgrade('gecko-pads').outcome.kind, 'loadoutFull');
});

test('four acquired slots permit the plan’s three-terminal-Chimera ceiling', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG });

  master(runtime, 'porcupine-quills');
  master(runtime, 'puffer-pouch');
  assert.equal(runtime.fuseEvolution('thornstorm-mantle').outcome.ok, true);
  assert.equal(runtime.activeAttackSlots(), 1);

  master(runtime, 'electric-eel-coil');
  master(runtime, 'firefly-colony');
  assert.equal(runtime.fuseEvolution('thunderbug-dynamo').outcome.ok, true);
  assert.equal(runtime.activeAttackSlots(), 2);

  master(runtime, 'mantis-scythes');
  master(runtime, 'gecko-pads');
  assert.equal(runtime.fuseEvolution('razorstep-chimera').outcome.ok, true);
  assert.equal(runtime.activeAttackSlots(), 3);
  assert.equal(runtime.getState().evolutions.length, 3);

  assert.equal(runtime.applyUpgrade('owl-pinions').outcome.ok, true);
  assert.deepEqual(runtime.applyUpgrade('bat-ears').outcome, {
    ok: false,
    kind: 'loadoutFull',
    traitId: 'bat-ears',
    capacity: 4,
  });
});

test('neutral damage and attack-speed multipliers apply to trait commands', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'electric-eel-coil');
  const first = runtime.update(context(1, {
    weaponDamageMultiplier: 1.12,
    weaponCooldownMultiplier: 0.92,
  }));
  assert.equal(first.at(0).damage, 4.48);
  assert.equal(first.at(0).jumps, 1, 'neutral damage never fabricates extra lightning hops');
  assert.equal(first.at(0).range, 120, 'neutral attack speed never changes hop range');
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
