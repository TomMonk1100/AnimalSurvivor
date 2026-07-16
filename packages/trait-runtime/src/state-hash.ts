/**
 * LEAD-OWNED.
 *
 * Canonical fingerprints. Zero dependencies, no wall clock, no RNG.
 *
 *  - fingerprintCatalog: stable hash of authored content (definitions + recipes).
 *  - hashState: canonical hash of mutable runtime state. Includes owned stages,
 *    socket occupancy, resolved recipes, behavior timers (phase/ticks/cooldown/
 *    charges), and pending deterministic state (offer RNG). Independent of key
 *    insertion order.
 *
 * Two runs with identical inputs must produce byte-identical hashes.
 */

import type { Catalog, CommandTemplate, RuntimeState } from './contracts.js';
import type { SocketId } from './ids.js';
import { SOCKETS, TRAIT_RANKS } from './ids.js';
import { rankStagesFor } from './rank-progression.js';
import { CHIMERA_CONTENT_VERSION } from './chimera/resolved-evolution.js';
import { CHIMERA_LAB_CALIBRATION_FINGERPRINT_INPUT } from './chimera/lab-calibration.js';
import { MASTER_DPS_FINGERPRINT_INPUT } from './chimera/master-dps.generated.js';

/**
 * Stable 64-bit hash (two 32-bit FNV-1a lanes) rendered as 16 lowercase hex
 * chars. Deterministic and allocation-light.
 */
function hash64(input: string): string {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0xc9dc5118 | 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (c + i) & 0xffff;
    h2 = Math.imul(h2, 0x85ebca77);
  }
  const u1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const u2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return u1 + u2;
}

/** Canonical string form of the catalog (content fingerprint input). */
function canonicalCatalog(catalog: Catalog): string {
  const traits = [...catalog.traits]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((t) => {
      const stages = TRAIT_RANKS
        .map((rank) => {
          const stage = rankStagesFor(t)[rank];
          return `rank${rank}=${stage.visualKey}|${JSON.stringify(stage.behavior)}`;
        })
        .join(';');
      return `T:${t.id}|sockets=${[...t.sockets].sort().join(',')}|tags=${[...t.tags]
        .sort()
        .join(',')}|${stages}`;
    })
    .join('\n');
  const evolutions = [...catalog.evolutions]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(
      (e) =>
        `E:${e.id}|ing=${[...e.ingredients].sort().join(',')}|occ=${[...e.occupiedSockets]
          .sort()
          .join(',')}|vk=${e.visualKey}|${JSON.stringify(e.behavior)}`,
    )
    .join('\n');
  return `CATALOG|maxActiveTraits=${catalog.maxActiveTraits ?? 'unbounded'}\n${traits}\n--\n${evolutions}`;
}

/** Content fingerprint of the catalog. */
export function fingerprintCatalog(catalog: Catalog): string {
  return hash64(canonicalCatalog(catalog));
}

/** Runtime/replay identity includes generated behavior semantics without mutating the authored catalog fingerprint. */
export function fingerprintRuntimeContent(catalog: Catalog): string {
  return hash64(
    `${fingerprintCatalog(catalog)}|${CHIMERA_CONTENT_VERSION}|${MASTER_DPS_FINGERPRINT_INPUT}|${CHIMERA_LAB_CALIBRATION_FINGERPRINT_INPUT}`,
  );
}

/** Canonical string form of runtime state (hash input). */
function canonicalState(state: RuntimeState): string {
  const owned = [...state.owned]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((o) => `${o.id}:${o.rank}:${o.stage}:${o.disabled ? 1 : 0}`)
    .join(',');

  const sockets = SOCKETS.map((s: SocketId) => `${s}=${state.sockets[s] ?? ''}`).join(',');

  const evolutions = [...state.evolutions]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => `${e.id}[${[...e.ingredients].sort().join('+')}]${e.variant === undefined
      ? ''
      : `{${e.variant.seed >>> 0}:${e.variant.temperamentId}:${e.variant.leanId}}`}`)
    .join(',');

  const fusionPreviews = [...state.fusionPreviews]
    .sort((a, b) => (a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : a.ordinal - b.ordinal))
    .map((preview) => (
      `${preview.pairId}:${preview.ordinal}:${preview.variant.seed >>> 0}:${preview.variant.temperamentId}:${preview.variant.leanId}:${preview.flavorIndex}`
    ))
    .join(',');

  const timers = [...state.timers]
    .sort((a, b) => (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0))
    .map(
      (t) =>
        `${t.ownerId}:${t.active ? 1 : 0}:${t.phase}:${t.phaseTicks}:${t.cooldown}:${t.charges}:${t.cycles}`,
    )
    .join(',');

  const templateFields: readonly (keyof CommandTemplate)[] = [
    'kind', 'targeting', 'anchor', 'originX', 'originY', 'dirX', 'dirY', 'count', 'damage', 'speed', 'radius',
    'strength', 'durationTicks', 'arc', 'facing', 'spread', 'jumps', 'pierce', 'range', 'amount',
    'intervalTicks', 'tag',
  ];
  const pending = state.pendingEmissions
    .map((pendingEmission, index) => `${pendingEmission.dueTick}:${pendingEmission.ownerId}:${index}:${templateFields
      .map((field) => `${field}=${pendingEmission.emit[field] ?? ''}`)
      .join(';')}`)
    .join(',');

  return [
    `v=${state.version}`,
    `catalog=${state.catalogFingerprint}`,
    `chimera=${state.chimeraFingerprint}`,
    `tick=${state.tick}`,
    `runSeed=${state.runSeed >>> 0}`,
    `fusionReady=${state.fusionReadyCount}`,
    `fusionPreviews=${fusionPreviews}`,
    `owned=${owned}`,
    `sockets=${sockets}`,
    `evo=${evolutions}`,
    `timers=${timers}`,
    `pending=${pending}`,
    `rng=${state.offerRngState >>> 0}`,
  ].join('\n');
}

/** Canonical hash of runtime state. */
export function hashState(state: RuntimeState): string {
  return hash64(canonicalState(state));
}
