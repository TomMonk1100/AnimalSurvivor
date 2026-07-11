import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeContext } from '../src/contracts.js';
import { TraitRuntime } from '../src/index.js';
import { deserializeState, serializeState, SerializationError } from '../src/serialization.js';
import { hashState } from '../src/state-hash.js';

function ctx(tick: number): RuntimeContext {
  return { tick, playerX: 3, playerY: -4, moveDirX: 1, moveDirY: 0, distanceMovedThisTick: 1 };
}

function midGameRuntime(): TraitRuntime {
  const rt = new TraitRuntime({ seed: 314 });
  rt.applyUpgrade('porcupine-quills');
  rt.applyUpgrade('porcupine-quills');
  rt.applyUpgrade('puffer-pouch');
  rt.applyUpgrade('puffer-pouch'); // Thornstorm
  rt.applyUpgrade('electric-eel-coil');
  rt.offers(3);
  for (let t = 0; t < 137; t++) rt.update(ctx(t));
  return rt;
}

test('round-trip preserves canonical hash', () => {
  const rt = midGameRuntime();
  const json = rt.serialize();
  const restored = deserializeState(json);
  assert.equal(hashState(restored), rt.hash());
});

test('round-trip preserves the future command stream', () => {
  const rt = midGameRuntime();
  const json = rt.serialize();

  const collect = (r: TraitRuntime): string[] => {
    const out: string[] = [];
    const start = r.getState().tick + 1;
    for (let t = start; t < start + 300; t++) {
      const buf = r.update(ctx(t));
      for (let i = 0; i < buf.length; i++) {
        const c = buf.at(i);
        out.push(`${c.tick}:${c.sourceId}:${c.kind}:${c.count}:${c.damage}`);
      }
    }
    return out;
  };

  const original = collect(rt);
  const clone = TraitRuntime.deserialize(json);
  const cloned = collect(clone);
  assert.deepEqual(cloned, original);
});

test('serialized output is byte-identical for identical state', () => {
  const a = midGameRuntime().serialize();
  const b = midGameRuntime().serialize();
  assert.equal(a, b);
});

test('malformed JSON is rejected', () => {
  assert.throws(() => deserializeState('{ not json'), SerializationError);
});

test('non-finite numbers are rejected', () => {
  const rt = new TraitRuntime({ seed: 1 });
  const obj = JSON.parse(rt.serialize());
  obj.tick = Number.POSITIVE_INFINITY; // becomes null through JSON, but guard explicitly
  const withInf = rt.serialize().replace(/"tick":-?\d+/, '"tick":1e999');
  assert.throws(() => deserializeState(withInf), SerializationError);
});

test('unknown socket key is rejected', () => {
  const rt = new TraitRuntime({ seed: 1 });
  rt.applyUpgrade('porcupine-quills');
  const obj = JSON.parse(rt.serialize());
  obj.sockets['nose'] = 'porcupine-quills';
  assert.throws(() => deserializeState(JSON.stringify(obj)), SerializationError);
});

test('wrong version is rejected', () => {
  const obj = JSON.parse(new TraitRuntime({ seed: 1 }).serialize());
  obj.version = 999;
  assert.throws(() => deserializeState(JSON.stringify(obj)), SerializationError);
});

test('serializeState/deserializeState are structurally stable', () => {
  const rt = midGameRuntime();
  const once = serializeState(deserializeState(rt.serialize()));
  assert.equal(once, rt.serialize());
});
