/**
 * Primary illustrated VFX presentation for hero signatures and resolved combat
 * outcomes.
 *
 * This is deliberately a renderer-only, fixed-pool layer. It consumes the
 * app-owned presentation event copies, advances every animation from fixed
 * simulation ticks, and never mutates a combat, pickup, or hero state.
 */
import * as pc from 'playcanvas';
import type { TraitPresentationEventView } from '@sim';
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';
import {
  WILDGUARD_VFX_CLIP,
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
  // The built-in Gracie basic attack uses a telegraph, while authored trait
  // projectile bursts use the structural burst command. Both are one visible
  // spit cast, so they share the exact same illustrated comet sequence.
  if (
    (event.kind === 'telegraph' || event.kind === 'spawnProjectileBurst')
    && is('gracie-spit')
  ) return WILDGUARD_VFX_CLIP.spitComet;
  if (
    (event.kind === 'grantShield' || event.kind === 'playTraitCue')
    && is('fluffy-shield')
  ) return WILDGUARD_VFX_CLIP.fluffyShield;
  if (
    event.kind === 'playTraitCue'
    && (is('armor-block') || is('fox-dodge'))
  ) return WILDGUARD_VFX_CLIP.shieldRecharge;
  return null;
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
  ): void;
  /** Clears all renderer-owned cards; call at a run/replay boundary. */
  reset(): void;
  dispose(): void;
}

interface IllustratedVfxSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
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
}

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 96;
const HEIGHT = 1.56;

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

function lifetimeForClip(clip: WildguardVfxClip): number {
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe: return 12;
    case WILDGUARD_VFX_CLIP.earthWave: return 20;
    case WILDGUARD_VFX_CLIP.spitComet: return 12;
    case WILDGUARD_VFX_CLIP.fluffyShield: return 18;
    case WILDGUARD_VFX_CLIP.normalImpact: return 7;
    case WILDGUARD_VFX_CLIP.criticalImpact: return 12;
    case WILDGUARD_VFX_CLIP.playerImpact: return 9;
    case WILDGUARD_VFX_CLIP.shieldRecharge: return 12;
    case WILDGUARD_VFX_CLIP.bomb: return 12;
    case WILDGUARD_VFX_CLIP.magnet: return 12;
    case WILDGUARD_VFX_CLIP.food: return 12;
    // These cards are currently used by the world renderer's persistent lanes,
    // but retain finite fallback lives if a future event route needs them.
    case WILDGUARD_VFX_CLIP.xpOrbit: return 12;
    case WILDGUARD_VFX_CLIP.xpCollect: return 8;
    case WILDGUARD_VFX_CLIP.hostileThorn: return 12;
    case WILDGUARD_VFX_CLIP.masterXp: return 12;
  }
}

function priorityForClip(clip: WildguardVfxClip): number {
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
    case WILDGUARD_VFX_CLIP.earthWave:
    case WILDGUARD_VFX_CLIP.spitComet:
      return 4;
    case WILDGUARD_VFX_CLIP.fluffyShield:
    case WILDGUARD_VFX_CLIP.shieldRecharge:
    case WILDGUARD_VFX_CLIP.criticalImpact:
    case WILDGUARD_VFX_CLIP.playerImpact:
    case WILDGUARD_VFX_CLIP.bomb:
    case WILDGUARD_VFX_CLIP.magnet:
    case WILDGUARD_VFX_CLIP.food:
      return 3;
    case WILDGUARD_VFX_CLIP.normalImpact:
      return 1;
    default:
      return 2;
  }
}

function radiusForTrait(event: TraitPresentationEventView, clip: WildguardVfxClip): number {
  const authoredRadius = positive(event.range, positive(event.radius, 0));
  switch (clip) {
    case WILDGUARD_VFX_CLIP.foxSwipe:
      return clamp(positive(authoredRadius, 46), 24, 96);
    case WILDGUARD_VFX_CLIP.earthWave:
      return clamp(positive(authoredRadius, 28), 18, 62);
    case WILDGUARD_VFX_CLIP.spitComet:
      return clamp(positive(authoredRadius, 20), 16, 42);
    case WILDGUARD_VFX_CLIP.fluffyShield:
      return clamp(16 + Math.sqrt(Math.max(0, finite(event.strength, 1))) * 3.6, 20, 38);
    case WILDGUARD_VFX_CLIP.shieldRecharge:
      return clamp(12 + Math.sqrt(Math.max(0, finite(event.strength, 1))) * 2.4, 16, 30);
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

function seededAngleDegrees(seed: number): number {
  const folded = Math.abs(Math.imul(Math.floor(seed), 0x45d9f3b)) % 360;
  return folded;
}

function resetSlot(slot: IllustratedVfxSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
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
    // Individual cards can travel beyond the source command's initial point;
    // culling them against an old aggregate bound causes distracting pop-in.
    meshInstance.cull = false;
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    slots.push({
      entity,
      meshInstance,
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
    });
  }

  let disposed = false;
  let liveSlots = 0;
  let highWaterSlots = 0;
  let lastTick = -1;

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
  ): void {
    const tick = normalizedTick(eventTick);
    const lifetime = lifetimeForClip(clip);
    if (tick + lifetime <= currentTick) return;
    const priority = priorityForClip(clip);
    const slot = selectSlot(priority);
    if (slot === null) return;
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
  }

  function startTraitEvents(events: readonly TraitPresentationEventView[], currentTick: number): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      const clip = illustratedVfxClipForTraitEvent(event);
      if (clip === null) continue;
      start(
        clip,
        event.tick,
        event.originX,
        event.originY,
        event.dirX,
        event.dirY,
        radiusForTrait(event, clip),
        event.tick * 31 + index * 17,
        currentTick,
        event.facing,
      );
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
    if (currentTick >= slot.expiresAtTick) {
      resetSlot(slot);
      return false;
    }
    const duration = Math.max(1, slot.expiresAtTick - slot.tick);
    const progress = clamp((currentTick - slot.tick) / duration, 0, 1);
    const pulse = Math.sin(progress * Math.PI);
    let x = slot.x;
    let y = slot.y;
    let scaleX = slot.radius;
    let scaleZ = slot.radius;
    let yaw = slot.yawDegrees;
    let height = HEIGHT;
    let opacity = 0.96 * (1 - progress * 0.74);

    switch (slot.clip) {
      case WILDGUARD_VFX_CLIP.foxSwipe: {
        const travel = slot.radius * (0.12 + progress * 0.25);
        x += slot.dirX * travel;
        y += slot.dirY * travel;
        scaleX = slot.radius * (0.8 + pulse * 0.24);
        scaleZ = slot.radius * (0.8 + pulse * 0.24);
        height += 0.18;
        break;
      }
      case WILDGUARD_VFX_CLIP.earthWave: {
        const travel = slot.radius * progress * 0.52;
        x += slot.dirX * travel;
        y += slot.dirY * travel;
        scaleX = slot.radius * (1.55 + pulse * 0.4);
        scaleZ = slot.radius * (0.9 + pulse * 0.18);
        height += 0.12;
        break;
      }
      case WILDGUARD_VFX_CLIP.spitComet: {
        const travel = slot.radius * (0.16 + progress * 1.05);
        x += slot.dirX * travel;
        y += slot.dirY * travel;
        scaleX = slot.radius * (1.15 + progress * 0.3);
        scaleZ = slot.radius * (0.72 + pulse * 0.16);
        height += 0.16;
        break;
      }
      case WILDGUARD_VFX_CLIP.fluffyShield:
        scaleX = slot.radius * (0.9 + pulse * 0.16);
        scaleZ = slot.radius * (0.9 + pulse * 0.16);
        height += 0.24;
        opacity = 0.9 * (1 - progress * 0.44);
        break;
      case WILDGUARD_VFX_CLIP.shieldRecharge:
        scaleX = slot.radius * (0.76 + pulse * 0.42);
        scaleZ = scaleX;
        height += 0.28 + progress * 0.12;
        opacity = 0.92 * (1 - progress * 0.54);
        break;
      case WILDGUARD_VFX_CLIP.criticalImpact:
        scaleX = slot.radius * (0.62 + pulse * 0.56);
        scaleZ = scaleX;
        yaw += seededAngleDegrees(slot.seed) + progress * 42;
        height += 0.18;
        break;
      case WILDGUARD_VFX_CLIP.playerImpact:
        scaleX = slot.radius * (0.72 + pulse * 0.42);
        scaleZ = scaleX;
        yaw += seededAngleDegrees(slot.seed) - progress * 32;
        height += 0.26;
        break;
      case WILDGUARD_VFX_CLIP.normalImpact:
        scaleX = slot.radius * (0.6 + pulse * 0.42);
        scaleZ = scaleX;
        yaw += seededAngleDegrees(slot.seed) + progress * 26;
        height += 0.12;
        break;
      case WILDGUARD_VFX_CLIP.bomb:
        scaleX = slot.radius * (0.62 + pulse * 0.48);
        scaleZ = scaleX;
        yaw += progress * 32;
        height += 0.24;
        break;
      case WILDGUARD_VFX_CLIP.magnet:
        scaleX = slot.radius * (0.76 + pulse * 0.24);
        scaleZ = scaleX;
        yaw -= progress * 70;
        height += 0.22;
        break;
      case WILDGUARD_VFX_CLIP.food:
        scaleX = slot.radius * (0.68 + pulse * 0.32);
        scaleZ = scaleX;
        height += 0.3 + progress * 0.18;
        opacity = 0.92 * (1 - progress * 0.46);
        break;
      default:
        scaleX = slot.radius * (0.74 + pulse * 0.28);
        scaleZ = scaleX;
        break;
    }

    slot.meshInstance.material = materialBank.materialFor(slot.clip, Math.max(0, currentTick - slot.tick));
    slot.meshInstance.setParameter('material_opacity', clamp(opacity, 0, 1));
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
    update(currentTick, traitEvents, combatEvents): void {
      if (disposed) return;
      const tick = normalizedTick(currentTick);
      // A replay seek or fresh run that moves backwards cannot retain an art
      // card with a future start tick. The presentation remains stateless with
      // respect to gameplay after this renderer-owned reset.
      if (lastTick >= 0 && tick < lastTick) {
        for (const slot of slots) resetSlot(slot);
      }
      startTraitEvents(traitEvents, tick);
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
