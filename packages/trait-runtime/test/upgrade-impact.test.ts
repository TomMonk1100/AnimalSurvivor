import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeTraitUpgradeImpact } from '../src/index.js';

test('trait impact metadata follows executable rank behavior instead of visual-stage labels', () => {
  const rankTwo = describeTraitUpgradeImpact('porcupine-quills', 2);
  assert.ok(rankTwo);
  assert.equal(rankTwo.rankTransition, 'Rank 1 → 2');
  assert.equal(rankTwo.category, 'Direct damage');
  assert.equal(rankTwo.directDamage, true);
  assert.match(rankTwo.delta, /cadence 90 → 60 ticks/);
  assert.match(rankTwo.delta, /damage 4 → 6/);
  assert.match(rankTwo.delta, /count 3 → 5/);
  assert.match(rankTwo.delta, /pierce 1 → 2/);

  const rankFive = describeTraitUpgradeImpact('porcupine-quills', 5);
  assert.ok(rankFive);
  assert.equal(rankFive.rankTransition, 'Rank 4 → 5');
  assert.match(rankFive.delta, /cadence 46 → 38 ticks/);
});

test('trait impact metadata calls utility outcomes out without inventing direct damage', () => {
  const puffer = describeTraitUpgradeImpact('puffer-pouch', 2);
  assert.ok(puffer);
  assert.equal(puffer.category, 'Crowd control');
  assert.equal(puffer.directDamage, false);
  assert.match(puffer.summary, /no direct damage/i);
  assert.match(puffer.delta, /force 5 → 9/);

  const bat = describeTraitUpgradeImpact('bat-ears', 1);
  assert.ok(bat);
  assert.equal(bat.category, 'Targeting');
  assert.equal(bat.directDamage, false);
  assert.match(bat.delta, /Targeting unlock — no direct damage/i);
});

test('unknown or invalid trait impact requests remain safely unavailable', () => {
  assert.equal(describeTraitUpgradeImpact('unknown-trait', 1), undefined);
  assert.equal(describeTraitUpgradeImpact('porcupine-quills', 0), undefined);
  assert.equal(describeTraitUpgradeImpact('porcupine-quills', 6), undefined);
});
