/**
 * AGENT B — OWNED.
 *
 * Mutable build state: socket occupancy, upgrade progression, and the
 * renderer-facing visual snapshot. Operates on the plain RuntimeState object
 * (the canonical serializable form). Does NOT manage behavior timers — that is
 * behavior-runtime's job (timers are reconciled from state each update).
 *
 * Upgrade rules (see spec "Upgrade and socket rules"):
 *   - Applying an unowned trait: if ALL its sockets are free -> create Bud.
 *     Returns { outcome: {ok, kind:'created', stage:'bud'}, evolved: null }.
 *   - If any required socket is held by another owner -> socketConflict, and
 *     STATE IS NOT MUTATED. heldBy lists the current owners of the conflicting
 *     sockets, in socket declaration order, de-duplicated preserving order.
 *   - Applying an owned Bud trait -> advance to Adapted ('advanced').
 *   - Applying an owned Adapted trait with no completable recipe -> 'maxed'
 *     (a trait cannot advance beyond Adapted without a recipe).
 *   - Applying a trait already consumed by a Mythic -> 'alreadyMythic'
 *     (duplicates after Mythic must not retrigger evolution).
 *   - Unknown trait id -> 'unknownTrait'.
 *   - After a successful create/advance, call resolvePending() exactly once;
 *     if it resolves an evolution, set result.evolved to that id.
 *
 * Determinism: no RNG, no wall clock, no allocation-per-tick concerns (upgrades
 * are rare events).
 */

import type {
  ApplyResult,
  Catalog,
  OwnedTrait,
  RuntimeState,
  TraitDefinition,
  VisualAttachmentState,
} from './contracts.js';
import type { SocketId, TraitId, TraitStage } from './ids.js';
import { STATE_VERSION } from './serialization.js';
import { resolvePending } from './evolution-resolver.js';
import { getCatalog } from './definitions.js';
import { fingerprintCatalog } from './state-hash.js';

/**
 * Fresh empty state. version = current STATE_VERSION (import from serialization
 * is NOT allowed to avoid a cycle; hardcode the same integer and keep in sync,
 * or accept it as a parameter). Use offerRngState = seed >>> 0.
 */
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
  return catalog.traits.find((t) => t.id === traitId);
}

function findOwned(state: RuntimeState, traitId: TraitId): OwnedTrait | undefined {
  return state.owned.find((o) => o.id === traitId);
}

/** Apply one upgrade of `traitId`. Pure w.r.t. RNG; mutates state on success. */
export function applyUpgrade(
  _catalog: Catalog,
  _state: RuntimeState,
  _traitId: TraitId,
): ApplyResult {
  const traitDef = findTraitDef(_catalog, _traitId);
  if (!traitDef) {
    return { outcome: { ok: false, kind: 'unknownTrait', traitId: _traitId }, evolved: null };
  }

  const owned = findOwned(_state, _traitId);

  if (owned && owned.disabled) {
    return { outcome: { ok: false, kind: 'alreadyMythic', traitId: _traitId }, evolved: null };
  }

  let didMutate = false;

  if (!owned) {
    const capacity = _catalog.maxActiveTraits;
    // `owned` intentionally retains disabled Mythic ingredients. A resolved
    // evolution therefore still occupies the two acquisition footprints that
    // created it instead of silently freeing active-attack slots.
    if (capacity !== undefined && _state.owned.length >= capacity) {
      return {
        outcome: { ok: false, kind: 'loadoutFull', traitId: _traitId, capacity },
        evolved: null,
      };
    }
    // Check every required socket is free.
    const conflictSockets: SocketId[] = [];
    const heldBySeen = new Set<string>();
    const heldBy: string[] = [];
    for (const socket of traitDef.sockets) {
      const currentOwner = _state.sockets[socket];
      if (currentOwner !== undefined) {
        conflictSockets.push(socket);
        if (!heldBySeen.has(currentOwner)) {
          heldBySeen.add(currentOwner);
          heldBy.push(currentOwner);
        }
      }
    }
    if (conflictSockets.length > 0) {
      return {
        outcome: {
          ok: false,
          kind: 'socketConflict',
          traitId: _traitId,
          sockets: conflictSockets,
          heldBy,
        },
        evolved: null,
      };
    }

    // All sockets free: create Bud.
    _state.owned.push({ id: _traitId, stage: 'bud', disabled: false });
    for (const socket of traitDef.sockets) {
      _state.sockets[socket] = _traitId;
    }
    didMutate = true;
  } else if (owned.stage === 'bud') {
    owned.stage = 'adapted';
    didMutate = true;
  } else {
    // owned.stage === 'adapted', not disabled: cannot advance without a recipe.
    return { outcome: { ok: false, kind: 'maxed', traitId: _traitId }, evolved: null };
  }

  let evolved: string | null = null;
  if (didMutate) {
    evolved = resolvePending(_catalog, _state);
  }

  const finalOwned = findOwned(_state, _traitId);
  const stage = finalOwned!.stage;
  const kind = stage === 'bud' ? 'created' : 'advanced';

  if (kind === 'created') {
    return {
      outcome: { ok: true, kind: 'created', traitId: _traitId, stage: 'bud' },
      evolved,
    };
  }
  return {
    outcome: { ok: true, kind: 'advanced', traitId: _traitId, stage: 'adapted' },
    evolved,
  };
}

/** locked | bud | adapted | mythic for a trait id given current state. */
export function stageOf(_state: RuntimeState, _traitId: TraitId): TraitStage {
  const owned = findOwned(_state, _traitId);
  if (!owned) return 'locked';
  if (owned.disabled) return 'mythic';
  return owned.stage;
}

/** Current owner id of a socket, or undefined if free. */
export function socketOwner(_state: RuntimeState, _socket: SocketId): string | undefined {
  return _state.sockets[_socket];
}

/**
 * Renderer-facing snapshot. One entry per visible source:
 *   - each owned, non-disabled trait -> stage 'bud' | 'adapted', its sockets,
 *     its stage visualKey, enabled true.
 *   - each resolved evolution -> stage 'mythic', occupiedSockets, mythic
 *     visualKey, enabled true.
 * Disabled (consumed) traits are NOT emitted (their silhouette is the Mythic).
 * Order: owned traits in acquisition order, then evolutions in resolution order.
 */
export function visualState(
  _catalog: Catalog,
  _state: RuntimeState,
): VisualAttachmentState[] {
  const result: VisualAttachmentState[] = [];

  for (const owned of _state.owned) {
    if (owned.disabled) continue;
    const traitDef = findTraitDef(_catalog, owned.id);
    if (!traitDef) continue;
    const stageDef = traitDef.stages[owned.stage];
    result.push({
      sourceId: owned.id,
      stage: owned.stage,
      sockets: traitDef.sockets,
      visualKey: stageDef.visualKey,
      enabled: true,
    });
  }

  for (const resolved of _state.evolutions) {
    const evoDef = _catalog.evolutions.find((e) => e.id === resolved.id);
    if (!evoDef) continue;
    result.push({
      sourceId: resolved.id,
      stage: 'mythic',
      sockets: evoDef.occupiedSockets,
      visualKey: evoDef.visualKey,
      enabled: true,
    });
  }

  return result;
}
