import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplayRecorder, serializeReplay, deserializeReplay } from '../src/replay.js';

const FP = '0123456789abcdef';
const TRAIT_FP = 'fedcba9876543210';
const UNIVERSAL_FP = 'abcdef0123456789';
const RUN_FP = '89abcdef';
const LOADOUT_FP = '13579bdf2468ace0';

test('record -> finish -> serialize -> deserialize round-trips exactly', () => {
  const recorder = createReplayRecorder(42, 1, FP, TRAIT_FP, UNIVERSAL_FP, RUN_FP, LOADOUT_FP);
  const samples = [
    { moveX: 0, moveY: 0, paused: false },
    { moveX: 1, moveY: -1, paused: false },
    { moveX: -0.5, moveY: 0.25, paused: true },
  ];
  for (const s of samples) recorder.record(s);
  recorder.recordUpgrade({ tick: 2, kind: 'trait', id: 'trait:directed-quills' });
  recorder.recordUpgrade({ tick: 2, kind: 'universal', id: 'universal:xp-magnet' });
  const record = recorder.finish();

  const json = serializeReplay(record);
  const roundTripped = deserializeReplay(json);

  assert.deepEqual(roundTripped, record);
});

test('record copies the input (later mutation does not affect history)', () => {
  const recorder = createReplayRecorder(1, 1, FP, null, null, null, LOADOUT_FP);
  const input = { moveX: 0.1, moveY: 0.2, paused: false };
  const selection = { tick: 3, kind: 'trait' as const, id: 'trait:puffer' };
  recorder.record(input);
  recorder.recordUpgrade(selection);
  input.moveX = 999;
  input.paused = true;
  selection.tick = 999;
  selection.id = 'trait:changed';
  const record = recorder.finish();
  assert.equal(record.inputs[0]!.moveX, 0.1);
  assert.equal(record.inputs[0]!.paused, false);
  assert.deepEqual(record.upgradeSelections, [{ tick: 3, kind: 'trait', id: 'trait:puffer' }]);
  assert.equal(record.traitCatalogFingerprint, null);
});

test('serializeReplay uses a stable key order for trait progression fields', () => {
  const record = {
    seed: 7,
    configVersion: 2,
    configFingerprint: FP,
    traitCatalogFingerprint: TRAIT_FP,
    universalUpgradeCatalogFingerprint: UNIVERSAL_FP,
    runContentFingerprint: RUN_FP,
    runStartLoadoutFingerprint: LOADOUT_FP,
    inputs: [{ moveX: 0, moveY: 1, paused: false }],
    upgradeSelections: [{ tick: 4, kind: 'trait' as const, id: 'trait:thornstorm' }],
  };
  assert.equal(
    serializeReplay(record),
    `{"seed":7,"configVersion":2,"configFingerprint":"${FP}","traitCatalogFingerprint":"${TRAIT_FP}","universalUpgradeCatalogFingerprint":"${UNIVERSAL_FP}","runContentFingerprint":"${RUN_FP}","runStartLoadoutFingerprint":"${LOADOUT_FP}","inputs":[{"moveX":0,"moveY":1,"paused":false}],"upgradeSelections":[{"tick":4,"kind":"trait","id":"trait:thornstorm"}]}`,
  );
});

test('deserializeReplay rejects malformed JSON', () => {
  assert.throws(() => deserializeReplay('{not valid json'));
});

test('deserializeReplay rejects missing seed', () => {
  const json = JSON.stringify({ configVersion: 1, inputs: [] });
  assert.throws(() => deserializeReplay(json));
});

test('deserializeReplay rejects non-array inputs', () => {
  const json = JSON.stringify({
    seed: 1,
    configVersion: 1,
    configFingerprint: FP,
    traitCatalogFingerprint: null,
    universalUpgradeCatalogFingerprint: null,
    runContentFingerprint: null,
    runStartLoadoutFingerprint: LOADOUT_FP,
    inputs: 'nope',
    upgradeSelections: [],
  });
  assert.throws(() => deserializeReplay(json));
});

test('deserializeReplay rejects NaN moveX', () => {
  const json = '{"seed":1,"configVersion":1,"inputs":[{"moveX":NaN,"moveY":0,"paused":false}]}';
  assert.throws(() => deserializeReplay(json));
});

test('deserializeReplay rejects a missing moveX field', () => {
  const json = JSON.stringify({
    seed: 1,
    configVersion: 1,
    configFingerprint: FP,
    traitCatalogFingerprint: null,
    universalUpgradeCatalogFingerprint: null,
    runContentFingerprint: null,
    runStartLoadoutFingerprint: LOADOUT_FP,
    inputs: [{ moveY: 0, paused: false }],
    upgradeSelections: [],
  });
  assert.throws(() => deserializeReplay(json));
});

test('deserializeReplay clamps moveX/moveY to [-1, 1]', () => {
  const json = JSON.stringify({
    seed: 1,
    configVersion: 1,
    configFingerprint: FP,
    traitCatalogFingerprint: null,
    universalUpgradeCatalogFingerprint: null,
    runContentFingerprint: null,
    runStartLoadoutFingerprint: LOADOUT_FP,
    inputs: [{ moveX: 5, moveY: -5, paused: false }],
    upgradeSelections: [],
  });
  const record = deserializeReplay(json);
  assert.equal(record.inputs[0]!.moveX, 1);
  assert.equal(record.inputs[0]!.moveY, -1);
});

test('deserializeReplay rejects non-finite numeric values and a bad fingerprint', () => {
  assert.throws(() =>
    deserializeReplay(`{"seed":1e400,"configVersion":1,"configFingerprint":"${FP}","inputs":[]}`),
  );
  assert.throws(() =>
    deserializeReplay(`{"seed":1,"configVersion":1,"configFingerprint":"bad","inputs":[]}`),
  );
  assert.throws(() =>
    deserializeReplay(
      `{"seed":1,"configVersion":1,"configFingerprint":"${FP}","inputs":[{"moveX":1e400,"moveY":0,"paused":false}]}`,
    ),
  );
});

test('deserializeReplay validates trait catalog fingerprints', () => {
  const base = {
    seed: 1,
    configVersion: 1,
    configFingerprint: FP,
    inputs: [],
    upgradeSelections: [],
    runContentFingerprint: null,
    universalUpgradeCatalogFingerprint: null,
    runStartLoadoutFingerprint: LOADOUT_FP,
  };
  assert.throws(() => deserializeReplay(JSON.stringify(base)));
  assert.throws(() => deserializeReplay(JSON.stringify({ ...base, traitCatalogFingerprint: 'ABCDEF0123456789' })));
  assert.throws(() => deserializeReplay(JSON.stringify({ ...base, traitCatalogFingerprint: 'short' })));
  assert.equal(deserializeReplay(JSON.stringify({ ...base, traitCatalogFingerprint: null })).traitCatalogFingerprint, null);
});

test('deserializeReplay validates run content fingerprints', () => {
  const base = {
    seed: 1,
    configVersion: 3,
    configFingerprint: FP,
    traitCatalogFingerprint: null,
    universalUpgradeCatalogFingerprint: null,
    runStartLoadoutFingerprint: LOADOUT_FP,
    inputs: [],
    upgradeSelections: [],
  };
  assert.throws(() => deserializeReplay(JSON.stringify(base)));
  assert.throws(() => deserializeReplay(JSON.stringify({ ...base, runContentFingerprint: 'ABCDEF12' })));
  assert.throws(() => deserializeReplay(JSON.stringify({ ...base, runContentFingerprint: 'short' })));
  assert.equal(
    deserializeReplay(JSON.stringify({ ...base, runContentFingerprint: RUN_FP })).runContentFingerprint,
    RUN_FP,
  );
});

test('deserializeReplay validates universal catalog and permanent-loadout fingerprints', () => {
  const base = {
    seed: 1,
    configVersion: 4,
    configFingerprint: FP,
    traitCatalogFingerprint: null,
    runContentFingerprint: null,
    inputs: [],
    upgradeSelections: [],
  };
  assert.throws(() => deserializeReplay(JSON.stringify(base)), /universalUpgradeCatalogFingerprint/);
  assert.throws(() => deserializeReplay(JSON.stringify({
    ...base,
    universalUpgradeCatalogFingerprint: 'BAD',
    runStartLoadoutFingerprint: LOADOUT_FP,
  })), /universalUpgradeCatalogFingerprint/);
  assert.throws(() => deserializeReplay(JSON.stringify({
    ...base,
    universalUpgradeCatalogFingerprint: UNIVERSAL_FP,
    runStartLoadoutFingerprint: 'bad',
  })), /runStartLoadoutFingerprint/);
  assert.equal(deserializeReplay(JSON.stringify({
    ...base,
    universalUpgradeCatalogFingerprint: null,
    runStartLoadoutFingerprint: LOADOUT_FP,
  })).universalUpgradeCatalogFingerprint, null);
});

test('deserializeReplay strictly validates ordered upgrade selections', () => {
  const base = {
    seed: 1,
    configVersion: 1,
    configFingerprint: FP,
    traitCatalogFingerprint: TRAIT_FP,
    universalUpgradeCatalogFingerprint: UNIVERSAL_FP,
    runContentFingerprint: RUN_FP,
    runStartLoadoutFingerprint: LOADOUT_FP,
    inputs: [],
  };
  const invalidSelections: unknown[] = [
    undefined,
    'nope',
    [{ tick: -1, kind: 'trait', id: 'trait:puffer' }],
    [{ tick: 1.5, kind: 'trait', id: 'trait:puffer' }],
    [{ tick: Number.MAX_SAFE_INTEGER + 1, kind: 'trait', id: 'trait:puffer' }],
    [{ tick: 1, kind: 'trait', id: '' }],
    [{ tick: 1, kind: 'trait', id: 123 }],
    [{ tick: 1, kind: 'not-a-kind', id: 'trait:puffer' }],
    [
      { tick: 2, kind: 'trait', id: 'trait:puffer' },
      { tick: 1, kind: 'trait', id: 'trait:thornstorm' },
    ],
  ];
  for (const upgradeSelections of invalidSelections) {
    assert.throws(() => deserializeReplay(JSON.stringify({ ...base, upgradeSelections })));
  }

  const record = deserializeReplay(
    JSON.stringify({
      ...base,
      upgradeSelections: [
        { tick: 0, kind: 'trait', id: 'trait:puffer' },
        { tick: 0, kind: 'universal', id: 'universal:xp-magnet' },
        { tick: Number.MAX_SAFE_INTEGER, kind: 'essence', id: 'essence-cache' },
      ],
    }),
  );
  assert.deepEqual(record.upgradeSelections, [
    { tick: 0, kind: 'trait', id: 'trait:puffer' },
    { tick: 0, kind: 'universal', id: 'universal:xp-magnet' },
    { tick: Number.MAX_SAFE_INTEGER, kind: 'essence', id: 'essence-cache' },
  ]);
});
