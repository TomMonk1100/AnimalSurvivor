import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  TraitRuntimePort,
  TraitUpgradeApplyResultView,
  TraitUpgradeOfferView,
} from '../src/trait-runtime-port.js';
import { createTraitUpgradeQueue } from '../src/trait-upgrade-queue.js';

const SUCCESS: TraitUpgradeApplyResultView = {
  outcome: { ok: true, kind: 'created', traitId: 'unused', stage: 'bud' },
  evolved: null,
};

function offer(traitId: string): TraitUpgradeOfferView {
  return { traitId, resultStage: 'bud' };
}

function fakeRuntime(offerBatches: TraitUpgradeOfferView[][]): TraitRuntimePort & {
  readonly requestedCounts: number[];
  readonly applied: string[];
  applyResult: TraitUpgradeApplyResultView;
} {
  const requestedCounts: number[] = [];
  const applied: string[] = [];
  let cursor = 0;
  return {
    requestedCounts,
    applied,
    applyResult: SUCCESS,
    update: () => ({ length: 0, at: () => { throw new RangeError('empty'); } }),
    offers(count) {
      requestedCounts.push(count);
      return offerBatches[cursor++] ?? [];
    },
    applyUpgrade(traitId) {
      applied.push(traitId);
      return this.applyResult;
    },
    visualState: () => [],
    hash: () => 'runtime-hash',
    fingerprint: () => 'catalog-fingerprint',
  };
}

test('enqueues multiple levels behind one ordered offer set without rerolling', () => {
  const runtime = fakeRuntime([[offer('quills'), offer('pouch'), offer('coil')]]);
  const queue = createTraitUpgradeQueue(runtime);

  queue.enqueueLevels(2);
  queue.enqueueLevels(1);

  assert.equal(queue.queuedLevels, 3);
  assert.equal(queue.blocked, true);
  assert.deepEqual(queue.pendingOffers.map((entry) => entry.traitId), ['quills', 'pouch', 'coil']);
  assert.deepEqual(runtime.requestedCounts, [3]);
});

test('selects only an offered trait and records its simulation tick', () => {
  const runtime = fakeRuntime([[offer('quills')], [offer('pouch')]]);
  const queue = createTraitUpgradeQueue(runtime, { offerCount: 1 });
  queue.enqueueLevels(2);

  assert.throws(() => queue.select('coil', 17), /not a pending upgrade offer/);
  assert.deepEqual(runtime.applied, []);
  assert.equal(queue.queuedLevels, 2);

  assert.deepEqual(queue.select('quills', 17), { tick: 17, traitId: 'quills' });
  assert.deepEqual(runtime.applied, ['quills']);
  assert.equal(queue.queuedLevels, 1);
  assert.deepEqual(queue.pendingOffers, [offer('pouch')]);
  assert.equal(queue.selectionCount, 1);
});

test('preserves level ordering by generating the next offers only after selection', () => {
  const runtime = fakeRuntime([
    [offer('first-a'), offer('first-b')],
    [offer('second-a'), offer('second-b')],
    [offer('third-a')],
  ]);
  const queue = createTraitUpgradeQueue(runtime, { offerCount: 2 });
  queue.enqueueLevels(3);

  queue.select('first-b', 4);
  assert.deepEqual(queue.pendingOffers.map((entry) => entry.traitId), ['second-a', 'second-b']);
  queue.select('second-a', 4);
  assert.deepEqual(queue.pendingOffers.map((entry) => entry.traitId), ['third-a']);
  queue.select('third-a', 4);

  assert.equal(queue.queuedLevels, 0);
  assert.equal(queue.blocked, false);
  assert.deepEqual(runtime.requestedCounts, [2, 2, 2]);
});

test('automatically drains all queued levels when no eligible offers remain', () => {
  const runtime = fakeRuntime([[]]);
  const queue = createTraitUpgradeQueue(runtime);

  queue.enqueueLevels(5);

  assert.equal(queue.queuedLevels, 0);
  assert.equal(queue.drainedLevels, 5);
  assert.equal(queue.pendingOfferCount, 0);
  assert.equal(queue.blocked, false);
});

test('drains later levels after the final eligible selection', () => {
  const runtime = fakeRuntime([[offer('last')], []]);
  const queue = createTraitUpgradeQueue(runtime);
  queue.enqueueLevels(4);

  assert.deepEqual(queue.select('last', 9), { tick: 9, traitId: 'last' });
  assert.equal(queue.queuedLevels, 0);
  assert.equal(queue.drainedLevels, 3);
  assert.equal(queue.selectionCount, 1);
  assert.equal(queue.blocked, false);
});

test('keeps queue state atomic when an offered runtime upgrade is rejected', () => {
  const runtime = fakeRuntime([[offer('quills')]]);
  runtime.applyResult = {
    outcome: { ok: false, kind: 'maxed', traitId: 'quills' },
    evolved: null,
  };
  const queue = createTraitUpgradeQueue(runtime);
  queue.enqueueLevels(2);
  const pending = queue.pendingOffers;

  assert.throws(() => queue.select('quills', 3), /was rejected: maxed/);
  assert.equal(queue.queuedLevels, 2);
  assert.equal(queue.selectionCount, 0);
  assert.equal(queue.pendingOffers, pending);
  assert.equal(queue.blocked, true);
});

test('validates counts and selection ticks before touching the runtime', () => {
  const runtime = fakeRuntime([[offer('quills')]]);
  const queue = createTraitUpgradeQueue(runtime);

  assert.throws(() => queue.enqueueLevels(-1), /non-negative safe integer/);
  assert.throws(() => queue.enqueueLevels(0.5), /non-negative safe integer/);
  assert.doesNotThrow(() => queue.enqueueLevels(0));
  assert.deepEqual(runtime.requestedCounts, []);

  queue.enqueueLevels(1);
  assert.throws(() => queue.select('quills', -1), /non-negative safe integer/);
  assert.deepEqual(runtime.applied, []);
  assert.throws(() => createTraitUpgradeQueue(runtime, { offerCount: 0 }), /positive safe integer/);
});
