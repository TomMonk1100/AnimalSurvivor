/**
 * Mutable build state: logical attack capacity, rank progression, explicit
 * Master fusions, socket occupancy, and renderer-facing snapshots.
 *
 * Important split:
 *   - logical slots count executable attacks (a fusion costs one);
 *   - visual sockets retain the ingredient footprint of the fused form.
 *
 * The split lets a fusion free a combat slot without lying to the renderer
 * about which body attachments remain visible.
 */

import type {
  ApplyOutcome,
  ApplyResult,
  Catalog,
  FuseResult,
  OwnedTrait,
  RuntimeState,
  TraitDefinition,
  VisualAttachmentState,
} from './contracts.js';
import type { SocketId, TraitId, TraitRank, TraitStage } from './ids.js';
import { MASTER_RANK } from './ids.js';
import { STATE_VERSION } from './serialization.js';
import { availableFusions, fuseEvolution as fuseEvolutionState } from './evolution-resolver.js';
import { getCatalog } from './definitions.js';
import { fingerprintCatalog } from './state-hash.js';
import { isMasterRank, rankStageFor } from './rank-progression.js';

/** Fresh empty state. Use offerRngState = seed >>> 0. */
export function createInitialState(
  _seed: number,
  catalogFingerprint = fingerprintCatalog(getCatalog()),
  initialTick = -1,
): RuntimeState {
  return {
    version: STATE_VERSION,
    catalogFingerprint,
    tick: initialTick,
    owned: [],
    sockets: {},
    evolutions: [],
    timers: [],
    offerRngState: _seed >>> 0,
  };
}

function findTraitDef(catalog: Catalog, traitId: TraitId): TraitDefinition | undefined {
  return catalog.traits.find((trait) => trait.id === traitId);
}

function findOwned(state: RuntimeState, traitId: TraitId): OwnedTrait | undefined {
  return state.owned.find((owned) => owned.id === traitId);
}

/**
 * Number of live logical attack slots. Disabled ingredient records are
 * intentionally excluded: each resolved evolution replaces two attacks with
 * one executable owner.
 */
export function activeAttackSlots(state: RuntimeState): number {
  let slots = state.evolutions.length;
  for (const owned of state.owned) {
    if (!owned.disabled) slots++;
  }
  return slots;
}

function result(catalog: Catalog, state: RuntimeState, outcome: ApplyOutcome): ApplyResult {
  return {
    outcome,
    evolved: null,
    fusionReady: availableFusions(catalog, state),
  };
}

/** Apply one rank of `traitId`. Fusions are deliberately a separate action. */
export function applyUpgrade(
  catalog: Catalog,
  state: RuntimeState,
  traitId: TraitId,
): ApplyResult {
  const traitDef = findTraitDef(catalog, traitId);
  if (!traitDef) {
    return result(catalog, state, { ok: false, kind: 'unknownTrait', traitId });
  }

  const owned = findOwned(state, traitId);
  if (owned?.disabled) {
    return result(catalog, state, { ok: false, kind: 'alreadyMythic', traitId });
  }

  if (owned === undefined) {
    const capacity = catalog.maxActiveTraits;
    if (capacity !== undefined && activeAttackSlots(state) >= capacity) {
      return result(catalog, state, { ok: false, kind: 'loadoutFull', traitId, capacity });
    }

    const conflictSockets: SocketId[] = [];
    const heldBySeen = new Set<string>();
    const heldBy: string[] = [];
    for (const socket of traitDef.sockets) {
      const currentOwner = state.sockets[socket];
      if (currentOwner === undefined) continue;
      conflictSockets.push(socket);
      if (!heldBySeen.has(currentOwner)) {
        heldBySeen.add(currentOwner);
        heldBy.push(currentOwner);
      }
    }
    if (conflictSockets.length > 0) {
      return result(catalog, state, {
        ok: false,
        kind: 'socketConflict',
        traitId,
        sockets: conflictSockets,
        heldBy,
      });
    }

    state.owned.push({ id: traitId, stage: 'bud', rank: 1, disabled: false });
    for (const socket of traitDef.sockets) state.sockets[socket] = traitId;
    return result(catalog, state, {
      ok: true,
      kind: 'created',
      traitId,
      stage: 'bud',
      rank: 1,
    });
  }

  if (owned.rank === MASTER_RANK) {
    return result(catalog, state, { ok: false, kind: 'maxed', traitId });
  }

  const nextRank = (owned.rank + 1) as TraitRank;
  owned.rank = nextRank;
  // Every advancement after rank 1 maps to the renderer's existing Adapted
  // attachment bucket until rank-specific art is authored.
  owned.stage = 'adapted';
  return result(catalog, state, {
    ok: true,
    kind: 'advanced',
    traitId,
    stage: 'adapted',
    rank: nextRank,
  });
}

/** Explicitly fuse one currently compatible Master pair. */
export function fuseEvolution(
  catalog: Catalog,
  state: RuntimeState,
  evolutionId: string,
): FuseResult {
  return fuseEvolutionState(catalog, state, evolutionId);
}

/** Exact rank for an owned independent attack, or null when locked/fused. */
export function rankOf(state: RuntimeState, traitId: TraitId): TraitRank | null {
  const owned = findOwned(state, traitId);
  if (owned === undefined || owned.disabled) return null;
  return owned.rank;
}

/** Legacy status for callers that have not yet migrated to rankOf. */
export function stageOf(state: RuntimeState, traitId: TraitId): TraitStage {
  const owned = findOwned(state, traitId);
  if (owned === undefined) return 'locked';
  if (owned.disabled) return 'mythic';
  return owned.stage;
}

/** Current owner id of a visual socket, or undefined if free. */
export function socketOwner(state: RuntimeState, socket: SocketId): string | undefined {
  return state.sockets[socket];
}

/** Renderer-facing snapshot. It never grants renderer write access to state. */
export function visualState(catalog: Catalog, state: RuntimeState): VisualAttachmentState[] {
  const result: VisualAttachmentState[] = [];

  for (const owned of state.owned) {
    if (owned.disabled) continue;
    const traitDef = findTraitDef(catalog, owned.id);
    if (!traitDef) continue;
    const stageDef = rankStageFor(traitDef, owned.rank);
    result.push({
      sourceId: owned.id,
      stage: owned.stage,
      rank: owned.rank,
      isMaster: isMasterRank(owned.rank),
      logicalSlotCost: 1,
      sockets: traitDef.sockets,
      visualKey: stageDef.visualKey,
      enabled: true,
    });
  }

  for (const resolved of state.evolutions) {
    const evoDef = catalog.evolutions.find((evolution) => evolution.id === resolved.id);
    if (!evoDef) continue;
    result.push({
      sourceId: resolved.id,
      stage: 'mythic',
      rank: null,
      isMaster: false,
      logicalSlotCost: 1,
      sockets: evoDef.occupiedSockets,
      visualKey: evoDef.visualKey,
      enabled: true,
    });
  }

  return result;
}
