/**
 * Renderer-only composite anatomy for routed player signature casts.
 *
 * The illustrated-card layer owns the painted body. This projector consumes
 * the same authoritative presentation-event copies and exposes the short
 * core, seeded debris, and quiet ground contact that make that body feel
 * anchored. It has no PlayCanvas dependency and never writes back to combat.
 */
import type { TraitPresentationEventView } from '@sim';
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';
import {
  illustratedVfxClipForTraitEvent,
  illustratedVfxLifetimeForClip,
  illustratedVfxRadiusForTraitEvent,
} from './illustrated-vfx-presentation';
import {
  createIllustratedVfxMotionSample,
  writeIllustratedVfxMotion,
  type IllustratedVfxMotionSample,
} from './illustrated-vfx-motion';
import {
  WILDGUARD_VFX_CLIP,
  type WildguardVfxClip,
} from './wildguard-vfx-atlas';
import { easeOutCubic, envelope } from './vfx-easing';

/** Matches the illustrated-card pool so the two renderer layers can share admission policy. */
export const DEFAULT_SIGNATURE_VFX_COMPOSITE_CAPACITY = 40;
/** A core is a compact hit/cast read, never a sustained additive wash. */
export const DEFAULT_SIGNATURE_VFX_CORE_LIFETIME_TICKS = 4;
/** Contact is deliberately normal-blend and remains below the plan's opacity ceiling. */
export const SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP = 0.25;

const DEFAULT_DEBRIS_LIFETIME_TICKS = 10;
const DEFAULT_GROUND_CONTACT_LIFETIME_TICKS = 12;
const MAX_CAPACITY = 96;
const MAX_DEBRIS_CAPACITY = 672;
const MAX_CORE_LIFETIME_TICKS = 4;
const MAX_SUBLAYER_LIFETIME_TICKS = 18;
const ROUTINE_DEBRIS_COUNT = 3;
const CRITICAL_DEBRIS_COUNT = 7;
const DEBRIS_DECAY_PER_TICK = 0.88;
const EMPTY_COMBAT_EVENTS: readonly CombatPresentationEventView[] = Object.freeze([]);

export interface SignatureVfxCompositeOptions {
  /** Maximum parent casts retained by the renderer-only pool. */
  readonly capacity?: number;
  /** Fixed debris descriptor capacity; defaults to enough for every critical parent. */
  readonly debrisCapacity?: number;
  /** Clamped to one through four simulation ticks. */
  readonly coreLifetimeTicks?: number;
  /** Renderer-only shard lifetime. This never affects a command or hit. */
  readonly debrisLifetimeTicks?: number;
  /** Renderer-only contact lifetime. This never affects a command or hit. */
  readonly groundContactLifetimeTicks?: number;
}

/** Stable packed prefix; entries [0, count) are current-frame core flashes. */
export interface SignatureVfxCoreDescriptorBuffer {
  count: number;
  readonly clip: WildguardVfxClip[];
  /** Mirrors the illustrated card's priority for matching pool admission. */
  readonly priority: Uint8Array;
  readonly eventTick: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly lift: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
  readonly progress: Float32Array;
  readonly seed: Uint32Array;
  /** One only when a matching authoritative critical impact promoted this cast. */
  readonly critical: Uint8Array;
}

/** Stable packed prefix; entries [0, count) are deterministic physical shards. */
export interface SignatureVfxDebrisDescriptorBuffer {
  count: number;
  readonly clip: WildguardVfxClip[];
  readonly priority: Uint8Array;
  readonly eventTick: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly lift: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
  readonly progress: Float32Array;
  readonly seed: Uint32Array;
  readonly fragmentIndex: Uint8Array;
  readonly critical: Uint8Array;
}

/** Stable packed prefix; entries [0, count) are the quiet body anchors. */
export interface SignatureVfxGroundContactDescriptorBuffer {
  count: number;
  readonly clip: WildguardVfxClip[];
  readonly priority: Uint8Array;
  readonly eventTick: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
  readonly progress: Float32Array;
  readonly seed: Uint32Array;
  readonly critical: Uint8Array;
}

/**
 * Public, allocation-stable frame API for scene integration. The scene reads
 * each descriptor prefix and decides how to batch its material/mesh lanes.
 */
export interface SignatureVfxCompositeFrame {
  tick: number;
  readonly cores: SignatureVfxCoreDescriptorBuffer;
  readonly debris: SignatureVfxDebrisDescriptorBuffer;
  readonly groundContacts: SignatureVfxGroundContactDescriptorBuffer;
}

export interface SignatureVfxCompositePresentation {
  readonly capacity: number;
  readonly debrisCapacity: number;
  readonly coreLifetimeTicks: number;
  readonly debrisLifetimeTicks: number;
  readonly groundContactLifetimeTicks: number;
  /**
   * Admits only newly observed player-owned routed trait events, advances the
   * pool with fixed simulation ticks, and returns the same frame object.
   */
  update(
    currentTick: number,
    traitEvents: readonly TraitPresentationEventView[],
    /** Optional authoritative hit outcomes promote a matching cast on a real critical. */
    combatEvents?: readonly CombatPresentationEventView[],
  ): SignatureVfxCompositeFrame;
  /** Clears renderer-owned parent slots, duplicate history, and descriptor prefixes. */
  reset(): void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizedCapacity(value: number | undefined, fallback: number, maximum: number): number {
  return clamp(Math.floor(finite(value ?? fallback, fallback)), 1, maximum);
}

function normalizedCoreLifetime(value: number | undefined): number {
  return clamp(
    Math.floor(finite(value ?? DEFAULT_SIGNATURE_VFX_CORE_LIFETIME_TICKS, DEFAULT_SIGNATURE_VFX_CORE_LIFETIME_TICKS)),
    1,
    MAX_CORE_LIFETIME_TICKS,
  );
}

function normalizedSublayerLifetime(value: number | undefined, fallback: number): number {
  return clamp(Math.floor(finite(value ?? fallback, fallback)), 1, MAX_SUBLAYER_LIFETIME_TICKS);
}

/**
 * Mirrors the private priority table in `illustrated-vfx-presentation.ts`.
 * This source remains a pure descriptor producer, so it cannot share that
 * local helper directly; keeping the exact tiers here prevents its bounded
 * pool from admitting a different set of casts than the painted body pool.
 */
export function signatureVfxIllustratedPriorityForClip(clip: WildguardVfxClip): number {
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
    case WILDGUARD_VFX_CLIP.earthWave:
    case WILDGUARD_VFX_CLIP.spitComet:
    case WILDGUARD_VFX_CLIP.thornstorm:
    case WILDGUARD_VFX_CLIP.thunderbug:
    case WILDGUARD_VFX_CLIP.meteorImpact:
      return 4;
    case WILDGUARD_VFX_CLIP.fluffyShield:
    case WILDGUARD_VFX_CLIP.shieldRecharge:
    case WILDGUARD_VFX_CLIP.criticalImpact:
    case WILDGUARD_VFX_CLIP.playerImpact:
    case WILDGUARD_VFX_CLIP.bomb:
    case WILDGUARD_VFX_CLIP.magnet:
    case WILDGUARD_VFX_CLIP.food:
    case WILDGUARD_VFX_CLIP.royalStink:
    case WILDGUARD_VFX_CLIP.mantisSweep:
    case WILDGUARD_VFX_CLIP.crabCrush:
    case WILDGUARD_VFX_CLIP.armadilloRoll:
    case WILDGUARD_VFX_CLIP.owlPinions:
    case WILDGUARD_VFX_CLIP.monarchOrbit:
    case WILDGUARD_VFX_CLIP.midnightRadar:
      return 3;
    case WILDGUARD_VFX_CLIP.normalImpact:
      return 1;
    default:
      return 2;
  }
}

/**
 * The illustrated router also owns durable zones, orbit auras, shield cues,
 * and utility marks. Those are not one-shot cast/impact anatomy, so this
 * layer deliberately accepts only the command kinds that can read as a
 * compact player attack cast or resolved impact.
 */
function isSignatureCastOrImpact(
  event: TraitPresentationEventView,
  clip: WildguardVfxClip,
): boolean {
  switch (event.kind) {
    case 'meleeArc':
    case 'spawnProjectileBurst':
    case 'radialProjectileBurst':
    case 'applyAreaDamage':
    case 'areaKnockback':
      return true;
    case 'chainDamage':
      return event.resolvedHitCount > 0;
    case 'areaGather':
      // Puffer's pulse and Thornstorm's pull are real cast stages, unlike a
      // persistent zone or companion aura.
      return clip === WILDGUARD_VFX_CLIP.pufferPulse || clip === WILDGUARD_VFX_CLIP.thornstorm;
    case 'telegraph':
      // Only authored attack casts may use their start cue as anatomy. Scout
      // radar is a utility read and stays in the illustrated-card layer.
      return clip === WILDGUARD_VFX_CLIP.earthWave
        || clip === WILDGUARD_VFX_CLIP.spitComet
        || clip === WILDGUARD_VFX_CLIP.thornstorm
        || clip === WILDGUARD_VFX_CLIP.thunderbug;
    default:
      return false;
  }
}

/** Exposed for focused tests and pool-budget diagnostics. */
export function signatureVfxDebrisCountForCritical(critical: boolean): number {
  return critical ? CRITICAL_DEBRIS_COUNT : ROUTINE_DEBRIS_COUNT;
}

function isEligibleCriticalImpact(event: CombatPresentationEventView, renderTick: number): boolean {
  return event.kind === 'enemyHit'
    && event.critical
    && Number.isFinite(event.tick)
    && event.tick <= renderTick;
}

// Two compact non-cryptographic hashes avoid allocating duplicate keys while
// retaining enough identity for a repeated rAF input array to be harmless.
const HASH_FLOAT_SCRATCH = new DataView(new ArrayBuffer(8));

function mixHash(hash: number, value: number): number {
  return Math.imul((hash ^ (value >>> 0)) >>> 0, 0x01000193) >>> 0;
}

function mixNumber(hash: number, value: number): number {
  HASH_FLOAT_SCRATCH.setFloat64(0, value, true);
  return mixHash(
    mixHash(hash, HASH_FLOAT_SCRATCH.getUint32(0, true)),
    HASH_FLOAT_SCRATCH.getUint32(4, true),
  );
}

function mixText(hash: number, value: string): number {
  let result = mixHash(hash, value.length);
  for (let index = 0; index < value.length; index++) result = mixHash(result, value.charCodeAt(index));
  return result;
}

function hashTraitEvent(event: TraitPresentationEventView, clip: WildguardVfxClip, seed: number): number {
  let hash = mixText(seed, clip);
  hash = mixText(hash, event.kind);
  hash = mixText(hash, event.sourceId);
  hash = mixText(hash, event.tag);
  hash = mixNumber(hash, event.tick);
  hash = mixNumber(hash, event.originX);
  hash = mixNumber(hash, event.originY);
  hash = mixNumber(hash, event.dirX);
  hash = mixNumber(hash, event.dirY);
  hash = mixNumber(hash, event.range);
  hash = mixNumber(hash, event.radius);
  hash = mixNumber(hash, event.count);
  hash = mixNumber(hash, event.resolvedHitCount);
  if (event.resolvedHitCount > 0) {
    hash = mixNumber(hash, event.resolvedHitX[0] ?? 0);
    hash = mixNumber(hash, event.resolvedHitY[0] ?? 0);
  }
  return hash;
}

function fragmentHash(seed: number, fragment: number): number {
  let value = (seed ^ Math.imul(fragment + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function fractionFromHash(hash: number): number {
  return (hash >>> 0) / 0x1_0000_0000;
}

function scaleForTraitEvent(event: TraitPresentationEventView, clip: WildguardVfxClip): number {
  // The composite is anatomy for the exact illustrated body. Reusing the
  // card's bounded P2 scale policy prevents a large comet/ridge from carrying
  // a tiny, stale source-space core or ground anchor.
  return illustratedVfxRadiusForTraitEvent(event, clip);
}

/** Mirrors the active illustrated card's deterministic travel without owning it. */
function writeSignatureActionMotion(
  parentClip: WildguardVfxClip,
  ageTicks: number,
  parentScale: number,
  directionX: number,
  directionY: number,
  parentSeed: number,
  out: IllustratedVfxMotionSample,
): void {
  const bodyLifetime = Math.max(1, illustratedVfxLifetimeForClip(parentClip));
  writeIllustratedVfxMotion(
    parentClip,
    clamp(ageTicks / bodyLifetime, 0, 1),
    ageTicks,
    parentScale,
    directionX,
    directionY,
    parentSeed,
    out,
  );
}

/** Places compact anatomy at the active edge of P2 bodies, not their stale cast origin. */
function signatureActionFrontOffset(parentClip: WildguardVfxClip, parentScale: number): number {
  switch (parentClip) {
    // Place compact anatomy ahead of the painted moving body so its hot core,
    // quiet ground contact, and physical fragments do not hide under Greg.
    case WILDGUARD_VFX_CLIP.foxSwipe: return parentScale * 0.3;
    // The normal-blend ridge stays at its exact event position, but the
    // compact ivory core belongs on its moving leading edge. This is a short
    // contact read, not a second wave or a persistent additive wash.
    case WILDGUARD_VFX_CLIP.earthWave: return parentScale * 0.12;
    // The compact body is intentionally no longer stretched into a beam.
    // Put the near-white core at its real forward tip so it reads as a head,
    // not another teal highlight buried inside the painted tail.
    case WILDGUARD_VFX_CLIP.spitComet: return parentScale * 0.55;
    default: return parentScale * 0.035;
  }
}

/** Ground contact is a quiet footprint behind the moving hit/head, not a second core over it. */
function signatureGroundContactBackOffset(parentClip: WildguardVfxClip, parentScale: number): number {
  switch (parentClip) {
    // A compact receiver belongs under Greg's forward claw landing, not under
    // his whole body as a diffuse haze.
    case WILDGUARD_VFX_CLIP.foxSwipe: return parentScale * 0.05;
    // Leave the textured contact/fissure behind the leading crest so Benny
    // reads as ground breaking forward rather than a stationary crater.
    case WILDGUARD_VFX_CLIP.earthWave: return -parentScale * 0.1;
    case WILDGUARD_VFX_CLIP.spitComet: return -parentScale * 0.18;
    default: return -parentScale * 0.04;
  }
}

function signatureCoreScale(parentClip: WildguardVfxClip, parentScale: number, progress: number): number {
  const eased = easeOutCubic(progress);
  switch (parentClip) {
    // Every compact hot core remains <=35% of its painted body. Biasing the
    // scale early keeps it distinct inside its legal <=4-tick lifetime rather
    // than letting the final frame do all the work.
    case WILDGUARD_VFX_CLIP.foxSwipe: return parentScale * (0.2 + 0.045 * eased);
    case WILDGUARD_VFX_CLIP.earthWave: return parentScale * (0.16 + 0.04 * eased);
    // This is a short-lived, separately placed head, not a substitute for
    // the painted tail. Its final on-screen read clears the 18px threshold.
    case WILDGUARD_VFX_CLIP.spitComet: return parentScale * (0.3 + 0.05 * eased);
    default: return parentScale * (0.2 + 0.13 * eased);
  }
}

function signatureGroundContactScale(parentClip: WildguardVfxClip, parentScale: number, progress: number): number {
  const eased = easeOutCubic(progress);
  switch (parentClip) {
    // The ground ring is still normal-blend and capped below, but its quiet
    // silhouette must survive the forest texture at gameplay zoom.
    case WILDGUARD_VFX_CLIP.foxSwipe: return parentScale * (0.6 + 0.08 * eased);
    // Keep Trample's contact compact: the directional body supplies the
    // crest, while this quiet footprint merely grounds and trails it.
    case WILDGUARD_VFX_CLIP.earthWave: return parentScale * (0.74 + 0.14 * eased);
    case WILDGUARD_VFX_CLIP.spitComet: return parentScale * (0.94 + 0.18 * eased);
    default: return parentScale * (0.56 + 0.59 * eased);
  }
}

function signatureGroundContactOpacity(parentClip: WildguardVfxClip, critical: number, fade: number): number {
  const p2Signature = parentClip === WILDGUARD_VFX_CLIP.foxSwipe
    || parentClip === WILDGUARD_VFX_CLIP.earthWave
    || parentClip === WILDGUARD_VFX_CLIP.spitComet;
  return clamp(
    (p2Signature || critical === 1 ? SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP : 0.2) * fade,
    0,
    SIGNATURE_VFX_GROUND_CONTACT_OPACITY_CAP,
  );
}

function signatureDebrisScale(parentClip: WildguardVfxClip, parentScale: number, random: number): number {
  switch (parentClip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
      // The alpha-shaped shard occupies only part of its source card; this
      // now resolves as a modest but independent physical fragment at the
      // production camera. The normal-blend material keeps these chips matte,
      // so readability does not come from another glow pass.
      return parentScale * (0.2 + random * 0.035);
    case WILDGUARD_VFX_CLIP.spitComet:
      return parentScale * (0.16 + random * 0.02);
    case WILDGUARD_VFX_CLIP.earthWave:
      return parentScale * (0.08 + random * 0.024);
    default:
      return parentScale * (0.038 + random * 0.026);
  }
}

function isUsableEvent(event: TraitPresentationEventView): boolean {
  return Number.isFinite(event.tick)
    && Number.isFinite(event.originX)
    && Number.isFinite(event.originY)
    && Number.isFinite(event.dirX)
    && Number.isFinite(event.dirY);
}

/**
 * A fixed-pool composite source. Its hot path only updates preallocated typed
 * arrays and stable clip arrays; no cards, particles, maps, or event copies
 * are allocated while a run is playing.
 */
export function createSignatureVfxCompositePresentation(
  options: SignatureVfxCompositeOptions = {},
): SignatureVfxCompositePresentation {
  const capacity = normalizedCapacity(
    options.capacity,
    DEFAULT_SIGNATURE_VFX_COMPOSITE_CAPACITY,
    MAX_CAPACITY,
  );
  const debrisCapacity = normalizedCapacity(
    options.debrisCapacity,
    capacity * CRITICAL_DEBRIS_COUNT,
    MAX_DEBRIS_CAPACITY,
  );
  const coreLifetimeTicks = normalizedCoreLifetime(options.coreLifetimeTicks);
  const debrisLifetimeTicks = normalizedSublayerLifetime(
    options.debrisLifetimeTicks,
    DEFAULT_DEBRIS_LIFETIME_TICKS,
  );
  const groundContactLifetimeTicks = normalizedSublayerLifetime(
    options.groundContactLifetimeTicks,
    DEFAULT_GROUND_CONTACT_LIFETIME_TICKS,
  );
  const parentLifetimeTicks = Math.max(coreLifetimeTicks, debrisLifetimeTicks, groundContactLifetimeTicks);

  function parentLifetimeForClip(parentClip: WildguardVfxClip): number {
    // The painted body is authoritative for how long this renderer-only
    // composite may accompany a cast. This avoids dropping Benny's contact
    // anatomy eight ticks before his 20-tick ridge body reaches its true-zero
    // release frame.
    return Math.max(parentLifetimeTicks, illustratedVfxLifetimeForClip(parentClip));
  }

  function groundContactLifetimeForClip(parentClip: WildguardVfxClip): number {
    // A Trample ridge must remain grounded for its complete visible hold; all
    // other routes keep the normal compact contact lifetime.
    return parentClip === WILDGUARD_VFX_CLIP.earthWave
      ? Math.max(groundContactLifetimeTicks, illustratedVfxLifetimeForClip(parentClip))
      : groundContactLifetimeTicks;
  }

  const active = new Uint8Array(capacity);
  const critical = new Uint8Array(capacity);
  const priority = new Uint8Array(capacity);
  const startTick = new Int32Array(capacity);
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const dirX = new Float32Array(capacity);
  const dirY = new Float32Array(capacity);
  const scale = new Float32Array(capacity);
  const seed = new Uint32Array(capacity);
  const clip: WildguardVfxClip[] = [];
  const sourceId: string[] = [];
  for (let index = 0; index < capacity; index++) {
    clip.push(WILDGUARD_VFX_CLIP.normalImpact);
    sourceId.push('');
  }

  // The small identity ring suppresses rAF duplicate inputs while remaining
  // bounded for a long survivor run. Two hashes keep accidental suppression
  // extraordinarily unlikely without storing one string key per event.
  const seenCapacity = Math.min(768, Math.max(64, capacity * 8));
  const seenA = new Uint32Array(seenCapacity);
  const seenB = new Uint32Array(seenCapacity);
  let seenCount = 0;
  let nextSeen = 0;

  const cores: SignatureVfxCoreDescriptorBuffer = {
    count: 0,
    clip: [],
    priority: new Uint8Array(capacity),
    eventTick: new Int32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    lift: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    yawRadians: new Float32Array(capacity),
    progress: new Float32Array(capacity),
    seed: new Uint32Array(capacity),
    critical: new Uint8Array(capacity),
  };
  const debris: SignatureVfxDebrisDescriptorBuffer = {
    count: 0,
    clip: [],
    priority: new Uint8Array(debrisCapacity),
    eventTick: new Int32Array(debrisCapacity),
    x: new Float32Array(debrisCapacity),
    y: new Float32Array(debrisCapacity),
    scale: new Float32Array(debrisCapacity),
    lift: new Float32Array(debrisCapacity),
    opacity: new Float32Array(debrisCapacity),
    yawRadians: new Float32Array(debrisCapacity),
    progress: new Float32Array(debrisCapacity),
    seed: new Uint32Array(debrisCapacity),
    fragmentIndex: new Uint8Array(debrisCapacity),
    critical: new Uint8Array(debrisCapacity),
  };
  const groundContacts: SignatureVfxGroundContactDescriptorBuffer = {
    count: 0,
    clip: [],
    priority: new Uint8Array(capacity),
    eventTick: new Int32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    yawRadians: new Float32Array(capacity),
    progress: new Float32Array(capacity),
    seed: new Uint32Array(capacity),
    critical: new Uint8Array(capacity),
  };
  for (let index = 0; index < capacity; index++) {
    cores.clip.push(WILDGUARD_VFX_CLIP.normalImpact);
    groundContacts.clip.push(WILDGUARD_VFX_CLIP.normalImpact);
  }
  for (let index = 0; index < debrisCapacity; index++) debris.clip.push(WILDGUARD_VFX_CLIP.normalImpact);
  // One reusable sample is sufficient: descriptor writers run sequentially
  // and copy scalar results into their typed buffers before the next write.
  const actionMotion = createIllustratedVfxMotionSample();
  const frame: SignatureVfxCompositeFrame = { tick: 0, cores, debris, groundContacts };
  let lastRenderTick = -1;

  function hasSeen(hashA: number, hashB: number): boolean {
    for (let index = 0; index < seenCount; index++) {
      if (seenA[index] === hashA && seenB[index] === hashB) return true;
    }
    return false;
  }

  function remember(hashA: number, hashB: number): void {
    seenA[nextSeen] = hashA;
    seenB[nextSeen] = hashB;
    nextSeen = (nextSeen + 1) % seenCapacity;
    if (seenCount < seenCapacity) seenCount++;
  }

  function releaseExpired(renderTick: number): void {
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) continue;
      const ageTicks = renderTick - startTick[index]!;
      if (ageTicks < 0 || ageTicks > parentLifetimeForClip(clip[index]!)) active[index] = 0;
    }
  }

  /**
   * This is the same admission rule used by the illustrated-card body pool:
   * free slot first; otherwise replace the oldest lowest-priority card that
   * does not outrank the incoming cast. Critical debris never changes priority.
   */
  function findSlot(incomingPriority: number): number {
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) return index;
    }

    let replacement = -1;
    let replacementPriority = Number.POSITIVE_INFINITY;
    let replacementStartTick = Number.POSITIVE_INFINITY;
    for (let index = 0; index < capacity; index++) {
      const currentPriority = priority[index]!;
      if (currentPriority > incomingPriority) continue;
      const currentStartTick = startTick[index]!;
      if (
        currentPriority < replacementPriority
        || (currentPriority === replacementPriority && currentStartTick < replacementStartTick)
      ) {
        replacement = index;
        replacementPriority = currentPriority;
        replacementStartTick = currentStartTick;
      }
    }
    return replacement;
  }

  function addNewEvents(events: readonly TraitPresentationEventView[], renderTick: number): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      if (!isUsableEvent(event)) continue;
      const eventClip = illustratedVfxClipForTraitEvent(event);
      if (eventClip === null) continue;
      if (!isSignatureCastOrImpact(event, eventClip)) continue;
      const eventTick = Math.floor(event.tick);
      const ageTicks = renderTick - eventTick;
      if (ageTicks < 0 || ageTicks > parentLifetimeForClip(eventClip)) continue;

      const hashA = hashTraitEvent(event, eventClip, 0x811c9dc5);
      const hashB = hashTraitEvent(event, eventClip, 0x9e3779b9);
      if (hasSeen(hashA, hashB)) continue;
      remember(hashA, hashB);

      const eventPriority = signatureVfxIllustratedPriorityForClip(eventClip);
      const slot = findSlot(eventPriority);
      if (slot < 0) continue;
      const rawDirX = finite(event.dirX, 0);
      const rawDirY = finite(event.dirY, 0);
      const directionLength = Math.hypot(rawDirX, rawDirY);
      const fallbackFacing = finite(event.facing, 0);
      const sourceX = event.kind === 'chainDamage' && event.resolvedHitCount > 0
        ? finite(event.resolvedHitX[0] ?? event.originX, event.originX)
        : event.originX;
      const sourceY = event.kind === 'chainDamage' && event.resolvedHitCount > 0
        ? finite(event.resolvedHitY[0] ?? event.originY, event.originY)
        : event.originY;

      active[slot] = 1;
      // Trait presentation events deliberately contain no inferred critical
      // state. A real copied enemy-hit event may promote this later.
      critical[slot] = 0;
      priority[slot] = eventPriority;
      startTick[slot] = eventTick;
      x[slot] = sourceX;
      y[slot] = sourceY;
      dirX[slot] = directionLength > 1e-6 ? rawDirX / directionLength : Math.sin(fallbackFacing);
      dirY[slot] = directionLength > 1e-6 ? rawDirY / directionLength : -Math.cos(fallbackFacing);
      scale[slot] = scaleForTraitEvent(event, eventClip);
      seed[slot] = hashA ^ hashB;
      clip[slot] = eventClip;
      sourceId[slot] = event.sourceId;
    }
  }

  /**
   * Trait events intentionally carry no invented `critical` flag. Instead a
   * real copied enemy-hit event can promote its most recent matching cast
   * while that parent is still alive in this renderer-only pool.
   */
  function promoteCriticalImpacts(events: readonly CombatPresentationEventView[], renderTick: number): void {
    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const event = events[eventIndex]!;
      if (!isEligibleCriticalImpact(event, renderTick)) continue;
      let match = -1;
      let newestStartTick = Number.NEGATIVE_INFINITY;
      for (let slot = 0; slot < capacity; slot++) {
        if (active[slot] === 0 || sourceId[slot] !== event.sourceId) continue;
        const parentStartTick = startTick[slot]!;
        if (parentStartTick > event.tick || parentStartTick < newestStartTick) continue;
        match = slot;
        newestStartTick = parentStartTick;
      }
      if (match >= 0) critical[match] = 1;
    }
  }

  function writeCore(slot: number, ageTicks: number): void {
    if (ageTicks < 0 || ageTicks >= coreLifetimeTicks || cores.count >= capacity) return;
    const index = cores.count++;
    const progress = ageTicks / coreLifetimeTicks;
    // The final retained core sample is an exact zero-opacity frame. Without
    // this envelope a four-tick flash would still be visibly hot at age 3 and
    // disappear on the following pool reset.
    const fade = envelope((ageTicks + 1) / coreLifetimeTicks, 0.05, 0.6);
    const parentScale = scale[slot]!;
    const parentCritical = critical[slot]!;
    const parentClip = clip[slot]!;
    writeSignatureActionMotion(
      parentClip,
      ageTicks,
      parentScale,
      dirX[slot]!,
      dirY[slot]!,
      seed[slot]!,
      actionMotion,
    );
    const frontOffset = signatureActionFrontOffset(parentClip, parentScale);
    const actionX = x[slot]! + actionMotion.offsetX + dirX[slot]! * frontOffset;
    const actionY = y[slot]! + actionMotion.offsetY + dirY[slot]! * frontOffset;
    cores.clip[index] = parentClip;
    cores.priority[index] = priority[slot]!;
    cores.eventTick[index] = startTick[slot]!;
    cores.x[index] = actionX;
    cores.y[index] = actionY;
    cores.scale[index] = signatureCoreScale(parentClip, parentScale, progress);
    cores.lift[index] = parentScale * (parentCritical === 1 ? 0.024 : 0.018);
    // The core is the sole additive component and lasts at most four ticks;
    // give that legally compact moment enough contrast to survive the forest
    // floor instead of compensating with a larger persistent glow.
    const coreValue = parentClip === WILDGUARD_VFX_CLIP.foxSwipe
      ? (parentCritical === 1 ? 0.8 : 0.72)
      : parentClip === WILDGUARD_VFX_CLIP.earthWave
        ? (parentCritical === 1 ? 0.68 : 0.58)
        : (parentCritical === 1 ? 0.94 : 0.88);
    cores.opacity[index] = clamp(coreValue * fade, 0, 1);
    cores.yawRadians[index] = Math.atan2(dirY[slot]!, dirX[slot]!);
    cores.progress[index] = progress;
    cores.seed[index] = seed[slot]!;
    cores.critical[index] = parentCritical;
  }

  function writeDebris(slot: number, ageTicks: number): void {
    if (ageTicks < 0 || ageTicks > debrisLifetimeTicks) return;
    const parentClip = clip[slot]!;
    const parentCritical = critical[slot]!;
    const fragmentCount = signatureVfxDebrisCountForCritical(parentCritical === 1);
    const progress = clamp(ageTicks / debrisLifetimeTicks, 0, 1);
    const fadeProgress = clamp((ageTicks + 0.5) / (debrisLifetimeTicks + 0.5), 0, 1);
    const fade = envelope(fadeProgress, 0.05, 0.6);
    const parentScale = scale[slot]!;
    writeSignatureActionMotion(
      parentClip,
      ageTicks,
      parentScale,
      dirX[slot]!,
      dirY[slot]!,
      seed[slot]!,
      actionMotion,
    );
    const frontOffset = signatureActionFrontOffset(parentClip, parentScale);
    const actionX = x[slot]! + actionMotion.offsetX + dirX[slot]! * frontOffset;
    const actionY = y[slot]! + actionMotion.offsetY + dirY[slot]! * frontOffset;
    const baseAngle = Math.atan2(dirY[slot]!, dirX[slot]!);
    const distanceDecay = (1 - Math.pow(DEBRIS_DECAY_PER_TICK, ageTicks + 1)) / (1 - DEBRIS_DECAY_PER_TICK);
    const earthRidge = parentClip === WILDGUARD_VFX_CLIP.earthWave;
    const foxSwipe = parentClip === WILDGUARD_VFX_CLIP.foxSwipe;

    for (let fragment = 0; fragment < fragmentCount && debris.count < debrisCapacity; fragment++) {
      const index = debris.count++;
      const fragmentSeed = fragmentHash(seed[slot]!, fragment);
      const randomA = fractionFromHash(fragmentSeed);
      const randomB = fractionFromHash(fragmentHash(fragmentSeed, 17));
      if (earthRidge) {
        // Benny's lane reads as advancing broken ground, not a radial shower
        // or one static cross-ridge. Routine casts retain exactly three rocks:
        // a rear-left chunk, central chip, and leading-right chunk. Their
        // common forward travel ties them visibly to the crest across frames.
        const laneProgress = fragmentCount <= 1 ? 0.5 : fragment / (fragmentCount - 1);
        const normalizedLane = laneProgress * 2 - 1;
        const majorChunk = fragmentCount <= ROUTINE_DEBRIS_COUNT
          || fragment === 0
          || fragment === Math.floor(fragmentCount * 0.5)
          || fragment === fragmentCount - 1;
        // The simulation already emits the three forward Trample events. The
        // renderer-only chips therefore follow *this* ridge's leading edge;
        // their bounded launch spacing and decaying velocity never add a hit
        // lane or imply an extra damage wave.
        const forwardTravel = parentScale * (0.055 + randomB * 0.026) * distanceDecay;
        const forwardDistance = parentScale * (-0.14 + laneProgress * 0.64) + forwardTravel;
        const lateralDistance = normalizedLane * parentScale * (majorChunk ? 0.08 : 0.06)
          + (randomA - 0.5) * parentScale * (majorChunk ? 0.02 : 0.04);
        const normalX = -dirY[slot]!;
        const normalY = dirX[slot]!;
        const launchLift = parentScale * (majorChunk ? 0.065 + randomB * 0.024 : 0.034 + randomB * 0.016);
        const gravity = parentScale * 0.00095 * ageTicks * ageTicks;
        debris.clip[index] = parentClip;
        debris.priority[index] = priority[slot]!;
        debris.eventTick[index] = startTick[slot]!;
        debris.x[index] = actionX + dirX[slot]! * forwardDistance + normalX * lateralDistance;
        debris.y[index] = actionY + dirY[slot]! * forwardDistance + normalY * lateralDistance;
        // Three routine Trample rocks must remain individual, visible steps
        // across the ridge lane at production camera distance. Stay within
        // the P2 composite budget: only the existing major descriptors grow,
        // and their alpha remains capped below.
        debris.scale[index] = parentScale * (majorChunk ? 0.28 + randomB * 0.045 : 0.08 + randomB * 0.026);
        debris.lift[index] = Math.max(0.004, launchLift - gravity);
        debris.opacity[index] = clamp(
          (majorChunk ? 0.6 : 0.34) * fade * (1 - progress * 0.22),
          0,
          0.6,
        );
        debris.yawRadians[index] = baseAngle + normalizedLane * 0.16 + (randomA - 0.5) * (majorChunk ? 0.22 : 0.66)
          + ageTicks * (majorChunk ? 0.08 : 0.12);
        debris.progress[index] = progress;
        debris.seed[index] = fragmentSeed;
        debris.fragmentIndex[index] = fragment;
        debris.critical[index] = parentCritical;
        continue;
      }
      // Greg's routine shards land as three anchored chips around the forward
      // claw receiver. They still inherit this one melee event and never form
      // a second sweeping/projectile attack.
      if (foxSwipe) {
        const laneProgress = fragmentCount <= 1 ? 0.5 : fragment / (fragmentCount - 1);
        const normalizedLane = laneProgress * 2 - 1;
        const forwardTravel = parentScale * (0.04 + randomB * 0.018) * distanceDecay;
        const forwardDistance = parentScale * (0.1 + laneProgress * 0.22) + forwardTravel;
        const lateralDistance = normalizedLane * parentScale * 0.18 + (randomA - 0.5) * parentScale * 0.04;
        const normalX = -dirY[slot]!;
        const normalY = dirX[slot]!;
        const launchLift = parentScale * (0.038 + randomA * 0.02);
        const gravity = parentScale * 0.0018 * ageTicks * ageTicks;
        debris.clip[index] = parentClip;
        debris.priority[index] = priority[slot]!;
        debris.eventTick[index] = startTick[slot]!;
        debris.x[index] = actionX + dirX[slot]! * forwardDistance + normalX * lateralDistance;
        debris.y[index] = actionY + dirY[slot]! * forwardDistance + normalY * lateralDistance;
        debris.scale[index] = signatureDebrisScale(parentClip, parentScale, randomB);
        debris.lift[index] = Math.max(0.02, launchLift - gravity);
        debris.opacity[index] = clamp(0.6 * fade * (1 - progress * 0.18), 0, 0.6);
        debris.yawRadians[index] = baseAngle + normalizedLane * 0.16 + ageTicks * (0.07 + randomA * 0.08);
        debris.progress[index] = progress;
        debris.seed[index] = fragmentSeed;
        debris.fragmentIndex[index] = fragment;
        debris.critical[index] = parentCritical;
        continue;
      }
      const spread = foxSwipe
        ? (parentCritical === 1 ? 1.66 : 1.34)
        : (parentCritical === 1 ? 1.52 : 1.08);
      const centeredFragment = fragment - (fragmentCount - 1) * 0.5;
      const angle = baseAngle + centeredFragment * (spread / Math.max(1, fragmentCount - 1))
        + (randomA - 0.5) * 0.28;
      const speed = parentScale * (foxSwipe ? 0.084 + randomB * 0.046 : 0.065 + randomB * 0.048);
      const distance = speed * distanceDecay + (foxSwipe ? parentScale * 0.12 : 0);
      const launchLift = parentScale * (foxSwipe ? 0.06 + randomA * 0.042 : 0.052 + randomA * 0.04);
      const gravity = parentScale * (foxSwipe ? 0.0026 : 0.0036) * ageTicks * ageTicks;
      debris.clip[index] = parentClip;
      debris.priority[index] = priority[slot]!;
      debris.eventTick[index] = startTick[slot]!;
      debris.x[index] = actionX + Math.cos(angle) * distance;
      debris.y[index] = actionY + Math.sin(angle) * distance;
      debris.scale[index] = signatureDebrisScale(parentClip, parentScale, randomB);
      debris.lift[index] = Math.max(0.004, launchLift - gravity);
      // Fox gets the final two points of the existing normal-blend value
      // budget so its three physical shards separate on the forest floor
      // without introducing an additive glow lane.
      const debrisValue = foxSwipe ? 0.6 : (parentCritical === 1 ? 0.6 : 0.58);
      debris.opacity[index] = clamp(debrisValue * fade * (1 - progress * 0.18), 0, 0.6);
      debris.yawRadians[index] = angle + ageTicks * (0.09 + randomA * 0.13);
      debris.progress[index] = progress;
      debris.seed[index] = fragmentSeed;
      debris.fragmentIndex[index] = fragment;
      debris.critical[index] = parentCritical;
    }
  }

  function writeGroundContact(slot: number, ageTicks: number): void {
    const parentClip = clip[slot]!;
    const contactLifetimeTicks = groundContactLifetimeForClip(parentClip);
    if (ageTicks < 0 || ageTicks > contactLifetimeTicks || groundContacts.count >= capacity) return;
    const index = groundContacts.count++;
    const progress = clamp(ageTicks / contactLifetimeTicks, 0, 1);
    const parentCritical = critical[slot]!;
    const parentScale = scale[slot]!;
    writeSignatureActionMotion(
      parentClip,
      ageTicks,
      parentScale,
      dirX[slot]!,
      dirY[slot]!,
      seed[slot]!,
      actionMotion,
    );
    const frontOffset = signatureActionFrontOffset(parentClip, parentScale);
    const actionX = x[slot]! + actionMotion.offsetX + dirX[slot]! * frontOffset;
    const actionY = y[slot]! + actionMotion.offsetY + dirY[slot]! * frontOffset;
    const contactBackOffset = signatureGroundContactBackOffset(parentClip, parentScale);
    // Match the painted body's fast-in/slow-out envelope. The half-tick
    // offset gives a contact a visible first sample while retaining exact zero
    // on its terminal tick instead of a linear pop.
    const fadeProgress = clamp(
      (ageTicks + 0.5) / (contactLifetimeTicks + 0.5),
      0,
      1,
    );
    // Benny's quiet footprint begins clearing before the body finishes its
    // long release, so the ground reads as a dissipating fissure—not a new
    // static terrain decal left behind by each wave.
    const releasePortion = parentClip === WILDGUARD_VFX_CLIP.earthWave ? 0.62 : 0.55;
    const fade = envelope(fadeProgress, 0.12, releasePortion);
    groundContacts.clip[index] = parentClip;
    groundContacts.priority[index] = priority[slot]!;
    groundContacts.eventTick[index] = startTick[slot]!;
    groundContacts.x[index] = actionX + dirX[slot]! * contactBackOffset;
    groundContacts.y[index] = actionY + dirY[slot]! * contactBackOffset;
    groundContacts.scale[index] = signatureGroundContactScale(parentClip, parentScale, progress);
    groundContacts.opacity[index] = signatureGroundContactOpacity(parentClip, parentCritical, fade);
    groundContacts.yawRadians[index] = Math.atan2(dirY[slot]!, dirX[slot]!);
    groundContacts.progress[index] = progress;
    groundContacts.seed[index] = seed[slot]!;
    groundContacts.critical[index] = parentCritical;
  }

  function packActive(renderTick: number): void {
    cores.count = 0;
    debris.count = 0;
    groundContacts.count = 0;
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      const ageTicks = renderTick - startTick[slot]!;
      writeCore(slot, ageTicks);
      writeDebris(slot, ageTicks);
      writeGroundContact(slot, ageTicks);
    }
  }

  function reset(): void {
    active.fill(0);
    critical.fill(0);
    priority.fill(0);
    startTick.fill(0);
    x.fill(0);
    y.fill(0);
    dirX.fill(0);
    dirY.fill(0);
    scale.fill(0);
    seed.fill(0);
    for (let index = 0; index < capacity; index++) sourceId[index] = '';
    seenA.fill(0);
    seenB.fill(0);
    seenCount = 0;
    nextSeen = 0;
    cores.count = 0;
    debris.count = 0;
    groundContacts.count = 0;
    frame.tick = 0;
    lastRenderTick = -1;
  }

  return {
    capacity,
    debrisCapacity,
    coreLifetimeTicks,
    debrisLifetimeTicks,
    groundContactLifetimeTicks,
    update(currentTick, traitEvents, combatEvents = EMPTY_COMBAT_EVENTS): SignatureVfxCompositeFrame {
      const renderTick = Math.max(0, Math.floor(finite(currentTick, 0)));
      if (renderTick < lastRenderTick) reset();
      lastRenderTick = renderTick;
      releaseExpired(renderTick);
      addNewEvents(traitEvents, renderTick);
      promoteCriticalImpacts(combatEvents, renderTick);
      packActive(renderTick);
      frame.tick = renderTick;
      return frame;
    },
    reset,
  };
}
