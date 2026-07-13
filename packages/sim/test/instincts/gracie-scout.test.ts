import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGracieScoutState,
  stepGracieScout,
} from '../../src/instincts/gracie-scout.js';

test('Gracie Scout marks the nearest forward targets with stable id tie breaks', () => {
  const result = stepGracieScout(createGracieScoutState(), {
    originX: 0,
    originY: 0,
    moveFacingX: 1,
    moveFacingY: 0,
    targets: [
      { id: 9, x: 90, y: 0 },
      { id: 4, x: 90, y: 0 },
      { id: 2, x: 40, y: 0 },
      { id: 8, x: -20, y: 0 },
    ],
  });
  assert.deepEqual(result.pulse?.targetIds, [2, 4, 9]);
  assert.equal(result.state.cooldownTicksRemaining, 120);
});

test('Gracie Scout is deterministic across target input order and respects the cooldown', () => {
  const input = {
    originX: 4,
    originY: 5,
    moveFacingX: 0,
    moveFacingY: 0,
    targets: [{ id: 3, x: 20, y: 5 }, { id: 1, x: 40, y: 5 }],
  } as const;
  const first = stepGracieScout(createGracieScoutState(), input);
  const second = stepGracieScout(createGracieScoutState(), { ...input, targets: [...input.targets].reverse() });
  assert.deepEqual(first, second);
  const blocked = stepGracieScout(first.state, input);
  assert.equal(blocked.pulse, null);
});
