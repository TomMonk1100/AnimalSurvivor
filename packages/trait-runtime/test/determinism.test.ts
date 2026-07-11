import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeContext } from '../src/contracts.js';
import { TraitRuntime } from '../src/index.js';

/** Deterministic pseudo-varied context sequence (no RNG, pure function of tick). */
function ctx(tick: number): RuntimeContext {
  const px = (tick * 7) % 100;
  const py = (tick * 13) % 100;
  return { tick, playerX: px, playerY: py, moveDirX: 1, moveDirY: 0, distanceMovedThisTick: 1 };
}

/** Same definitions + seed + upgrades + contexts => identical stream + state. */
function scriptedRun(): { stream: string; finalState: string; hash: string } {
  const rt = new TraitRuntime({ seed: 20260710 });
  const script: Array<[number, string]> = [
    [5, 'porcupine-quills'],
    [5, 'porcupine-quills'],
    [40, 'puffer-pouch'],
    [40, 'puffer-pouch'],
    [80, 'electric-eel-coil'],
    [80, 'electric-eel-coil'],
    [80, 'firefly-colony'],
    [80, 'firefly-colony'],
  ];
  let cursor = 0;
  const parts: string[] = [];
  for (let t = 0; t < 600; t++) {
    while (cursor < script.length && script[cursor]![0] === t) {
      rt.applyUpgrade(script[cursor]![1]);
      // Consume a deterministic offer draw to advance the offer RNG too.
      rt.offers(3);
      cursor++;
    }
    const buf = rt.update(ctx(t));
    for (let i = 0; i < buf.length; i++) {
      const c = buf.at(i);
      parts.push(
        `${c.tick}|${c.sourceId}|${c.kind}|${c.count}|${c.damage}|${c.radius}|${c.originX}|${c.originY}|${c.tag}`,
      );
    }
  }
  return { stream: parts.join('\n'), finalState: rt.serialize(), hash: rt.hash() };
}

test('two independent runs produce byte-identical command streams and state', () => {
  const a = scriptedRun();
  const b = scriptedRun();
  assert.equal(a.stream, b.stream);
  assert.equal(a.finalState, b.finalState);
  assert.equal(a.hash, b.hash);
});

test('content fingerprint is stable across instances', () => {
  const a = new TraitRuntime({ seed: 1 }).fingerprint();
  const b = new TraitRuntime({ seed: 2 }).fingerprint();
  assert.equal(a, b); // fingerprint depends only on catalog content, not seed
});
