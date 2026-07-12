import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  TraitRuntimePort,
  TraitUpgradeApplyResultView,
  TraitUpgradeOfferView,
} from '../src/trait-runtime-port.js';
import { PASSIVE_SLOT_CAPACITY, createRunUpgradeQueue } from '../src/run-upgrade-queue.js';
import { UNIVERSAL_UPGRADE_CATALOG } from '../src/universal-upgrades.js';

const SUCCESS: TraitUpgradeApplyResultView = {
  outcome: { ok: true, kind: 'created', traitId: 'unused', stage: 'bud' },
  evolved: null,
};

function traitOffer(traitId: string): TraitUpgradeOfferView {
  return { traitId, resultStage: 'bud' };
}

function fakeRuntime(batches: TraitUpgradeOfferView[][]): TraitRuntimePort & { readonly applied: string[] } {
  let cursor = 0;
  const applied: string[] = [];
  return {
    applied,
    update: () => ({ length: 0, at: () => { throw new RangeError('empty'); } }),
    offers: () => batches[cursor++] ?? [],
    applyUpgrade(traitId) {
      applied.push(traitId);
      return SUCCESS;
    },
    visualState: () => [],
    hash: () => 'runtime-hash',
    fingerprint: () => 'catalog-fingerprint',
  };
}

test('mixes animal cards with neutral cards and applies each through the correct authority', () => {
  const runtime = fakeRuntime([
    [traitOffer('quills'), traitOffer('pouch')],
    [traitOffer('quills'), traitOffer('pouch')],
  ]);
  const queue = createRunUpgradeQueue(runtime, { universalCatalog: UNIVERSAL_UPGRADE_CATALOG });

  queue.enqueueLevels(2);
  assert.deepEqual(queue.pendingOffers.map((offer) => offer.kind), ['trait', 'trait', 'universal']);
  assert.deepEqual(queue.pendingOffers.map((offer) => offer.id), [
    'trait:quills', 'trait:pouch', 'universal:swift-paws',
  ]);

  assert.deepEqual(queue.select('universal:swift-paws', 7), {
    tick: 7,
    kind: 'universal',
    id: 'universal:swift-paws',
  });
  assert.deepEqual(runtime.applied, []);
  assert.equal(queue.universalStats?.speedMultiplier, 1.08);
  assert.equal(queue.queuedLevels, 1);

  const trait = queue.pendingOffers.find((offer) => offer.kind === 'trait');
  assert.ok(trait !== undefined && trait.kind === 'trait');
  queue.select(trait.id, 7);
  assert.deepEqual(runtime.applied, [trait.traitId]);
});

test('reserves a neutral card when the animal runtime can fill every chooser slot', () => {
  const runtime = fakeRuntime([[
    traitOffer('quills'), traitOffer('pouch'), traitOffer('coil'),
  ]]);
  const queue = createRunUpgradeQueue(runtime, { universalCatalog: UNIVERSAL_UPGRADE_CATALOG, offerCount: 3 });

  queue.enqueueLevels(1);
  assert.deepEqual(queue.pendingOffers.map((offer) => offer.id), [
    'trait:quills', 'trait:pouch', 'universal:swift-paws',
  ]);
});

test('locks a five-passive build, rotates its ranks fairly, then falls back to Essence', () => {
  const queue = createRunUpgradeQueue(null, {
    universalCatalog: UNIVERSAL_UPGRADE_CATALOG,
    offerCount: 1,
    essenceCacheAmount: 7,
  });

  queue.enqueueLevels(PASSIVE_SLOT_CAPACITY * 5 + 1);
  const seen = new Set<string>();
  for (let index = 0; index < PASSIVE_SLOT_CAPACITY * 5; index++) {
    const offer = queue.pendingOffers[0]!;
    assert.equal(offer.kind, 'universal');
    if (offer.kind !== 'universal') throw new Error('expected a universal card');
    seen.add(offer.upgradeId);
    queue.select(offer.id, index);
  }
  assert.deepEqual([...seen].sort(), [
    'rapid-instinct', 'sharpened-instinct', 'sturdy-hide', 'swift-paws', 'xp-magnet',
  ]);
  assert.equal(queue.universalSlotCapacity, PASSIVE_SLOT_CAPACITY);
  assert.equal(queue.universalSlotsUsed, PASSIVE_SLOT_CAPACITY);
  assert.deepEqual(queue.pendingOffers, [{ kind: 'essence', id: 'essence-cache', amount: 7 }]);
  assert.deepEqual(queue.select('essence-cache', PASSIVE_SLOT_CAPACITY * 5), {
    tick: PASSIVE_SLOT_CAPACITY * 5,
    kind: 'essence',
    id: 'essence-cache',
  });
  assert.equal(queue.essenceEarned, 7);
  assert.equal(queue.queuedLevels, 0);
  assert.equal(queue.drainedLevels, 0);
});

test('keeps legacy trait-only queues compatible by draining impossible later levels', () => {
  const queue = createRunUpgradeQueue(fakeRuntime([[]]));
  queue.enqueueLevels(3);
  assert.equal(queue.queuedLevels, 0);
  assert.equal(queue.drainedLevels, 3);
  assert.equal(queue.blocked, false);
});

test('rejects an unknown selection without altering a pending mixed offer set', () => {
  const queue = createRunUpgradeQueue(null, { universalCatalog: UNIVERSAL_UPGRADE_CATALOG });
  queue.enqueueLevels(1);
  const pending = queue.pendingOffers;
  assert.throws(() => queue.select('trait:not-offered', 1), /not a pending upgrade offer/);
  assert.equal(queue.pendingOffers, pending);
  assert.equal(queue.queuedLevels, 1);
});
