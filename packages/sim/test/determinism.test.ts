import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TickInput } from '../src/types.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { fingerprintConfig } from '../src/config.js';
import { createSimulation, runReplay } from '../src/simulation.js';
import { serializeReplay, deserializeReplay } from '../src/replay.js';

// Each component must stay within [-1, 1] per the TickInput contract (the
// vector's overall length is allowed to exceed 1 — step() normalizes that —
// but deserializeReplay() clamps each component independently, so a pattern
// that oversteps a single component here would desync a replay round-trip).
function patternAt(t: number): TickInput {
  return { moveX: Math.sin(t * 0.021), moveY: Math.cos(t * 0.017), paused: false };
}

test('same seed + same recorded inputs -> identical final hash, and runReplay reproduces it', () => {
  const config = DEFAULT_CONFIG;
  const seed = 555;
  const ticks = 500;

  const simA = createSimulation(config, seed);
  const simB = createSimulation(config, seed);

  for (let t = 0; t < ticks; t++) {
    const input = patternAt(t);
    simA.step(input);
    simB.step(input);
  }

  const hashA = simA.hash();
  const hashB = simB.hash();
  assert.equal(hashA, hashB, 'two independent sims fed identical inputs must reach the same hash');

  const replayResult = runReplay(config, simA.getReplay());
  assert.equal(replayResult.finalHash, hashA, 'runReplay must reproduce the original hash');
  assert.equal(replayResult.ticks, simA.tick);
});

test('different seed -> different hash over the same inputs (waves active)', () => {
  const config = DEFAULT_CONFIG;
  const ticks = 300;

  const simA = createSimulation(config, 1);
  const simB = createSimulation(config, 2);

  for (let t = 0; t < ticks; t++) {
    const input = patternAt(t);
    simA.step(input);
    simB.step(input);
  }

  assert.notEqual(simA.hash(), simB.hash(), 'different seeds should diverge once waves/rng are in play');
});

test('replay serialization round-trip: serialize -> deserialize -> runReplay reproduces the original hash', () => {
  const config = DEFAULT_CONFIG;
  const seed = 909;
  const ticks = 200;

  const sim = createSimulation(config, seed);
  for (let t = 0; t < ticks; t++) sim.step(patternAt(t));
  const originalHash = sim.hash();

  const record = sim.getReplay();
  const serialized = serializeReplay(record);
  const deserialized = deserializeReplay(serialized);

  const replayResult = runReplay(config, deserialized);
  assert.equal(replayResult.finalHash, originalHash);
});

test('runReplay throws on configVersion mismatch', () => {
  const config = DEFAULT_CONFIG;
  const badRecord = {
    seed: 1,
    configVersion: -1,
    configFingerprint: fingerprintConfig(config),
    traitCatalogFingerprint: null,
    universalUpgradeCatalogFingerprint: null,
    runContentFingerprint: null,
    runStartLoadoutFingerprint: '0000000000000000',
    inputs: [{ moveX: 0, moveY: 0, paused: false }],
    upgradeSelections: [],
  };
  assert.throws(() => runReplay(config, badRecord));
});

test('runReplay rejects a different config even when CONFIG_VERSION matches', () => {
  const sim = createSimulation(DEFAULT_CONFIG, 1);
  sim.step({ moveX: 0, moveY: 0, paused: false });
  const changed = { ...DEFAULT_CONFIG, worldWidth: DEFAULT_CONFIG.worldWidth + 1 };
  assert.throws(() => runReplay(changed, sim.getReplay()), /fingerprint mismatch/);
});

test('out-of-range movement is canonicalized before recording and replays exactly', () => {
  const sim = createSimulation(DEFAULT_CONFIG, 77);
  sim.step({ moveX: 5, moveY: 0.5, paused: false });
  const replay = deserializeReplay(serializeReplay(sim.getReplay()));
  assert.equal(replay.inputs[0]!.moveX, 1);
  assert.equal(runReplay(DEFAULT_CONFIG, replay).finalHash, sim.hash());
});

test('no ambient randomness: "Math.random" never appears in any src/*.ts file', () => {
  // Built via concatenation so this literal doesn't itself trip any tooling
  // that scans for the substring.
  const banned = 'Math.' + 'random';

  const here = fileURLToPath(import.meta.url); // dist/test/determinism.test.js
  const projectRoot = join(dirname(here), '..', '..'); // dist/test -> dist -> project root
  const srcDir = join(projectRoot, 'src');

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  const files = walk(srcDir);
  assert.ok(files.length > 0, `expected to find .ts files under ${srcDir}`);

  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    assert.ok(!content.includes(banned), `${f} must not contain "${banned}"`);
  }
});
