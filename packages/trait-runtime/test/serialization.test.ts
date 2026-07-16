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
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('porcupine-quills');
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('puffer-pouch');
  assert.equal(rt.fuseEvolution('thornstorm-mantle').outcome.ok, true);
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

test('v3 authored Perfect Pair saves migrate without inventing a Chimera variant', () => {
  const rt = new TraitRuntime({ seed: 314 });
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('porcupine-quills');
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('puffer-pouch');
  assert.equal(rt.fuseEvolution('thornstorm-mantle').outcome.ok, true);

  const legacy = JSON.parse(rt.serialize()) as {
    version: number;
    chimeraFingerprint?: string;
    runSeed?: number;
    fusionReadyCount?: number;
    fusionPreviews?: unknown[];
    pendingEmissions?: unknown[];
    offerRngState: number;
    evolutions: Array<{ variant?: unknown }>;
    timers: Array<{ cycles?: unknown }>;
  };
  legacy.version = 3;
  const legacyOfferRngState = legacy.offerRngState;
  delete legacy.chimeraFingerprint;
  delete legacy.runSeed;
  delete legacy.fusionReadyCount;
  delete legacy.fusionPreviews;
  delete legacy.pendingEmissions;
  for (const evolution of legacy.evolutions) delete evolution.variant;
  for (const timer of legacy.timers) delete timer.cycles;

  const migrated = deserializeState(JSON.stringify(legacy));
  assert.equal(migrated.version, 4);
  assert.equal(migrated.runSeed, legacyOfferRngState);
  assert.equal(migrated.fusionReadyCount, 1);
  assert.deepEqual(migrated.fusionPreviews, []);
  assert.equal(migrated.evolutions[0]?.variant, undefined);
  assert.ok(migrated.timers.every((timer) => timer.cycles === 0));
  assert.deepEqual(migrated.pendingEmissions, []);

  const restored = TraitRuntime.deserialize(JSON.stringify(legacy));
  assert.equal(restored.getState().evolutions[0]?.variant, undefined);
});

test('serializeState/deserializeState are structurally stable', () => {
  const rt = midGameRuntime();
  const once = serializeState(deserializeState(rt.serialize()));
  assert.equal(once, rt.serialize());
});

test('pending triggering-target anchors round-trip and reject unknown values', () => {
  const rt = new TraitRuntime({ seed: 88 });
  rt.applyUpgrade('porcupine-quills');
  const saved = JSON.parse(rt.serialize()) as {
    pendingEmissions: unknown[];
  };
  saved.pendingEmissions.push({
    ownerId: 'porcupine-quills',
    dueTick: 40,
    emit: {
      kind: 'spawnZone',
      anchor: 'triggerTarget',
      radius: 24,
      amount: 3,
      durationTicks: 60,
      intervalTicks: 15,
      tag: 'sticky-trail',
    },
  });

  const restored = deserializeState(JSON.stringify(saved));
  assert.equal(restored.pendingEmissions[0]?.emit.anchor, 'triggerTarget');
  const canonical = serializeState(restored);
  assert.equal(hashState(deserializeState(canonical)), hashState(restored));

  const malformed = JSON.parse(canonical) as {
    pendingEmissions: Array<{ emit: { anchor?: string } }>;
  };
  malformed.pendingEmissions[0]!.emit.anchor = 'untrusted-anchor';
  assert.throws(() => deserializeState(JSON.stringify(malformed)), SerializationError);
});

test('a stale synthesized evolution recovers its two Master parents instead of bricking a save', () => {
  const rt = new TraitRuntime({ seed: 631 });
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('puffer-pouch');
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('electric-eel-coil');
  const fusion = rt.availableFusions().find((offer) => offer.evolutionId.startsWith('chimera:'));
  assert.ok(fusion !== undefined);
  assert.equal(rt.fuseEvolution(fusion.evolutionId).outcome.ok, true);

  const stale = JSON.parse(rt.serialize()) as {
    evolutions: Array<{ id: string }>;
    timers: Array<{ ownerId: string }>;
    pendingEmissions: Array<{ ownerId: string }>;
  };
  const originalId = fusion.evolutionId;
  const staleId = 'chimera:electric-eel-coil+puffer-pouch';
  stale.evolutions[0]!.id = staleId;
  for (const timer of stale.timers) {
    if (timer.ownerId === originalId) timer.ownerId = staleId;
  }
  for (const pending of stale.pendingEmissions) {
    if (pending.ownerId === originalId) pending.ownerId = staleId;
  }

  const restored = TraitRuntime.deserialize(JSON.stringify(stale));
  const state = restored.getState();
  assert.deepEqual(state.evolutions, []);
  assert.deepEqual(
    state.owned.map((owned) => [owned.id, owned.rank, owned.disabled]),
    [
      ['puffer-pouch', 5, false],
      ['electric-eel-coil', 5, false],
    ],
  );
  assert.ok(state.timers.every((timer) => timer.ownerId !== staleId));
  assert.ok(restored.availableFusions().some((offer) => offer.evolutionId === originalId));
});
