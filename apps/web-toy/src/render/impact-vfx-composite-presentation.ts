/**
 * Renderer-only composite anatomy for authoritative combat impacts.
 *
 * The existing combat-impact projector owns deduplication, lifetime, and the
 * normal-blend painted body card. This layer consumes that compact descriptor
 * prefix and adds only the short textured core, physical debris, and contact
 * ring. It never inspects or mutates simulation state.
 */
import {
  COMBAT_IMPACT_STYLE,
  type CombatImpactDescriptorBuffer,
  type CombatImpactFrame,
} from './combat-impact-presentation';
import { easeOutCubic, envelope } from './vfx-easing';

const TAU = Math.PI * 2;
const DEFAULT_CAPACITY = 48;
const DEFAULT_CORE_LIFETIME_TICKS = 4;
const MAX_DEBRIS_PER_IMPACT = 7;
const MAX_CAPACITY = 192;
const MAX_DEBRIS_CAPACITY = 768;
const DEBRIS_DECAY_PER_TICK = 0.88;

export interface ImpactVfxCompositeOptions {
  /** Maximum number of body-card descriptors admitted to this visual layer. */
  readonly capacity?: number;
  /** Fixed debris pool capacity; under pressure critical shards are admitted first. */
  readonly debrisCapacity?: number;
  /** Core life is constrained to a compact two-to-four-tick hit flash. */
  readonly coreLifetimeTicks?: number;
}

export interface ImpactCoreDescriptorBuffer {
  count: number;
  readonly style: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly opacity: Float32Array;
  readonly spinRadians: Float32Array;
}

export interface ImpactDebrisDescriptorBuffer {
  count: number;
  readonly style: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly lift: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
}

export interface ImpactGroundRingDescriptorBuffer {
  count: number;
  readonly style: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
}

export interface ImpactVfxCompositeFrame {
  tick: number;
  /** Four-tick maximum textured flash; scene wiring provides the core art. */
  readonly cores: ImpactCoreDescriptorBuffer;
  /** Three routine shards or seven critical shards, never simulation particles. */
  readonly debris: ImpactDebrisDescriptorBuffer;
  /** A quiet normal-blend contact ring anchors the existing painted body. */
  readonly rings: ImpactGroundRingDescriptorBuffer;
}

export interface ImpactVfxCompositePresentation {
  readonly capacity: number;
  readonly debrisCapacity: number;
  readonly coreLifetimeTicks: number;
  update(impacts: CombatImpactFrame): ImpactVfxCompositeFrame;
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
    Math.floor(finite(value ?? DEFAULT_CORE_LIFETIME_TICKS, DEFAULT_CORE_LIFETIME_TICKS)),
    2,
    4,
  );
}

function stylePriority(style: number): number {
  switch (style) {
    case COMBAT_IMPACT_STYLE.criticalEnemyHit: return 3;
    case COMBAT_IMPACT_STYLE.playerHit: return 2;
    case COMBAT_IMPACT_STYLE.enemyHit: return 1;
    default: return 0;
  }
}

function debrisCountForStyle(style: number): number {
  return style === COMBAT_IMPACT_STYLE.criticalEnemyHit ? 7 : 3;
}

function coreScaleRatio(style: number): number {
  switch (style) {
    case COMBAT_IMPACT_STYLE.criticalEnemyHit: return 0.35;
    case COMBAT_IMPACT_STYLE.playerHit: return 0.3;
    default: return 0.28;
  }
}

/**
 * Authoritative impacts are first sampled on their event tick. Nudge only
 * that visual sample into the attack portion so the core/debris can be seen
 * immediately, while retaining the exact-zero terminal progress=1 sample.
 */
function visibleImpactProgress(progress: number): number {
  const safeProgress = clamp(progress, 0, 1);
  return safeProgress === 0 ? 0.08 : safeProgress;
}

/**
 * Fixed-capacity impact anatomy. Source descriptors are selected in explicit
 * priority passes, so a late routine hit cannot crowd a critical's core,
 * shards, or contact ring out of the renderer pool.
 */
export function createImpactVfxCompositePresentation(
  options: ImpactVfxCompositeOptions = {},
): ImpactVfxCompositePresentation {
  const capacity = normalizedCapacity(options.capacity, DEFAULT_CAPACITY, MAX_CAPACITY);
  const debrisCapacity = normalizedCapacity(
    options.debrisCapacity,
    capacity * MAX_DEBRIS_PER_IMPACT,
    MAX_DEBRIS_CAPACITY,
  );
  const coreLifetimeTicks = normalizedCoreLifetime(options.coreLifetimeTicks);
  const selectedSourceIndices = new Int16Array(capacity);
  const cores: ImpactCoreDescriptorBuffer = {
    count: 0,
    style: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    spinRadians: new Float32Array(capacity),
  };
  const debris: ImpactDebrisDescriptorBuffer = {
    count: 0,
    style: new Uint8Array(debrisCapacity),
    x: new Float32Array(debrisCapacity),
    y: new Float32Array(debrisCapacity),
    scale: new Float32Array(debrisCapacity),
    lift: new Float32Array(debrisCapacity),
    opacity: new Float32Array(debrisCapacity),
    yawRadians: new Float32Array(debrisCapacity),
  };
  const rings: ImpactGroundRingDescriptorBuffer = {
    count: 0,
    style: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    yawRadians: new Float32Array(capacity),
  };
  const frame: ImpactVfxCompositeFrame = { tick: 0, cores, debris, rings };

  function selectSources(impactBuffer: CombatImpactDescriptorBuffer): number {
    let selectedCount = 0;
    // Selection is deliberately separate from buffer order. The combat
    // projector normally already preserves crits, but this layer remains safe
    // when a smaller visual budget is requested for a low-quality device.
    for (let priority = 3; priority >= 1; priority--) {
      for (let index = 0; index < impactBuffer.count && selectedCount < capacity; index++) {
        if (stylePriority(impactBuffer.style[index]!) !== priority) continue;
        selectedSourceIndices[selectedCount++] = index;
      }
    }
    return selectedCount;
  }

  function writeCore(
    impactBuffer: CombatImpactDescriptorBuffer,
    sourceIndex: number,
    ageTicks: number,
  ): void {
    if (ageTicks < 0 || ageTicks >= coreLifetimeTicks || cores.count >= capacity) return;
    const index = cores.count++;
    const style = impactBuffer.style[sourceIndex]!;
    const progress = ageTicks / coreLifetimeTicks;
    const terminalFade = 1 - Math.pow((ageTicks + 1) / coreLifetimeTicks, 1.4);
    const scale = impactBuffer.coreScale[sourceIndex]! * coreScaleRatio(style)
      * (0.84 + 0.16 * easeOutCubic(progress));
    cores.style[index] = style;
    cores.x[index] = impactBuffer.x[sourceIndex]!;
    cores.y[index] = impactBuffer.y[sourceIndex]!;
    cores.scale[index] = scale;
    cores.opacity[index] = clamp(terminalFade, 0, 1);
    cores.spinRadians[index] = impactBuffer.spinRadians[sourceIndex]! * 0.18;
  }

  function writeDebris(
    impactBuffer: CombatImpactDescriptorBuffer,
    sourceIndex: number,
    ageTicks: number,
  ): void {
    const style = impactBuffer.style[sourceIndex]!;
    const particleCount = debrisCountForStyle(style);
    const progress = visibleImpactProgress(impactBuffer.progress[sourceIndex]!);
    const baseScale = impactBuffer.coreScale[sourceIndex]!;
    const phase = impactBuffer.phaseRadians[sourceIndex]!;
    // Every shard shares the same fast-arrival, long true-zero release. This
    // keeps the contact readable at its start without a few harsh one-frame
    // pixels appearing and disappearing independently.
    const fade = envelope(progress, 0.05, 0.6);
    const decayDistance = (1 - Math.pow(DEBRIS_DECAY_PER_TICK, Math.max(0, ageTicks)))
      / (1 - DEBRIS_DECAY_PER_TICK);

    for (let fragment = 0; fragment < particleCount && debris.count < debrisCapacity; fragment++) {
      const index = debris.count++;
      const angle = phase + fragment * TAU / particleCount + (style === COMBAT_IMPACT_STYLE.criticalEnemyHit ? 0.12 : 0);
      const speed = baseScale * (0.11 + (fragment % 3) * 0.026);
      const distance = speed * decayDistance;
      const launchLift = baseScale * (0.13 + (fragment % 2) * 0.025);
      const gravity = baseScale * 0.008 * ageTicks * ageTicks;
      debris.style[index] = style;
      debris.x[index] = impactBuffer.x[sourceIndex]! + Math.cos(angle) * distance;
      debris.y[index] = impactBuffer.y[sourceIndex]! + Math.sin(angle) * distance;
      debris.scale[index] = baseScale * (0.055 + (fragment % 3) * 0.016);
      debris.lift[index] = Math.max(0.02, launchLift - gravity);
      debris.opacity[index] = clamp(fade * (0.84 - (fragment % 3) * 0.08), 0, 1);
      debris.yawRadians[index] = angle + ageTicks * (0.14 + (fragment % 2) * 0.08);
    }
  }

  function writeRing(impactBuffer: CombatImpactDescriptorBuffer, sourceIndex: number): void {
    if (rings.count >= capacity) return;
    const index = rings.count++;
    const progress = visibleImpactProgress(impactBuffer.progress[sourceIndex]!);
    const bodyScale = impactBuffer.coreScale[sourceIndex]!;
    const style = impactBuffer.style[sourceIndex]!;
    rings.style[index] = style;
    rings.x[index] = impactBuffer.x[sourceIndex]!;
    rings.y[index] = impactBuffer.y[sourceIndex]!;
    rings.scale[index] = bodyScale * (0.5 + 0.65 * easeOutCubic(progress));
    // Ground contact is a quiet normal-blend anchor, never a bright halo.
    rings.opacity[index] = clamp(envelope(progress, 0.05, 0.6) * 0.22, 0, 0.22);
    rings.yawRadians[index] = impactBuffer.spinRadians[sourceIndex]! * 0.1;
  }

  function reset(): void {
    cores.count = 0;
    debris.count = 0;
    rings.count = 0;
    frame.tick = 0;
  }

  return {
    capacity,
    debrisCapacity,
    coreLifetimeTicks,
    update(impactFrame): ImpactVfxCompositeFrame {
      const impactBuffer = impactFrame.impacts;
      cores.count = 0;
      debris.count = 0;
      rings.count = 0;
      const selectedCount = selectSources(impactBuffer);
      const tick = Math.max(0, Math.floor(finite(impactFrame.tick, 0)));

      for (let selected = 0; selected < selectedCount; selected++) {
        const sourceIndex = selectedSourceIndices[selected]!;
        const ageTicks = Math.max(0, tick - impactBuffer.eventTick[sourceIndex]!);
        writeCore(impactBuffer, sourceIndex, ageTicks);
        writeDebris(impactBuffer, sourceIndex, ageTicks);
        writeRing(impactBuffer, sourceIndex);
      }

      frame.tick = tick;
      return frame;
    },
    reset,
  };
}
