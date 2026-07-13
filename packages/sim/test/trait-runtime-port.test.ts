import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertTraitRuntimePort,
  createTraitRuntimePort,
  type TraitRuntimeFactoryOptions,
  type TraitRuntimePort,
} from '../src/trait-runtime-port.js';

function runtimePort(): TraitRuntimePort {
  return {
    update: () => ({ length: 0, at: () => { throw new RangeError('empty'); } }),
    offers: () => [],
    applyUpgrade: (traitId) => ({
      outcome: { ok: true, kind: 'created', traitId, stage: 'bud' },
      evolved: null,
    }),
    visualState: () => [],
    hash: () => 'runtime-hash',
    fingerprint: () => 'catalog-fingerprint',
  };
}

test('creates a structural runtime port with deterministic factory options', () => {
  let received: TraitRuntimeFactoryOptions | undefined;
  const expected = runtimePort();
  const actual = createTraitRuntimePort((options) => {
    received = options;
    return expected;
  }, { seed: 42, initialTick: 0 });

  assert.equal(actual, expected);
  assert.deepEqual(received, { seed: 42, initialTick: 0 });
});

test('accepts the trait runtime initial tick sentinel', () => {
  assert.doesNotThrow(() => createTraitRuntimePort(() => runtimePort(), {
    seed: -12.5,
    initialTick: -1,
  }));
});

test('rejects malformed deterministic factory options before invocation', () => {
  let calls = 0;
  const factory = (): TraitRuntimePort => {
    calls += 1;
    return runtimePort();
  };

  assert.throws(
    () => createTraitRuntimePort(factory, { seed: Number.NaN, initialTick: 0 }),
    /seed must be finite/,
  );
  assert.throws(
    () => createTraitRuntimePort(factory, { seed: 1, initialTick: -2 }),
    /initialTick/,
  );
  assert.throws(
    () => createTraitRuntimePort(factory, { seed: 1, initialTick: 0.5 }),
    /initialTick/,
  );
  assert.equal(calls, 0);
});

test('rejects non-object and incomplete factory results', () => {
  assert.throws(
    () => createTraitRuntimePort((() => null) as unknown as () => TraitRuntimePort, {
      seed: 1,
      initialTick: 0,
    }),
    /must return an object/,
  );

  for (const missing of ['update', 'offers', 'applyUpgrade', 'visualState', 'hash', 'fingerprint'] as const) {
    const malformed = runtimePort() as unknown as Record<string, unknown>;
    delete malformed[missing];
    assert.throws(() => assertTraitRuntimePort(malformed), new RegExp(`port\\.${missing}`));
  }
});
