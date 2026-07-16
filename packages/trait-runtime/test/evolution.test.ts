import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from '../src/definitions.js';
import {
  activeAttackSlots,
  applyUpgrade,
  createInitialState,
  fuseEvolution,
  stageOf,
} from '../src/build-state.js';
import { availableFusions } from '../src/evolution-resolver.js';

const catalog = getCatalog();

function toMaster(state: ReturnType<typeof createInitialState>, id: string): void {
  for (let rank = 1; rank <= 5; rank++) applyUpgrade(catalog, state, id);
}

test('two Masters create an explicit Thornstorm fusion choice without auto-resolving', () => {
  const state = createInitialState(0);
  toMaster(state, 'porcupine-quills');
  toMaster(state, 'puffer-pouch');

  assert.equal(state.evolutions.length, 0);
  const offers = availableFusions(catalog, state);
  assert.deepEqual(availableFusions(catalog, state), offers);
  assert.equal(offers.length, 1);
  const offer = offers[0]!;
  assert.deepEqual({
    evolutionId: offer.evolutionId,
    ingredients: offer.ingredients,
    freesLogicalSlot: offer.freesLogicalSlot,
  }, {
    evolutionId: 'thornstorm-mantle',
    ingredients: ['porcupine-quills', 'puffer-pouch'],
    freesLogicalSlot: true,
  });
  assert.equal(offer.pairKind, 'perfect');
  const {
    displayName,
    rarity,
    temperamentId,
    leanId,
    flavorIndex,
    variantSeed,
  } = offer;
  assert.ok(displayName !== undefined && displayName.length > 0);
  assert.ok(rarity !== undefined && rarity.length > 0);
  assert.ok(temperamentId !== undefined && temperamentId.length > 0);
  assert.ok(leanId !== undefined && leanId.length > 0);
  assert.ok(flavorIndex !== undefined && Number.isInteger(flavorIndex) && flavorIndex >= 0 && flavorIndex < 10);
  assert.ok(variantSeed !== undefined && Number.isInteger(variantSeed));

  const result = fuseEvolution(catalog, state, 'thornstorm-mantle');
  assert.deepEqual(result.outcome, {
    ok: true,
    kind: 'fused',
    evolutionId: 'thornstorm-mantle',
    ingredients: ['porcupine-quills', 'puffer-pouch'],
    logicalSlotCost: 1,
  });
  assert.equal(state.evolutions.length, 1);
  assert.deepEqual(state.evolutions[0]!.variant, {
    seed: variantSeed,
    temperamentId,
    leanId,
  });
});

test('fusion consumes two Masters into one logical attack while retaining inspectable ingredients', () => {
  const state = createInitialState(0);
  toMaster(state, 'porcupine-quills');
  toMaster(state, 'puffer-pouch');
  assert.equal(activeAttackSlots(state), 2);
  fuseEvolution(catalog, state, 'thornstorm-mantle');

  assert.equal(activeAttackSlots(state), 1);
  assert.equal(stageOf(state, 'porcupine-quills'), 'mythic');
  assert.equal(stageOf(state, 'puffer-pouch'), 'mythic');
  assert.equal(state.owned.filter((owned) => owned.disabled).length, 2);
});

test('a fused recipe cannot retrigger and requires Master rank', () => {
  const state = createInitialState(0);
  applyUpgrade(catalog, state, 'porcupine-quills');
  applyUpgrade(catalog, state, 'puffer-pouch');
  assert.equal(fuseEvolution(catalog, state, 'thornstorm-mantle').outcome.kind, 'notMastered');

  toMaster(state, 'porcupine-quills');
  toMaster(state, 'puffer-pouch');
  assert.equal(fuseEvolution(catalog, state, 'thornstorm-mantle').outcome.ok, true);
  assert.equal(fuseEvolution(catalog, state, 'thornstorm-mantle').outcome.kind, 'alreadyFused');
});

test('fused form retains both recipe sockets for its visual footprint', () => {
  const state = createInitialState(0);
  toMaster(state, 'porcupine-quills');
  toMaster(state, 'puffer-pouch');
  fuseEvolution(catalog, state, 'thornstorm-mantle');
  assert.equal(state.sockets.head, 'thornstorm-mantle');
  assert.equal(state.sockets.back, 'thornstorm-mantle');
});

test('only one Support Chimera may resolve in a run, while other Masters remain valid', () => {
  const state = createInitialState(0);
  toMaster(state, 'puffer-pouch');
  toMaster(state, 'bat-ears');
  const firstSupport = availableFusions(catalog, state).find((offer) => offer.pairKind === 'support');
  assert.equal(firstSupport?.evolutionId, 'chimera:puffer-pouch+bat-ears');
  assert.equal(fuseEvolution(catalog, state, firstSupport!.evolutionId).outcome.ok, true);

  toMaster(state, 'armadillo-greaves');
  toMaster(state, 'monarch-brood');
  assert.equal(
    availableFusions(catalog, state).some((offer) => offer.pairKind === 'support'),
    false,
    'the second support pair is intentionally not offered',
  );
  assert.equal(
    fuseEvolution(catalog, state, 'chimera:armadillo-greaves+monarch-brood').outcome.kind,
    'notMastered',
  );
  assert.equal(activeAttackSlots(state), 3, 'the blocked pair leaves both Master attacks independently usable');
});
