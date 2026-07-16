/** Pure SplitMix32-derived Chimera variant rolls. */

import { isChimeraPairId, type ChimeraPairId } from './chimera-ids.js';
import { selectStatLean, type StatLeanId } from './leans.js';
import { selectTemperament, type TemperamentId } from './temperaments.js';

/** The plan provides ten authored Announcer flavor lines. */
export const CHIMERA_FLAVOR_COUNT = 10;

export interface ChimeraVariantRoll {
  /** Stable pair-specific uint32 seed retained by resolved fusion state. */
  readonly seed: number;
  readonly temperamentId: TemperamentId;
  readonly leanId: StatLeanId;
  readonly flavorIndex: number;
}

const SPLITMIX_INCREMENT = 0x9e37_79b9;
const U32_RANGE = 0x1_0000_0000;

function requireUint32Input(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
  return value >>> 0;
}

function requireFusionReadyCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('fusionReadyCount must be a non-negative safe integer');
  }
  return value;
}

/** Stable FNV-1a text mix. This is input preparation, not ambient randomness. */
function hashText(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function avalanche(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0_aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a_2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

/** One SplitMix32 step, exported for reproducible pure data tooling. */
export function splitmix32(seed: number): number {
  return avalanche((requireUint32Input(seed, 'seed') + SPLITMIX_INCREMENT) >>> 0);
}

function createSplitMix32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + SPLITMIX_INCREMENT) >>> 0;
    return avalanche(state);
  };
}

function uniformIndex(roll: number, length: number): number {
  return Math.floor(((roll >>> 0) * length) / U32_RANGE);
}

/**
 * Roll a stable preview/result pair from immutable inputs only. It never
 * consumes the runtime offer RNG, so asking to view the offer has no side effect.
 */
export function rollVariant(
  runSeed: number,
  pairId: ChimeraPairId | string,
  fusionReadyCount: number,
): ChimeraVariantRoll {
  if (!isChimeraPairId(pairId)) throw new RangeError(`Invalid Chimera pair id: ${String(pairId)}`);
  const normalizedSeed = requireUint32Input(runSeed, 'runSeed');
  const readyCount = requireFusionReadyCount(fusionReadyCount);
  const initialSeed = avalanche(
    normalizedSeed
      ^ hashText(pairId)
      ^ hashText(String(readyCount)),
  );
  const next = createSplitMix32(initialSeed);
  const seed = next();
  const temperament = selectTemperament(next(), next());
  const lean = selectStatLean(next());
  const flavorIndex = uniformIndex(next(), CHIMERA_FLAVOR_COUNT);

  return {
    seed,
    temperamentId: temperament.id,
    leanId: lean.id,
    flavorIndex,
  };
}
