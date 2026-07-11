/**
 * Deterministic input recording and stable (de)serialization.
 *
 * This module only records and (de)serializes; it does not replay/step the
 * simulation from a ReplayRecord — that belongs to the simulation module.
 */
import type { ReplayRecord, TickInput, UpgradeSelection } from './types.js';

export function createReplayRecorder(
  seed: number,
  configVersion: number,
  configFingerprint: string,
  traitCatalogFingerprint: string | null,
  runContentFingerprint: string | null,
): {
  record(input: TickInput): void;
  recordUpgrade(selection: UpgradeSelection): void;
  finish(): ReplayRecord;
} {
  const inputs: TickInput[] = [];
  const upgradeSelections: UpgradeSelection[] = [];
  return {
    record(input: TickInput): void {
      // Copy so later mutation of the caller's input object can never alter
      // already-recorded history (append-only).
      inputs.push({ moveX: input.moveX, moveY: input.moveY, paused: input.paused });
    },
    recordUpgrade(selection: UpgradeSelection): void {
      upgradeSelections.push({ tick: selection.tick, traitId: selection.traitId });
    },
    finish(): ReplayRecord {
      return {
        seed,
        configVersion,
        configFingerprint,
        traitCatalogFingerprint,
        runContentFingerprint,
        inputs: inputs.slice(),
        upgradeSelections: upgradeSelections.slice(),
      };
    },
  };
}

/** Throws if `n` is not finite — a non-finite number has no stable JSON form. */
function jsonNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`serializeReplay: cannot serialize non-finite number (${n})`);
  }
  return String(n);
}

/**
 * Stable JSON serialization: the object's exact key order is hand-built
 * rather than relying on JSON.stringify's iteration-order behavior, so the
 * output is byte-identical across engines/runs for the same ReplayRecord.
 */
export function serializeReplay(r: ReplayRecord): string {
  const inputsJson = r.inputs
    .map(
      (i) =>
        `{"moveX":${jsonNumber(i.moveX)},"moveY":${jsonNumber(i.moveY)},"paused":${i.paused ? 'true' : 'false'}}`,
    )
    .join(',');
  const upgradesJson = r.upgradeSelections
    .map((selection) => `{"tick":${jsonNumber(selection.tick)},"traitId":${JSON.stringify(selection.traitId)}}`)
    .join(',');
  return `{"seed":${jsonNumber(r.seed)},"configVersion":${jsonNumber(r.configVersion)},"configFingerprint":${JSON.stringify(r.configFingerprint)},"traitCatalogFingerprint":${JSON.stringify(r.traitCatalogFingerprint)},"runContentFingerprint":${JSON.stringify(r.runContentFingerprint)},"inputs":[${inputsJson}],"upgradeSelections":[${upgradesJson}]}`;
}

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/**
 * Parses and validates a serialized ReplayRecord. Throws Error (not a typed
 * subclass — callers are expected to treat any thrown error here as "bad
 * replay data") on: invalid JSON, a non-object root, missing/non-number/NaN
 * seed or configVersion, invalid config fingerprint, non-array inputs, or any
 * input entry with a missing/non-finite moveX or moveY, or a non-boolean paused. Valid
 * moveX/moveY are clamped into [-1, 1] on the way out.
 */
export function deserializeReplay(s: string): ReplayRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch (err) {
    throw new Error(`deserializeReplay: invalid JSON: ${(err as Error).message}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('deserializeReplay: root value is not an object');
  }
  const obj = raw as Record<string, unknown>;

  const seed = obj.seed;
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new Error('deserializeReplay: missing or invalid "seed"');
  }

  const configVersion = obj.configVersion;
  if (typeof configVersion !== 'number' || !Number.isInteger(configVersion)) {
    throw new Error('deserializeReplay: missing or invalid "configVersion"');
  }

  const configFingerprint = obj.configFingerprint;
  if (typeof configFingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(configFingerprint)) {
    throw new Error('deserializeReplay: missing or invalid "configFingerprint"');
  }

  const traitCatalogFingerprint = obj.traitCatalogFingerprint;
  if (
    traitCatalogFingerprint !== null &&
    (typeof traitCatalogFingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(traitCatalogFingerprint))
  ) {
    throw new Error('deserializeReplay: missing or invalid "traitCatalogFingerprint"');
  }

  const runContentFingerprint = obj.runContentFingerprint;
  if (
    runContentFingerprint !== null &&
    (typeof runContentFingerprint !== 'string' || !/^[0-9a-f]{8}$/.test(runContentFingerprint))
  ) {
    throw new Error('deserializeReplay: missing or invalid "runContentFingerprint"');
  }

  const rawInputs = obj.inputs;
  if (!Array.isArray(rawInputs)) {
    throw new Error('deserializeReplay: "inputs" is not an array');
  }

  const inputs: TickInput[] = rawInputs.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`deserializeReplay: inputs[${index}] is not an object`);
    }
    const e = entry as Record<string, unknown>;

    const moveX = e.moveX;
    const moveY = e.moveY;
    const paused = e.paused;

    if (typeof moveX !== 'number' || !Number.isFinite(moveX)) {
      throw new Error(`deserializeReplay: inputs[${index}].moveX is missing or NaN`);
    }
    if (typeof moveY !== 'number' || !Number.isFinite(moveY)) {
      throw new Error(`deserializeReplay: inputs[${index}].moveY is missing or NaN`);
    }
    if (typeof paused !== 'boolean') {
      throw new Error(`deserializeReplay: inputs[${index}].paused is not a boolean`);
    }

    return {
      moveX: clampUnit(moveX),
      moveY: clampUnit(moveY),
      paused,
    };
  });

  const rawUpgradeSelections = obj.upgradeSelections;
  if (!Array.isArray(rawUpgradeSelections)) {
    throw new Error('deserializeReplay: "upgradeSelections" is not an array');
  }

  let previousTick = -1;
  const upgradeSelections: UpgradeSelection[] = rawUpgradeSelections.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`deserializeReplay: upgradeSelections[${index}] is not an object`);
    }
    const selection = entry as Record<string, unknown>;
    const tick = selection.tick;
    const traitId = selection.traitId;

    if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) {
      throw new Error(`deserializeReplay: upgradeSelections[${index}].tick is invalid`);
    }
    if (typeof traitId !== 'string' || traitId.length === 0) {
      throw new Error(`deserializeReplay: upgradeSelections[${index}].traitId is empty or invalid`);
    }
    if (tick < previousTick) {
      throw new Error('deserializeReplay: upgradeSelections ticks are not nondecreasing');
    }
    previousTick = tick;
    return { tick, traitId };
  });

  return {
    seed,
    configVersion,
    configFingerprint,
    traitCatalogFingerprint,
    runContentFingerprint,
    inputs,
    upgradeSelections,
  };
}
