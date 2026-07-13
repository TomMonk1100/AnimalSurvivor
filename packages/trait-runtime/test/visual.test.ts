import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraitRuntime } from '../src/index.js';

function keys(rt: TraitRuntime): string[] {
  return rt.visualState().map((v) => v.visualKey);
}

function master(rt: TraitRuntime, traitId: string): void {
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade(traitId);
}

test('visual state progresses through required slice keys', () => {
  const rt = new TraitRuntime({ seed: 0 });

  rt.applyUpgrade('porcupine-quills');
  assert.deepEqual(keys(rt), ['porcupine-quills:bud']);
  assert.deepEqual(rt.visualState()[0]!.rank, 1);

  rt.applyUpgrade('porcupine-quills');
  assert.deepEqual(keys(rt), ['porcupine-quills:adapted']);

  for (let rank = 3; rank <= 5; rank++) rt.applyUpgrade('porcupine-quills');
  assert.equal(rt.visualState()[0]!.rank, 5);
  assert.equal(rt.visualState()[0]!.isMaster, true);

  master(rt, 'puffer-pouch');
  assert.equal(rt.fuseEvolution('thornstorm-mantle').outcome.ok, true);
  assert.deepEqual(keys(rt), ['thornstorm-mantle:mythic']);
});

test('mythic visual entry uses both recipe sockets and hides consumed traits', () => {
  const rt = new TraitRuntime({ seed: 0 });
  master(rt, 'porcupine-quills');
  master(rt, 'puffer-pouch');
  rt.fuseEvolution('thornstorm-mantle');

  const vs = rt.visualState();
  assert.equal(vs.length, 1);
  const mythic = vs[0]!;
  assert.equal(mythic.sourceId, 'thornstorm-mantle');
  assert.equal(mythic.stage, 'mythic');
  assert.equal(mythic.rank, null);
  assert.equal(mythic.logicalSlotCost, 1);
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
  master(m, 'porcupine-quills');
  master(m, 'puffer-pouch');
  m.fuseEvolution('thornstorm-mantle');
  assert.ok(keys(m).includes('thornstorm-mantle:mythic'));
});
