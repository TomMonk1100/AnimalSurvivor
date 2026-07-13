import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBennyBraceState,
  stepBennyBrace,
} from '../../src/instincts/benny-brace.js';

test('Benny Brace Bloom charges on contact and emits one reactive pulse at the threshold', () => {
  let state = createBennyBraceState();
  const first = stepBennyBrace(state, { contactHits: 1, originX: 10, originY: 20 });
  assert.equal(first.pulse, null);
  state = first.state;

  const second = stepBennyBrace(state, { contactHits: 1, originX: 10, originY: 20 });
  assert.deepEqual(second.pulse, {
    kind: 'bennyBracePulse',
    tick: 1,
    originX: 10,
    originY: 20,
    radius: 92,
    damage: 14,
    knockbackStrength: 26,
  });
  assert.equal(second.state.charge, 0);
  assert.equal(second.state.cooldownTicksRemaining, 90);
});

test('Benny Brace Bloom does not retrigger during its fixed cooldown', () => {
  let state = createBennyBraceState();
  state = stepBennyBrace(state, { contactHits: 2, originX: 0, originY: 0 }).state;
  for (let tick = 0; tick < 89; tick++) {
    const result = stepBennyBrace(state, { contactHits: 2, originX: 0, originY: 0 });
    assert.equal(result.pulse, null);
    state = result.state;
  }
  const afterCooldown = stepBennyBrace(state, { contactHits: 2, originX: 0, originY: 0 });
  assert.notEqual(afterCooldown.pulse, null);
});
