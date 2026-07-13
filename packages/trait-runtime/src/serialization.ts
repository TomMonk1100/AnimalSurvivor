/**
 * LEAD-OWNED.
 *
 * Versioned JSON serialization for RuntimeState. Deserialization is strict:
 * every field is validated, unknown shapes are rejected, and any non-finite
 * number causes a thrown SerializationError. No wall clock, no RNG.
 *
 * Round-trip guarantee: deserialize(serialize(s)) is structurally equal to s
 * and preserves hashState(s) and the future command stream.
 */

import type {
  BehaviorTimer,
  Catalog,
  OwnedTrait,
  ResolvedEvolution,
  RuntimeState,
} from './contracts.js';
import type { OwnedStage, SocketId, TraitRank } from './ids.js';
import { MASTER_RANK, SOCKETS, isSocketId, isTraitRank } from './ids.js';
import { fingerprintCatalog } from './state-hash.js';
import { legacyStageForRank, rankStageFor } from './rank-progression.js';

export const STATE_VERSION = 3;

export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SerializationError';
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFiniteInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v);
}

function fail(msg: string): never {
  throw new SerializationError(msg);
}

/** Serialize state to canonical versioned JSON. */
export function serializeState(state: RuntimeState): string {
  // Emit sockets in a stable socket order for byte-identical output.
  const sockets: Record<string, string> = {};
  for (const s of SOCKETS) {
    const owner = state.sockets[s];
    if (owner !== undefined) sockets[s] = owner;
  }
  const canonical = {
    version: state.version,
    catalogFingerprint: state.catalogFingerprint,
    tick: state.tick,
    owned: state.owned.map((o) => ({
      id: o.id,
      stage: o.stage,
      rank: o.rank,
      disabled: o.disabled,
    })),
    sockets,
    evolutions: state.evolutions.map((e) => ({
      id: e.id,
      ingredients: [e.ingredients[0], e.ingredients[1]],
    })),
    timers: state.timers.map((t) => ({
      ownerId: t.ownerId,
      active: t.active,
      phase: t.phase,
      phaseTicks: t.phaseTicks,
      cooldown: t.cooldown,
      charges: t.charges,
    })),
    offerRngState: state.offerRngState >>> 0,
  };
  return JSON.stringify(canonical);
}

/** Strictly parse and validate serialized state. Throws SerializationError. */
export function deserializeState(json: string): RuntimeState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail('invalid JSON');
  }
  if (typeof raw !== 'object' || raw === null) return fail('root must be object');
  const r = raw as Record<string, unknown>;

  if (r['version'] !== STATE_VERSION) return fail(`unsupported version: ${String(r['version'])}`);
  if (typeof r['catalogFingerprint'] !== 'string' || !/^[0-9a-f]{16}$/.test(r['catalogFingerprint'])) {
    return fail('invalid catalogFingerprint');
  }
  if (!isFiniteInt(r['tick']) || (r['tick'] as number) < -1) return fail('invalid tick');
  if (
    !isFiniteInt(r['offerRngState']) ||
    (r['offerRngState'] as number) < 0 ||
    (r['offerRngState'] as number) > 0xffff_ffff
  ) {
    return fail('invalid offerRngState');
  }

  // owned
  if (!Array.isArray(r['owned'])) return fail('owned must be array');
  const owned: OwnedTrait[] = (r['owned'] as unknown[]).map((item, i) => {
    if (typeof item !== 'object' || item === null) return fail(`owned[${i}] not object`);
    const o = item as Record<string, unknown>;
    if (typeof o['id'] !== 'string' || o['id'] === '') return fail(`owned[${i}].id`);
    if (o['stage'] !== 'bud' && o['stage'] !== 'adapted') return fail(`owned[${i}].stage`);
    if (!isTraitRank(o['rank'])) return fail(`owned[${i}].rank`);
    if (typeof o['disabled'] !== 'boolean') return fail(`owned[${i}].disabled`);
    return {
      id: o['id'],
      stage: o['stage'] as OwnedStage,
      rank: o['rank'] as TraitRank,
      disabled: o['disabled'],
    };
  });

  // sockets
  if (typeof r['sockets'] !== 'object' || r['sockets'] === null) return fail('sockets object');
  const socketsRaw = r['sockets'] as Record<string, unknown>;
  const sockets: Partial<Record<SocketId, string>> = {};
  for (const key of Object.keys(socketsRaw)) {
    if (!isSocketId(key)) return fail(`unknown socket: ${key}`);
    const val = socketsRaw[key];
    if (typeof val !== 'string' || val === '') return fail(`socket ${key} owner`);
    sockets[key] = val;
  }

  // evolutions
  if (!Array.isArray(r['evolutions'])) return fail('evolutions array');
  const evolutions: ResolvedEvolution[] = (r['evolutions'] as unknown[]).map((item, i) => {
    if (typeof item !== 'object' || item === null) return fail(`evolutions[${i}]`);
    const e = item as Record<string, unknown>;
    if (typeof e['id'] !== 'string' || e['id'] === '') return fail(`evolutions[${i}].id`);
    const ing = e['ingredients'];
    if (!Array.isArray(ing) || ing.length !== 2) return fail(`evolutions[${i}].ingredients`);
    if (typeof ing[0] !== 'string' || typeof ing[1] !== 'string') {
      return fail(`evolutions[${i}].ingredients type`);
    }
    return { id: e['id'], ingredients: [ing[0], ing[1]] as [string, string] };
  });

  // timers
  if (!Array.isArray(r['timers'])) return fail('timers array');
  const timers: BehaviorTimer[] = (r['timers'] as unknown[]).map((item, i) => {
    if (typeof item !== 'object' || item === null) return fail(`timers[${i}]`);
    const t = item as Record<string, unknown>;
    if (typeof t['ownerId'] !== 'string' || t['ownerId'] === '') return fail(`timers[${i}].ownerId`);
    if (typeof t['active'] !== 'boolean') return fail(`timers[${i}].active`);
    for (const f of ['phase', 'phaseTicks', 'cooldown', 'charges'] as const) {
      if (!isFiniteInt(t[f]) || (t[f] as number) < 0) return fail(`timers[${i}].${f}`);
    }
    if (!Number.isSafeInteger(t['charges'])) return fail(`timers[${i}].charges`);
    return {
      ownerId: t['ownerId'],
      active: t['active'],
      phase: t['phase'] as number,
      phaseTicks: t['phaseTicks'] as number,
      cooldown: t['cooldown'] as number,
      charges: t['charges'] as number,
    };
  });

  return {
    version: STATE_VERSION,
    catalogFingerprint: r['catalogFingerprint'],
    tick: r['tick'] as number,
    owned,
    sockets,
    evolutions,
    timers,
    offerRngState: r['offerRngState'] as number,
  };
}

/**
 * Reject structurally valid but impossible/forged state for a specific catalog.
 * This is intentionally separate from JSON shape parsing so callers that load
 * saves can report a catalog mismatch distinctly.
 */
export function validateStateAgainstCatalog(state: RuntimeState, catalog: Catalog): void {
  const expectedFingerprint = fingerprintCatalog(catalog);
  if (state.catalogFingerprint !== expectedFingerprint) fail('catalog fingerprint mismatch');

  const traitById = new Map(catalog.traits.map((trait) => [trait.id, trait]));
  const evolutionById = new Map(catalog.evolutions.map((evolution) => [evolution.id, evolution]));
  const ownedById = new Map<string, OwnedTrait>();
  for (const owned of state.owned) {
    if (ownedById.has(owned.id)) fail(`duplicate owned trait: ${owned.id}`);
    if (!traitById.has(owned.id)) fail(`unknown owned trait: ${owned.id}`);
    if (owned.stage !== legacyStageForRank(owned.rank)) {
      fail(`owned stage/rank mismatch: ${owned.id}`);
    }
    if (owned.disabled && owned.rank !== MASTER_RANK) {
      fail(`disabled trait is not Master rank: ${owned.id}`);
    }
    ownedById.set(owned.id, owned);
  }

  const evolutionIds = new Set<string>();
  const consumedTraits = new Set<string>();
  for (const resolved of state.evolutions) {
    if (evolutionIds.has(resolved.id)) fail(`duplicate resolved evolution: ${resolved.id}`);
    const definition = evolutionById.get(resolved.id);
    if (definition === undefined) fail(`unknown resolved evolution: ${resolved.id}`);
    if (
      resolved.ingredients[0] !== definition.ingredients[0] ||
      resolved.ingredients[1] !== definition.ingredients[1]
    ) {
      fail(`evolution ingredient mismatch: ${resolved.id}`);
    }
    for (const ingredient of resolved.ingredients) {
      const owned = ownedById.get(ingredient);
      if (owned === undefined || owned.rank !== MASTER_RANK || !owned.disabled) {
        fail(`evolution ingredient is not consumed Master state: ${resolved.id}`);
      }
      if (consumedTraits.has(ingredient)) fail(`trait consumed by multiple evolutions: ${ingredient}`);
      consumedTraits.add(ingredient);
    }
    evolutionIds.add(resolved.id);
  }
  for (const owned of state.owned) {
    if (owned.disabled !== consumedTraits.has(owned.id)) {
      fail(`disabled trait/evolution mismatch: ${owned.id}`);
    }
  }

  if (
    catalog.maxActiveTraits !== undefined
    && state.owned.filter((owned) => !owned.disabled).length + state.evolutions.length
      > catalog.maxActiveTraits
  ) {
    fail('active logical attack capacity exceeded');
  }

  const expectedSockets: Partial<Record<SocketId, string>> = {};
  const claimSocket = (socket: SocketId, owner: string): void => {
    if (expectedSockets[socket] !== undefined) fail(`multiple owners claim socket: ${socket}`);
    expectedSockets[socket] = owner;
  };
  for (const owned of state.owned) {
    if (owned.disabled) continue;
    const definition = traitById.get(owned.id)!;
    for (const socket of definition.sockets) claimSocket(socket, owned.id);
  }
  for (const resolved of state.evolutions) {
    const definition = evolutionById.get(resolved.id)!;
    for (const socket of definition.occupiedSockets) claimSocket(socket, resolved.id);
  }
  for (const socket of SOCKETS) {
    if (state.sockets[socket] !== expectedSockets[socket]) {
      fail(`socket occupancy mismatch: ${socket}`);
    }
  }

  const activeOwners = new Set<string>();
  for (const owned of state.owned) if (!owned.disabled) activeOwners.add(owned.id);
  for (const resolved of state.evolutions) activeOwners.add(resolved.id);

  const timersByOwner = new Map<string, BehaviorTimer>();
  for (const timer of state.timers) {
    if (timersByOwner.has(timer.ownerId)) fail(`duplicate behavior timer: ${timer.ownerId}`);
    const owned = ownedById.get(timer.ownerId);
    const evolution = evolutionById.get(timer.ownerId);
    if (owned === undefined && !evolutionIds.has(timer.ownerId)) {
      fail(`unknown behavior timer owner: ${timer.ownerId}`);
    }
    if (timer.active !== activeOwners.has(timer.ownerId)) {
      fail(`behavior timer active-state mismatch: ${timer.ownerId}`);
    }

    const behavior = owned !== undefined
      ? rankStageFor(traitById.get(owned.id)!, owned.rank).behavior
      : evolution!.behavior;
    if (behavior.kind === 'multiPhase') {
      const phases = behavior.phases!;
      if (timer.phase >= phases.length || timer.phaseTicks >= phases[timer.phase]!.durationTicks) {
        fail(`multi-phase timer out of range: ${timer.ownerId}`);
      }
    } else if (behavior.kind === 'movementTrail') {
      if (timer.phase !== 0 || timer.phaseTicks !== 0 || timer.cooldown !== 0) {
        fail(`movement-trail timer out of range: ${timer.ownerId}`);
      }
    } else if (timer.phase !== 0 || timer.phaseTicks !== 0) {
      // Cooldowns are scaled by the per-tick attack-speed multiplier, which is
      // deliberately contextual rather than serialized. Its exact upper bound
      // therefore cannot be reconstructed during save validation.
      fail(`periodic timer out of range: ${timer.ownerId}`);
    }
    timersByOwner.set(timer.ownerId, timer);
  }
  for (const owner of activeOwners) {
    if (!timersByOwner.has(owner)) fail(`missing behavior timer: ${owner}`);
  }
  for (const owned of state.owned) {
    if (!timersByOwner.has(owned.id)) fail(`missing behavior timer: ${owned.id}`);
  }
}
