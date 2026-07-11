import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('same seed produces identical first 1000 uint32s', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 1000; i++) {
    assert.equal(a.nextUint32(), b.nextUint32());
  }
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  let same = true;
  for (let i = 0; i < 32; i++) {
    if (a.nextUint32() !== b.nextUint32()) {
      same = false;
      break;
    }
  }
  assert.equal(same, false);
});

test('getState/setState round trip resumes the sequence identically', () => {
  const a = createRng(999);
  for (let i = 0; i < 50; i++) a.nextUint32();
  const snapshot = a.getState();

  const expected: number[] = [];
  for (let i = 0; i < 20; i++) expected.push(a.nextUint32());

  // Different seed entirely — proves the continuation comes from setState,
  // not from coincidentally matching initial state.
  const b = createRng(0);
  b.setState(snapshot);
  const actual: number[] = [];
  for (let i = 0; i < 20; i++) actual.push(b.nextUint32());

  assert.deepEqual(actual, expected);
});

test('int() stays within [min, maxExcl) over many draws', () => {
  const rng = createRng(42);
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(-5, 10);
    assert.ok(v >= -5 && v < 10, `int out of range: ${v}`);
    assert.equal(v, Math.trunc(v));
  }
});

test('chance(0) is always false and chance(1) is always true', () => {
  const rng = createRng(7);
  for (let i = 0; i < 200; i++) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
  }
});

test('pickWeighted never selects zero-weight entries and is deterministic', () => {
  const weights = [0, 5, 0, 3, 0];
  const a = createRng(555);
  const b = createRng(555);
  const picksA: number[] = [];
  const picksB: number[] = [];
  for (let i = 0; i < 500; i++) picksA.push(a.pickWeighted(weights));
  for (let i = 0; i < 500; i++) picksB.push(b.pickWeighted(weights));

  assert.deepEqual(picksA, picksB);
  for (const idx of picksA) {
    assert.ok(weights[idx]! > 0, `picked zero-weight index ${idx}`);
  }
});

test('pickWeighted throws RangeError on all-zero weights or empty array', () => {
  const rng = createRng(1);
  assert.throws(() => rng.pickWeighted([0, 0, 0]), RangeError);
  assert.throws(() => rng.pickWeighted([]), RangeError);
});
