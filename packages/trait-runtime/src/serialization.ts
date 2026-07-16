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
  CommandAnchor,
  CommandKind,
  CommandTemplate,
  FusionPreview,
  FusionVariant,
  OwnedTrait,
  PendingBehaviorEmission,
  ResolvedEvolution,
  RuntimeState,
  TargetingPolicy,
} from './contracts.js';
import { COMMAND_ANCHORS, COMMAND_KINDS } from './contracts.js';
import type { OwnedStage, SocketId, TraitRank } from './ids.js';
import { MASTER_RANK, SOCKETS, isSocketId, isTraitRank } from './ids.js';
import { fingerprintCatalog, fingerprintRuntimeContent } from './state-hash.js';
import { legacyStageForRank, rankStageFor } from './rank-progression.js';
import { resolveEvolution } from './chimera/resolved-evolution.js';
import { parseChimeraPairId } from './chimera/chimera-ids.js';
import { CHIMERA_FLAVOR_COUNT, rollVariant } from './chimera/variant-roll.js';
import { selectChassis } from './chimera/chassis.js';
import { socketProjectionFor } from './socket-projection.js';

export const STATE_VERSION = 4;
const LEGACY_STATE_VERSION = 3;
export const LEGACY_CHIMERA_FINGERPRINT = '0000000000000000';

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

const TARGETING_POLICIES: readonly TargetingPolicy[] = [
  'none', 'nearest', 'highestHealth', 'densestCluster', 'marked', 'rearThreat',
];
const TEMPLATE_NUMBER_FIELDS = [
  'originX', 'originY', 'dirX', 'dirY', 'count', 'damage', 'speed', 'radius',
  'strength', 'durationTicks', 'arc', 'facing', 'spread', 'jumps', 'pierce',
  'range', 'amount', 'intervalTicks',
] as const satisfies readonly (keyof CommandTemplate)[];
const TEMPLATE_INTEGER_FIELDS = new Set<keyof CommandTemplate>([
  'count', 'durationTicks', 'jumps', 'pierce', 'intervalTicks',
]);

function parseTemplate(value: unknown, path: string): CommandTemplate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${path} must be object`);
  const raw = value as Record<string, unknown>;
  if (typeof raw['kind'] !== 'string' || !(COMMAND_KINDS as readonly string[]).includes(raw['kind'])) {
    fail(`${path}.kind`);
  }
  const template: CommandTemplate = { kind: raw['kind'] as CommandKind };
  if (raw['targeting'] !== undefined) {
    if (typeof raw['targeting'] !== 'string' || !(TARGETING_POLICIES as readonly string[]).includes(raw['targeting'])) {
      fail(`${path}.targeting`);
    }
    template.targeting = raw['targeting'] as TargetingPolicy;
  }
  if (raw['anchor'] !== undefined) {
    if (typeof raw['anchor'] !== 'string' || !(COMMAND_ANCHORS as readonly string[]).includes(raw['anchor'])) {
      fail(`${path}.anchor`);
    }
    template.anchor = raw['anchor'] as CommandAnchor;
  }
  for (const field of TEMPLATE_NUMBER_FIELDS) {
    const candidate = raw[field];
    if (candidate === undefined) continue;
    if (!isFiniteNumber(candidate) || (TEMPLATE_INTEGER_FIELDS.has(field) && !Number.isInteger(candidate))) {
      fail(`${path}.${field}`);
    }
    template[field] = candidate;
  }
  if (raw['tag'] !== undefined) {
    if (typeof raw['tag'] !== 'string') fail(`${path}.tag`);
    template.tag = raw['tag'];
  }
  return template;
}

function parseVariant(value: unknown, path: string): FusionVariant {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${path} must be object`);
  const raw = value as Record<string, unknown>;
  if (!isFiniteInt(raw['seed']) || (raw['seed'] as number) < 0 || (raw['seed'] as number) > 0xffff_ffff) {
    fail(`${path}.seed`);
  }
  if (typeof raw['temperamentId'] !== 'string' || raw['temperamentId'].length === 0) fail(`${path}.temperamentId`);
  if (typeof raw['leanId'] !== 'string' || raw['leanId'].length === 0) fail(`${path}.leanId`);
  return {
    seed: raw['seed'] as number,
    temperamentId: raw['temperamentId'],
    leanId: raw['leanId'],
  };
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
    chimeraFingerprint: state.chimeraFingerprint,
    tick: state.tick,
    runSeed: state.runSeed >>> 0,
    fusionReadyCount: state.fusionReadyCount,
    fusionPreviews: state.fusionPreviews.map((preview) => ({
      pairId: preview.pairId,
      ordinal: preview.ordinal,
      variant: {
        seed: preview.variant.seed >>> 0,
        temperamentId: preview.variant.temperamentId,
        leanId: preview.variant.leanId,
      },
      flavorIndex: preview.flavorIndex,
    })),
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
      ...(e.variant === undefined
        ? {}
        : {
          variant: {
            seed: e.variant.seed >>> 0,
            temperamentId: e.variant.temperamentId,
            leanId: e.variant.leanId,
          },
        }),
    })),
    timers: state.timers.map((t) => ({
      ownerId: t.ownerId,
      active: t.active,
      phase: t.phase,
      phaseTicks: t.phaseTicks,
      cooldown: t.cooldown,
      charges: t.charges,
      cycles: t.cycles,
    })),
    pendingEmissions: state.pendingEmissions.map((pending) => ({
      ownerId: pending.ownerId,
      dueTick: pending.dueTick,
      emit: pending.emit,
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

  const sourceVersion = r['version'];
  if (sourceVersion !== STATE_VERSION && sourceVersion !== LEGACY_STATE_VERSION) {
    return fail(`unsupported version: ${String(sourceVersion)}`);
  }
  const legacy = sourceVersion === LEGACY_STATE_VERSION;
  if (typeof r['catalogFingerprint'] !== 'string' || !/^[0-9a-f]{16}$/.test(r['catalogFingerprint'])) {
    return fail('invalid catalogFingerprint');
  }
  const chimeraFingerprint = legacy
    ? LEGACY_CHIMERA_FINGERPRINT
    : (() => {
      if (typeof r['chimeraFingerprint'] !== 'string' || !/^[0-9a-f]{16}$/.test(r['chimeraFingerprint'])) {
        return fail('invalid chimeraFingerprint');
      }
      return r['chimeraFingerprint'];
    })();
  if (!isFiniteInt(r['tick']) || (r['tick'] as number) < -1) return fail('invalid tick');
  if (
    !isFiniteInt(r['offerRngState']) ||
    (r['offerRngState'] as number) < 0 ||
    (r['offerRngState'] as number) > 0xffff_ffff
  ) {
    return fail('invalid offerRngState');
  }
  const runSeed = legacy
    ? (r['offerRngState'] as number) >>> 0
    : (() => {
      if (!isFiniteInt(r['runSeed']) || (r['runSeed'] as number) < 0 || (r['runSeed'] as number) > 0xffff_ffff) {
        return fail('invalid runSeed');
      }
      return (r['runSeed'] as number) >>> 0;
    })();

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
    const variant = e['variant'];
    if (legacy && variant !== undefined) fail(`evolutions[${i}].variant unsupported in v3`);
    return {
      id: e['id'],
      ingredients: [ing[0], ing[1]] as [string, string],
      ...(variant === undefined ? {} : { variant: parseVariant(variant, `evolutions[${i}].variant`) }),
    };
  });

  const fusionReadyCount = legacy
    ? evolutions.length
    : (() => {
      if (!isFiniteInt(r['fusionReadyCount']) || (r['fusionReadyCount'] as number) < 0) {
        return fail('invalid fusionReadyCount');
      }
      return r['fusionReadyCount'] as number;
    })();

  const fusionPreviews: FusionPreview[] = legacy
    ? []
    : (() => {
      // Early v4 development saves predate first-ready preview persistence.
      // They remain loadable and receive snapshots during runtime restore.
      if (r['fusionPreviews'] === undefined) return [];
      if (!Array.isArray(r['fusionPreviews'])) return fail('fusionPreviews must be array');
      return (r['fusionPreviews'] as unknown[]).map((item, i) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) fail(`fusionPreviews[${i}]`);
        const preview = item as Record<string, unknown>;
        if (typeof preview['pairId'] !== 'string' || preview['pairId'].length === 0) {
          fail(`fusionPreviews[${i}].pairId`);
        }
        if (!isFiniteInt(preview['ordinal']) || (preview['ordinal'] as number) < 0) {
          fail(`fusionPreviews[${i}].ordinal`);
        }
        if (!isFiniteInt(preview['flavorIndex']) || (preview['flavorIndex'] as number) < 0) {
          fail(`fusionPreviews[${i}].flavorIndex`);
        }
        return {
          pairId: preview['pairId'],
          ordinal: preview['ordinal'] as number,
          variant: parseVariant(preview['variant'], `fusionPreviews[${i}].variant`),
          flavorIndex: preview['flavorIndex'] as number,
        };
      });
    })();

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
    const cycles = legacy
      ? 0
      : (() => {
        if (!isFiniteInt(t['cycles']) || (t['cycles'] as number) < 0 || !Number.isSafeInteger(t['cycles'])) {
          return fail(`timers[${i}].cycles`);
        }
        return t['cycles'] as number;
      })();
    return {
      ownerId: t['ownerId'],
      active: t['active'],
      phase: t['phase'] as number,
      phaseTicks: t['phaseTicks'] as number,
      cooldown: t['cooldown'] as number,
      charges: t['charges'] as number,
      cycles,
    };
  });

  const pendingEmissions: PendingBehaviorEmission[] = legacy
    ? []
    : (() => {
      if (!Array.isArray(r['pendingEmissions'])) return fail('pendingEmissions array');
      return (r['pendingEmissions'] as unknown[]).map((item, i) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) fail(`pendingEmissions[${i}]`);
        const pending = item as Record<string, unknown>;
        if (typeof pending['ownerId'] !== 'string' || pending['ownerId'].length === 0) {
          fail(`pendingEmissions[${i}].ownerId`);
        }
        if (!isFiniteInt(pending['dueTick']) || (pending['dueTick'] as number) < 0) {
          fail(`pendingEmissions[${i}].dueTick`);
        }
        return {
          ownerId: pending['ownerId'],
          dueTick: pending['dueTick'] as number,
          emit: parseTemplate(pending['emit'], `pendingEmissions[${i}].emit`),
        };
      });
    })();

  return {
    version: STATE_VERSION,
    catalogFingerprint: r['catalogFingerprint'],
    chimeraFingerprint,
    tick: r['tick'] as number,
    runSeed,
    fusionReadyCount,
    fusionPreviews,
    owned,
    sockets,
    evolutions,
    timers,
    pendingEmissions,
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
  const expectedChimeraFingerprint = fingerprintRuntimeContent(catalog);
  if (state.chimeraFingerprint !== expectedChimeraFingerprint) fail('chimera content fingerprint mismatch');

  if (!Number.isSafeInteger(state.fusionReadyCount) || state.fusionReadyCount < 0) {
    fail('fusion ready count invalid');
  }

  const traitById = new Map(catalog.traits.map((trait) => [trait.id, trait]));
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

  const previewByPair = new Map<string, FusionPreview>();
  let highestPreviewOrdinal = -1;
  for (const preview of state.fusionPreviews) {
    if (previewByPair.has(preview.pairId)) fail(`duplicate fusion preview: ${preview.pairId}`);
    const pair = parseChimeraPairId(catalog, preview.pairId);
    if (pair === undefined) fail(`invalid fusion preview pair: ${preview.pairId}`);
    if (!Number.isSafeInteger(preview.ordinal) || preview.ordinal < 0) {
      fail(`invalid fusion preview ordinal: ${preview.pairId}`);
    }
    if (!Number.isSafeInteger(preview.flavorIndex) || preview.flavorIndex < 0 || preview.flavorIndex >= CHIMERA_FLAVOR_COUNT) {
      fail(`invalid fusion preview flavor: ${preview.pairId}`);
    }
    const expected = rollVariant(state.runSeed, pair.id, preview.ordinal);
    if (
      preview.variant.seed !== expected.seed
      || preview.variant.temperamentId !== expected.temperamentId
      || preview.variant.leanId !== expected.leanId
      || preview.flavorIndex !== expected.flavorIndex
    ) {
      fail(`fusion preview roll mismatch: ${preview.pairId}`);
    }
    for (const ingredient of [pair.first, pair.second]) {
      const owned = ownedById.get(ingredient);
      if (owned === undefined || owned.rank !== MASTER_RANK) {
        fail(`fusion preview parent is not a Master: ${preview.pairId}`);
      }
    }
    highestPreviewOrdinal = Math.max(highestPreviewOrdinal, preview.ordinal);
    previewByPair.set(preview.pairId, preview);
  }
  if (highestPreviewOrdinal >= state.fusionReadyCount) {
    fail('fusion ready count precedes a persisted preview');
  }

  const evolutionIds = new Set<string>();
  const resolvedDefinitionById = new Map<string, ReturnType<typeof resolveEvolution>>();
  const consumedTraits = new Set<string>();
  for (const resolved of state.evolutions) {
    if (evolutionIds.has(resolved.id)) fail(`duplicate resolved evolution: ${resolved.id}`);
    const definition = resolveEvolution(catalog, resolved);
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
    resolvedDefinitionById.set(resolved.id, definition);
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

  const expectedSockets = socketProjectionFor(catalog, state);
  for (const socket of SOCKETS) {
    if (state.sockets[socket] !== expectedSockets[socket]) {
      fail(`socket occupancy mismatch: ${socket}`);
    }
  }

  const activeOwners = new Set<string>();
  for (const owned of state.owned) if (!owned.disabled) activeOwners.add(owned.id);
  for (const resolved of state.evolutions) {
    activeOwners.add(resolved.id);
    // Apex Whisper runs the donor's complete Master schedule alongside the
    // fused chassis/graft loop. Its existing parent timer remains the
    // serializable parallel scheduler, while emitted commands attribute to
    // the evolution itself in behavior-runtime.
    if (resolved.variant?.temperamentId === 'apex-whisper') {
      const roles = selectChassis(catalog, resolved.ingredients[0], resolved.ingredients[1]);
      activeOwners.add(roles.donor.id);
    }
  }

  const timersByOwner = new Map<string, BehaviorTimer>();
  for (const timer of state.timers) {
    if (timersByOwner.has(timer.ownerId)) fail(`duplicate behavior timer: ${timer.ownerId}`);
    const owned = ownedById.get(timer.ownerId);
    const evolution = resolvedDefinitionById.get(timer.ownerId);
    if (owned === undefined && evolution === undefined) {
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
  for (const pending of state.pendingEmissions) {
    if (!activeOwners.has(pending.ownerId)) fail(`pending behavior owner is inactive: ${pending.ownerId}`);
    if (!Number.isSafeInteger(pending.dueTick) || pending.dueTick < 0) {
      fail(`pending behavior due tick invalid: ${pending.ownerId}`);
    }
  }
}
