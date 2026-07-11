import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SimConfig } from '../src/config.js';
import { DEFAULT_CONFIG, fingerprintConfig, validateConfig } from '../src/config.js';
import { createSimulation } from '../src/simulation.js';

test('default config validates and fingerprints identically across independent calls', () => {
  assert.doesNotThrow(() => validateConfig(DEFAULT_CONFIG));
  assert.match(fingerprintConfig(DEFAULT_CONFIG), /^[0-9a-f]{16}$/);
  assert.equal(fingerprintConfig(DEFAULT_CONFIG), fingerprintConfig({ ...DEFAULT_CONFIG }));
});

test('fingerprint changes when a gameplay value changes', () => {
  const changed: SimConfig = {
    ...DEFAULT_CONFIG,
    weapon: { ...DEFAULT_CONFIG.weapon, damage: DEFAULT_CONFIG.weapon.damage + 1 },
  };
  assert.notEqual(fingerprintConfig(changed), fingerprintConfig(DEFAULT_CONFIG));

  const behaviorChanged: SimConfig = {
    ...DEFAULT_CONFIG,
    enemyBehavior: {
      ...DEFAULT_CONFIG.enemyBehavior,
      spitterFireIntervalTicks: DEFAULT_CONFIG.enemyBehavior.spitterFireIntervalTicks + 1,
    },
  };
  assert.notEqual(fingerprintConfig(behaviorChanged), fingerprintConfig(DEFAULT_CONFIG));
});

test('validation rejects capacities that can collide with packed ids', () => {
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, enemyCap: 0 }), /enemyCap/);
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, enemyCap: 0xffff }), /enemyCap/);
});

test('validation rejects mismatched wave weights and non-finite values', () => {
  const badWeights: SimConfig = {
    ...DEFAULT_CONFIG,
    waves: [{ ...DEFAULT_CONFIG.waves[0]!, archetypeWeights: [1] }],
  };
  assert.throws(() => validateConfig(badWeights), /archetypeWeights/);
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, hz: Number.POSITIVE_INFINITY }), /hz/);
  assert.throws(() => validateConfig({
    ...DEFAULT_CONFIG,
    enemyBehavior: { ...DEFAULT_CONFIG.enemyBehavior, runnerWeaveStrength: 2 },
  }), /runnerWeaveStrength/);
  assert.throws(() => validateConfig({
    ...DEFAULT_CONFIG,
    enemyBehavior: { ...DEFAULT_CONFIG.enemyBehavior, eliteFireIntervalTicks: 0 },
  }), /eliteFireIntervalTicks/);
  assert.throws(() => validateConfig({
    ...DEFAULT_CONFIG,
    enemyBehavior: { ...DEFAULT_CONFIG.enemyBehavior, spitterProjectileDamage: 0 },
  }), /spitterProjectileDamage/);
});

test('simulation rejects non-finite input before recording or mutation', () => {
  const sim = createSimulation(DEFAULT_CONFIG, 1);
  const before = sim.hash();
  assert.throws(
    () => sim.step({ moveX: Number.POSITIVE_INFINITY, moveY: 0, paused: false }),
    /finite moveX\/moveY/,
  );
  assert.equal(sim.hash(), before);
  assert.equal(sim.getReplay().inputs.length, 0);
});
