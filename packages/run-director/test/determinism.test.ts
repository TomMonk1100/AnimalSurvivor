/**
 * Determinism, seed-isolation, serialization future-stream, and full-run tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RunDirector, getDefaultDefinition, serializeState } from '../src/index.js';
import { metricsAt, runEveryTick, authoredOnly } from './helpers.js';

test('identical seed + metrics yield byte-identical event streams and hashes', () => {
  const a = new RunDirector({ seed: 42 });
  const b = new RunDirector({ seed: 42 });
  const ea = runEveryTick(a, 0, 20_000);
  const eb = runEveryTick(b, 0, 20_000);
  assert.equal(JSON.stringify(ea), JSON.stringify(eb));
  assert.equal(a.stateHash(), b.stateHash());
  assert.equal(a.serialize(), b.serialize());
});

test('different seeds change only discretionary spawns, never authored timing', () => {
  const a = new RunDirector({ seed: 1 });
  const b = new RunDirector({ seed: 999 });
  const ea = runEveryTick(a, 0, 23_400);
  const eb = runEveryTick(b, 0, 23_400);
  // Authored phase/elite/boss events must be identical.
  const norm = (e: (typeof ea)[number]) => `${e.kind}@${e.tick}#${e.seq}`;
  assert.deepEqual(authoredOnly(ea).map(norm), authoredOnly(eb).map(norm));
});

test('content fingerprint is stable and identical across independent directors', () => {
  const a = new RunDirector({ seed: 1 });
  const b = new RunDirector({ seed: 2 });
  assert.equal(a.contentFingerprint(), b.contentFingerprint());
});

test('serialization round-trip preserves the future event stream and final hash', () => {
  const original = new RunDirector({ seed: 7 });
  runEveryTick(original, 0, 20_000);
  const snapshot = original.serialize();

  // Continue the original to the end.
  const tailOriginal = runEveryTick(original, 20_001, 28_800);

  // Restore from snapshot and continue identically.
  const restored = RunDirector.deserialize(snapshot);
  const tailRestored = runEveryTick(restored, 20_001, 28_800);

  assert.equal(JSON.stringify(tailOriginal), JSON.stringify(tailRestored));
  assert.equal(original.stateHash(), restored.stateHash());
  assert.equal(original.serialize(), restored.serialize());
});

test('RunDirector saves are bound to the exact authored content fingerprint', () => {
  const original = new RunDirector({ seed: 77 });
  original.step(metricsAt(0));
  const snapshot = original.serialize();
  const base = getDefaultDefinition();
  const changed = {
    ...base,
    phases: base.phases.map((phase) =>
      phase.id === 'opening' ? { ...phase, softCap: phase.softCap + 1 } : phase),
  };

  assert.throws(
    () => RunDirector.deserialize(snapshot, { definition: changed }),
    /content fingerprint mismatch/,
  );
  assert.throws(
    () => RunDirector.deserialize(serializeState(original.snapshotState())),
    /content fingerprint/,
  );
});

test('an independent 28,800-tick run ends at the expected phase/outcome/hash', () => {
  const run1 = new RunDirector({ seed: 2024 });
  const run2 = new RunDirector({ seed: 2024 });
  runEveryTick(run1, 0, 28_800);
  runEveryTick(run2, 0, 28_800);

  assert.equal(run1.outcome, 'defeat');
  assert.equal(run1.phase, 'boss');
  const h1 = run1.stateHash();
  const h2 = run2.stateHash();
  assert.equal(h1, h2, 'two independent identical runs produce equal hashes');
});

test('a normal terminal state serializes and restores after the deadline', () => {
  const original = new RunDirector({ seed: 0xface });
  runEveryTick(original, 0, 28_800);
  const restored = RunDirector.deserialize(original.serialize());

  assert.equal(restored.outcome, 'defeat');
  assert.equal(restored.phase, 'boss');
  assert.equal(restored.stateHash(), original.stateHash());
  assert.deepEqual(restored.step(metricsAt(28_801)), []);
});

test('boss request fires exactly once across serialization and the normal cap', () => {
  const d = new RunDirector({ seed: 3 });
  runEveryTick(d, 0, 22_999);
  const mid = d.serialize();
  const restored = RunDirector.deserialize(mid);
  const events = runEveryTick(restored, 23_000, 28_800);
  const reqs = events.filter((e) => e.kind === 'bossRequested');
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.tick, 23_400);
});
