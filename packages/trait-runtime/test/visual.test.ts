import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraitRuntime } from '../src/index.js';

function keys(rt: TraitRuntime): string[] {
  return rt.visualState().map((v) => v.visualKey);
}

test('visual state progresses through required slice keys', () => {
  const rt = new TraitRuntime({ seed: 0 });

  rt.applyUpgrade('porcupine-quills');
  assert.deepEqual(keys(rt), ['porcupine-quills:bud']);

  rt.applyUpgrade('porcupine-quills');
  assert.deepEqual(keys(rt), ['porcupine-quills:adapted']);

  rt.applyUpgrade('puffer-pouch');
  assert.deepEqual(keys(rt), ['porcupine-quills:adapted', 'puffer-pouch:bud']);

  rt.applyUpgrade('puffer-pouch'); // triggers Thornstorm
  assert.deepEqual(keys(rt), ['thornstorm-mantle:mythic']);
});

test('mythic visual entry uses both recipe sockets and hides consumed traits', () => {
  const rt = new TraitRuntime({ seed: 0 });
  rt.applyUpgrade('porcupine-quills');
  rt.applyUpgrade('porcupine-quills');
  rt.applyUpgrade('puffer-pouch');
  rt.applyUpgrade('puffer-pouch');

  const vs = rt.visualState();
  assert.equal(vs.length, 1);
  const mythic = vs[0]!;
  assert.equal(mythic.sourceId, 'thornstorm-mantle');
  assert.equal(mythic.stage, 'mythic');
  assert.equal(mythic.enabled, true);
  assert.deepEqual([...mythic.sockets].sort(), ['back', 'head']);
});

test('each required first-slice visual key is observable in a valid state', () => {
  // quills:bud and quills:adapted, in isolation.
  const q = new TraitRuntime({ seed: 0 });
  q.applyUpgrade('porcupine-quills');
  assert.ok(keys(q).includes('porcupine-quills:bud'));
  q.applyUpgrade('porcupine-quills');
  assert.ok(keys(q).includes('porcupine-quills:adapted'));

  // pouch:bud and pouch:adapted, in isolation (no quills => no resolution).
  const p = new TraitRuntime({ seed: 0 });
  p.applyUpgrade('puffer-pouch');
  assert.ok(keys(p).includes('puffer-pouch:bud'));
  p.applyUpgrade('puffer-pouch');
  assert.ok(keys(p).includes('puffer-pouch:adapted'));

  // mythic via the full recipe path.
  const m = new TraitRuntime({ seed: 0 });
  m.applyUpgrade('porcupine-quills');
  m.applyUpgrade('porcupine-quills');
  m.applyUpgrade('puffer-pouch');
  m.applyUpgrade('puffer-pouch');
  assert.ok(keys(m).includes('thornstorm-mantle:mythic'));
});
