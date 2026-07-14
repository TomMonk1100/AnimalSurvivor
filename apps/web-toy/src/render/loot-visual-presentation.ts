/**
 * Read-only loot presentation projection.
 *
 * The simulation owns drops, collection, XP values, and every lifetime. This
 * module only reads the app's previous/current RenderSnapshots and turns them
 * into compact, deterministic visual descriptors for the renderer. It does
 * not import a live pool, does not use wall-clock time, and never allocates in
 * its update path.
 *
 * The output deliberately separates three XP silhouettes and three special
 * pickup languages. That lets the scene keep each material/mesh family in a
 * bounded instanced batch while still making a survivor-style field of drops
 * read at a glance:
 *   - mint diamond motes with warm-gold glints: ordinary XP
 *   - mint crystal gems with stronger gold glints: higher-value XP
 *   - mint star prisms with a bold gold glint: elite/boss XP
 *   - orange charge, blue field ring, green bloom: Bomb/Magnet/Food
 */
import { POWER_PICKUP_KIND, idSlot } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../contracts';

const ENTITY_SLOT_COUNT = 0x1_0000;
const TAU = Math.PI * 2;
const DEFAULT_COLLECTION_CAPACITY = 72;
const XP_GEM_MIN_RADIUS = 5.5;
const XP_PRISM_MIN_RADIUS = 8;
const XP_GEM_MIN_VALUE = 3;
const XP_PRISM_MIN_VALUE = 9;

/** Persistent pickup motion is capped at 0.5Hz for the 60Hz simulation. */
export const PERSISTENT_LOOT_BREATH_PERIOD_TICKS = 120;
export const PERSISTENT_LOOT_MAX_BREATH_HZ = 0.5;
const PERSISTENT_LOOT_BREATH_RADIANS_PER_TICK = TAU / PERSISTENT_LOOT_BREATH_PERIOD_TICKS;

/** Numeric styles are intentionally direct material/mesh routing keys. */
export const LOOT_VISUAL_STYLE = Object.freeze({
  xpMote: 1,
  xpGem: 2,
  xpPrism: 3,
  bomb: 4,
  magnet: 5,
  food: 6,
} as const);

export type LootVisualStyle = (typeof LOOT_VISUAL_STYLE)[keyof typeof LOOT_VISUAL_STYLE];

/** The mesh family that gives each pickup its silhouette, independent of tint. */
export type LootMeshFamily = 'diamond' | 'crystal' | 'star-prism' | 'charge' | 'field-ring' | 'bloom-orb';

/** Collection effects can share a compact pool while keeping their own motion language. */
export type LootCollectionLanguage = 'comet' | 'nova' | 'vortex' | 'bloom';

export interface LootVisualRecipe {
  readonly style: LootVisualStyle;
  readonly mesh: LootMeshFamily;
  readonly collectionLanguage: LootCollectionLanguage;
  /** RGB in linear 0..1 space for the core mesh. */
  readonly coreColor: readonly [number, number, number];
  /** RGB in linear 0..1 space for a bloom/halo mesh. */
  readonly haloColor: readonly [number, number, number];
  /** Small high-contrast spark/glint color, kept separate from the halo. */
  readonly glintColor: readonly [number, number, number];
  /** Multiplied by `radius * 2` to produce the core world scale. */
  readonly scaleMultiplier: number;
  /** Halo scale relative to the projected core scale. */
  readonly haloScaleMultiplier: number;
  /** Renderer-facing emissive/bloom weighting. */
  readonly glow: number;
  /** Scale modulation around the base scale. */
  readonly pulseAmplitude: number;
  /** Renderer-facing vertical bob in world units. */
  readonly bobAmplitude: number;
  /** Stable spin speed in radians per fixed tick. */
  readonly spinRadiansPerTick: number;
  /** Fixed-tick lifetime for inferred collection travel/burst. */
  readonly collectionLifetimeTicks: number;
}

/**
 * Presentation recipes intentionally use color + silhouette + movement, not
 * color alone. This is especially important in a dense swarm or for players
 * with reduced color discrimination.
 */
const RECIPES: Readonly<Record<LootVisualStyle, LootVisualRecipe>> = Object.freeze({
  [LOOT_VISUAL_STYLE.xpMote]: {
    style: LOOT_VISUAL_STYLE.xpMote,
    mesh: 'diamond',
    collectionLanguage: 'comet',
    coreColor: [0.18, 1, 0.64],
    haloColor: [0.05, 0.62, 0.56],
    glintColor: [1, 0.74, 0.18],
    scaleMultiplier: 0.22,
    haloScaleMultiplier: 1.9,
    glow: 1.15,
    pulseAmplitude: 0.025,
    bobAmplitude: 0.04,
    spinRadiansPerTick: 0.14,
    collectionLifetimeTicks: 10,
  },
  [LOOT_VISUAL_STYLE.xpGem]: {
    style: LOOT_VISUAL_STYLE.xpGem,
    mesh: 'crystal',
    collectionLanguage: 'comet',
    coreColor: [0.18, 1, 0.62],
    haloColor: [0.04, 0.95, 0.76],
    glintColor: [1, 0.76, 0.18],
    scaleMultiplier: 0.25,
    haloScaleMultiplier: 2.08,
    glow: 1.42,
    pulseAmplitude: 0.035,
    bobAmplitude: 0.055,
    spinRadiansPerTick: -0.11,
    collectionLifetimeTicks: 12,
  },
  [LOOT_VISUAL_STYLE.xpPrism]: {
    style: LOOT_VISUAL_STYLE.xpPrism,
    mesh: 'star-prism',
    collectionLanguage: 'nova',
    coreColor: [0.3, 1, 0.68],
    haloColor: [0.12, 0.86, 0.62],
    glintColor: [1, 0.72, 0.12],
    scaleMultiplier: 0.3,
    haloScaleMultiplier: 2.35,
    glow: 1.85,
    pulseAmplitude: 0.045,
    bobAmplitude: 0.07,
    spinRadiansPerTick: 0.21,
    collectionLifetimeTicks: 15,
  },
  [LOOT_VISUAL_STYLE.bomb]: {
    style: LOOT_VISUAL_STYLE.bomb,
    mesh: 'charge',
    collectionLanguage: 'nova',
    coreColor: [1, 0.2, 0.08],
    haloColor: [1, 0.7, 0.08],
    glintColor: [1, 0.92, 0.7],
    scaleMultiplier: 0.42,
    haloScaleMultiplier: 1.72,
    glow: 2.05,
    pulseAmplitude: 0.045,
    bobAmplitude: 0.07,
    spinRadiansPerTick: 0.09,
    collectionLifetimeTicks: 22,
  },
  [LOOT_VISUAL_STYLE.magnet]: {
    style: LOOT_VISUAL_STYLE.magnet,
    mesh: 'field-ring',
    collectionLanguage: 'vortex',
    coreColor: [0.2, 0.63, 1],
    haloColor: [0.54, 0.24, 1],
    glintColor: [0.72, 0.95, 1],
    scaleMultiplier: 0.4,
    haloScaleMultiplier: 2.18,
    glow: 1.92,
    pulseAmplitude: 0.035,
    bobAmplitude: 0.06,
    spinRadiansPerTick: -0.18,
    collectionLifetimeTicks: 20,
  },
  [LOOT_VISUAL_STYLE.food]: {
    style: LOOT_VISUAL_STYLE.food,
    mesh: 'bloom-orb',
    collectionLanguage: 'bloom',
    coreColor: [0.44, 1, 0.22],
    haloColor: [1, 0.48, 0.18],
    glintColor: [1, 0.9, 0.52],
    scaleMultiplier: 0.38,
    haloScaleMultiplier: 2.02,
    glow: 1.72,
    pulseAmplitude: 0.04,
    bobAmplitude: 0.065,
    spinRadiansPerTick: 0.06,
    collectionLifetimeTicks: 20,
  },
});

/**
 * Returns the immutable recipe used to create materials and meshes. Unknown
 * numeric styles are ignored rather than falling back to a misleading color.
 */
export function lootVisualRecipeForStyle(style: number): LootVisualRecipe | null {
  return RECIPES[style as LootVisualStyle] ?? null;
}

/** Selects a visible XP tier using only the copied, authoritative pickup radius. */
export function xpVisualStyleForRadius(radius: number): LootVisualStyle {
  if (radius >= XP_PRISM_MIN_RADIUS) return LOOT_VISUAL_STYLE.xpPrism;
  if (radius >= XP_GEM_MIN_RADIUS) return LOOT_VISUAL_STYLE.xpGem;
  return LOOT_VISUAL_STYLE.xpMote;
}

/**
 * Tiers from the actual copied XP value when a newer snapshot provides one.
 * Older snapshots are supported via the radius fallback, which keeps this
 * renderer-only module backward compatible while the capture contract rolls
 * out. Three XP is the first "notice me" drop; nine is reserved for the
 * gold-glint elite/boss prism.
 */
export function xpVisualStyleForValue(value: number | undefined, radius: number): LootVisualStyle {
  if (value !== undefined && Number.isFinite(value) && value > 0) {
    if (value >= XP_PRISM_MIN_VALUE) return LOOT_VISUAL_STYLE.xpPrism;
    if (value >= XP_GEM_MIN_VALUE) return LOOT_VISUAL_STYLE.xpGem;
    return LOOT_VISUAL_STYLE.xpMote;
  }
  return xpVisualStyleForRadius(radius);
}

function xpVisualStyleForSnapshot(snapshot: CategorySnapshot, index: number): LootVisualStyle {
  return xpVisualStyleForValue(snapshot.value[index], snapshot.radius[index]!);
}

/** Maps a compact copied power-pickup kind to its distinct visual language. */
export function powerPickupVisualStyleForRole(role: number): LootVisualStyle | null {
  switch (role) {
    case POWER_PICKUP_KIND.bomb: return LOOT_VISUAL_STYLE.bomb;
    case POWER_PICKUP_KIND.magnet: return LOOT_VISUAL_STYLE.magnet;
    case POWER_PICKUP_KIND.food: return LOOT_VISUAL_STYLE.food;
    default: return null;
  }
}

/**
 * A stable, packed prefix of persistent world-pickup descriptors. Every field
 * has `count` live entries. `scale`, `haloScale`, `glow`, and `lift` are all
 * concrete renderer values; the scene does not need to rediscover the tier.
 */
export interface LootVisualInstanceBuffer {
  readonly count: number;
  readonly id: Int32Array;
  readonly style: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly haloScale: Float32Array;
  readonly glow: Float32Array;
  readonly pulse: Float32Array;
  readonly spinRadians: Float32Array;
  readonly lift: Float32Array;
}

/**
 * A stable, packed prefix of short-lived collection descriptors. The renderer
 * can draw a core from `(tailX, tailY)` to `(headX, headY)`, then render the
 * source/impact rings independently. This makes XP read as a comet, Bomb as a
 * warning nova, Magnet as a field collapse, and Food as a healing bloom.
 */
export interface LootCollectionEffectBuffer {
  readonly count: number;
  readonly style: Uint8Array;
  readonly originX: Float32Array;
  readonly originY: Float32Array;
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  readonly headX: Float32Array;
  readonly headY: Float32Array;
  readonly tailX: Float32Array;
  readonly tailY: Float32Array;
  readonly coreScale: Float32Array;
  readonly trailWidth: Float32Array;
  readonly sourceBurstRadius: Float32Array;
  readonly impactBurstRadius: Float32Array;
  readonly glow: Float32Array;
  readonly opacity: Float32Array;
  readonly progress: Float32Array;
}

/** A stable object whose typed-array buffers are reused by every update. */
export interface LootVisualFrame {
  readonly tick: number;
  readonly xp: LootVisualInstanceBuffer;
  readonly power: LootVisualInstanceBuffer;
  readonly collections: LootCollectionEffectBuffer;
}

export interface LootVisualPresentationOptions {
  /** Must cover `RenderSnapshot.pickups.count` at the renderer's chosen cap. */
  readonly xpCapacity: number;
  /** Must cover `RenderSnapshot.powerPickups.count` at the renderer's chosen cap. */
  readonly powerCapacity: number;
  /** Bounded transient collection pool. Defaults to 72 and may be zero to disable trails. */
  readonly collectionCapacity?: number;
}

export interface LootVisualPresentation {
  /**
   * Reads only the snapshot pair and returns the same allocation-stable frame
   * object every call. `alpha` is clamped and contributes only presentation
   * interpolation/pulse phase.
   */
  update(
    previous: Readonly<RenderSnapshot>,
    current: Readonly<RenderSnapshot>,
    alpha: number,
  ): LootVisualFrame;
  /** Clears renderer-owned transient trails, useful on a deliberate scene reset. */
  reset(): void;
  readonly xpCapacity: number;
  readonly powerCapacity: number;
  readonly collectionCapacity: number;
}

interface MutableLootVisualInstanceBuffer {
  count: number;
  readonly id: Int32Array;
  readonly style: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly haloScale: Float32Array;
  readonly glow: Float32Array;
  readonly pulse: Float32Array;
  readonly spinRadians: Float32Array;
  readonly lift: Float32Array;
}

interface MutableLootCollectionEffectBuffer {
  count: number;
  readonly style: Uint8Array;
  readonly originX: Float32Array;
  readonly originY: Float32Array;
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  readonly headX: Float32Array;
  readonly headY: Float32Array;
  readonly tailX: Float32Array;
  readonly tailY: Float32Array;
  readonly coreScale: Float32Array;
  readonly trailWidth: Float32Array;
  readonly sourceBurstRadius: Float32Array;
  readonly impactBurstRadius: Float32Array;
  readonly glow: Float32Array;
  readonly opacity: Float32Array;
  readonly progress: Float32Array;
}

interface MutableLootVisualFrame {
  tick: number;
  readonly xp: MutableLootVisualInstanceBuffer;
  readonly power: MutableLootVisualInstanceBuffer;
  readonly collections: MutableLootCollectionEffectBuffer;
}

function createInstanceBuffer(capacity: number): MutableLootVisualInstanceBuffer {
  return {
    count: 0,
    id: new Int32Array(capacity),
    style: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    haloScale: new Float32Array(capacity),
    glow: new Float32Array(capacity),
    pulse: new Float32Array(capacity),
    spinRadians: new Float32Array(capacity),
    lift: new Float32Array(capacity),
  };
}

function createCollectionBuffer(capacity: number): MutableLootCollectionEffectBuffer {
  return {
    count: 0,
    style: new Uint8Array(capacity),
    originX: new Float32Array(capacity),
    originY: new Float32Array(capacity),
    targetX: new Float32Array(capacity),
    targetY: new Float32Array(capacity),
    headX: new Float32Array(capacity),
    headY: new Float32Array(capacity),
    tailX: new Float32Array(capacity),
    tailY: new Float32Array(capacity),
    coreScale: new Float32Array(capacity),
    trailWidth: new Float32Array(capacity),
    sourceBurstRadius: new Float32Array(capacity),
    impactBurstRadius: new Float32Array(capacity),
    glow: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    progress: new Float32Array(capacity),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampAlpha(alpha: number): number {
  return clamp(finiteOr(alpha, 0), 0, 1);
}

function positiveRadius(radius: number): number {
  return Math.max(0.1, finiteOr(radius, 1));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function easeOutCubic(amount: number): number {
  const inverse = 1 - clamp(amount, 0, 1);
  return 1 - inverse * inverse * inverse;
}

function easeInCubic(amount: number): number {
  const clamped = clamp(amount, 0, 1);
  return clamped * clamped * clamped;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

/** A stable visual phase based only on the generation-packed entity id. */
function phaseForId(id: number): number {
  let hash = id >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return (hash / 0x1_0000_0000) * TAU;
}

/**
 * Persistent rewards should breathe, not pulse. This remains entirely
 * deterministic because both inputs come from the copied entity id and the
 * fixed simulation clock.
 */
function persistentBreathPulse(phase: number, renderClock: number, power: boolean): number {
  const familyOffset = power ? TAU * 0.23 : 0;
  return 0.5 + 0.5 * Math.sin(phase + familyOffset + renderClock * PERSISTENT_LOOT_BREATH_RADIANS_PER_TICK);
}

function assertCapacity(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer; received ${value}`);
  }
}

/**
 * Renderer-only state machine for loot. All persistent state below is visual
 * bookkeeping (previous-id lookup and short-lived effects), never simulation
 * state. The event pool overwrites round-robin on a mass pickup; XP is emitted
 * first and special pickups second so the rare, higher-priority read wins.
 */
class LootVisualPresentationImpl implements LootVisualPresentation {
  readonly xpCapacity: number;
  readonly powerCapacity: number;
  readonly collectionCapacity: number;

  private readonly frame: MutableLootVisualFrame;
  private readonly lookupStamp = new Uint32Array(ENTITY_SLOT_COUNT);
  private readonly lookupValue = new Int32Array(ENTITY_SLOT_COUNT);
  private lookupVersion = 0;

  private readonly effectActive: Uint8Array;
  private readonly effectStyle: Uint8Array;
  private readonly effectStartClock: Float64Array;
  private readonly effectOriginX: Float32Array;
  private readonly effectOriginY: Float32Array;
  private readonly effectTargetX: Float32Array;
  private readonly effectTargetY: Float32Array;
  private effectCursor = 0;
  private lastPreviousTick = Number.NEGATIVE_INFINITY;
  private lastCurrentTick = Number.NEGATIVE_INFINITY;

  constructor(options: LootVisualPresentationOptions) {
    const collectionCapacity = options.collectionCapacity ?? DEFAULT_COLLECTION_CAPACITY;
    assertCapacity('xpCapacity', options.xpCapacity);
    assertCapacity('powerCapacity', options.powerCapacity);
    assertCapacity('collectionCapacity', collectionCapacity);

    this.xpCapacity = options.xpCapacity;
    this.powerCapacity = options.powerCapacity;
    this.collectionCapacity = collectionCapacity;
    this.frame = {
      tick: 0,
      xp: createInstanceBuffer(this.xpCapacity),
      power: createInstanceBuffer(this.powerCapacity),
      collections: createCollectionBuffer(this.collectionCapacity),
    };
    this.effectActive = new Uint8Array(this.collectionCapacity);
    this.effectStyle = new Uint8Array(this.collectionCapacity);
    this.effectStartClock = new Float64Array(this.collectionCapacity);
    this.effectOriginX = new Float32Array(this.collectionCapacity);
    this.effectOriginY = new Float32Array(this.collectionCapacity);
    this.effectTargetX = new Float32Array(this.collectionCapacity);
    this.effectTargetY = new Float32Array(this.collectionCapacity);
  }

  update(
    previous: Readonly<RenderSnapshot>,
    current: Readonly<RenderSnapshot>,
    alpha: number,
  ): LootVisualFrame {
    if (current.pickups.count > this.xpCapacity) {
      throw new RangeError(
        `XP snapshot count ${current.pickups.count} exceeds loot visual capacity ${this.xpCapacity}`,
      );
    }
    if (current.powerPickups.count > this.powerCapacity) {
      throw new RangeError(
        `Power snapshot count ${current.powerPickups.count} exceeds loot visual capacity ${this.powerCapacity}`,
      );
    }

    const safeAlpha = clampAlpha(alpha);
    const renderClock = finiteOr(current.tick, 0) + safeAlpha;
    const timelineReset = current.tick < this.lastCurrentTick || previous.tick > current.tick;
    if (timelineReset) this.reset();

    const newTransition =
      previous.tick !== this.lastPreviousTick || current.tick !== this.lastCurrentTick;
    if (newTransition && current.tick > previous.tick) {
      // Process XP first, then rare power tokens. The round-robin pool is
      // deliberately bounded, so a same-tick mass XP collection cannot hide a
      // much more important Bomb/Magnet/Food confirmation.
      this.emitDepartures(
        previous.pickups,
        current.pickups,
        current.playerX,
        current.playerY,
        renderClock,
        false,
      );
      this.emitDepartures(
        previous.powerPickups,
        current.powerPickups,
        current.playerX,
        current.playerY,
        renderClock,
        true,
      );
    }
    this.lastPreviousTick = previous.tick;
    this.lastCurrentTick = current.tick;

    this.writeLiveInstances(previous.pickups, current.pickups, safeAlpha, renderClock, false, this.frame.xp);
    this.writeLiveInstances(previous.powerPickups, current.powerPickups, safeAlpha, renderClock, true, this.frame.power);
    this.writeCollectionEffects(renderClock);
    this.frame.tick = current.tick;
    return this.frame;
  }

  reset(): void {
    this.effectActive.fill(0);
    this.frame.xp.count = 0;
    this.frame.power.count = 0;
    this.frame.collections.count = 0;
    this.effectCursor = 0;
    this.lastPreviousTick = Number.NEGATIVE_INFINITY;
    this.lastCurrentTick = Number.NEGATIVE_INFINITY;
  }

  private nextLookupVersion(): number {
    this.lookupVersion = (this.lookupVersion + 1) >>> 0;
    if (this.lookupVersion === 0) {
      this.lookupStamp.fill(0);
      this.lookupVersion = 1;
    }
    return this.lookupVersion;
  }

  /** Writes the previous snapshot's live index at each generation-packed slot. */
  private indexSnapshot(snapshot: CategorySnapshot): number {
    const version = this.nextLookupVersion();
    for (let index = 0; index < snapshot.count; index++) {
      const slot = idSlot(snapshot.id[index]!);
      this.lookupStamp[slot] = version;
      this.lookupValue[slot] = index;
    }
    return version;
  }

  private previousIndexFor(id: number, snapshot: CategorySnapshot, version: number): number {
    const slot = idSlot(id);
    if (this.lookupStamp[slot] !== version) return -1;
    const index = this.lookupValue[slot]!;
    return snapshot.id[index] === id ? index : -1;
  }

  private writeLiveInstances(
    previous: CategorySnapshot,
    current: CategorySnapshot,
    alpha: number,
    renderClock: number,
    power: boolean,
    output: MutableLootVisualInstanceBuffer,
  ): void {
    const previousVersion = this.indexSnapshot(previous);
    let count = 0;

    for (let index = 0; index < current.count; index++) {
      const id = current.id[index]!;
      const style = power
        ? powerPickupVisualStyleForRole(current.role[index]!)
        : xpVisualStyleForSnapshot(current, index);
      if (style === null) continue;
      const recipe = RECIPES[style];
      const previousIndex = this.previousIndexFor(id, previous, previousVersion);
      const currentX = finiteOr(current.x[index]!, 0);
      const currentY = finiteOr(current.y[index]!, 0);
      const x = previousIndex === -1
        ? currentX
        : lerp(finiteOr(previous.x[previousIndex]!, currentX), currentX, alpha);
      const y = previousIndex === -1
        ? currentY
        : lerp(finiteOr(previous.y[previousIndex]!, currentY), currentY, alpha);
      const phase = phaseForId(id);
      const pulse = persistentBreathPulse(phase, renderClock, power);
      const baseScale = positiveRadius(current.radius[index]!) * 2 * recipe.scaleMultiplier;
      const scale = baseScale * (1 + (pulse - 0.5) * 2 * recipe.pulseAmplitude);

      output.id[count] = id;
      output.style[count] = style;
      output.x[count] = x;
      output.y[count] = y;
      output.scale[count] = scale;
      output.haloScale[count] = scale * recipe.haloScaleMultiplier * (0.985 + pulse * 0.03);
      output.glow[count] = recipe.glow * (0.97 + pulse * 0.06);
      output.pulse[count] = pulse;
      output.spinRadians[count] = phase + renderClock * recipe.spinRadiansPerTick;
      output.lift[count] = recipe.bobAmplitude * (0.22 + pulse * 0.78);
      count++;
    }
    output.count = count;
  }

  /**
   * Detects snapshot departures once per tick transition. Snapshot loss is the
   * only renderer-visible proof available for a collection, so it produces a
   * purely decorative confirmation and never attempts to infer reward values.
   */
  private emitDepartures(
    previous: CategorySnapshot,
    current: CategorySnapshot,
    targetX: number,
    targetY: number,
    renderClock: number,
    power: boolean,
  ): void {
    const currentVersion = this.indexSnapshot(current);
    for (let index = 0; index < previous.count; index++) {
      const id = previous.id[index]!;
      const slot = idSlot(id);
      const stillLive = this.lookupStamp[slot] === currentVersion && current.id[this.lookupValue[slot]!] === id;
      if (stillLive) continue;
      const style = power
        ? powerPickupVisualStyleForRole(previous.role[index]!)
        : xpVisualStyleForSnapshot(previous, index);
      if (style === null) continue;
      this.spawnCollection(
        style,
        finiteOr(previous.x[index]!, 0),
        finiteOr(previous.y[index]!, 0),
        finiteOr(targetX, 0),
        finiteOr(targetY, 0),
        renderClock,
      );
    }
  }

  private spawnCollection(
    style: LootVisualStyle,
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    startClock: number,
  ): void {
    if (this.collectionCapacity === 0) return;
    const slot = this.effectCursor;
    this.effectCursor = (this.effectCursor + 1) % this.collectionCapacity;
    this.effectActive[slot] = 1;
    this.effectStyle[slot] = style;
    this.effectStartClock[slot] = startClock;
    this.effectOriginX[slot] = originX;
    this.effectOriginY[slot] = originY;
    this.effectTargetX[slot] = targetX;
    this.effectTargetY[slot] = targetY;
  }

  private writeCollectionEffects(renderClock: number): void {
    const output = this.frame.collections;
    let count = 0;
    for (let slot = 0; slot < this.collectionCapacity; slot++) {
      if (this.effectActive[slot] === 0) continue;
      const style = this.effectStyle[slot]! as LootVisualStyle;
      const recipe = RECIPES[style];
      const age = Math.max(0, renderClock - this.effectStartClock[slot]!);
      if (age >= recipe.collectionLifetimeTicks) {
        this.effectActive[slot] = 0;
        continue;
      }

      const progress = age / recipe.collectionLifetimeTicks;
      const originX = this.effectOriginX[slot]!;
      const originY = this.effectOriginY[slot]!;
      const targetX = this.effectTargetX[slot]!;
      const targetY = this.effectTargetY[slot]!;

      output.style[count] = style;
      output.originX[count] = originX;
      output.originY[count] = originY;
      output.targetX[count] = targetX;
      output.targetY[count] = targetY;
      writeCollectionMotion(
        output,
        count,
        style,
        progress,
        originX,
        originY,
        targetX,
        targetY,
        recipe,
      );
      output.progress[count] = progress;
      count++;
    }
    output.count = count;
  }
}

/**
 * Pure collection choreography, deliberately compact enough to drive a few
 * pooled meshes instead of particle-system allocations. Its visual language is
 * independent of gameplay: only the departed token's copied location and the
 * copied player position participate.
 */
function writeCollectionMotion(
  output: MutableLootCollectionEffectBuffer,
  index: number,
  style: LootVisualStyle,
  progress: number,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  recipe: LootVisualRecipe,
): void {
  const safeProgress = clamp(progress, 0, 1);
  let travel = 0;
  let trailLag = 0.12;
  let coreScale = 1;
  let trailWidth = 0.38;
  let sourceBurstRadius = 0;
  let impactBurstRadius = 0;
  let glow = 1;

  switch (style) {
    case LOOT_VISUAL_STYLE.xpMote:
      travel = easeOutCubic(safeProgress / 0.72);
      trailLag = 0.17;
      coreScale = 0.95 * (1 - safeProgress * 0.22);
      trailWidth = 0.32;
      impactBurstRadius = smoothstep(0.7, 1, safeProgress) * 2.4;
      break;
    case LOOT_VISUAL_STYLE.xpGem:
      travel = easeOutCubic(safeProgress / 0.7);
      trailLag = 0.19;
      coreScale = 1.32 * (1 - safeProgress * 0.16);
      trailWidth = 0.46;
      impactBurstRadius = smoothstep(0.66, 1, safeProgress) * 3.8;
      glow = 1.12;
      break;
    case LOOT_VISUAL_STYLE.xpPrism:
      travel = easeOutCubic(safeProgress / 0.66);
      trailLag = 0.23;
      coreScale = 1.76 * (1 - safeProgress * 0.1);
      trailWidth = 0.62;
      sourceBurstRadius = (1 - smoothstep(0, 0.38, safeProgress)) * 3.2;
      impactBurstRadius = smoothstep(0.58, 1, safeProgress) * 6.4;
      glow = 1.28;
      break;
    case LOOT_VISUAL_STYLE.bomb:
      // A Bomb reads as a warning detonation at the token, then a hot charge
      // snapping into the hero: broad orange source nova, thin white-hot tail.
      travel = easeInCubic(safeProgress / 0.55);
      trailLag = 0.12;
      coreScale = 2.25 * (1 - safeProgress * 0.34);
      trailWidth = 0.86;
      sourceBurstRadius = (1 - smoothstep(0.05, 0.58, safeProgress)) * 10.5;
      impactBurstRadius = smoothstep(0.52, 1, safeProgress) * 5.5;
      glow = 1.46;
      break;
    case LOOT_VISUAL_STYLE.magnet:
      // Magnets accelerate early and leave a wide cool field tail. The large
      // impact ring gives the player an immediate "whole field pulled" read.
      travel = easeOutCubic(safeProgress / 0.53);
      trailLag = 0.3;
      coreScale = 1.88 * (1 - safeProgress * 0.22);
      trailWidth = 0.76;
      sourceBurstRadius = (1 - smoothstep(0, 0.72, safeProgress)) * 5.6;
      impactBurstRadius = smoothstep(0.2, 0.9, safeProgress) * 9.5;
      glow = 1.38;
      break;
    case LOOT_VISUAL_STYLE.food:
      // Food is softer and rounder: a short warm trail, a small source bloom,
      // then a larger restorative bloom around the hero.
      travel = easeOutCubic(safeProgress / 0.64);
      trailLag = 0.15;
      coreScale = 1.7 * (1 - safeProgress * 0.17);
      trailWidth = 0.58;
      sourceBurstRadius = (1 - smoothstep(0.04, 0.52, safeProgress)) * 4.1;
      impactBurstRadius = smoothstep(0.42, 1, safeProgress) * 7.2;
      glow = 1.24;
      break;
  }

  const tailTravel = Math.max(0, travel - trailLag * (0.7 + (1 - safeProgress) * 0.3));
  output.headX[index] = lerp(originX, targetX, travel);
  output.headY[index] = lerp(originY, targetY, travel);
  output.tailX[index] = lerp(originX, targetX, tailTravel);
  output.tailY[index] = lerp(originY, targetY, tailTravel);
  output.coreScale[index] = coreScale;
  output.trailWidth[index] = trailWidth;
  output.sourceBurstRadius[index] = sourceBurstRadius;
  output.impactBurstRadius[index] = impactBurstRadius;
  output.glow[index] = glow * recipe.glow;
  output.opacity[index] = (1 - safeProgress * safeProgress) * (0.92 + (1 - safeProgress) * 0.08);
}

/**
 * Creates one bounded renderer-owned presentation instance. Integrate it by
 * constructing once with the snapshot capacities and calling `update` inside
 * the existing renderer's `render(prev, curr, alpha, ...)` path.
 */
export function createLootVisualPresentation(
  options: LootVisualPresentationOptions,
): LootVisualPresentation {
  return new LootVisualPresentationImpl(options);
}
