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
  /**
   * Angular width in radians for an authoritative melee sweep. Optional while
   * older command producers are still structurally compatible.
   */
  readonly arc?: number;
  readonly facing: number;
  readonly spread: number;
  readonly range: number;
  /**
   * True only after the authoritative executor acquired and resolved a real
   * melee target. This must not be inferred from authored fallback direction.
   */
  readonly meleeArcResolved?: boolean;
  /**
   * Authoritative chain-lightning impact endpoints. They are optional so this
   * renderer remains compatible with older command producers, but a
   * `chainDamage` effect never renders until it has at least one resolved hit.
   */
  readonly resolvedHitCount?: number;
  readonly resolvedHitX?: Float32Array;
  readonly resolvedHitY?: Float32Array;
  /** Present when the producer has access to the full trait-runtime command. */
  readonly tag?: string;
  /** Present when the producer has access to the full trait-runtime command. */
  readonly durationTicks?: number;
}

export type TraitCommandEffectKind =
  | 'telegraph'
  | 'directed-burst'
  | 'radial-burst'
  | 'orbiting-damage'
  | 'gather'
  | 'knockback'
  | 'area-damage'
  | 'melee-arc'
  | 'zone-spawn'
  | 'trait-cue'
  | 'chain-lightning';

type EffectMotion = 'expand' | 'contract' | 'pulse';
type EffectMaterial = Exclude<TraitCommandEffectKind, 'zone-spawn'>
  | 'thornstorm-telegraph'
  | 'thunderbug-telegraph'
  | 'gecko-zone-spawn'
  | 'razorstep-zone-spawn';

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
  'thunderbug-telegraph': {
    kind: 'telegraph', material: 'thunderbug-telegraph', motion: 'pulse', lifetimeTicks: 18,
    fallbackRadius: 150, minimumRadius: 24, maximumRadius: 280, directed: false,
  },
  'directed-burst': {
    kind: 'directed-burst', material: 'directed-burst', motion: 'expand', lifetimeTicks: 9,
    fallbackRadius: 34, minimumRadius: 10, maximumRadius: 100, directed: true,
  },
  'radial-burst': {
    kind: 'radial-burst', material: 'radial-burst', motion: 'expand', lifetimeTicks: 14,
    fallbackRadius: 62, minimumRadius: 16, maximumRadius: 180, directed: false,
  },
  'orbiting-damage': {
    kind: 'orbiting-damage', material: 'orbiting-damage', motion: 'pulse', lifetimeTicks: 30,
    fallbackRadius: 50, minimumRadius: 20, maximumRadius: 120, directed: false,
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
  'melee-arc': {
    kind: 'melee-arc', material: 'melee-arc', motion: 'expand', lifetimeTicks: 8,
    fallbackRadius: 68, minimumRadius: 20, maximumRadius: 150, directed: true,
  },
  'gecko-zone-spawn': {
    kind: 'zone-spawn', material: 'gecko-zone-spawn', motion: 'pulse', lifetimeTicks: 18,
    fallbackRadius: 38, minimumRadius: 14, maximumRadius: 160, directed: false,
  },
  'razorstep-zone-spawn': {
    kind: 'zone-spawn', material: 'razorstep-zone-spawn', motion: 'pulse', lifetimeTicks: 20,
    fallbackRadius: 58, minimumRadius: 16, maximumRadius: 180, directed: false,
  },
  'trait-cue': {
    kind: 'trait-cue', material: 'trait-cue', motion: 'pulse', lifetimeTicks: 12,
    fallbackRadius: 28, minimumRadius: 10, maximumRadius: 90, directed: false,
  },
  'chain-lightning': {
    kind: 'chain-lightning', material: 'chain-lightning', motion: 'pulse', lifetimeTicks: 8,
    fallbackRadius: 36, minimumRadius: 12, maximumRadius: 120, directed: false,
  },
});

const COLORS: Readonly<Record<EffectMaterial, pc.Color>> = Object.freeze({
  telegraph: new pc.Color(0.72, 0.28, 1),
  'thornstorm-telegraph': new pc.Color(0.98, 0.2, 0.72),
  'thunderbug-telegraph': new pc.Color(0.3, 0.66, 1),
  'directed-burst': new pc.Color(1, 0.8, 0.16),
  'radial-burst': new pc.Color(0.92, 0.48, 1),
  'orbiting-damage': new pc.Color(0.42, 1, 0.3),
  gather: new pc.Color(0.18, 0.85, 1),
  knockback: new pc.Color(1, 0.3, 0.12),
  'area-damage': new pc.Color(1, 0.16, 0.26),
  // Mantis needs a strong, unmistakable identity apart from red area pulses
  // and gold projectile bursts: a high-contrast leaf-green scythe sweep.
  'melee-arc': new pc.Color(0.72, 1, 0.3),
  'gecko-zone-spawn': new pc.Color(0.28, 1, 0.62),
  'razorstep-zone-spawn': new pc.Color(0.84, 1, 0.4),
  'trait-cue': new pc.Color(0.34, 1, 0.58),
  'chain-lightning': new pc.Color(0.76, 1, 1),
});

const OPACITY: Readonly<Record<EffectMaterial, number>> = Object.freeze({
  telegraph: 0.28,
  'thornstorm-telegraph': 0.34,
  'thunderbug-telegraph': 0.34,
  'directed-burst': 0.72,
  'radial-burst': 0.62,
  'orbiting-damage': 0.9,
  gather: 0.42,
  knockback: 0.5,
  'area-damage': 0.66,
  'melee-arc': 0.9,
  'gecko-zone-spawn': 0.58,
  'razorstep-zone-spawn': 0.66,
  'trait-cue': 0.55,
  'chain-lightning': 0.9,
});

// The geometry's outer radius is deliberately accounted for when applying a
// command radius below. This keeps an authored radius as the visible outside
// edge of the hollow pulse, rather than the torus centreline.
const RING_RADIUS = 0.5;
const RING_TUBE_RADIUS = 0.025;
const RING_OUTER_RADIUS = RING_RADIUS + RING_TUBE_RADIUS;
const RING_SEGMENTS = 48;
const RING_SIDES = 8;
const CHAIN_LIGHTNING_LIFETIME_TICKS = 8;
const CHAIN_LIGHTNING_THICKNESS = 1.7;
const CHAIN_LIGHTNING_HEIGHT = 1.05;

/**
 * These exactly mirror the authored Bud/Adapted Mantis widths. They are not a
 * generic arc quantizer: other valid combat arcs deliberately use the fixed
 * directional-slash fallback below, so a future weapon is never silently
 * shown as one of Mantis's narrower/wider hit sectors.
 */
const MELEE_ARC_VARIANTS = Object.freeze([
  Object.freeze({ arcRadians: 1.2, sectorAngleDegrees: 68.75 }),
  Object.freeze({ arcRadians: 1.6, sectorAngleDegrees: 91.67 }),
] as const);
const MELEE_ARC_VARIANT_TOLERANCE = 0.025;
const MELEE_ARC_TUBE_RADIUS = 0.04;
const MELEE_ARC_OUTER_RADIUS = RING_RADIUS + MELEE_ARC_TUBE_RADIUS;
const MELEE_ARC_HEIGHT = 1.18;
const MELEE_ARC_SEGMENTS = 18;
const MELEE_ARC_SIDES = 6;
const FIREFLY_ORBIT_HEIGHT = 2.35;
const FIREFLY_ORBIT_SIZE = 1.7;
const FIREFLY_ORBIT_MAX_COUNT = 16;
const GENERIC_MELEE_SLASH_HEIGHT = 1.22;
const GENERIC_MELEE_SLASH_THICKNESS = 0.22;

/**
 * Each complete current chain needs at most eight segments (Greg → first hit,
 * then seven hops). The pool scales to that requirement for small custom
 * capacities and remains globally capped so visual stress stays bounded.
 */
export const DEFAULT_CHAIN_LIGHTNING_SEGMENT_CAPACITY = 96;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolvedChainHitCount(event: TraitCommandPresentationEvent): number {
  const count = Math.floor(finiteOr(event.resolvedHitCount ?? 0, 0));
  const hitX = event.resolvedHitX;
  const hitY = event.resolvedHitY;
  if (count <= 0 || hitX === undefined || hitY === undefined) return 0;
  return Math.min(count, hitX.length, hitY.length);
}

/**
 * A `meleeArc` is only shown after the authoritative executor has resolved a
 * real target. A non-zero direction alone is not proof: a targetless command
 * can retain authored/fallback direction and must never create a false slash.
 */
export function hasResolvedMeleeArc(event: TraitCommandPresentationEvent): boolean {
  return event.kind === 'meleeArc' && event.meleeArcResolved === true;
}

/** Returns a stable visual profile for the supported simulation command kinds. */
export function projectTraitCommandEffect(event: TraitCommandPresentationEvent): TraitCommandEffectProfile | null {
  switch (event.kind) {
    case 'telegraph':
      return event.tag === 'thornstorm-inhale'
        ? PROFILES['thornstorm-telegraph']
        : event.tag === 'thunderbug-charge'
          ? PROFILES['thunderbug-telegraph']
          : PROFILES.telegraph;
    case 'spawnProjectileBurst': return PROFILES['directed-burst'];
    case 'radialProjectileBurst': return PROFILES['radial-burst'];
    case 'orbitingDamage': return PROFILES['orbiting-damage'];
    case 'areaGather': return PROFILES.gather;
    case 'areaKnockback': return PROFILES.knockback;
    case 'applyAreaDamage': return PROFILES['area-damage'];
    case 'meleeArc': return hasResolvedMeleeArc(event) ? PROFILES['melee-arc'] : null;
    case 'spawnZone':
      return event.tag === 'razorstep-scythe-pad'
        ? PROFILES['razorstep-zone-spawn']
        : PROFILES['gecko-zone-spawn'];
    case 'playTraitCue': return PROFILES['trait-cue'];
    case 'chainDamage':
      return resolvedChainHitCount(event) > 0 ? PROFILES['chain-lightning'] : null;
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
  // Mantis uses `range` as its authoritative wedge reach. Do not accidentally
  // render its unused generic `radius` field as a full-radius hit area.
  let radius = profile.kind === 'melee-arc' ? event.range : event.radius;
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

/**
 * Resolve an exact Mantis sector only. `null` intentionally selects the
 * generic directional-slash geometry for another valid melee arc, avoiding a
 * misleading nearest-sector substitution.
 */
export function resolveMeleeArcVariantIndex(arc: number | undefined): number | null {
  if (!(Number.isFinite(arc) && arc! > 0)) return null;
  const requested = arc!;
  let winner = 0;
  let bestDelta = Math.abs(requested - MELEE_ARC_VARIANTS[0]!.arcRadians);
  for (let index = 1; index < MELEE_ARC_VARIANTS.length; index++) {
    const delta = Math.abs(requested - MELEE_ARC_VARIANTS[index]!.arcRadians);
    if (delta < bestDelta) {
      winner = index;
      bestDelta = delta;
    }
  }
  return bestDelta <= MELEE_ARC_VARIANT_TOLERANCE ? winner : null;
}

/**
 * Torus sectors begin on local +X. The normal directed-effect yaw points local
 * +Z at the resolved enemy, so offset it until the sector's middle points at
 * that same target rather than one of its open ends.
 */
function resolveMeleeArcYawDegrees(
  event: TraitCommandPresentationEvent,
  sectorAngleDegrees: number,
): number {
  return resolveYawDegrees(event) + sectorAngleDegrees * 0.5 - 90;
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
  readonly meshInstance: pc.MeshInstance;
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

interface ChainLightningSegmentSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface MeleeArcSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  radius: number;
  yawDegrees: number;
}

/**
 * A generic forward blade streak is deliberately not a sector/hitbox preview.
 * It is the safe bounded fallback for arbitrary valid `meleeArc` widths.
 */
interface GenericMeleeSlashSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  radius: number;
  yawDegrees: number;
}

interface OrbitingDamageSlot {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  active: boolean;
  tick: number;
  expiresAtTick: number;
  originX: number;
  originY: number;
  count: number;
  index: number;
  radius: number;
  speed: number;
  facing: number;
}

function resetSlot(slot: EffectSlot): void {
  slot.active = false;
  slot.profile = null;
  slot.entity.enabled = false;
}

function resetChainLightningSlot(slot: ChainLightningSegmentSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
}

function resetMeleeArcSlot(slot: MeleeArcSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
}

function resetGenericMeleeSlashSlot(slot: GenericMeleeSlashSlot): void {
  slot.active = false;
  slot.entity.enabled = false;
}

function resetOrbitingDamageSlot(slot: OrbitingDamageSlot): void {
  slot.active = false;
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
  device: pc.GraphicsDevice,
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
  // A single narrow torus mesh is shared by every ordinary pulse slot.
  // Materials and transforms remain per-slot, preserving fixed-pool ownership.
  const ringMesh = pc.Mesh.fromGeometry(device, new pc.TorusGeometry({
    ringRadius: RING_RADIUS,
    tubeRadius: RING_TUBE_RADIUS,
    segments: RING_SEGMENTS,
    sides: RING_SIDES,
  }));
  // Mantis uses separate, prebuilt sector meshes. This avoids a full ring
  // falsely communicating 360-degree damage, without constructing geometry
  // or entities when an attack fires.
  const meleeArcMeshes: pc.Mesh[] = MELEE_ARC_VARIANTS.map((variant) => pc.Mesh.fromGeometry(
    device,
    new pc.TorusGeometry({
      ringRadius: RING_RADIUS,
      tubeRadius: MELEE_ARC_TUBE_RADIUS,
      sectorAngle: variant.sectorAngleDegrees,
      segments: MELEE_ARC_SEGMENTS,
      sides: MELEE_ARC_SIDES,
    }),
  ));
  // This narrow forward slash is intentionally generic: future valid arc
  // widths fall back here instead of being misrepresented by Mantis's two
  // authored sector meshes. It is an attack cue, not a fake coverage preview.
  const genericMeleeSlashMesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry({
    halfExtents: new pc.Vec3(0.5, 0.5, 0.5),
  }));
  // A low, narrow box gives each resolved hit-to-hit segment a crisp, bright
  // cyan-white read from the top-down camera. Every segment shares this one
  // mesh and material; only transforms are per-slot.
  const chainLightningMesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry({
    halfExtents: new pc.Vec3(0.5, 0.5, 0.5),
  }));
  // Fireflies stay above the ground plane so their orbit reads as a defensive
  // ring of companions instead of another radial projectile burst.
  const orbitingDamageMesh = pc.Mesh.fromGeometry(device, new pc.SphereGeometry({
    radius: 0.5,
    latitudeBands: 8,
    longitudeBands: 8,
  }));

  const slots: EffectSlot[] = [];
  for (let index = 0; index < capacity; index++) {
    const entity = new pc.Entity(`trait-command-effect-${index}`);
    const meshInstance = new pc.MeshInstance(ringMesh, materials.get('telegraph')!);
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    slots.push({
      entity, meshInstance, active: false, profile: null, material: 'telegraph', tick: 0, expiresAtTick: 0,
      x: 0, y: 0, radius: 0, aspect: 1, yawDegrees: 0,
    });
  }

  const meleeArcSlotsPerVariant = Math.max(2, Math.min(8, Math.ceil(capacity / 4)));
  const meleeArcSlots: MeleeArcSlot[][] = MELEE_ARC_VARIANTS.map(() => []);
  for (let variantIndex = 0; variantIndex < MELEE_ARC_VARIANTS.length; variantIndex++) {
    const variantSlots = meleeArcSlots[variantIndex]!;
    for (let index = 0; index < meleeArcSlotsPerVariant; index++) {
      const entity = new pc.Entity(`mantis-scythe-arc-${variantIndex}-${index}`);
      const meshInstance = new pc.MeshInstance(meleeArcMeshes[variantIndex]!, materials.get('melee-arc')!);
      entity.addComponent('render', {
        meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
      });
      entity.enabled = false;
      parent.addChild(entity);
      variantSlots.push({
        entity, meshInstance, active: false, tick: 0, expiresAtTick: 0,
        x: 0, y: 0, radius: 0, yawDegrees: 0,
      });
    }
  }
  const genericMeleeSlashSlots: GenericMeleeSlashSlot[] = [];
  for (let index = 0; index < meleeArcSlotsPerVariant; index++) {
    const entity = new pc.Entity(`generic-melee-slash-${index}`);
    const meshInstance = new pc.MeshInstance(genericMeleeSlashMesh, materials.get('melee-arc')!);
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    genericMeleeSlashSlots.push({
      entity, meshInstance, active: false, tick: 0, expiresAtTick: 0,
      x: 0, y: 0, dirX: 1, dirY: 0, radius: 0, yawDegrees: 0,
    });
  }

  const orbitingDamageSlots: OrbitingDamageSlot[] = [];
  const orbitingDamageCapacity = Math.max(4, Math.min(FIREFLY_ORBIT_MAX_COUNT, capacity));
  for (let index = 0; index < orbitingDamageCapacity; index++) {
    const entity = new pc.Entity(`firefly-orbit-${index}`);
    const meshInstance = new pc.MeshInstance(orbitingDamageMesh, materials.get('orbiting-damage')!);
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    orbitingDamageSlots.push({
      entity, meshInstance, active: false, tick: 0, expiresAtTick: 0,
      originX: 0, originY: 0, count: 1, index: 0, radius: 0, speed: 0, facing: 0,
    });
  }

  const chainSegmentCapacity = Math.min(
    DEFAULT_CHAIN_LIGHTNING_SEGMENT_CAPACITY,
    Math.max(8, capacity * 8),
  );
  const chainLightningSlots: ChainLightningSegmentSlot[] = [];
  for (let index = 0; index < chainSegmentCapacity; index++) {
    const entity = new pc.Entity(`chain-lightning-segment-${index}`);
    const meshInstance = new pc.MeshInstance(chainLightningMesh, materials.get('chain-lightning')!);
    entity.addComponent('render', {
      meshInstances: [meshInstance], castShadows: false, receiveShadows: false,
    });
    entity.enabled = false;
    parent.addChild(entity);
    chainLightningSlots.push({
      entity, meshInstance, active: false, tick: 0, expiresAtTick: 0,
      fromX: 0, fromY: 0, toX: 0, toY: 0,
    });
  }

  let overflowCount = 0;
  let lastTick = -1;

  function reset(): void {
    for (const slot of slots) resetSlot(slot);
    for (const variantSlots of meleeArcSlots) {
      for (const slot of variantSlots) resetMeleeArcSlot(slot);
    }
    for (const slot of genericMeleeSlashSlots) resetGenericMeleeSlashSlot(slot);
    for (const slot of orbitingDamageSlots) resetOrbitingDamageSlot(slot);
    for (const slot of chainLightningSlots) resetChainLightningSlot(slot);
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
    // Scale by the torus's outer radius so `radius` stays the authored outer
    // visual radius, not the centreline radius of the tube.
    const radialScale = radius / RING_OUTER_RADIUS;
    slot.meshInstance.material = materials.get(slot.material)!;
    slot.entity.setLocalPosition(slot.x - worldHalfWidth, thickness * 0.5 + 0.1, worldHalfHeight - slot.y);
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees, 0);
    slot.entity.setLocalScale(
      radialScale * slot.aspect,
      thickness / (RING_TUBE_RADIUS * 2),
      radialScale,
    );
    slot.entity.enabled = true;
  }

  function updateMeleeArcSlot(slot: MeleeArcSlot, tick: number): void {
    if (!slot.active) return;
    if (tick >= slot.expiresAtTick) {
      resetMeleeArcSlot(slot);
      return;
    }
    const progress = clamp((tick - slot.tick) / (slot.expiresAtTick - slot.tick), 0, 1);
    // A quick outward sweep reads like a claw cut rather than a stationary
    // defensive aura. The authoritative damage itself remains instantaneous.
    const radius = Math.max(1, slot.radius * (0.32 + progress * 0.68));
    const thickness = Math.max(0.8, radius * 0.032 * (1 - progress * 0.28));
    const radialScale = radius / MELEE_ARC_OUTER_RADIUS;
    slot.meshInstance.material = materials.get('melee-arc')!;
    slot.entity.setLocalPosition(
      slot.x - worldHalfWidth,
      MELEE_ARC_HEIGHT + thickness * 0.5,
      worldHalfHeight - slot.y,
    );
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees, 0);
    slot.entity.setLocalScale(
      radialScale,
      thickness / (MELEE_ARC_TUBE_RADIUS * 2),
      radialScale,
    );
    slot.entity.enabled = true;
  }

  function updateGenericMeleeSlashSlot(slot: GenericMeleeSlashSlot, tick: number): void {
    if (!slot.active) return;
    if (tick >= slot.expiresAtTick) {
      resetGenericMeleeSlashSlot(slot);
      return;
    }
    const progress = clamp((tick - slot.tick) / (slot.expiresAtTick - slot.tick), 0, 1);
    const length = Math.max(2, slot.radius * (0.26 + progress * 0.62));
    const width = Math.max(1.1, slot.radius * 0.03 * (1 - progress * 0.25));
    // Position the streak forward from Greg. Unlike a sector mesh it claims
    // no exact angular coverage, which keeps arbitrary future arc values
    // visually honest while preserving a readable directional attack cue.
    const centerX = slot.x + slot.dirX * length * 0.42;
    const centerY = slot.y + slot.dirY * length * 0.42;
    slot.meshInstance.material = materials.get('melee-arc')!;
    slot.entity.setLocalPosition(
      centerX - worldHalfWidth,
      GENERIC_MELEE_SLASH_HEIGHT,
      worldHalfHeight - centerY,
    );
    slot.entity.setLocalEulerAngles(0, slot.yawDegrees, 0);
    slot.entity.setLocalScale(width, GENERIC_MELEE_SLASH_THICKNESS, length);
    slot.entity.enabled = true;
  }

  function updateOrbitingDamageSlot(slot: OrbitingDamageSlot, tick: number): void {
    if (!slot.active) return;
    if (tick >= slot.expiresAtTick) {
      resetOrbitingDamageSlot(slot);
      return;
    }
    const progress = clamp((tick - slot.tick) / (slot.expiresAtTick - slot.tick), 0, 1);
    const angle = slot.facing
      + (slot.speed % (Math.PI * 2)) * (tick % 1_000_000)
      + Math.PI * 2 * slot.index / slot.count;
    const x = slot.originX + Math.cos(angle) * slot.radius;
    const y = slot.originY + Math.sin(angle) * slot.radius;
    const scale = FIREFLY_ORBIT_SIZE * (0.86 + Math.sin(progress * Math.PI) * 0.18);
    slot.meshInstance.material = materials.get('orbiting-damage')!;
    slot.entity.setLocalPosition(
      x - worldHalfWidth,
      FIREFLY_ORBIT_HEIGHT + Math.sin(progress * Math.PI * 2) * 0.12,
      worldHalfHeight - y,
    );
    slot.entity.setLocalScale(scale, scale, scale);
    slot.entity.enabled = true;
  }

  function updateChainLightningSlot(slot: ChainLightningSegmentSlot, tick: number): void {
    if (!slot.active) return;
    if (tick >= slot.expiresAtTick) {
      resetChainLightningSlot(slot);
      return;
    }
    const dx = slot.toX - slot.fromX;
    const dy = slot.toY - slot.fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!(length > 0.001)) {
      resetChainLightningSlot(slot);
      return;
    }
    const progress = clamp((tick - slot.tick) / (slot.expiresAtTick - slot.tick), 0, 1);
    const thickness = Math.max(0.7, CHAIN_LIGHTNING_THICKNESS * (1 - progress * 0.38));
    const midpointX = (slot.fromX + slot.toX) * 0.5;
    const midpointY = (slot.fromY + slot.toY) * 0.5;
    // Scene +Z is simulation -Y; local +Z is the elongated box axis.
    const yawDegrees = Math.atan2(dx, -dy) * 180 / Math.PI;
    slot.meshInstance.material = materials.get('chain-lightning')!;
    slot.entity.setLocalPosition(
      midpointX - worldHalfWidth,
      CHAIN_LIGHTNING_HEIGHT,
      worldHalfHeight - midpointY,
    );
    slot.entity.setLocalEulerAngles(0, yawDegrees, 0);
    slot.entity.setLocalScale(thickness, 0.22, length);
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

  function startMeleeArc(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
  ): void {
    if (!hasResolvedMeleeArc(event)) return;
    const emittedTick = normalizedTick(event.tick);
    const lifetimeTicks = resolveLifetime(event, profile);
    if (emittedTick + lifetimeTicks <= currentTick) return;
    const variantIndex = resolveMeleeArcVariantIndex(event.arc);
    if (variantIndex === null) {
      startGenericMeleeSlash(event, profile, emittedTick, lifetimeTicks);
      return;
    }
    const slot = meleeArcSlots[variantIndex]!.find((candidate) => !candidate.active);
    if (slot === undefined) {
      overflowCount++;
      return;
    }
    const variant = MELEE_ARC_VARIANTS[variantIndex]!;
    slot.active = true;
    slot.tick = emittedTick;
    slot.expiresAtTick = emittedTick + lifetimeTicks;
    slot.x = finiteOr(event.originX, 0);
    slot.y = finiteOr(event.originY, 0);
    slot.radius = resolveTraitCommandEffectRadius(event, profile);
    slot.yawDegrees = resolveMeleeArcYawDegrees(event, variant.sectorAngleDegrees);
  }

  function startGenericMeleeSlash(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    emittedTick: number,
    lifetimeTicks: number,
  ): void {
    const slot = genericMeleeSlashSlots.find((candidate) => !candidate.active);
    if (slot === undefined) {
      overflowCount++;
      return;
    }
    const rawDirX = finiteOr(event.dirX, 0);
    const rawDirY = finiteOr(event.dirY, 0);
    const length = Math.sqrt(rawDirX * rawDirX + rawDirY * rawDirY);
    slot.active = true;
    slot.tick = emittedTick;
    slot.expiresAtTick = emittedTick + lifetimeTicks;
    slot.x = finiteOr(event.originX, 0);
    slot.y = finiteOr(event.originY, 0);
    slot.dirX = length > 1e-8 ? rawDirX / length : 1;
    slot.dirY = length > 1e-8 ? rawDirY / length : 0;
    slot.radius = resolveTraitCommandEffectRadius(event, profile);
    slot.yawDegrees = resolveYawDegrees(event);
  }

  function startOrbitingDamage(
    event: TraitCommandPresentationEvent,
    profile: TraitCommandEffectProfile,
    currentTick: number,
  ): void {
    const emittedTick = normalizedTick(event.tick);
    const lifetimeTicks = resolveLifetime(event, profile);
    if (emittedTick + lifetimeTicks <= currentTick) return;
    const count = Math.max(1, Math.min(
      FIREFLY_ORBIT_MAX_COUNT,
      Math.floor(finiteOr(event.count, 1)),
    ));
    let free = 0;
    for (const slot of orbitingDamageSlots) {
      if (!slot.active) free++;
    }
    if (free < count) {
      overflowCount++;
      return;
    }
    let assigned = 0;
    for (const slot of orbitingDamageSlots) {
      if (slot.active) continue;
      slot.active = true;
      slot.tick = emittedTick;
      slot.expiresAtTick = emittedTick + lifetimeTicks;
      slot.originX = finiteOr(event.originX, 0);
      slot.originY = finiteOr(event.originY, 0);
      slot.count = count;
      slot.index = assigned++;
      slot.radius = resolveTraitCommandEffectRadius(event, profile);
      slot.speed = finiteOr(event.speed, 0);
      slot.facing = finiteOr(event.facing, 0);
      if (assigned >= count) break;
    }
  }

  function startChainLightning(event: TraitCommandPresentationEvent, currentTick: number): void {
    const hitCount = resolvedChainHitCount(event);
    if (hitCount === 0) return;
    const emittedTick = normalizedTick(event.tick);
    if (emittedTick + CHAIN_LIGHTNING_LIFETIME_TICKS <= currentTick) return;
    const hitX = event.resolvedHitX!;
    const hitY = event.resolvedHitY!;
    let fromX = finiteOr(event.originX, 0);
    let fromY = finiteOr(event.originY, 0);
    for (let index = 0; index < hitCount; index++) {
      const toX = hitX[index]!;
      const toY = hitY[index]!;
      if (!(Number.isFinite(toX) && Number.isFinite(toY))) break;
      const dx = toX - fromX;
      const dy = toY - fromY;
      if (dx * dx + dy * dy <= 1e-6) {
        fromX = toX;
        fromY = toY;
        continue;
      }
      const slot = chainLightningSlots.find((candidate) => !candidate.active);
      if (slot === undefined) {
        overflowCount++;
        break;
      }
      slot.active = true;
      slot.tick = emittedTick;
      slot.expiresAtTick = emittedTick + CHAIN_LIGHTNING_LIFETIME_TICKS;
      slot.fromX = fromX;
      slot.fromY = fromY;
      slot.toX = toX;
      slot.toY = toY;
      fromX = toX;
      fromY = toY;
    }
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
      for (const variantSlots of meleeArcSlots) {
        for (const slot of variantSlots) updateMeleeArcSlot(slot, tick);
      }
      for (const slot of genericMeleeSlashSlots) updateGenericMeleeSlashSlot(slot, tick);
      for (const slot of orbitingDamageSlots) updateOrbitingDamageSlot(slot, tick);
      for (const slot of chainLightningSlots) updateChainLightningSlot(slot, tick);
      for (const event of events) {
        const profile = projectTraitCommandEffect(event);
        if (profile === null) continue;
        if (profile.kind === 'chain-lightning') {
          startChainLightning(event, tick);
        } else if (profile.kind === 'melee-arc') {
          startMeleeArc(event, profile, tick);
        } else if (profile.kind === 'orbiting-damage') {
          startOrbitingDamage(event, profile, tick);
        } else {
          start(event, profile, tick);
        }
      }
      // Newly started slots need their first transform in the same render.
      for (const slot of slots) updateSlot(slot, tick);
      for (const variantSlots of meleeArcSlots) {
        for (const slot of variantSlots) updateMeleeArcSlot(slot, tick);
      }
      for (const slot of genericMeleeSlashSlots) updateGenericMeleeSlashSlot(slot, tick);
      for (const slot of orbitingDamageSlots) updateOrbitingDamageSlot(slot, tick);
      for (const slot of chainLightningSlots) updateChainLightningSlot(slot, tick);
      lastTick = tick;
    },
    reset,
    dispose() {
      for (const slot of slots) slot.entity.destroy();
      for (const variantSlots of meleeArcSlots) {
        for (const slot of variantSlots) slot.entity.destroy();
      }
      for (const slot of genericMeleeSlashSlots) slot.entity.destroy();
      for (const slot of orbitingDamageSlots) slot.entity.destroy();
      for (const slot of chainLightningSlots) slot.entity.destroy();
      // Each mesh instance decrements the shared mesh's reference count on
      // entity destruction, so the last one releases each shared GPU mesh.
      for (const material of materials.values()) material.destroy();
    },
  };
}
