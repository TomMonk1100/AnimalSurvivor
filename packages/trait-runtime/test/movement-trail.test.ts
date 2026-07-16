import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fingerprintCatalog,
  GREG_FOREST_ARSENAL_CATALOG,
  TraitRuntime,
  type Catalog,
  type RuntimeContext,
} from '../src/index.js';

function context(
  tick: number,
  distanceMovedThisTick: number,
  overrides: Partial<RuntimeContext> = {},
): RuntimeContext {
  return {
    tick,
    playerX: 12,
    playerY: -8,
    moveDirX: 1,
    moveDirY: 0,
    distanceMovedThisTick,
    ...overrides,
  };
}

function upgrade(runtime: TraitRuntime, traitId: string) {
  const result = runtime.applyUpgrade(traitId);
  assert.equal(result.outcome.ok, true, `${traitId} should be a legal upgrade`);
  return result;
}

function master(runtime: TraitRuntime, traitId: string): void {
  for (let rank = 1; rank <= 5; rank++) upgrade(runtime, traitId);
}

function geckoTimer(runtime: TraitRuntime) {
  const timer = runtime.getState().timers.find((candidate) => candidate.ownerId === 'gecko-pads');
  assert.ok(timer, 'expected a Gecko movement-trail timer');
  return timer;
}

test('Gecko Pads accumulate fixed movement, never fire while stationary, and emit authored zones', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'gecko-pads');

  assert.equal(runtime.update(context(1, 149)).length, 0);
  assert.equal(geckoTimer(runtime).charges, 149_000);

  // A stationary tick cannot consume a charged threshold or emit a free pad.
  assert.equal(runtime.update(context(2, 0)).length, 0);
  assert.equal(geckoTimer(runtime).charges, 149_000);

  const pad = runtime.update(context(3, 1));
  assert.equal(pad.length, 1);
  assert.deepEqual(
    {
      sourceId: pad.at(0).sourceId,
      kind: pad.at(0).kind,
      radius: pad.at(0).radius,
      amount: pad.at(0).amount,
      durationTicks: pad.at(0).durationTicks,
      intervalTicks: pad.at(0).intervalTicks,
      tag: pad.at(0).tag,
      originX: pad.at(0).originX,
      originY: pad.at(0).originY,
    },
    {
      sourceId: 'gecko-pads',
      kind: 'spawnZone',
      radius: 38,
      amount: 3,
      durationTicks: 150,
      intervalTicks: 24,
      tag: 'gecko-pad',
      originX: -12,
      originY: -8,
    },
  );
  assert.equal(geckoTimer(runtime).charges, 0);
});

test('movement trails place authored pads behind the normalized movement heading', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'gecko-pads');

  const pad = runtime.update(context(1, 150, {
    playerX: 100,
    playerY: 80,
    moveDirX: 3,
    moveDirY: 4,
  })).at(0);
  assert.equal(pad.kind, 'spawnZone');
  assert.equal(pad.originX, 85.6);
  assert.equal(pad.originY, 60.8);
});

test('movement trails emit at most one pad per positive-movement tick and preserve excess charge', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'gecko-pads');

  const first = runtime.update(context(1, 500));
  assert.equal(first.length, 1, 'a large movement sample still emits only one pad');
  assert.equal(geckoTimer(runtime).charges, 350_000);

  assert.equal(runtime.update(context(2, 0)).length, 0, 'backlog never fires while stationary');
  assert.equal(geckoTimer(runtime).charges, 350_000);

  const second = runtime.update(context(3, 1));
  assert.equal(second.length, 1, 'one positive tick may consume only one threshold');
  assert.equal(geckoTimer(runtime).charges, 201_000);
});

test('movement distance quantization saturates safely instead of overflowing serializable charges', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'gecko-pads');

  const pad = runtime.update(context(1, Number.MAX_VALUE));
  assert.equal(pad.length, 1);
  assert.equal(geckoTimer(runtime).charges, Number.MAX_SAFE_INTEGER - 150_000);
  assert.doesNotThrow(() => runtime.serialize());
});

test('Razorstep Chimera consumes Mantis and Gecko into a tempered deterministic combat loop', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  master(runtime, 'mantis-scythes');
  master(runtime, 'gecko-pads');
  const result = runtime.fuseEvolution('razorstep-chimera');
  assert.equal(result.outcome.ok, true);
  assert.equal(runtime.stageOf('mantis-scythes'), 'mythic');
  assert.equal(runtime.stageOf('gecko-pads'), 'mythic');
  assert.equal(runtime.socketOwner('leftShoulder'), 'razorstep-chimera');
  assert.equal(runtime.socketOwner('rightShoulder'), 'razorstep-chimera');
  assert.ok(runtime.getState().evolutions[0]?.variant !== undefined);

  const replay = TraitRuntime.deserialize(runtime.serialize(), {
    catalog: GREG_FOREST_ARSENAL_CATALOG,
  });
  const collectRazorstep = (candidate: TraitRuntime): Array<[number, string, string]> => {
    const emitted: Array<[number, string, string]> = [];
    for (let tick = 1; tick <= 120; tick++) {
      const commands = candidate.update(context(tick, 90));
      for (let index = 0; index < commands.length; index++) {
        const command = commands.at(index);
        emitted.push([tick, command.sourceId, command.kind]);
      }
    }
    return emitted;
  };
  const razorstepEmissions = collectRazorstep(runtime);
  assert.ok(razorstepEmissions.length > 0);
  assert.ok(razorstepEmissions.every(([, sourceId]) => sourceId === 'razorstep-chimera'));
  assert.deepEqual(
    collectRazorstep(replay),
    razorstepEmissions,
  );
});

test('neutral damage and attack speed scale zone damage cadence but not Gecko travel distance', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'gecko-pads');

  // An extreme attack-speed multiplier cannot make a 149-unit movement place
  // a pad before the authored 150-unit threshold.
  assert.equal(
    runtime.update(context(1, 149, { weaponCooldownMultiplier: 0.1 })).length,
    0,
  );
  const pad = runtime.update(context(2, 1, {
    weaponDamageMultiplier: 1.5,
    weaponCooldownMultiplier: 0.5,
  }));
  assert.equal(pad.length, 1);
  assert.equal(pad.at(0).amount, 4.5);
  assert.equal(pad.at(0).intervalTicks, 12);
  assert.equal(pad.at(0).durationTicks, 150, 'attack speed does not change zone lifetime');
});

test('movement-trail charges round-trip and authored fields participate in catalog fingerprints', () => {
  const runtime = new TraitRuntime({ catalog: GREG_FOREST_ARSENAL_CATALOG, initialTick: 0 });
  upgrade(runtime, 'gecko-pads');
  assert.equal(runtime.update(context(1, 100)).length, 0);

  const serialized = runtime.serialize();
  const parsed = JSON.parse(serialized) as {
    timers: Array<{ ownerId: string; charges: number; cooldown: number }>;
  };
  const serializedTimer = parsed.timers.find((timer) => timer.ownerId === 'gecko-pads');
  assert.equal(serializedTimer?.charges, 100_000);
  assert.equal(serializedTimer?.cooldown, 0);

  const restored = TraitRuntime.deserialize(serialized, { catalog: GREG_FOREST_ARSENAL_CATALOG });
  assert.equal(restored.hash(), runtime.hash(), 'state hashing includes pending movement charge');
  assert.equal(runtime.update(context(2, 0)).length, 0);
  assert.equal(restored.update(context(2, 0)).length, 0);
  const originalPad = runtime.update(context(3, 50));
  const restoredPad = restored.update(context(3, 50));
  assert.equal(originalPad.length, 1);
  assert.equal(restoredPad.length, 1);
  assert.deepEqual(
    {
      sourceId: restoredPad.at(0).sourceId,
      amount: restoredPad.at(0).amount,
      intervalTicks: restoredPad.at(0).intervalTicks,
      tag: restoredPad.at(0).tag,
    },
    {
      sourceId: originalPad.at(0).sourceId,
      amount: originalPad.at(0).amount,
      intervalTicks: originalPad.at(0).intervalTicks,
      tag: originalPad.at(0).tag,
    },
  );

  const baseline = fingerprintCatalog(GREG_FOREST_ARSENAL_CATALOG);
  const changedDistance = JSON.parse(JSON.stringify(GREG_FOREST_ARSENAL_CATALOG)) as Catalog;
  const geckoDistance = changedDistance.traits.find((trait) => trait.id === 'gecko-pads');
  assert.ok(geckoDistance);
  geckoDistance.stages.bud.behavior.distanceMilliunits = 150_001;
  assert.notEqual(fingerprintCatalog(changedDistance), baseline);

  const changedInterval = JSON.parse(JSON.stringify(GREG_FOREST_ARSENAL_CATALOG)) as Catalog;
  const geckoInterval = changedInterval.traits.find((trait) => trait.id === 'gecko-pads');
  assert.ok(geckoInterval);
  geckoInterval.stages.bud.behavior.emit!.intervalTicks = 25;
  assert.notEqual(fingerprintCatalog(changedInterval), baseline);

  const changedPlacement = JSON.parse(JSON.stringify(GREG_FOREST_ARSENAL_CATALOG)) as Catalog;
  const geckoPlacement = changedPlacement.traits.find((trait) => trait.id === 'gecko-pads');
  assert.ok(geckoPlacement);
  geckoPlacement.stages.bud.behavior.trailBehindDistance = 25;
  assert.notEqual(fingerprintCatalog(changedPlacement), baseline);
});
