import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/clock.js';

test('clock starts at tick 0', () => {
  const clock = createClock(60);
  assert.equal(clock.tick, 0);
});

test('dt equals 1/hz', () => {
  assert.equal(createClock(60).dt, 1 / 60);
  assert.equal(createClock(30).dt, 1 / 30);
  assert.equal(createClock(1).dt, 1);
});

test('advance increments tick by exactly 1', () => {
  const clock = createClock(60);
  clock.advance();
  assert.equal(clock.tick, 1);
  clock.advance();
  clock.advance();
  assert.equal(clock.tick, 3);
});

test('reset returns tick to 0', () => {
  const clock = createClock(60);
  clock.advance();
  clock.advance();
  clock.reset();
  assert.equal(clock.tick, 0);
});

test('invalid rates fail fast', () => {
  assert.throws(() => createClock(0), RangeError);
  assert.throws(() => createClock(Number.POSITIVE_INFINITY), RangeError);
});
