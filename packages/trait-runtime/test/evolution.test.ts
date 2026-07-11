import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from '../src/definitions.js';
import { applyUpgrade, createInitialState, stageOf } from '../src/build-state.js';

const catalog = getCatalog();

function toAdapted(s: ReturnType<typeof createInitialState>, id: string): void {
  applyUpgrade(catalog, s, id);
  applyUpgrade(catalog, s, id);
}

test('Thornstorm resolves exactly once when both ingredients become Adapted', () => {
  const s = createInitialState(0);
  toAdapted(s, 'porcupine-quills');

  // Only one ingredient adapted -> no resolution yet.
  applyUpgrade(catalog, s, 'puffer-pouch'); // pouch bud
  assert.equal(s.evolutions.length, 0);

  const r = applyUpgrade(catalog, s, 'puffer-pouch'); // pouch adapted -> resolves
  assert.equal(r.evolved, 'thornstorm-mantle');
  assert.equal(s.evolutions.length, 1);
});

test('both ingredient traits are disabled and reported as mythic after resolution', () => {
  const s = createInitialState(0);
  toAdapted(s, 'porcupine-quills');
  toAdapted(s, 'puffer-pouch');
  assert.equal(stageOf(s, 'porcupine-quills'), 'mythic');
  assert.equal(stageOf(s, 'puffer-pouch'), 'mythic');
  // Ingredient state remains inspectable.
  assert.equal(s.owned.filter((o) => o.disabled).length, 2);
});

test('applying duplicates after Mythic does not retrigger the evolution', () => {
  const s = createInitialState(0);
  toAdapted(s, 'porcupine-quills');
  toAdapted(s, 'puffer-pouch');
  assert.equal(s.evolutions.length, 1);

  const r = applyUpgrade(catalog, s, 'porcupine-quills');
  assert.equal(r.outcome.kind, 'alreadyMythic');
  assert.equal(r.evolved, null);
  assert.equal(s.evolutions.length, 1);
});

test('mythic keeps both recipe sockets occupied by the evolution', () => {
  const s = createInitialState(0);
  toAdapted(s, 'porcupine-quills');
  toAdapted(s, 'puffer-pouch');
  assert.equal(s.sockets['head'], 'thornstorm-mantle');
  assert.equal(s.sockets['back'], 'thornstorm-mantle');
});
