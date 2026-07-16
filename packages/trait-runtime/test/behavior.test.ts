import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeContext } from '../src/contracts.js';
import { createCommandBuffer } from '../src/command-buffer.js';
import { createInitialState, applyUpgrade, fuseEvolution } from '../src/build-state.js';
import { ensureTimers, stepBehaviors } from '../src/behavior-runtime.js';
import { GREG_FOREST_ARSENAL_CATALOG } from '../src/content/greg-vertical-slice.js';
import { getCatalog } from '../src/definitions.js';
import { availableFusions } from '../src/evolution-resolver.js';
import { resolveEvolution } from '../src/chimera/resolved-evolution.js';
import { TraitRuntime } from '../src/index.js';

function ctx(tick: number): RuntimeContext {
  return { tick, playerX: 0, playerY: 0, moveDirX: 0, moveDirY: 0, distanceMovedThisTick: 0 };
}

function toThornstorm(): TraitRuntime {
  const rt = new TraitRuntime({ seed: 7 });
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('porcupine-quills');
  for (let rank = 1; rank <= 5; rank++) rt.applyUpgrade('puffer-pouch');
  assert.equal(rt.availableFusions()[0]?.evolutionId, 'thornstorm-mantle');
  assert.equal(rt.fuseEvolution('thornstorm-mantle').outcome.ok, true);
  return rt;
}

function toLegacyThornstorm(): TraitRuntime {
  const rt = toThornstorm();
  const legacy = JSON.parse(rt.serialize()) as {
    version: number;
    chimeraFingerprint?: string;
    runSeed?: number;
    fusionReadyCount?: number;
    fusionPreviews?: unknown[];
    pendingEmissions?: unknown[];
    evolutions: Array<{ variant?: unknown }>;
    timers: Array<{ cycles?: unknown }>;
  };
  legacy.version = 3;
  delete legacy.chimeraFingerprint;
  delete legacy.runSeed;
  delete legacy.fusionReadyCount;
  delete legacy.fusionPreviews;
  delete legacy.pendingEmissions;
  for (const evolution of legacy.evolutions) delete evolution.variant;
  for (const timer of legacy.timers) delete timer.cycles;
  return TraitRuntime.deserialize(JSON.stringify(legacy));
}

/** Collect (tick, sourceId, kind) emissions over [0, ticks). */
function run(rt: TraitRuntime, ticks: number): Array<[number, string, string]> {
  const out: Array<[number, string, string]> = [];
  for (let t = 0; t < ticks; t++) {
    const buf = rt.update(ctx(t));
    for (let i = 0; i < buf.length; i++) {
      const c = buf.at(i);
      out.push([t, c.sourceId, c.kind]);
    }
  }
  return out;
}

test('new Thornstorm Perfect Pair fusions persist a tempered deterministic schedule', () => {
  const rt = toThornstorm();
  const resolved = rt.getState().evolutions[0];
  assert.ok(resolved !== undefined);
  assert.ok(resolved.variant !== undefined);

  const catalog = getCatalog();
  const authored = catalog.evolutions.find((evolution) => evolution.id === 'thornstorm-mantle');
  assert.ok(authored !== undefined);
  const tempered = resolveEvolution(catalog, resolved);
  assert.ok(tempered !== undefined);
  assert.notDeepEqual(tempered.behavior, authored.behavior);

  const emissions = run(rt, 360).filter((e) => e[1] === 'thornstorm-mantle');
  assert.ok(emissions.length > 0);
  assert.ok(emissions.every(([, sourceId]) => sourceId === 'thornstorm-mantle'));
  assert.deepEqual(
    run(toThornstorm(), 360).filter((e) => e[1] === 'thornstorm-mantle'),
    emissions,
  );
});

test('Thornstorm replaces both independent ingredient loops (only the mythic fires)', () => {
  const rt = toThornstorm();
  const emissions = run(rt, 200);
  const sources = new Set(emissions.map((e) => e[1]));
  assert.deepEqual([...sources], ['thornstorm-mantle']);
  assert.ok(!sources.has('porcupine-quills'));
  assert.ok(!sources.has('puffer-pouch'));
});

test('a migrated v3 Thornstorm save retains the authored phase schedule', () => {
  const emissions = run(toLegacyThornstorm(), 91).filter((e) => e[1] === 'thornstorm-mantle');
  assert.deepEqual(emissions.slice(0, 4), [
    [0, 'thornstorm-mantle', 'telegraph'],
    [20, 'thornstorm-mantle', 'areaGather'],
    [35, 'thornstorm-mantle', 'radialProjectileBurst'],
    [90, 'thornstorm-mantle', 'telegraph'],
  ]);
});

test('long sequential tempered run remains deterministic with one active evolution timer', () => {
  const rt = toThornstorm();
  const TICKS = 9000;
  const emissions = run(rt, TICKS).filter((e) => e[1] === 'thornstorm-mantle');
  assert.ok(emissions.length > 0);
  assert.ok(emissions.every(([, sourceId]) => sourceId === 'thornstorm-mantle'));
  assert.deepEqual(
    run(toThornstorm(), TICKS).filter((e) => e[1] === 'thornstorm-mantle'),
    emissions,
  );
  const activeEvolutionTimers = rt.getState().timers.filter((timer) => (
    timer.ownerId === 'thornstorm-mantle' && timer.active
  ));
  assert.equal(activeEvolutionTimers.length, 1);
});

test('a single bud trait fires its periodic burst deterministically', () => {
  const rt = new TraitRuntime({ seed: 1 });
  rt.applyUpgrade('porcupine-quills'); // bud, periodTicks 90
  const emissions = run(rt, 271).filter((e) => e[1] === 'porcupine-quills');
  // Fires at ticks 0, 90, 180, 270 (fires on first processed tick then each period).
  assert.deepEqual(emissions.map((e) => e[0]), [0, 90, 180, 270]);
  assert.ok(emissions.every((e) => e[2] === 'spawnProjectileBurst'));
});

test('Apex Whisper retains the donor Master scheduler beside its chassis-and-graft loop', () => {
  const catalog = getCatalog();
  const state = createInitialState(0x0a0e_0001);
  for (let rank = 1; rank <= 5; rank++) applyUpgrade(catalog, state, 'mantis-scythes');
  for (let rank = 1; rank <= 5; rank++) applyUpgrade(catalog, state, 'owl-pinions');
  const fusionId = 'chimera:mantis-scythes+owl-pinions';
  assert.equal(fuseEvolution(catalog, state, fusionId).outcome.ok, true);
  const evolution = state.evolutions[0]!;
  evolution.variant = { seed: 0, temperamentId: 'apex-whisper', leanId: 'balanced' };
  ensureTimers(catalog, state);

  const owlTimer = state.timers.find((timer) => timer.ownerId === 'owl-pinions');
  const mantisTimer = state.timers.find((timer) => timer.ownerId === 'mantis-scythes');
  const fusionTimer = state.timers.find((timer) => timer.ownerId === fusionId);
  assert.equal(owlTimer?.active, true, 'donor keeps its independent Master scheduler');
  assert.notEqual(mantisTimer?.active, true, 'chassis is represented by the fused loop');
  assert.equal(fusionTimer?.active, true);

  const buffer = createCommandBuffer(16);
  stepBehaviors(catalog, state, {
    ...ctx(0),
    distanceMovedThisTick: 0,
  }, buffer);
  const commands = Array.from({ length: buffer.length }, (_, index) => buffer.at(index));
  assert.ok(commands.every((command) => command.sourceId === fusionId));
  assert.equal(commands.filter((command) => command.kind === 'meleeArc').length, 1);
  // One volley is the Owl Fan graft; the second is Owl's full Master loop,
  // proving Apex did not reduce the donor to a same-cadence follow-up.
  assert.equal(commands.filter((command) => command.kind === 'spawnProjectileBurst').length, 2);
});

test('movement-gated Undertow and Lock-On controls emit before their Gecko payload', () => {
  const catalog = GREG_FOREST_ARSENAL_CATALOG;
  const commandsFor = (first: 'puffer-pouch' | 'bat-ears'): string[] => {
    const state = createInitialState(first === 'puffer-pouch' ? 0x0bad_c0de : 0x0bad_fade);
    for (const traitId of [first, 'gecko-pads'] as const) {
      for (let rank = 1; rank <= 5; rank++) applyUpgrade(catalog, state, traitId);
    }
    const offer = availableFusions(catalog, state)[0];
    assert.ok(offer !== undefined);
    assert.equal(fuseEvolution(catalog, state, offer.evolutionId).outcome.ok, true);
    state.evolutions[0]!.variant = { seed: 0, temperamentId: 'steady', leanId: 'balanced' };
    ensureTimers(catalog, state);
    const buffer = createCommandBuffer(16);
    stepBehaviors(catalog, state, {
      ...ctx(0),
      distanceMovedThisTick: 999,
    }, buffer);
    return Array.from({ length: buffer.length }, (_, index) => buffer.at(index).kind);
  };

  assert.deepEqual(commandsFor('puffer-pouch'), ['telegraph', 'areaGather', 'spawnZone']);
  assert.deepEqual(commandsFor('bat-ears'), ['markTargets', 'spawnZone']);
});
