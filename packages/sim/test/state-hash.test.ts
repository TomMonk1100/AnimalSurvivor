import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHashWriter } from '../src/state-hash.js';

test('same write sequence produces the same digest', () => {
  const a = createHashWriter();
  a.u32(1);
  a.f32(3.5);
  a.str('hello');
  a.i32(-7);
  const digestA = a.digestHex();

  const b = createHashWriter();
  b.u32(1);
  b.f32(3.5);
  b.str('hello');
  b.i32(-7);
  const digestB = b.digestHex();

  assert.equal(digestA, digestB);
});

test('different write order produces a different digest', () => {
  const a = createHashWriter();
  a.u32(1);
  a.u32(2);
  const digestA = a.digestHex();

  const b = createHashWriter();
  b.u32(2);
  b.u32(1);
  const digestB = b.digestHex();

  assert.notEqual(digestA, digestB);
});

test('f32 distinguishes 0 from -0 by bit pattern', () => {
  const a = createHashWriter();
  a.f32(0);
  const digestA = a.digestHex();

  const b = createHashWriter();
  b.f32(-0);
  const digestB = b.digestHex();

  assert.notEqual(digestA, digestB);
});

test('digestHex returns exactly 16 lowercase hex characters', () => {
  const w = createHashWriter();
  w.u8(1);
  w.u16(2);
  w.u32(3);
  w.f64(1.5);
  const digest = w.digestHex();
  assert.equal(digest.length, 16);
  assert.match(digest, /^[0-9a-f]{16}$/);
});

test('digestHex throws if called twice (writer is spent after first call)', () => {
  const w = createHashWriter();
  w.u8(1);
  w.digestHex();
  assert.throws(() => w.digestHex());
});
