import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunDirectorPort, type RunDirectorPort } from '../src/run-director-port.js';

function port(): RunDirectorPort {
  return {
    outcome: 'running', tick: -1, phase: 'opening',
    step: () => [], stateHash: () => '12345678', contentFingerprint: () => 'abcdef01',
  };
}

test('constructs a structural run director with the simulation seed', () => {
  let received = 0;
  const expected = port();
  const actual = createRunDirectorPort(({ seed }) => { received = seed; return expected; }, { seed: 42 });
  assert.equal(actual, expected);
  assert.equal(received, 42);
});

test('rejects malformed run director factories at injection time', () => {
  assert.throws(() => createRunDirectorPort((() => null) as never, { seed: 1 }), /return an object/);
  const malformed = port() as unknown as Record<string, unknown>;
  delete malformed.step;
  assert.throws(() => createRunDirectorPort(() => malformed as unknown as RunDirectorPort, { seed: 1 }), /\.step/);
});
