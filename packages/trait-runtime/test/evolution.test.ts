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
  assert.deepEqual(availableFusions(catalog, state), [{
    evolutionId: 'thornstorm-mantle',
    ingredients: ['porcupine-quills', 'puffer-pouch'],
    freesLogicalSlot: true,
  }]);

  const result = fuseEvolution(catalog, state, 'thornstorm-mantle');
  assert.deepEqual(result.outcome, {
    ok: true,
    kind: 'fused',
    evolutionId: 'thornstorm-mantle',
    ingredients: ['porcupine-quills', 'puffer-pouch'],
    logicalSlotCost: 1,
  });
  assert.equal(state.evolutions.length, 1);
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
