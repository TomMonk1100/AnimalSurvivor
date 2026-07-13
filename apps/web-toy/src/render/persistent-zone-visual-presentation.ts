/**
 * Renderer-only visual policy for long-lived player damage zones.
 *
 * The simulation can legitimately keep several overlapping zones alive at
 * once. Rendering every card at the same full alpha, however, turns a strong
 * attack into an opaque blanket. This presentation keeps one deterministic
 * primary card per semantic zone lane, ages it from a bright arrival into a
 * quiet footprint, and never changes any simulation zone, damage, lifetime,
 * or collision result.
 */
import { idSlot } from '@sim';
import type { CategorySnapshot } from '../contracts';
import { VfxTransformStore } from './vfx-transform-store';

/** One controlled primary cloud is clearer than several full-strength cards. */
export const PERSISTENT_ZONE_PRIMARY_CAPACITY = 1;

const ENTITY_SLOT_COUNT = 0x1_0000;
const NO_ENTITY_ID = -1;
const DEFAULT_FADE_IN_TICKS = 6;
const DEFAULT_PRIMARY_TICKS = 30;
const DEFAULT_SETTLE_TICKS = 36;
const DEFAULT_QUIET_OPACITY_RATIO = 0.28;

export interface PersistentZoneVisualPresentationOptions {
  /** Compact, simulation-owned zone tag consumed read-only from snapshots. */
  readonly zoneTag: number;
  /** Shared maximum alpha for the one selected illustrated card. */
  readonly baseOpacity: number;
  /** Keeps the painted silhouette inside the simulation collision radius. */
  readonly scaleMultiplier: number;
  /** Opacity retained by an old-but-still-live zone as a quiet footprint. */
  readonly quietOpacityRatio?: number;
  readonly fadeInTicks?: number;
  readonly primaryTicks?: number;
  readonly settleTicks?: number;
}

export interface PersistentZoneVisualPresentation {
  /** Fixed one-card matrix buffer consumed by the matching instanced batch. */
  readonly transforms: VfxTransformStore;
  /** Read-only diagnostic identity for focused renderer tests. */
  readonly selectedId: number | null;
  /** Current batch opacity after this lane's renderer-only age curve. */
  readonly opacity: number;
  /** Rebuilds the sole visible primary from immutable zone snapshot data. */
  update(
    zones: CategorySnapshot,
    tick: number,
    offsetX: number,
    offsetZ: number,
    zScale: number,
  ): void;
  /** Clears renderer-local identity/age state after a run restart. */
  reset(): void;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function nonNegativeInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Makes a bounded visual lane for one persistent zone tag. Newer zones win;
 * same-tick ties use the generation slot, so the result is deterministic even
 * when the pool snapshot order changes. The selected card is bright only for
 * its primary beat, then settles into a faint footprint until the simulation
 * despawns it.
 */
export function createPersistentZoneVisualPresentation(
  options: PersistentZoneVisualPresentationOptions,
): PersistentZoneVisualPresentation {
  const fadeInTicks = Math.max(1, nonNegativeInteger(options.fadeInTicks ?? DEFAULT_FADE_IN_TICKS, DEFAULT_FADE_IN_TICKS));
  const primaryTicks = nonNegativeInteger(options.primaryTicks ?? DEFAULT_PRIMARY_TICKS, DEFAULT_PRIMARY_TICKS);
  const settleTicks = Math.max(1, nonNegativeInteger(options.settleTicks ?? DEFAULT_SETTLE_TICKS, DEFAULT_SETTLE_TICKS));
  const quietOpacityRatio = clamp01(options.quietOpacityRatio ?? DEFAULT_QUIET_OPACITY_RATIO);
  const baseOpacity = clamp01(options.baseOpacity);
  const scaleMultiplier = Number.isFinite(options.scaleMultiplier)
    ? Math.max(0, options.scaleMultiplier)
    : 0;
  const seenIdBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const bornTickBySlot = new Int32Array(ENTITY_SLOT_COUNT);
  const transforms = new VfxTransformStore(PERSISTENT_ZONE_PRIMARY_CAPACITY);
  seenIdBySlot.fill(NO_ENTITY_ID);

  let lastTick = -1;
  let selectedId: number | null = null;
  let opacity = 0;

  function reset(): void {
    seenIdBySlot.fill(NO_ENTITY_ID);
    bornTickBySlot.fill(0);
    transforms.reset();
    lastTick = -1;
    selectedId = null;
    opacity = 0;
  }

  function update(
    zones: CategorySnapshot,
    tick: number,
    offsetX: number,
    offsetZ: number,
    zScale: number,
  ): void {
    if (tick < lastTick) reset();
    lastTick = tick;
    transforms.reset();
    selectedId = null;
    opacity = 0;

    let selectedIndex = -1;
    let selectedAge = Number.POSITIVE_INFINITY;
    let selectedSlot = ENTITY_SLOT_COUNT;
    for (let index = 0; index < zones.count; index++) {
      if (zones.role[index] !== options.zoneTag) continue;
      const id = zones.id[index]!;
      const slot = idSlot(id);
      if (seenIdBySlot[slot] !== id) {
        seenIdBySlot[slot] = id;
        bornTickBySlot[slot] = tick;
      }
      const age = Math.max(0, tick - bornTickBySlot[slot]!);
      if (age < selectedAge || (age === selectedAge && slot < selectedSlot)) {
        selectedIndex = index;
        selectedAge = age;
        selectedSlot = slot;
      }
    }

    if (selectedIndex < 0 || !Number.isFinite(selectedAge)) return;

    const arrival = clamp01((selectedAge + 1) / fadeInTicks);
    const settle = clamp01((selectedAge - primaryTicks) / settleTicks);
    const visualStrength = arrival * (1 - (1 - quietOpacityRatio) * settle);
    const radius = Math.max(0, zones.radius[selectedIndex]!);
    const scale = radius * 2 * scaleMultiplier;
    transforms.push(
      zones.x[selectedIndex]! + offsetX,
      zones.y[selectedIndex]! * zScale + offsetZ,
      scale,
      1,
      scale,
    );
    selectedId = zones.id[selectedIndex]!;
    opacity = baseOpacity * visualStrength;
  }

  return {
    transforms,
    get selectedId(): number | null {
      return selectedId;
    },
    get opacity(): number {
      return opacity;
    },
    update,
    reset,
  };
}
