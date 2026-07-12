import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZonePool } from '../src/pools.js';

test('zone pool is bounded, generation-guarded, and reuses freed slots deterministically', () => {
  const zones = createZonePool(2);
  const first = zones.spawn();
  const second = zones.spawn();
  assert.equal(first, 0);
  assert.equal(second, 1);
  assert.equal(zones.spawn(), -1, 'full zones are never evicted by the pool');

  zones.data.radius[second] = 77;
  const stale = zones.idOf(second);
  zones.despawn(second);
  const reused = zones.spawn();

  assert.equal(reused, second, 'the most recently freed slot is reused first');
  assert.equal(zones.isLive(stale), false, 'generation invalidates stale presentation ids');
  assert.equal(zones.data.radius[reused], 0, 'all zone components reset before reuse');
});
