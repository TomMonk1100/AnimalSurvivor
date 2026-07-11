import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommandBuffer } from '../src/command-buffer.js';

test('acquire fills up to capacity then overflows safely and counts drops', () => {
  const buf = createCommandBuffer(3);
  for (let i = 0; i < 3; i++) {
    const c = buf.acquire();
    assert.ok(c !== null);
    c!.kind = 'telegraph';
    c!.tick = i;
  }
  assert.equal(buf.length, 3);
  // Overflow: three more acquisitions all dropped.
  for (let i = 0; i < 3; i++) {
    assert.equal(buf.acquire(), null);
  }
  assert.equal(buf.overflowCount, 3);
  assert.equal(buf.length, 3);
});

test('reset clears length and overflow without reallocating slot identity', () => {
  const buf = createCommandBuffer(2);
  const a0 = buf.acquire();
  buf.acquire();
  buf.acquire(); // overflow
  assert.equal(buf.overflowCount, 1);
  buf.reset();
  assert.equal(buf.length, 0);
  assert.equal(buf.overflowCount, 0);
  const a0Again = buf.acquire();
  // Same underlying struct is reused (zero steady-state allocation).
  assert.equal(a0Again, a0);
});

test('acquire returns a zeroed struct (no stale field leakage)', () => {
  const buf = createCommandBuffer(1);
  const c = buf.acquire()!;
  c.damage = 99;
  c.tag = 'dirty';
  c.count = 7;
  buf.reset();
  const c2 = buf.acquire()!;
  assert.equal(c2.damage, 0);
  assert.equal(c2.tag, '');
  assert.equal(c2.count, 0);
});

test('countsByKind reflects buffer contents', () => {
  const buf = createCommandBuffer(4);
  buf.acquire()!.kind = 'telegraph';
  buf.acquire()!.kind = 'areaGather';
  buf.acquire()!.kind = 'telegraph';
  const counts = buf.countsByKind();
  assert.equal(counts.telegraph, 2);
  assert.equal(counts.areaGather, 1);
  assert.equal(counts.radialProjectileBurst, 0);
});

test('capacity below 1 throws', () => {
  assert.throws(() => createCommandBuffer(0));
});
