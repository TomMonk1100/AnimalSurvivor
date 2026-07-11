/**
 * Immutable, simulation-owned boundary for permanent profile effects. Browser
 * persistence resolves its purchases into this tiny payload before a run is
 * created; the simulation never reads storage directly.
 */
import { createHashWriter } from './state-hash.js';

export const RUN_START_LOADOUT_VERSION = 1 as const;

export interface RunStartLoadout {
  readonly version: typeof RUN_START_LOADOUT_VERSION;
  /** Permanent bonus maximum health applied before any per-run cards. */
  readonly maxHpBonus: number;
}

export const DEFAULT_RUN_START_LOADOUT: RunStartLoadout = Object.freeze({
  version: RUN_START_LOADOUT_VERSION,
  maxHpBonus: 0,
});

/** Validate and detach caller-owned data before it becomes deterministic state. */
export function normalizeRunStartLoadout(loadout: RunStartLoadout | undefined): RunStartLoadout {
  if (loadout === undefined) return DEFAULT_RUN_START_LOADOUT;
  if (typeof loadout !== 'object' || loadout === null) {
    throw new TypeError('run start loadout must be an object');
  }
  if (loadout.version !== RUN_START_LOADOUT_VERSION) {
    throw new RangeError(`run start loadout version must be ${RUN_START_LOADOUT_VERSION}`);
  }
  if (!Number.isSafeInteger(loadout.maxHpBonus) || loadout.maxHpBonus < 0) {
    throw new RangeError('run start loadout maxHpBonus must be a non-negative safe integer');
  }
  return Object.freeze({ version: RUN_START_LOADOUT_VERSION, maxHpBonus: loadout.maxHpBonus });
}

/** Stable replay identity for exactly the permanent effects a run receives. */
export function fingerprintRunStartLoadout(loadout: RunStartLoadout | undefined): string {
  const normalized = normalizeRunStartLoadout(loadout);
  const writer = createHashWriter();
  writer.u32(RUN_START_LOADOUT_VERSION);
  writer.f64(normalized.maxHpBonus);
  return writer.digestHex();
}
