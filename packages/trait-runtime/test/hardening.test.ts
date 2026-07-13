import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Catalog, RuntimeContext } from '../src/contracts.js';
import {
  CatalogValidationError,
  SerializationError,
  TraitRuntime,
  getCatalog,
} from '../src/index.js';

function ctx(tick: number): RuntimeContext {
  return {
    tick,
    playerX: 10,
    playerY: 20,
    moveDirX: 1,
    moveDirY: 0,
    distanceMovedThisTick: 2,
  };
}

function cloneCatalog(): Catalog {
  return JSON.parse(JSON.stringify(getCatalog())) as Catalog;
}

test('custom catalog behavior is validated and executed instead of the global catalog', () => {
  const catalog = cloneCatalog();
  const quills = catalog.traits.find((trait) => trait.id === 'porcupine-quills')!;
  quills.stages.bud.behavior.emit!.damage = 777;

  const runtime = new TraitRuntime({ catalog });
  runtime.applyUpgrade('porcupine-quills');
  const commands = runtime.update(ctx(0));

  assert.equal(commands.length, 1);
  assert.equal(commands.at(0).damage, 777);
});

test('invalid custom catalog is rejected at construction', () => {
  const catalog = cloneCatalog();
  (catalog.traits as unknown as Array<Catalog['traits'][number]>).push(catalog.traits[0]!);
  assert.throws(() => new TraitRuntime({ catalog }), CatalogValidationError);
});

test('runtime rejects repeated and skipped ticks without changing canonical state', () => {
  const runtime = new TraitRuntime();
  runtime.applyUpgrade('porcupine-quills');
  runtime.update(ctx(0));
  const hash = runtime.hash();

  assert.throws(() => runtime.update(ctx(0)), /expected tick 1/);
  assert.throws(() => runtime.update(ctx(2)), /expected tick 1/);
  assert.equal(runtime.hash(), hash);
  assert.doesNotThrow(() => runtime.update(ctx(1)));
});

test('initialTick aligns an injected runtime without consuming a bootstrap behavior tick', () => {
  const runtime = new TraitRuntime({ initialTick: 0 });
  runtime.applyUpgrade('porcupine-quills');
  const commands = runtime.update(ctx(1));
  assert.equal(commands.length, 1);
  assert.equal(commands.at(0).tick, 1);
  assert.throws(() => new TraitRuntime({ initialTick: -2 }), /initialTick/);
});

test('runtime rejects non-finite context without mutation', () => {
  const runtime = new TraitRuntime();
  const hash = runtime.hash();
  assert.throws(() => runtime.update({ ...ctx(0), playerX: Number.NaN }), /playerX/);
  assert.equal(runtime.hash(), hash);
});

test('deserialize rejects a catalog mismatch', () => {
  const json = new TraitRuntime().serialize();
  const catalog = cloneCatalog();
  const quills = catalog.traits.find((trait) => trait.id === 'porcupine-quills')!;
  quills.stages.bud.behavior.emit!.damage = 778;
  assert.throws(
    () => TraitRuntime.deserialize(json, { catalog }),
    /catalog fingerprint mismatch/,
  );
});

test('deserialize rejects unknown owners and inconsistent socket occupancy', () => {
  const unknownOwner = JSON.parse(new TraitRuntime().serialize()) as {
    owned: unknown[];
  };
  unknownOwner.owned.push({ id: 'forged-trait', stage: 'bud', disabled: false });
  assert.throws(
    () => TraitRuntime.deserialize(JSON.stringify(unknownOwner)),
    SerializationError,
  );

  const runtime = new TraitRuntime();
  runtime.applyUpgrade('porcupine-quills');
  const wrongSocket = JSON.parse(runtime.serialize()) as { sockets: Record<string, string> };
  wrongSocket.sockets.back = 'puffer-pouch';
  assert.throws(
    () => TraitRuntime.deserialize(JSON.stringify(wrongSocket)),
    /socket occupancy mismatch/,
  );
});

test('deserialize rejects duplicated timers and forged Mythics', () => {
  const runtime = new TraitRuntime();
  runtime.applyUpgrade('porcupine-quills');
  const duplicateTimer = JSON.parse(runtime.serialize()) as { timers: unknown[] };
  duplicateTimer.timers.push(duplicateTimer.timers[0]);
  assert.throws(
    () => TraitRuntime.deserialize(JSON.stringify(duplicateTimer)),
    /duplicate behavior timer/,
  );

  const forgedMythic = JSON.parse(new TraitRuntime().serialize()) as {
    evolutions: unknown[];
  };
  forgedMythic.evolutions.push({
    id: 'thornstorm-mantle',
    ingredients: ['porcupine-quills', 'puffer-pouch'],
  });
  assert.throws(
    () => TraitRuntime.deserialize(JSON.stringify(forgedMythic)),
    /ingredient is not consumed Master state/,
  );
});

test('canonical state hash is bound to gameplay content', () => {
  const defaultRuntime = new TraitRuntime();
  const catalog = cloneCatalog();
  const quills = catalog.traits.find((trait) => trait.id === 'porcupine-quills')!;
  quills.stages.bud.behavior.emit!.damage = 779;
  const customRuntime = new TraitRuntime({ catalog });
  assert.notEqual(customRuntime.hash(), defaultRuntime.hash());
});

test('getState returns a detached snapshot', () => {
  const runtime = new TraitRuntime();
  runtime.applyUpgrade('porcupine-quills');
  const hash = runtime.hash();
  const snapshot = runtime.getState();
  snapshot.tick = 999;
  snapshot.owned.length = 0;
  snapshot.sockets.back = 'forged';
  assert.equal(runtime.hash(), hash);
  assert.equal(runtime.stageOf('porcupine-quills'), 'bud');
});
