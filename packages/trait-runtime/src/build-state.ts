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
import {
  availableFusions,
  fuseEvolution as fuseEvolutionState,
  refreshFusionPreviews,
} from './evolution-resolver.js';
import { getCatalog } from './definitions.js';
import { fingerprintCatalog, fingerprintRuntimeContent } from './state-hash.js';
import { isMasterRank, rankStageFor } from './rank-progression.js';
import { rebuildSocketProjection } from './socket-projection.js';
import { resolveEvolution, resolveSynthesizedEvolution } from './chimera/resolved-evolution.js';

/** Fresh empty state. Use offerRngState = seed >>> 0. */
export function createInitialState(
  _seed: number,
  catalogFingerprint = fingerprintCatalog(getCatalog()),
  initialTick = -1,
  chimeraFingerprint = fingerprintRuntimeContent(getCatalog()),
): RuntimeState {
  return {
    version: STATE_VERSION,
    catalogFingerprint,
    chimeraFingerprint,
    tick: initialTick,
    runSeed: _seed >>> 0,
    fusionReadyCount: 0,
    fusionPreviews: [],
    owned: [],
    sockets: {},
    evolutions: [],
    timers: [],
    pendingEmissions: [],
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

    // Wild Splice deliberately allows visual socket sharing. Logical capacity
    // remains the gameplay limit; `sockets` is rebuilt as a deterministic
    // primary projection for legacy callers while each active record retains
    // its full renderer-facing socket footprint.
    state.owned.push({ id: traitId, stage: 'bud', rank: 1, disabled: false });
    rebuildSocketProjection(catalog, state);
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
  // The variant is captured exactly when this advancement makes one or more
  // Master pairs available, never when the UI happens to inspect the offer.
  refreshFusionPreviews(catalog, state);
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
    const evoDef = resolveEvolution(catalog, resolved);
    if (!evoDef) continue;
    const synthesized = resolveSynthesizedEvolution(catalog, resolved);
    result.push({
      sourceId: resolved.id,
      stage: 'mythic',
      rank: null,
      isMaster: false,
      logicalSlotCost: 1,
      sockets: evoDef.occupiedSockets,
      visualKey: evoDef.visualKey,
      enabled: true,
      chimeraParents: [resolved.ingredients[0], resolved.ingredients[1]],
      ...(synthesized === undefined ? {} : {
        displayName: synthesized.displayName,
        rarity: synthesized.rarity,
        temperamentId: synthesized.temperamentId,
        leanId: synthesized.leanId,
        pairKind: synthesized.pairKind,
        variantSeed: synthesized.variantSeed,
      }),
    });

    // Fused ingredients no longer execute, but their Master attachments stay
    // renderer-visible. These read-only entries are explicitly excluded from
    // logical slot/accounting projections by `visualOnly`.
    for (const ingredient of resolved.ingredients) {
      const parent = findTraitDef(catalog, ingredient);
      if (parent === undefined) continue;
      const parentStage = rankStageFor(parent, MASTER_RANK);
      result.push({
        sourceId: ingredient,
        stage: 'adapted',
        rank: MASTER_RANK,
        isMaster: true,
        logicalSlotCost: 1,
        sockets: parent.sockets,
        visualKey: parentStage.visualKey,
        enabled: true,
        visualOnly: true,
        chimeraParents: [resolved.ingredients[0], resolved.ingredients[1]],
        ...(synthesized === undefined ? {} : {
          temperamentId: synthesized.temperamentId,
          pairKind: synthesized.pairKind,
          variantSeed: synthesized.variantSeed,
        }),
      });
    }
  }

  return result;
}
