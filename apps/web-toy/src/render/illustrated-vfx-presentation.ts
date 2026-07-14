/**
 * Primary illustrated VFX presentation for hero signatures and resolved combat
 * outcomes.
 *
 * This is deliberately a renderer-only, fixed-pool layer. It consumes the
 * app-owned presentation event copies, advances every animation from fixed
 * simulation ticks, and never mutates a combat, pickup, or hero state.
 */
import * as pc from 'playcanvas';
import type { TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';
import {
  createAnimatedVfxAtlasSample,
  writeAnimatedVfxAtlasSample,
  type AnimatedVfxAtlasSample,
} from './animated-vfx-atlas';
import {
  DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE,
  illustratedVfxRankProfileForSource,
  type IllustratedVfxRankProfile,
} from './illustrated-vfx-rank-profile';
import {
  createIllustratedVfxMotionSample,
  writeIllustratedVfxMotion,
  type IllustratedVfxMotionSample,
} from './illustrated-vfx-motion';
import {
  ILLUSTRATED_VFX_FULL_INTENSITY_PROFILE,
  illustratedVfxIntensityForNewCast,
  type IllustratedVfxIntensityProfile,
} from './illustrated-vfx-intensity-governor';
import { envelope } from './vfx-easing';
import {
  WILDGUARD_VFX_CLIP,
  wildguardVfxClipDefinition,
  type WildguardVfxClip,
  type WildguardVfxMaterialBank,
} from './wildguard-vfx-atlas';

/** Enough room for signature casts while routine hit flashes stay bounded. */
export const DEFAULT_ILLUSTRATED_VFX_PRESENTATION_CAPACITY = 40;

/**
 * A small public input subset keeps the source-routing policy easy to test
 * without making test fixtures reconstruct the simulation's reusable buffers.
 */
export type IllustratedTraitVfxEvent = Pick<
  TraitPresentationEventView,
  'kind' | 'sourceId' | 'tag' | 'meleeArcResolved'
  | 'resolvedHitCount' | 'resolvedHitX' | 'resolvedHitY'
>;

/** A similarly narrow, read-only outcome view for the impact routing policy. */
export type IllustratedCombatVfxEvent = Pick<
  CombatPresentationEventView,
  'kind' | 'critical' | 'pickupKind'
>;

/**
 * The signature sheet replaces generic geometric accents only after the
 * simulation has emitted a real command. In particular, a Fox Swipe must
 * have its authoritative melee aim resolved before a claw can be shown.
 */
export function illustratedVfxClipForTraitEvent(event: IllustratedTraitVfxEvent): WildguardVfxClip | null {
  const is = (identity: string): boolean => event.sourceId === identity || event.tag === identity;
  if (
    event.kind === 'meleeArc'
    && event.meleeArcResolved === true
    && (is('greg-fox-swipe') || is('greg-rush-rake'))
  ) return WILDGUARD_VFX_CLIP.foxSwipe;
  if (
    event.kind === 'telegraph'
    && (is('benny-trample-wave') || event.sourceId === 'benny-trample')
  ) return WILDGUARD_VFX_CLIP.earthWave;
  // Gracie's painted comet lives only on the real snapshot-driven projectile
  // route. Her telegraph remains a quiet cast cue; turning that hero-origin
  // cue into a second invented travelling card produced a hero-hugging beam
  // that could disagree with the actual projectile path.
  if (
    (event.kind === 'grantShield' || event.kind === 'playTraitCue')
    && is('fluffy-shield')
  ) return WILDGUARD_VFX_CLIP.fluffyShield;
  if (
    event.kind === 'playTraitCue'
    && (is('armor-block') || is('fox-dodge'))
  ) return WILDGUARD_VFX_CLIP.shieldRecharge;

  // The remaining routes are intentionally source-aware. A command kind by
  // itself is never enough to borrow a player trait's artwork: that would let
  // a hostile or an unowned future command masquerade as a player upgrade.
  switch (event.kind) {
    case 'telegraph':
      // Gracie's Scout is a non-damaging targeting pulse, but it still earns
      // a true animated information read instead of a raw procedural eye.
      // Midnight's cyan radar language is intentionally reused here because
      // both effects expose priority targets without claiming a damage hit.
      if (event.sourceId === 'gracie-scout' && event.tag === 'gracie-scout') {
        return WILDGUARD_VFX_CLIP.midnightRadar;
      }
      if (event.sourceId === 'thornstorm-mantle' && event.tag === 'thornstorm-inhale') {
        return WILDGUARD_VFX_CLIP.thornstorm;
      }
      if (event.sourceId === 'thunderbug-dynamo' && event.tag === 'thunderbug-charge') {
        return WILDGUARD_VFX_CLIP.thunderbug;
      }
      return null;
    case 'spawnProjectileBurst':
      if (event.sourceId === 'porcupine-quills') return WILDGUARD_VFX_CLIP.quillVolley;
      if (event.sourceId === 'owl-pinions') return WILDGUARD_VFX_CLIP.owlPinions;
      return null;
    case 'radialProjectileBurst':
      return event.sourceId === 'thornstorm-mantle' ? WILDGUARD_VFX_CLIP.thornstorm : null;
    case 'areaGather':
      if (event.sourceId === 'puffer-pouch') return WILDGUARD_VFX_CLIP.pufferPulse;
      return event.sourceId === 'thornstorm-mantle' ? WILDGUARD_VFX_CLIP.thornstorm : null;
    case 'areaKnockback':
      if (event.sourceId === 'puffer-pouch') return WILDGUARD_VFX_CLIP.pufferPulse;
      if (event.sourceId === 'armadillo-greaves') return WILDGUARD_VFX_CLIP.armadilloRoll;
      // Benny's brace is a player-owned defensive burst. It intentionally
      // reuses his established earth signature instead of a generic ring.
      return event.tag === 'benny-brace' ? WILDGUARD_VFX_CLIP.earthWave : null;
    case 'applyAreaDamage':
      if (event.sourceId === 'crab-pincers') return WILDGUARD_VFX_CLIP.crabCrush;
      return event.sourceId === 'meteor-mauler' ? WILDGUARD_VFX_CLIP.meteorImpact : null;
    case 'meleeArc':
      if (event.meleeArcResolved !== true) return null;
      return event.sourceId === 'mantis-scythes' ? WILDGUARD_VFX_CLIP.mantisSweep : null;
    case 'spawnZone':
      if (event.sourceId === 'royal-stinkcloud' && event.tag === 'royal-stink') {
        return WILDGUARD_VFX_CLIP.royalStink;
      }
      if (event.sourceId === 'skunk-brush' && event.tag === 'stink-cloud') {
        return WILDGUARD_VFX_CLIP.skunkCloud;
      }
      if (
        event.sourceId === 'gecko-pads'
        && event.tag === 'gecko-pad'
      ) return WILDGUARD_VFX_CLIP.geckoPad;
      if (
        event.sourceId === 'razorstep-chimera'
        && event.tag === 'razorstep-scythe-pad'
      ) return WILDGUARD_VFX_CLIP.geckoPad;
      return null;
    case 'orbitingDamage':
      if (event.sourceId === 'firefly-colony') return WILDGUARD_VFX_CLIP.fireflyOrbit;
      return event.sourceId === 'monarch-brood' ? WILDGUARD_VFX_CLIP.monarchOrbit : null;
    case 'chainDamage':
      // Electric Eel Coil and its Thunderbug evolution share the authored
      // lightning language, but its illustrated contact card can only exist
      // after the executor exposes an actual struck endpoint. Otherwise it
      // would falsely imply a hit from a targetless chain command.
      return hasResolvedIllustratedChainEndpoint(event)
        && (event.sourceId === 'electric-eel-coil' || event.sourceId === 'thunderbug-dynamo')
        ? WILDGUARD_VFX_CLIP.thunderbug
        : null;
    case 'markTargets':
      if (event.sourceId === 'bat-ears' && event.tag === 'echo-mark') return WILDGUARD_VFX_CLIP.batSonar;
      return event.sourceId === 'midnight-radar' && event.tag === 'night-vision'
        ? WILDGUARD_VFX_CLIP.midnightRadar
        : null;
    default:
      return null;
  }
}

function hasResolvedIllustratedChainEndpoint(event: IllustratedTraitVfxEvent): boolean {
  const count = Math.floor(Number.isFinite(event.resolvedHitCount) ? event.resolvedHitCount : 0);
  return count > 0
    && event.resolvedHitX.length > 0
    && event.resolvedHitY.length > 0
    && Number.isFinite(event.resolvedHitX[0])
    && Number.isFinite(event.resolvedHitY[0]);
}

/**
 * Outcome art remains deliberately sparse in dense combat: normal/critical
 * hits and player damage are primary; rare world-token collections receive a
 * short branded beat. Routine shield outcomes already travel through the
 * defense-to-trait bridge above, so they are not doubled here.
 */
export function illustratedVfxClipForCombatEvent(event: IllustratedCombatVfxEvent): WildguardVfxClip | null {
  switch (event.kind) {
    case 'enemyHit':
      return event.critical ? WILDGUARD_VFX_CLIP.criticalImpact : WILDGUARD_VFX_CLIP.normalImpact;
    case 'playerHit':
      return WILDGUARD_VFX_CLIP.playerImpact;
    case 'pickup':
      switch (event.pickupKind?.trim().toLowerCase()) {
        case 'bomb': return WILDGUARD_VFX_CLIP.bomb;
        case 'magnet': return WILDGUARD_VFX_CLIP.magnet;
        case 'food': return WILDGUARD_VFX_CLIP.food;
        default: return null;
      }
    default:
      return null;
  }
}

export interface IllustratedVfxPresentationOptions {
  /** Bounded visual slots. Low-priority hit flashes yield to hero signatures. */
  readonly capacity?: number;
  /** Optional presentation-only layer for foreground combat anatomy. */
  readonly layers?: readonly number[];
}

export interface IllustratedVfxPresentation {
  readonly capacity: number;
  readonly liveSlots: number;
  readonly highWaterSlots: number;
  /** Starts fresh renderer-only cards and advances all active cards by tick. */
  update(
    currentTick: number,
    traitEvents: readonly TraitPresentationEventView[],
    combatEvents: readonly CombatPresentationEventView[],
    traitVisualState?: readonly TraitVisualAttachmentView[],
  ): void;
  /** Clears all renderer-owned cards; call at a run/replay boundary. */
  reset(): void;
  dispose(): void;
}

interface IllustratedVfxSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  /** Preallocated next-frame layer used only while an atlas blend is active. */
  readonly nextFrameMeshInstance: pc.MeshInstance;
  /** Slot-owned sample storage keeps atlas reads allocation-free in combat. */
  readonly atlasSample: AnimatedVfxAtlasSample;
  /** Slot-owned transform result keeps archetype motion allocation-free. */
  readonly motion: IllustratedVfxMotionSample;
  active: boolean;
  clip: WildguardVfxClip;
  priority: number;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  radius: number;
  yawDegrees: number;
  seed: number;
  /** Snapshot-derived presentation only; never feeds a combat command back. */
  rankProfile: IllustratedVfxRankProfile;
  /** Start-of-life heat budget; lower priorities always retain full intensity. */
  intensityProfile: IllustratedVfxIntensityProfile;
}

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 96;
const HEIGHT = 1.56;
/** One Master flourish per source every 0.75 seconds keeps dense fights clean. */
const MASTER_ACCENT_MIN_INTERVAL_TICKS = 45;
const VFX_ENVELOPE_ATTACK = 0.12;
const VFX_ENVELOPE_RELEASE = 0.55;
/**
 * Signature cards now spend at least half their life in release. This keeps
 * the high-value hero reads from remaining fully hot until their final tick,
 * while the short opening still leaves enough room for core/body/debris to
 * establish their shared silhouette.
 */
export const SIGNATURE_VFX_ENVELOPE_RELEASE = 0.5;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedTick(value: number): number {
  return Math.max(0, Math.floor(finite(value, 0)));
}

function normalizedCapacity(value: number | undefined): number {
  return clamp(
    Math.floor(finite(value ?? DEFAULT_ILLUSTRATED_VFX_PRESENTATION_CAPACITY, DEFAULT_ILLUSTRATED_VFX_PRESENTATION_CAPACITY)),
    MIN_CAPACITY,
    MAX_CAPACITY,
  );
}

/** Base lifetime before the bounded rank profile is applied. */
export function illustratedVfxLifetimeForClip(clip: WildguardVfxClip): number {
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe: return 12;
    case WILDGUARD_VFX_CLIP.earthWave: return 20;
    case WILDGUARD_VFX_CLIP.spitComet: return 12;
    // Static material-only threat route; it has no event projector today but
    // retains a finite fallback lifetime to keep the clip union exhaustive.
    case WILDGUARD_VFX_CLIP.saltwindEarthTelegraph: return 12;
    // Sixteen two-tick erosion frames need enough room for a readable
    // arrival and the shared true-zero release envelope.
    case WILDGUARD_VFX_CLIP.fluffyShield: return 40;
    case WILDGUARD_VFX_CLIP.normalImpact: return 10;
    case WILDGUARD_VFX_CLIP.criticalImpact: return 12;
    case WILDGUARD_VFX_CLIP.playerImpact: return 10;
    case WILDGUARD_VFX_CLIP.shieldRecharge: return 12;
    case WILDGUARD_VFX_CLIP.bomb: return 12;
    case WILDGUARD_VFX_CLIP.magnet: return 12;
    case WILDGUARD_VFX_CLIP.food: return 12;
    // These cards are currently used by the world renderer's persistent lanes,
    // but retain finite fallback lives if a future event route needs them.
    case WILDGUARD_VFX_CLIP.xpOrbit: return 12;
    case WILDGUARD_VFX_CLIP.xpCollect: return 10;
    case WILDGUARD_VFX_CLIP.hostileThorn: return 12;
    case WILDGUARD_VFX_CLIP.masterXp: return 12;
    case WILDGUARD_VFX_CLIP.pufferPulse: return 18;
    case WILDGUARD_VFX_CLIP.geckoPad: return 40;
    case WILDGUARD_VFX_CLIP.skunkCloud: return 48;
    case WILDGUARD_VFX_CLIP.royalStink: return 48;
    case WILDGUARD_VFX_CLIP.mantisSweep: return 10;
    case WILDGUARD_VFX_CLIP.crabCrush: return 13;
    case WILDGUARD_VFX_CLIP.armadilloRoll: return 16;
    case WILDGUARD_VFX_CLIP.meteorImpact: return 18;
    case WILDGUARD_VFX_CLIP.quillVolley: return 10;
    case WILDGUARD_VFX_CLIP.owlPinions: return 14;
    case WILDGUARD_VFX_CLIP.thornstorm: return 24;
    case WILDGUARD_VFX_CLIP.thunderbug: return 20;
    case WILDGUARD_VFX_CLIP.fireflyOrbit: return 30;
    case WILDGUARD_VFX_CLIP.monarchOrbit: return 30;
    case WILDGUARD_VFX_CLIP.batSonar: return 24;
    case WILDGUARD_VFX_CLIP.midnightRadar: return 28;
  }
}

function priorityForClip(clip: WildguardVfxClip): number {
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
 * Maps an authoritative trait radius to the readable body scale of its
 * renderer-only card. P2 signatures intentionally use a presentation scale
 * larger than their exact damage radius: this is a camera/readability choice,
 * never a change to collision, targeting, or projectile travel.
 */
export function illustratedVfxRadiusForTraitEvent(
  event: Pick<TraitPresentationEventView, 'range' | 'radius' | 'strength'>,
  clip: WildguardVfxClip,
): number {
  const authoredRadius = positive(event.range, positive(event.radius, 0));
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
      return clamp(positive(authoredRadius, 46), 24, 96);
    case WILDGUARD_VFX_CLIP.earthWave:
      // Benny's first real trample wave is already placed ahead of him by
      // simulation. Expand the painted front, rather than its damage query,
      // so the individual wave reads as a broad advancing ridge at gameplay
      // camera distance. This wider visual footprint remains renderer-only;
      // it never changes the compact simulation damage query.
      return clamp(Math.max(64, positive(authoredRadius, 34) * 1.95), 64, 104);
    case WILDGUARD_VFX_CLIP.spitComet:
      // The actual spit cast exposes a compact projectile hit radius (often
      // 12 world units). A card at that literal radius vanished into Gracie's
      // silhouette, so retain a bounded 56-unit body before its long tail is
      // applied by the motion projector.
      return clamp(Math.max(56, positive(authoredRadius, 16) * 3.75), 56, 86);
    case WILDGUARD_VFX_CLIP.fluffyShield:
      return clamp(16 + Math.sqrt(Math.max(0, finite(event.strength, 1))) * 3.6, 20, 38);
    case WILDGUARD_VFX_CLIP.shieldRecharge:
      return clamp(12 + Math.sqrt(Math.max(0, finite(event.strength, 1))) * 2.4, 16, 30);
    case WILDGUARD_VFX_CLIP.pufferPulse:
      return clamp(positive(authoredRadius, 90), 34, 154);
    case WILDGUARD_VFX_CLIP.geckoPad:
      return clamp(positive(authoredRadius, 38), 16, 78);
    case WILDGUARD_VFX_CLIP.skunkCloud:
      return clamp(positive(authoredRadius, 70), 30, 136);
    case WILDGUARD_VFX_CLIP.royalStink:
      return clamp(positive(authoredRadius, 110), 48, 168);
    case WILDGUARD_VFX_CLIP.mantisSweep:
      return clamp(positive(authoredRadius, 68), 26, 96);
    case WILDGUARD_VFX_CLIP.crabCrush:
      return clamp(positive(authoredRadius, 50), 20, 88);
    case WILDGUARD_VFX_CLIP.armadilloRoll:
      return clamp(positive(authoredRadius, 70), 28, 114);
    case WILDGUARD_VFX_CLIP.meteorImpact:
      return clamp(positive(authoredRadius, 100), 42, 164);
    case WILDGUARD_VFX_CLIP.quillVolley:
      return clamp(positive(authoredRadius, 18), 11, 34);
    case WILDGUARD_VFX_CLIP.owlPinions:
      return clamp(positive(authoredRadius, 42), 22, 72);
    case WILDGUARD_VFX_CLIP.thornstorm:
      return clamp(positive(authoredRadius, 140), 64, 190);
    case WILDGUARD_VFX_CLIP.thunderbug:
      return clamp(positive(authoredRadius, 150), 56, 205);
    case WILDGUARD_VFX_CLIP.fireflyOrbit:
      return clamp(positive(authoredRadius, 50), 28, 88);
    case WILDGUARD_VFX_CLIP.monarchOrbit:
      return clamp(positive(authoredRadius, 72), 42, 110);
    case WILDGUARD_VFX_CLIP.batSonar:
      return clamp(positive(authoredRadius, 200), 80, 290);
    case WILDGUARD_VFX_CLIP.midnightRadar:
      return clamp(positive(authoredRadius, 320), 130, 390);
    default:
      return clamp(positive(authoredRadius, 18), 10, 44);
  }
}

function radiusForCombat(event: CombatPresentationEventView, clip: WildguardVfxClip): number {
  const amount = Math.max(0, finite(event.amount, 0));
  switch (clip) {
    case WILDGUARD_VFX_CLIP.criticalImpact:
      return clamp(13 + Math.sqrt(amount) * 1.55, 16, 34);
    case WILDGUARD_VFX_CLIP.playerImpact:
      return clamp(12 + Math.sqrt(amount) * 1.35, 15, 30);
    case WILDGUARD_VFX_CLIP.bomb:
      return clamp(26 + Math.sqrt(amount) * 0.7, 28, 52);
    case WILDGUARD_VFX_CLIP.magnet:
      return clamp(22 + Math.sqrt(amount) * 0.34, 24, 42);
    case WILDGUARD_VFX_CLIP.food:
      return clamp(20 + Math.sqrt(amount) * 0.65, 20, 36);
    default:
      return clamp(8 + Math.sqrt(amount) * 1.15, 10, 24);
  }
}

function yawFromDirection(dirX: number, dirY: number, fallbackFacing = 0): number {
  const x = finite(dirX, 0);
  const y = finite(dirY, 0);
  if (x * x + y * y > 1e-8) return Math.atan2(x, -y) * 180 / Math.PI;
  return finite(fallbackFacing, 0) * 180 / Math.PI;
}

/**
 * A hero signature needs enough held body time for its short core, physical
 * debris, and grounded contact to read as one motion in real compositor
 * frames. It still reaches the shared exact-zero terminal endpoint; only the
 * release start is later than a compact impact/utility card.
 */
export function illustratedVfxEnvelopeReleaseForClip(clip: WildguardVfxClip): number {
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
    case WILDGUARD_VFX_CLIP.earthWave:
    case WILDGUARD_VFX_CLIP.spitComet:
      return SIGNATURE_VFX_ENVELOPE_RELEASE;
    default:
      return VFX_ENVELOPE_RELEASE;
  }
}

function resetSlot(slot: IllustratedVfxSlot): void {
  slot.active = false;
  slot.nextFrameMeshInstance.visible = false;
  slot.entity.enabled = false;
}

/**
 * Master accents deliberately attach only to resolved non-projectile, non-zone
 * casts. They are a read of the existing renderer snapshot, not a new combat
 * event, hit, area, or traversal path.
 */
function masterAccentEligible(event: TraitPresentationEventView): boolean {
  switch (event.kind) {
    case 'meleeArc':
    case 'areaGather':
    case 'areaKnockback':
    case 'applyAreaDamage':
      return true;
    default:
      return false;
  }
}

/**
 * A finite plane-card pool for the generated artwork. The material bank owns
 * texture/material lifetime; this layer owns only its mesh instances and
 * entities, which makes it safe to compose with instanced world VFX lanes.
 */
export function createIllustratedVfxPresentation(
  device: pc.GraphicsDevice,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
  materialBank: WildguardVfxMaterialBank,
  options: IllustratedVfxPresentationOptions = {},
): IllustratedVfxPresentation {
  const capacity = normalizedCapacity(options.capacity);
  const cardMesh = pc.Mesh.fromGeometry(
    device,
    new pc.PlaneGeometry({
      halfExtents: new pc.Vec2(0.5, 0.5),
      widthSegments: 1,
      lengthSegments: 1,
    }),
  );
  const slots: IllustratedVfxSlot[] = [];
  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`illustrated-vfx-${index}`);
    const meshInstance = new pc.MeshInstance(cardMesh, materialBank.materialForFrame(WILDGUARD_VFX_CLIP.normalImpact));
    const nextFrameMeshInstance = new pc.MeshInstance(
      cardMesh,
      materialBank.materialForFrame(WILDGUARD_VFX_CLIP.normalImpact),
    );
    // Individual cards can travel beyond the source command's initial point;
    // culling them against an old aggregate bound causes distracting pop-in.
    meshInstance.cull = false;
    nextFrameMeshInstance.cull = false;
    // The next-frame quad remains in the finite pool but draws only during a
    // deterministic atlas blend. Its fixed ordering keeps alpha composition
    // stable without allocating a card, entity, or material mid-fight.
    nextFrameMeshInstance.visible = false;
    entity.addComponent('render', {
      meshInstances: [meshInstance, nextFrameMeshInstance], castShadows: false, receiveShadows: false,
      ...(options.layers === undefined ? {} : { layers: options.layers }),
    });
    entity.enabled = false;
    parent.addChild(entity);
    slots.push({
      entity,
      meshInstance,
      nextFrameMeshInstance,
      atlasSample: createAnimatedVfxAtlasSample(),
      motion: createIllustratedVfxMotionSample(),
      active: false,
      clip: WILDGUARD_VFX_CLIP.normalImpact,
      priority: 0,
      tick: 0,
      expiresAtTick: 0,
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 0,
      radius: 1,
      yawDegrees: 0,
      seed: index,
      rankProfile: DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE,
      intensityProfile: ILLUSTRATED_VFX_FULL_INTENSITY_PROFILE,
    });
  }

  let disposed = false;
  let liveSlots = 0;
  let highWaterSlots = 0;
  let lastTick = -1;
  const lastMasterAccentTickBySource = new Map<string, number>();

  function selectSlot(priority: number): IllustratedVfxSlot | null {
    for (const slot of slots) {
      if (!slot.active) return slot;
    }
    let replacement: IllustratedVfxSlot | null = null;
    for (const candidate of slots) {
      if (candidate.priority > priority) continue;
      if (
        replacement === null
        || candidate.priority < replacement.priority
        || (candidate.priority === replacement.priority && candidate.tick < replacement.tick)
      ) replacement = candidate;
    }
    return replacement;
  }

  function start(
    clip: WildguardVfxClip,
    eventTick: number,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    radius: number,
    seed: number,
    currentTick: number,
    fallbackFacing = 0,
    rankProfile: IllustratedVfxRankProfile = DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE,
  ): void {
    const tick = normalizedTick(eventTick);
    const lifetime = Math.max(
      10,
      Math.round(illustratedVfxLifetimeForClip(clip) * rankProfile.lifetimeMultiplier),
    );
    // Retain the terminal tick so the shared envelope can actually present
    // its exact-zero endpoint before this pooled card is released.
    if (tick + lifetime < currentTick) return;
    const priority = priorityForClip(clip);
    const slot = selectSlot(priority);
    if (slot === null) return;
    // Count only the other live hot slots. When a saturated pool replaces an
    // old card, excluding that exact slot prevents its soon-to-be-evicted heat
    // from incorrectly dimming the incoming one.
    const intensityProfile = illustratedVfxIntensityForNewCast(priority, currentTick, slots, slot);
    slot.active = true;
    slot.clip = clip;
    slot.priority = priority;
    slot.tick = tick;
    slot.expiresAtTick = tick + lifetime;
    slot.x = finite(x, 0);
    slot.y = finite(y, 0);
    const rawDirX = finite(dirX, 0);
    const rawDirY = finite(dirY, 0);
    const length = Math.hypot(rawDirX, rawDirY);
    slot.dirX = length > 1e-6 ? rawDirX / length : 0;
    slot.dirY = length > 1e-6 ? rawDirY / length : 0;
    slot.radius = Math.max(1, finite(radius, 18));
    slot.yawDegrees = yawFromDirection(slot.dirX, slot.dirY, fallbackFacing);
    slot.seed = Math.floor(finite(seed, tick));
    slot.rankProfile = rankProfile;
    slot.intensityProfile = intensityProfile;
  }

  function startTraitEvents(
    events: readonly TraitPresentationEventView[],
    currentTick: number,
    traitVisualState: readonly TraitVisualAttachmentView[],
  ): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      const clip = illustratedVfxClipForTraitEvent(event);
      if (clip === null) continue;
      const rankProfile = illustratedVfxRankProfileForSource(traitVisualState, event.sourceId);
      const radius = illustratedVfxRadiusForTraitEvent(event, clip);
      // A chain card is a resolved contact marker, not a decorative bolt
      // travelling from the command's origin. The routing guard above proves
      // the first endpoint exists, so use that exact copied victim position.
      const isResolvedChain = event.kind === 'chainDamage';
      const x = isResolvedChain ? event.resolvedHitX[0]! : event.originX;
      const y = isResolvedChain ? event.resolvedHitY[0]! : event.originY;
      start(
        clip,
        event.tick,
        x,
        y,
        event.dirX,
        event.dirY,
        radius,
        event.tick * 31 + index * 17,
        currentTick,
        event.facing,
        rankProfile,
      );

      const lastAccentTick = lastMasterAccentTickBySource.get(event.sourceId);
      if (
        rankProfile.showMasterAccent
        && masterAccentEligible(event)
        && (lastAccentTick === undefined || event.tick - lastAccentTick >= MASTER_ACCENT_MIN_INTERVAL_TICKS)
      ) {
        // Existing critical art gives Master one unmistakable but compact read.
        // The eligibility gate above keeps this outside projectile and zone paths.
        start(
          WILDGUARD_VFX_CLIP.criticalImpact,
          event.tick,
          event.originX,
          event.originY,
          event.dirX,
          event.dirY,
          clamp(radius * 0.26, 10, 24),
          event.tick * 71 + index * 19,
          currentTick,
          event.facing,
        );
        lastMasterAccentTickBySource.set(event.sourceId, event.tick);
      }
    }
  }

  function startCombatEvents(events: readonly CombatPresentationEventView[], currentTick: number): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      const clip = illustratedVfxClipForCombatEvent(event);
      if (clip === null) continue;
      const targetSeed = typeof event.targetId === 'number'
        ? event.targetId
        : event.targetId.length * 37;
      start(
        clip,
        event.tick,
        event.x,
        event.y,
        0,
        0,
        radiusForCombat(event, clip),
        event.tick * 53 + targetSeed + index * 11,
        currentTick,
      );
    }
  }

  function updateSlot(slot: IllustratedVfxSlot, currentTick: number): boolean {
    if (!slot.active) return false;
    if (currentTick > slot.expiresAtTick) {
      resetSlot(slot);
      return false;
    }
    const duration = Math.max(1, slot.expiresAtTick - slot.tick);
    const progress = clamp((currentTick - slot.tick) / duration, 0, 1);
    const ageTicks = Math.max(0, currentTick - slot.tick);
    writeIllustratedVfxMotion(
      slot.clip,
      progress,
      ageTicks,
      slot.radius,
      slot.dirX,
      slot.dirY,
      slot.seed,
      slot.motion,
    );
    const x = slot.x + slot.motion.offsetX;
    const y = slot.y + slot.motion.offsetY;
    let scaleX = slot.motion.scaleX;
    let scaleZ = slot.motion.scaleZ;
    const yaw = slot.yawDegrees + slot.motion.yawOffsetDegrees;
    const height = HEIGHT + slot.motion.heightOffset;
    // A shared attack/hold/release curve makes every card arrive with intent,
    // remain readable, and reach exact zero before the pooled slot is reused.
    let opacity = 0.96 * envelope(progress, VFX_ENVELOPE_ATTACK, illustratedVfxEnvelopeReleaseForClip(slot.clip));

    // This is the only rank treatment applied to a live card. Duration already
    // drives the motion curve above, so R1–R5 read as a deliberately paced,
    // bounded escalation rather than a second gameplay effect.
    scaleX *= slot.rankProfile.scaleMultiplier;
    scaleZ *= slot.rankProfile.scaleMultiplier;
    opacity *= slot.rankProfile.opacityMultiplier;
    scaleX *= slot.intensityProfile.scaleMultiplier;
    scaleZ *= slot.intensityProfile.scaleMultiplier;
    opacity *= slot.intensityProfile.opacityMultiplier;
    const atlasSample = slot.atlasSample;
    const definition = wildguardVfxClipDefinition(slot.clip);
    if (!writeAnimatedVfxAtlasSample(definition.sequence, ageTicks, atlasSample)) {
      resetSlot(slot);
      return false;
    }
    const safeOpacity = clamp(opacity, 0, 1);
    const frameBlend = atlasSample.crossfade;
    slot.meshInstance.material = materialBank.materialForFrame(slot.clip, atlasSample.frameIndex);
    slot.meshInstance.setParameter('material_opacity', safeOpacity * (1 - frameBlend));
    // A static clip has no second source frame. Do not write a zero-opacity
    // override through another MeshInstance that shares this material: some
    // PlayCanvas material paths resolve that final shared uniform for both
    // instances, which makes the actual authored body disappear. The second
    // finite card is only configured on a real crossfade.
    if (frameBlend > 0) {
      slot.nextFrameMeshInstance.material = materialBank.materialForFrame(slot.clip, atlasSample.nextFrameIndex);
      slot.nextFrameMeshInstance.setParameter('material_opacity', safeOpacity * frameBlend);
      slot.nextFrameMeshInstance.visible = true;
    } else {
      slot.nextFrameMeshInstance.visible = false;
    }
    slot.entity.setLocalPosition(x - worldHalfWidth, height, worldHalfHeight - y);
    slot.entity.setLocalEulerAngles(0, yaw, 0);
    slot.entity.setLocalScale(scaleX, 1, scaleZ);
    slot.entity.enabled = true;
    return true;
  }

  return {
    capacity,
    get liveSlots(): number {
      return liveSlots;
    },
    get highWaterSlots(): number {
      return highWaterSlots;
    },
    update(currentTick, traitEvents, combatEvents, traitVisualState = []): void {
      if (disposed) return;
      const tick = normalizedTick(currentTick);
      // A replay seek or fresh run that moves backwards cannot retain an art
      // card with a future start tick. The presentation remains stateless with
      // respect to gameplay after this renderer-owned reset.
      if (lastTick >= 0 && tick < lastTick) {
        for (const slot of slots) resetSlot(slot);
        lastMasterAccentTickBySource.clear();
      }
      startTraitEvents(traitEvents, tick, traitVisualState);
      startCombatEvents(combatEvents, tick);
      let active = 0;
      for (const slot of slots) {
        if (updateSlot(slot, tick)) active++;
      }
      liveSlots = active;
      highWaterSlots = Math.max(highWaterSlots, liveSlots);
      lastTick = tick;
    },
    reset(): void {
      if (disposed) return;
      for (const slot of slots) resetSlot(slot);
      liveSlots = 0;
      highWaterSlots = 0;
      lastTick = -1;
      lastMasterAccentTickBySource.clear();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) slot.entity.destroy();
      // Entity destruction releases the only MeshInstance references. The
      // final MeshInstance releases this shared mesh, so destroying it here
      // would double-release its GPU resources.
      liveSlots = 0;
    },
  };
}
