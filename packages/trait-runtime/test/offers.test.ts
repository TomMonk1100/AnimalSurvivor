import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from '../src/definitions.js';
import { applyUpgrade, createInitialState } from '../src/build-state.js';
import { generateOffers } from '../src/offer-director.js';
import { createRng } from '../src/rng.js';

const catalog = getCatalog();

test('offers are deterministic for the same seed and state', () => {
  const s = createInitialState(0);
  const a = generateOffers(catalog, s, createRng(42), 3);
  const b = generateOffers(catalog, s, createRng(42), 3);
  assert.deepEqual(a, b);
});

test('different seeds can produce different selections', () => {
  const s = createInitialState(0);
  const a = generateOffers(catalog, s, createRng(1), 3);
  const b = generateOffers(catalog, s, createRng(9999), 3);
  // Not a strict guarantee, but with 12 eligible traits these should differ.
  assert.notDeepEqual(a, b);
});

test('offers exclude maxed (adapted) and socket-blocked traits', () => {
  const s = createInitialState(0);
  // Max out porcupine-quills to adapted (maxed without a recipe).
  applyUpgrade(catalog, s, 'porcupine-quills');
  applyUpgrade(catalog, s, 'porcupine-quills');
  // Occupy both shoulders so shoulder-traits become impossible offers.
  applyUpgrade(catalog, s, 'mantis-scythes');

  const offers = generateOffers(catalog, s, createRng(3), 20); // ask for more than exist
  const ids = offers.map((o) => o.traitId);

  // Adapted trait is excluded.
  assert.ok(!ids.includes('porcupine-quills'));
  // mantis-scythes is now bud -> offered as an advance to adapted.
  const mantis = offers.find((o) => o.traitId === 'mantis-scythes');
  assert.equal(mantis?.resultStage, 'adapted');
  // Shoulder-blocked locked traits are excluded (owl/crab need both shoulders).
  assert.ok(!ids.includes('owl-pinions'));
  assert.ok(!ids.includes('crab-pincers'));
});

test('offer count is capped and unique', () => {
  const s = createInitialState(0);
  const offers = generateOffers(catalog, s, createRng(5), 4);
  assert.equal(offers.length, 4);
  assert.equal(new Set(offers.map((o) => o.traitId)).size, 4);
});

test('requesting more than the eligible pool returns all in catalog order', () => {
  const s = createInitialState(0);
  const offers = generateOffers(catalog, s, createRng(5), 100);
  const eligibleIds = catalog.traits.map((t) => t.id);
  assert.deepEqual(
    offers.map((o) => o.traitId),
    eligibleIds,
  );
});
