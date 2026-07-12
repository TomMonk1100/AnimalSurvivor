import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Catalog } from '../src/contracts.js';
import { getCatalog } from '../src/definitions.js';
import { validateCatalog } from '../src/validation.js';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type MutableCatalog = Mutable<Catalog>;

function clone(): MutableCatalog {
  return JSON.parse(JSON.stringify(getCatalog())) as MutableCatalog;
}

function codes(catalog: MutableCatalog): string[] {
  return validateCatalog(catalog).issues.map((i) => i.code);
}

test('shipped catalog validates clean', () => {
  const result = validateCatalog(getCatalog());
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.issues.length, 0);
});

test('every trait has bud and adapted stages with distinct visual keys', () => {
  const seen = new Set<string>();
  for (const t of getCatalog().traits) {
    assert.ok(t.stages.bud, `${t.id} bud`);
    assert.ok(t.stages.adapted, `${t.id} adapted`);
    for (const vk of [t.stages.bud.visualKey, t.stages.adapted.visualKey]) {
      assert.ok(!seen.has(vk), `duplicate visualKey ${vk}`);
      seen.add(vk);
    }
  }
});

test('duplicate trait id fails', () => {
  const c = clone();
  c.traits.push(c.traits[0]!);
  assert.ok(codes(c).includes('duplicateTraitId'));
});

test('duplicate evolution id fails', () => {
  const c = clone();
  c.evolutions.push(c.evolutions[0]!);
  assert.ok(codes(c).includes('duplicateEvolutionId'));
});

test('unknown ingredient fails', () => {
  const c = clone();
  c.evolutions[0]!.ingredients[0] = 'does-not-exist';
  assert.ok(codes(c).includes('unknownIngredient'));
});

test('invalid socket fails', () => {
  const c = clone();
  c.traits[0]!.sockets = ['nose' as never];
  assert.ok(codes(c).includes('invalidSocket'));
});

test('occupied-socket mismatch fails', () => {
  const c = clone();
  c.evolutions[0]!.occupiedSockets = ['tail'];
  assert.ok(codes(c).includes('occupiedSocketMismatch'));
});

test('self-paired ingredient fails', () => {
  const c = clone();
  const a = c.evolutions[0]!.ingredients[0];
  c.evolutions[0]!.ingredients[1] = a;
  assert.ok(codes(c).includes('selfPairedIngredient'));
});

test('non-finite behavior parameter fails', () => {
  const c = clone();
  const emit = c.traits[0]!.stages.bud.behavior.emit;
  if (emit) emit.damage = 1e999; // JSON.stringify would drop Infinity; set via literal path below
  // 1e999 parses to Infinity; ensure it is actually non-finite in the object.
  if (emit) emit.damage = Number.POSITIVE_INFINITY;
  assert.ok(codes(c).includes('nonFiniteParam'));
});

test('empty multiphase phases fail', () => {
  const c = clone();
  const evo = c.evolutions.find((e) => e.behavior.kind === 'multiPhase');
  assert.ok(evo, 'expected a multiPhase evolution');
  evo!.behavior.phases = [];
  assert.ok(codes(c).includes('emptyPhases'));
});

test('fractional fixed-tick and count fields fail validation', () => {
  const c = clone();
  c.traits[0]!.stages.bud.behavior.periodTicks = 1.5;
  c.traits[0]!.stages.bud.behavior.emit!.count = 2.5;
  const resultCodes = codes(c);
  assert.ok(resultCodes.includes('nonFiniteParam'));
  assert.ok(resultCodes.includes('nonIntegerParam'));
});

test('movementTrail requires a positive distance threshold and spawn-zone emit', () => {
  const c = clone();
  const behavior = c.traits[0]!.stages.bud.behavior;
  behavior.kind = 'movementTrail';
  behavior.periodTicks = 0;
  behavior.distanceMilliunits = 0;
  behavior.emit = { kind: 'applyAreaDamage', radius: 10, damage: 1 };
  assert.ok(codes(c).includes('invalidMovementTrail'));

  behavior.distanceMilliunits = 100_000;
  behavior.emit = { kind: 'spawnZone', intervalTicks: 2.5 };
  assert.ok(codes(c).includes('nonIntegerParam'));
  assert.ok(codes(c).includes('invalidMovementTrail'));
});

test('movementTrail validates every spawnZone field required by the accepted executor', () => {
  const c = clone();
  const behavior = c.traits[0]!.stages.bud.behavior;
  behavior.kind = 'movementTrail';
  behavior.periodTicks = 0;
  behavior.distanceMilliunits = 100_000;
  behavior.emit = { kind: 'spawnZone', radius: 20, amount: 2, durationTicks: 30, intervalTicks: 10, tag: 'gecko-pad' };
  assert.equal(codes(c).includes('invalidMovementTrail'), false);

  behavior.emit = { kind: 'spawnZone', radius: 0, amount: 2, durationTicks: 0, intervalTicks: 0, tag: '' };
  assert.ok(codes(c).includes('invalidMovementTrail'));
});

test('chainDamage requires a bounded integer hop count and a positive hop range', () => {
  const c = clone();
  const coil = c.traits.find((trait) => trait.id === 'electric-eel-coil');
  assert.ok(coil, 'expected conceptual Electric Eel Coil chain content');
  const emit = coil!.stages.bud.behavior.emit!;
  emit.jumps = 8;
  emit.range = 0;
  assert.ok(codes(c).includes('invalidChainDamage'));

  delete emit.jumps;
  emit.range = 120;
  assert.ok(codes(c).includes('invalidChainDamage'));
});

test('meleeArc requires an authored sector width and positive reach', () => {
  const c = clone();
  const mantis = c.traits.find((trait) => trait.id === 'mantis-scythes');
  assert.ok(mantis, 'expected conceptual Mantis Scythes melee content');
  const emit = mantis!.stages.bud.behavior.emit!;
  emit.arc = 0;
  emit.range = 0;
  assert.ok(codes(c).includes('invalidMeleeArc'));
});

test('orbitingDamage requires bounded firefly count, orbit radius, contact range, and speed', () => {
  const c = clone();
  const emit = c.traits[0]!.stages.bud.behavior.emit!;
  Object.assign(emit, {
    kind: 'orbitingDamage',
    count: 17,
    damage: 3,
    radius: 0,
    range: 0,
    speed: 0,
  });
  assert.ok(codes(c).includes('invalidOrbitingDamage'));
});

test('projectile pierce stays within the fixed unsigned-byte bound', () => {
  const c = clone();
  const emit = c.traits[0]!.stages.bud.behavior.emit!;
  emit.pierce = 256;
  assert.ok(codes(c).includes('invalidProjectilePierce'));
});
