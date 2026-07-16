import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from '../src/definitions.js';
import {
  activeAttackSlots,
  applyUpgrade,
  createInitialState,
  rankOf,
  socketOwner,
  stageOf,
} from '../src/build-state.js';
import { hashState } from '../src/state-hash.js';

const catalog = getCatalog();

test('locked -> rank 1 through Master progression', () => {
  const s = createInitialState(0);
  assert.equal(stageOf(s, 'porcupine-quills'), 'locked');
  assert.equal(rankOf(s, 'porcupine-quills'), null);

  const r1 = applyUpgrade(catalog, s, 'porcupine-quills');
  assert.deepEqual(r1.outcome, {
    ok: true,
    kind: 'created',
    traitId: 'porcupine-quills',
    stage: 'bud',
    rank: 1,
  });
  assert.equal(stageOf(s, 'porcupine-quills'), 'bud');
  assert.equal(rankOf(s, 'porcupine-quills'), 1);
  assert.equal(socketOwner(s, 'back'), 'porcupine-quills');

  for (const rank of [2, 3, 4, 5] as const) {
    const result = applyUpgrade(catalog, s, 'porcupine-quills');
    assert.equal(result.outcome.kind, 'advanced');
    if (result.outcome.ok) assert.equal(result.outcome.rank, rank);
    assert.equal(rankOf(s, 'porcupine-quills'), rank);
    assert.equal(stageOf(s, 'porcupine-quills'), 'adapted');
  }
});

test('advancing beyond Master is maxed', () => {
  const s = createInitialState(0);
  for (let rank = 1; rank <= 5; rank++) applyUpgrade(catalog, s, 'porcupine-quills');
  const r = applyUpgrade(catalog, s, 'porcupine-quills');
  assert.equal(r.outcome.ok, false);
  assert.equal(r.outcome.kind, 'maxed');
});

test('unknown trait id is rejected without mutation', () => {
  const s = createInitialState(0);
  const before = hashState(s);
  const r = applyUpgrade(catalog, s, 'not-a-real-trait');
  assert.equal(r.outcome.kind, 'unknownTrait');
  assert.equal(hashState(s), before);
});

test('shared socket acquisition succeeds while retaining a stable primary projection', () => {
  // owl-pinions and crab-pincers both use leftShoulder+rightShoulder.
  const s = createInitialState(0);
  applyUpgrade(catalog, s, 'owl-pinions');
  const before = hashState(s);
  const r = applyUpgrade(catalog, s, 'crab-pincers');
  assert.deepEqual(r.outcome, {
    ok: true,
    kind: 'created',
    traitId: 'crab-pincers',
    stage: 'bud',
    rank: 1,
  });
  // The legacy single-owner projection remains deterministic: first active
  // claimant wins, while both attacks stay logically active and renderable.
  assert.equal(socketOwner(s, 'leftShoulder'), 'owl-pinions');
  assert.equal(socketOwner(s, 'rightShoulder'), 'owl-pinions');
  assert.equal(stageOf(s, 'crab-pincers'), 'bud');
  assert.equal(activeAttackSlots(s), 2);
  assert.notEqual(hashState(s), before);
});

test('the primary projection retains each earliest claim across partial socket overlap', () => {
  const s = createInitialState(0);
  // Mantis claims the left shoulder; Owl subsequently shares it and claims the
  // otherwise-free right shoulder.
  applyUpgrade(catalog, s, 'mantis-scythes');
  const r = applyUpgrade(catalog, s, 'owl-pinions');
  assert.equal(r.outcome.kind, 'created');
  assert.equal(socketOwner(s, 'leftShoulder'), 'mantis-scythes');
  assert.equal(socketOwner(s, 'rightShoulder'), 'owl-pinions');
  assert.equal(stageOf(s, 'owl-pinions'), 'bud');
  assert.equal(activeAttackSlots(s), 2);
});
