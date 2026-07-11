import * as pc from 'playcanvas';

/**
 * Read-only, renderer-facing copy of a trait command.  It intentionally stays
 * structural so the browser layer does not depend on the trait-runtime package
 * (or mutate its reusable command buffer).
 */
export interface TraitCommandPresentationEvent {
  readonly kind: string;
  readonly sourceId: string;
  readonly tick: number;
  readonly targeting: string;
  readonly originX: number;
  readonly originY: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly count: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly strength: number;
  readonly facing: number;
  readonly spread: number;
  readonly range: number;
  /** Present when the producer has access to the full trait-runtime command. */
  readonly tag?: string;
  /** Present when the producer has access to the full trait-runtime command. */
  readonly durationTicks?: number;
}

export type TraitCommandEffectKind =
  | 'telegraph'
  | 'directed-burst'
  | 'radial-burst'
  | 'gather'
  | 'knockback'
  | 'area-damage'
  | 'trait-cue';

type EffectMotion = 'expand' | 'contract' | 'pulse';
type EffectMaterial = TraitCommandEffectKind | 'thornstorm-telegraph';

export interface TraitCommandEffectProfile {
  readonly kind: TraitCommandEffectKind;
  readonly material: EffectMaterial;
  readonly motion: EffectMotion;
  readonly lifetimeTicks: number;
  readonly fallbackRadius: number;
  readonly minimumRadius: number;
  readonly maximumRadius: number;
  readonly directed: boolean;
}

export interface TraitCommandPresentation {
  readonly capacity: number;
  readonly overflowCount: number;
  /**
   * Consume commands newly emitted since the previous render call. Effects
   * remain visible after the input stream is empty, until their tick lifetime
   * expires. `currentTick` comes from the rendered simulation snapshot.
   */
  update(currentTick: number, events: readonly TraitCommandPresentationEvent[]): void;
  /** Clear all renderer-only effects, useful for an explicit run restart. */
  reset(): void;
  dispose(): void;
}

export const DEFAULT_TRAIT_COMMAND_PRESENTATION_CAPACITY = 32;

const PROFILES: Readonly<Record<EffectMaterial, TraitCommandEffectProfile>> = Object.freeze({
  telegraph: {
    kind: 'telegraph', material: 'telegraph', motion: 'pulse', lifetimeTicks: 22,
    fallbackRadius: 88, minimumRadius: 18, maximumRadius: 240, directed: false,
  },
  'thornstorm-telegraph': {
    kind: 'telegraph', material: 'thornstorm-telegraph', motion: 'pulse', lifetimeTicks: 26,
    fallbackRadius: 140, minimumRadius: 24, maximumRadius: 280, directed: false,
  },
  'directed-burst': {
    kind: 'directed-burst', material: 'directed-burst', motion: 'expand', lifetimeTicks: 9,
    fallbackRadius: 34, minimumRadius: 10, maximumRadius: 100, directed: true,
  },
  'radial-burst': {
    kind: 'radial-burst', material: 'radial-burst', motion: 'expand', lifetimeTicks: 14,
    fallbackRadius: 62, minimumRadius: 16, maximumRadius: 180, directed: false,
  },
  gather: {
    kind: 'gather', material: 'gather', motion: 'contract', lifetimeTicks: 15,
    fallbackRadius: 80, minimumRadius: 18, maximumRadius: 260, directed: false,
  },
  knockback: {
    kind: 'knockback', material: 'knockback', motion: 'expand', lifetimeTicks: 13,
    fallbackRadius: 90, minimumRadius: 20, maximumRadius: 280, directed: false,
  },
  'area-damage': {
    kind: 'area-damage', material: 'area-damage', motion: 'expand', lifetimeTicks: 10,
    fallbackRadius: 52, minimumRadius: 14, maximumRadius: 220, directed: false,
  },
  'trait-cue': {
    kind: 'trait-cue', material: 'trait-cue', motion: 'pulse', lifetimeTicks: 12,
    fallbackRadius: 28, minimumRadius: 10, maximumRadius: 90, directed: false,
  },
});

const COLORS: Readonly<Record<EffectMaterial, pc.Color>> = Object.freeze({
  telegraph: new pc.Color(0.72, 0.28, 1),
  'thornstorm-telegraph': new pc.Color(0.98, 0.2, 0.72),
  'directed-burst': new pc.Color(1, 0.8, 0.16),
  'radial-burst': new pc.Color(0.92, 0.48, 1),
  gather: new pc.Color(0.18, 0.85, 1),
  knockback: new pc.Color(1, 0.3, 0.12),
  'area-damage': new pc.Color(1, 0.16, 0.26),
  'trait-cue': new pc.Color(0.34, 1, 0.58),
});

const OPACITY: Readonly<Record<EffectMaterial, number>> = Object.freeze({
  telegraph: 0.28,
  'thornstorm-telegraph': 0.34,
  'directed-burst': 0.72,
  'radial-burst': 0.62,
  gather: 0.42,
  knockback: 0.5,
  'area-damage': 0.66,
  'trait-cue': 0.55,
});

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Returns a stable visual profile for the supported simulation command kinds. */
export function projectTraitCommandEffect(event: TraitCommandPresentationEvent): TraitCommandEffectProfile | null {
  switch (event.kind) {
    case 'telegraph':
      return event.tag === 'thornstorm-inhale' ? PROFILES['thornstorm-telegraph'] : PROFILES.telegraph;
    case 'spawnProjectileBurst': return PROFILES['directed-burst'];
    case 'radialProjectileBurst': return PROFILES['radial-burst'];
    case 'areaGather': return PROFILES.gather;
    case 'areaKnockback': return PROFILES.knockback;
    case 'applyAreaDamage': return PROFILES['area-damage'];
    case 'playTraitCue': return PROFILES['trait-cue'];
    default: return null;
  }
}

/**
 * Converts authored command numbers to a bounded renderer radius. It is
 * defensive by design: malformed visual data falls back to a readable pulse
 * instead of making a mesh disappear or exploding a camera-facing primitive.
 */
export function resolveTraitCommandEffectRadius(
  event: TraitCommandPresentationEvent,
  profile: TraitCommandEffectProfile,
): number {
  let radius = event.radius;
  if (!(Number.isFinite(radius) && radius > 0)) {
    switch (profile.kind) {
      case 'directed-burst':
      case 'radial-burst':
        radius = profile.fallbackRadius + Math.max(0, finiteOr(event.count, 0)) * 2.5;
        break;
      case 'trait-cue':
        radius = profile.fallbackRadius + Math.max(0, finiteOr(event.strength, 0)) * 2;
        break;
      default:
        radius = profile.fallbackRadius;
        break;
    }
  }
  return clamp(radius, profile.minimumRadius, profile.maximumRadius);
}

function resolveLifetime(event: TraitCommandPresentationEvent, profile: TraitCommandEffectProfile): number {
  if (profile.kind !== 'telegraph') return profile.lifetimeTicks;
  const requested = positiveOr(event.durationTicks ?? 0, profile.lifetimeTicks);
  return Math.round(clamp(requested, 6, 120));
}

function resolveYawDegrees(event: TraitCommandPresentationEvent): number {
  const dirX = finiteOr(event.dirX, 0);
  const dirY = finiteOr(event.dirY, 0);
  if (dirX * dirX + dirY * dirY > 1e-8) {
    // scene direction is (simX, -simY); local +Z is the elongated axis.
    return Math.atan2(dirX, -dirY) * 180 / Math.PI;
  }
  return (Math.PI / 2 + finiteOr(event.facing, 0)) * 180 / Math.PI;
}

function resolveAspect(event: TraitCommandPresentationEvent, profile: TraitCommandEffectProfile): number {
  if (!profile.directed) return 1;
  const spread = Math.abs(finiteOr(event.spread, 0));
  return clamp(0.42 + spread / Math.PI, 0.42, 1);
}

function createMaterial(role: EffectMaterial): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(COLORS[role]);
  material.opacity = OPACITY[role];
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.update();
  return material;
}

interface EffectSlot {
  readonly entity: pc.Entity;
  active: boolean;
  profile: TraitCommandEffectProfile | null;
  material: EffectMaterial;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  radius: number;
  aspect: number;
  yawDegrees: number;
}

function resetSlot(slot: EffectSlot): void {
  slot.active = false;
  slot.profile = null;
  slot.entity.enabled = false;
}

function normalizedTick(tick: number): number {
  return Math.max(0, Math.floor(finiteOr(tick, 0)));
}

/**
 * Fixed-pool renderer for the trait command stream. Each command becomes a
 * short-lived ground pulse; no command ever feeds back into simulation state.
 * The pool owns all PlayCanvas entities/materials at construction time.
 */
export function createTraitCommandPresentation(
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
  capacity = DEFAULT_TRAIT_COMMAND_PRESENTATION_CAPACITY,
): TraitCommandPresentation {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('trait command presentation capacity must be a positive safe integer');
  }

  const materials = new Map<EffectMaterial, pc.StandardMaterial>();
  for (const role of Object.keys(COLORS) as EffectMaterial[]) materials.set(role, createMaterial(role));

  const slots: EffectSlot[] = [];
  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`trait-command-effect-${index}`);
    entity.addComponent('render', {
      type: 'cylinder', material: materials.get('telegraph')!, castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    slots.push({
      entity, active: false, profile: null, material: 'telegraph', tick: 0, expiresAtTick: 0,
      x: 0, y: 0, radius: 0, aspect: 1, yawDegrees: 0,
    });
  }

  let overflowCount = 0;
  let lastTick = -1;

  function reset(): void {
    for (const slot of slots) resetSlot(slot);
    overflowCount = 0;
    lastTick = -1;
  }

  function updateSlot(slot: EffectSlot, tick: number): void {
    const profile = slot.profile;
    if (!slot.active || profile === null) return;
    if (tick >= slot.expiresAtTick) {
      resetSlot(slot);
      return;
    }

    const progress = clamp((tick - slot.tick) / (slot.expiresAtTick - slot.tick), 0, 1);
    const scale = profile.motion === 'expand'
      ? 0.22 + progress * 0.78
      : profile.motion === 'contract'
        ? 1 - progress * 0.7
        : 0.72 + Math.sin(progress * Math.PI) * 0.22;
    const radius = Math.max(1, slot.radius * scale);
    const thickness = Math.max(0.7, radius * 0.025);
    slot.entity.render!.material = materials.get(slot.material)!;
    slot.entity.setLocalPosition(slot.x - worldHalfWidth, thickness * 0.5 + 0.1, worldHalfHeight - slot.y);
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees, 0);
    slot.entity.setLocalScale(radius * 2 * slot.aspect, thickness, radius * 2);
    slot.entity.enabled = true;
  }

  function start(event: TraitCommandPresentationEvent, profile: TraitCommandEffectProfile, currentTick: number): void {
    const emittedTick = normalizedTick(event.tick);
    const lifetimeTicks = resolveLifetime(event, profile);
    if (emittedTick + lifetimeTicks <= currentTick) return;
    const slot = slots.find((candidate) => !candidate.active);
    if (slot === undefined) {
      overflowCount++;
      return;
    }
    slot.active = true;
    slot.profile = profile;
    slot.material = profile.material;
    slot.tick = emittedTick;
    slot.expiresAtTick = emittedTick + lifetimeTicks;
    slot.x = finiteOr(event.originX, 0);
    slot.y = finiteOr(event.originY, 0);
    slot.radius = resolveTraitCommandEffectRadius(event, profile);
    slot.aspect = resolveAspect(event, profile);
    slot.yawDegrees = resolveYawDegrees(event);
  }

  return {
    capacity,
    get overflowCount() {
      return overflowCount;
    },
    update(currentTick, events) {
      const tick = normalizedTick(currentTick);
      if (tick < lastTick) reset();
      for (const slot of slots) updateSlot(slot, tick);
      for (const event of events) {
        const profile = projectTraitCommandEffect(event);
        if (profile !== null) start(event, profile, tick);
      }
      // Newly started slots need their first transform in the same render.
      for (const slot of slots) updateSlot(slot, tick);
      lastTick = tick;
    },
    reset,
    dispose() {
      for (const slot of slots) slot.entity.destroy();
      for (const material of materials.values()) material.destroy();
    },
  };
}
