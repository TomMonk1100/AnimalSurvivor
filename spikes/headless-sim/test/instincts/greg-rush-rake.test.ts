import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RUSH_RAKE_CONFIG,
  createRushRakeState,
  stepRushRake,
  type RushRakeCluster,
  type RushRakeInput,
  type RushRakeState,
} from '../../src/instincts/greg-rush-rake.js';

const noClusters: readonly RushRakeCluster[] = [];

function input(overrides: Partial<RushRakeInput> = {}): RushRakeInput {
  return {
    distanceMovedMilliunits: 0,
    nearMissCount: 0,
    originX: 0,
    originY: 0,
    moveFacingX: 1,
    moveFacingY: 0,
    clusters: noClusters,
    ...overrides,
  };
}

function chargedState(overrides: Partial<RushRakeState> = {}): RushRakeState {
  return {
    ...createRushRakeState(),
    chargeMilliunits: DEFAULT_RUSH_RAKE_CONFIG.chargeDistanceMilliunits - 100,
    ...overrides,
  };
}

test('charges from integer movement distance and advances exactly one integer tick', () => {
  const result = stepRushRake(createRushRakeState(), input({ distanceMovedMilliunits: 750 }));
  assert.deepEqual(result.state, { tick: 0, chargeMilliunits: 750, facingX: 1, facingY: 0 });
  assert.equal(result.command, null);
});

test('explicit near misses shorten the remaining charge distance deterministically', () => {
  const previous = { ...createRushRakeState(), chargeMilliunits: 2_000 };
  const reduced = stepRushRake(previous, input({ distanceMovedMilliunits: 500, nearMissCount: 1 }));
  assert.equal(reduced.state.chargeMilliunits, 12_500);

  const triggered = stepRushRake(reduced.state, input({ nearMissCount: 14 }));
  assert.equal(triggered.state.chargeMilliunits, 0);
  assert.equal(triggered.command?.kind, 'gregRushRakeBurst');
});

test('applies movement and near-miss bonus before deciding whether charge triggers', () => {
  const result = stepRushRake(
    chargedState({ chargeMilliunits: DEFAULT_RUSH_RAKE_CONFIG.chargeDistanceMilliunits - 1_000 }),
    input({ distanceMovedMilliunits: 100, nearMissCount: 1 }),
  );
  assert.equal(result.command?.kind, 'gregRushRakeBurst');
  assert.equal(result.state.chargeMilliunits, 0);
});

test('emits exactly three fixed-tick claw waves and resets charge at threshold', () => {
  const result = stepRushRake(chargedState({ tick: 40 }), input({ distanceMovedMilliunits: 100 }));
  assert.equal(result.state.tick, 41);
  assert.equal(result.state.chargeMilliunits, 0);
  assert.deepEqual(result.command, {
    kind: 'gregRushRakeBurst',
    tick: 41,
    originX: 0,
    originY: 0,
    aimX: 1,
    aimY: 0,
    targetClusterId: null,
    waves: [
      { index: 0, tickOffset: 0 },
      { index: 1, tickOffset: 12 },
      { index: 2, tickOffset: 24 },
    ],
  });
});

test('aims at the nearest in-range cluster in the movement-facing half-plane', () => {
  const clusters: readonly RushRakeCluster[] = [
    { id: 30, centerX: 20, centerY: 0, memberCount: 10 },
    { id: 20, centerX: 5, centerY: 5, memberCount: 2 },
    { id: 10, centerX: -1, centerY: 0, memberCount: 50 },
    { id: 5, centerX: 100, centerY: 0, memberCount: 50 },
  ];
  const result = stepRushRake(chargedState(), input({ distanceMovedMilliunits: 100, clusters }));

  assert.equal(result.command?.targetClusterId, 20);
  assert.ok(Math.abs((result.command?.aimX ?? 0) - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs((result.command?.aimY ?? 0) - Math.SQRT1_2) < 1e-12);
});

test('cluster selection is independent of input order and ties use lowest stable id', () => {
  const a = { id: 8, centerX: 6, centerY: 8, memberCount: 1 };
  const b = { id: 3, centerX: 8, centerY: 6, memberCount: 1 };
  const first = stepRushRake(chargedState(), input({ distanceMovedMilliunits: 100, clusters: [a, b] }));
  const second = stepRushRake(chargedState(), input({ distanceMovedMilliunits: 100, clusters: [b, a] }));

  assert.equal(first.command?.targetClusterId, 3);
  assert.deepEqual(first, second);
});

test('zero movement retains last facing and uses it when no cluster is eligible', () => {
  const previous = { ...chargedState(), facingX: 0, facingY: -1 };
  const result = stepRushRake(previous, input({ distanceMovedMilliunits: 100, moveFacingX: 0, moveFacingY: 0 }));
  assert.deepEqual(
    { aimX: result.command?.aimX, aimY: result.command?.aimY },
    { aimX: 0, aimY: -1 },
  );
});

test('invalid event values cannot inject fractional, negative, or non-finite charge', () => {
  for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = stepRushRake(createRushRakeState(), input({ distanceMovedMilliunits: value, nearMissCount: value }));
    assert.equal(result.state.chargeMilliunits, 0);
    assert.equal(result.command, null);
  }
});

test('is pure and deterministic for identical state and input', () => {
  const state = chargedState();
  const stateCopy = { ...state };
  const tickInput = input({
    distanceMovedMilliunits: 100,
    moveFacingX: 3,
    moveFacingY: 4,
    clusters: [{ id: 7, centerX: 9, centerY: 12, memberCount: 3 }],
  });

  const first = stepRushRake(state, tickInput);
  const second = stepRushRake(state, tickInput);
  assert.deepEqual(first, second);
  assert.deepEqual(state, stateCopy);
});
