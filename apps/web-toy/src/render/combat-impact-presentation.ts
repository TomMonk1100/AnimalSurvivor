/**
 * Read-only hit-impact projection for the world renderer.
 *
 * The simulation remains responsible for resolving every hit. This module
 * receives only the app-owned combat-event view, retains a bounded visual
 * echo for a few fixed ticks, and writes a packed descriptor prefix suitable
 * for instanced mesh routing. It deliberately has no PlayCanvas dependency so
 * the presentation policy stays easy to test and cannot feed back into play.
 */
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';

/** Numeric routing keys keep the hot descriptor buffer compact. */
export const COMBAT_IMPACT_STYLE = Object.freeze({
  enemyHit: 1,
  criticalEnemyHit: 2,
  playerHit: 3,
} as const);

export type CombatImpactStyle = (typeof COMBAT_IMPACT_STYLE)[keyof typeof COMBAT_IMPACT_STYLE];

export interface CombatImpactRecipe {
  readonly style: CombatImpactStyle;
  /** A renderer can route this to one compact core + spark material family. */
  readonly coreColor: readonly [number, number, number];
  readonly sparkColor: readonly [number, number, number];
  readonly ringColor: readonly [number, number, number];
  readonly sparkCount: number;
  readonly scaleMultiplier: number;
  readonly spinRadians: number;
}

/**
 * Warm ivory reads as a normal successful hit, gold is deliberately reserved
 * for criticals, and coral is reserved for damage aimed at the player. Shape,
 * spark count, scale, and life differentiate them even without color.
 */
const RECIPES: Readonly<Record<CombatImpactStyle, CombatImpactRecipe>> = Object.freeze({
  [COMBAT_IMPACT_STYLE.enemyHit]: Object.freeze({
    style: COMBAT_IMPACT_STYLE.enemyHit,
    coreColor: [1, 0.96, 0.76] as const,
    sparkColor: [1, 0.68, 0.18] as const,
    ringColor: [1, 0.42, 0.12] as const,
    sparkCount: 5,
    scaleMultiplier: 1,
    spinRadians: 0.64,
  }),
  [COMBAT_IMPACT_STYLE.criticalEnemyHit]: Object.freeze({
    style: COMBAT_IMPACT_STYLE.criticalEnemyHit,
    coreColor: [1, 1, 0.84] as const,
    sparkColor: [1, 0.78, 0.12] as const,
    ringColor: [1, 0.38, 0.08] as const,
    sparkCount: 11,
    scaleMultiplier: 1.62,
    spinRadians: -1.14,
  }),
  [COMBAT_IMPACT_STYLE.playerHit]: Object.freeze({
    style: COMBAT_IMPACT_STYLE.playerHit,
    coreColor: [1, 0.72, 0.62] as const,
    sparkColor: [1, 0.18, 0.2] as const,
    ringColor: [0.76, 0.04, 0.16] as const,
    sparkCount: 8,
    scaleMultiplier: 1.28,
    spinRadians: 0.9,
  }),
});

export function combatImpactRecipeForStyle(style: number): CombatImpactRecipe | null {
  return RECIPES[style as CombatImpactStyle] ?? null;
}

/**
 * Stable packed prefix for one render frame. Entries [0, count) are active;
 * the typed arrays and enclosing frame object are retained and reused by the
 * projector on every update.
 */
export interface CombatImpactDescriptorBuffer {
  count: number;
  readonly style: Uint8Array;
  readonly eventTick: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Deterministic per-event phase for a renderer's shard layout. */
  readonly phaseRadians: Float32Array;
  /** World-space core radius / mesh scale. */
  readonly coreScale: Float32Array;
  /** Outer spark / burst radius. */
  readonly sparkRadius: Float32Array;
  /** Expanding ground ring scale. */
  readonly ringScale: Float32Array;
  /** Renderer-facing vertical lift, so bursts do not sit flat on terrain. */
  readonly lift: Float32Array;
  readonly opacity: Float32Array;
  readonly progress: Float32Array;
  readonly spinRadians: Float32Array;
  readonly sparkCount: Uint8Array;
}

export interface CombatImpactFrame {
  tick: number;
  readonly impacts: CombatImpactDescriptorBuffer;
}

export interface CombatImpactPresentationOptions {
  /** Maximum simultaneous visual echoes. This never changes combat outcomes. */
  readonly capacity?: number;
  /** Normal hits persist for 6-12 fixed ticks; default is deliberately crisp. */
  readonly normalLifetimeTicks?: number;
  /** Critical hits persist for 6-12 fixed ticks; default is the full heroic beat. */
  readonly criticalLifetimeTicks?: number;
  /** Optional danger bursts make enemy contact more legible at the player. */
  readonly includePlayerHitBursts?: boolean;
  readonly playerHitLifetimeTicks?: number;
}

export interface CombatImpactPresentation {
  readonly capacity: number;
  readonly normalLifetimeTicks: number;
  readonly criticalLifetimeTicks: number;
  readonly playerHitLifetimeTicks: number;
  /**
   * Copies newly observed authoritative outcomes into a bounded visual pool,
   * then returns the stable descriptor object for `renderTick`.
   */
  update(events: readonly CombatPresentationEventView[], renderTick: number): CombatImpactFrame;
  /** Clears renderer-owned effects and duplicate identity history on run reset. */
  reset(): void;
}

export const DEFAULT_COMBAT_IMPACT_CAPACITY = 72;
export const DEFAULT_NORMAL_IMPACT_LIFETIME_TICKS = 7;
export const DEFAULT_CRITICAL_IMPACT_LIFETIME_TICKS = 12;
export const DEFAULT_PLAYER_HIT_IMPACT_LIFETIME_TICKS = 9;

const MIN_LIFETIME_TICKS = 6;
const MAX_LIFETIME_TICKS = 12;
const MAX_CAPACITY = 192;
const TAU = Math.PI * 2;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedCapacity(value: number | undefined): number {
  return clamp(Math.floor(finite(value ?? DEFAULT_COMBAT_IMPACT_CAPACITY, DEFAULT_COMBAT_IMPACT_CAPACITY)), 1, MAX_CAPACITY);
}

function normalizedLifetime(value: number | undefined, fallback: number): number {
  return clamp(Math.floor(finite(value ?? fallback, fallback)), MIN_LIFETIME_TICKS, MAX_LIFETIME_TICKS);
}

function styleForEvent(event: CombatPresentationEventView, includePlayerHitBursts: boolean): CombatImpactStyle | null {
  if (event.kind === 'enemyHit') {
    return event.critical ? COMBAT_IMPACT_STYLE.criticalEnemyHit : COMBAT_IMPACT_STYLE.enemyHit;
  }
  if (includePlayerHitBursts && event.kind === 'playerHit') return COMBAT_IMPACT_STYLE.playerHit;
  return null;
}

function lifetimeForStyle(
  style: CombatImpactStyle,
  normalLifetimeTicks: number,
  criticalLifetimeTicks: number,
  playerHitLifetimeTicks: number,
): number {
  switch (style) {
    case COMBAT_IMPACT_STYLE.enemyHit: return normalLifetimeTicks;
    case COMBAT_IMPACT_STYLE.criticalEnemyHit: return criticalLifetimeTicks;
    case COMBAT_IMPACT_STYLE.playerHit: return playerHitLifetimeTicks;
  }
}

function priorityForStyle(style: CombatImpactStyle): number {
  switch (style) {
    case COMBAT_IMPACT_STYLE.enemyHit: return 1;
    case COMBAT_IMPACT_STYLE.playerHit: return 2;
    case COMBAT_IMPACT_STYLE.criticalEnemyHit: return 3;
  }
}

function isUsableEvent(event: CombatPresentationEventView): boolean {
  return Number.isFinite(event.tick)
    && Number.isFinite(event.x)
    && Number.isFinite(event.y)
    && Number.isFinite(event.amount);
}

// Two compact non-cryptographic hashes give duplicate suppression an
// exceptionally low collision chance without retaining strings or allocating
// a key for every repeated rAF event list.
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

function mixTarget(hash: number, targetId: CombatPresentationEventView['targetId']): number {
  return typeof targetId === 'string'
    ? mixText(mixHash(hash, 1), targetId)
    : mixNumber(mixHash(hash, 2), targetId);
}

function hashEvent(event: CombatPresentationEventView, seed: number): number {
  let hash = mixText(seed, event.kind);
  hash = mixNumber(hash, event.tick);
  hash = mixNumber(hash, event.x);
  hash = mixNumber(hash, event.y);
  hash = mixNumber(hash, event.amount);
  hash = mixHash(hash, event.critical ? 1 : 0);
  hash = mixText(hash, event.sourceId);
  hash = mixTarget(hash, event.targetId);
  return mixText(hash, event.pickupKind ?? '');
}

function phaseForHash(hash: number): number {
  return (hash >>> 0) / 0x1_0000_0000 * TAU;
}

function scaleForEvent(event: CombatPresentationEventView, style: CombatImpactStyle): number {
  const recipe = RECIPES[style];
  // Square-root response lets high damage feel weightier without turning a
  // late-game crit into a screen-covering effect.
  const amountWeight = Math.sqrt(Math.max(0, event.amount));
  return recipe.scaleMultiplier * (3.4 + Math.min(3.8, amountWeight * 0.32));
}

/**
 * Fixed-capacity projector. Its update path does not mutate event views or
 * snapshots, create DOM nodes, use wall time, or allocate descriptor arrays.
 */
export function createCombatImpactPresentation(
  options: CombatImpactPresentationOptions = {},
): CombatImpactPresentation {
  const capacity = normalizedCapacity(options.capacity);
  const normalLifetimeTicks = normalizedLifetime(options.normalLifetimeTicks, DEFAULT_NORMAL_IMPACT_LIFETIME_TICKS);
  const criticalLifetimeTicks = normalizedLifetime(options.criticalLifetimeTicks, DEFAULT_CRITICAL_IMPACT_LIFETIME_TICKS);
  const playerHitLifetimeTicks = normalizedLifetime(options.playerHitLifetimeTicks, DEFAULT_PLAYER_HIT_IMPACT_LIFETIME_TICKS);
  const includePlayerHitBursts = options.includePlayerHitBursts ?? true;

  const active = new Uint8Array(capacity);
  const style = new Uint8Array(capacity);
  const startTick = new Int32Array(capacity);
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const scale = new Float32Array(capacity);
  const identityA = new Uint32Array(capacity);
  const identityB = new Uint32Array(capacity);

  // A small ring remembers slightly more identities than simultaneous slots.
  // It suppresses input arrays repeated over multiple render frames while
  // remaining bounded even during a long survivor run.
  const seenCapacity = Math.min(768, Math.max(48, capacity * 4));
  const seenA = new Uint32Array(seenCapacity);
  const seenB = new Uint32Array(seenCapacity);
  let seenCount = 0;
  let nextSeen = 0;

  const impacts: CombatImpactDescriptorBuffer = {
    count: 0,
    style: new Uint8Array(capacity),
    eventTick: new Int32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    phaseRadians: new Float32Array(capacity),
    coreScale: new Float32Array(capacity),
    sparkRadius: new Float32Array(capacity),
    ringScale: new Float32Array(capacity),
    lift: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    progress: new Float32Array(capacity),
    spinRadians: new Float32Array(capacity),
    sparkCount: new Uint8Array(capacity),
  };
  const frame: CombatImpactFrame = { tick: 0, impacts };
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
      const activeStyle = style[index]! as CombatImpactStyle;
      const age = renderTick - startTick[index]!;
      if (age < 0 || age >= lifetimeForStyle(activeStyle, normalLifetimeTicks, criticalLifetimeTicks, playerHitLifetimeTicks)) {
        active[index] = 0;
      }
    }
  }

  function findSlot(incomingStyle: CombatImpactStyle): number {
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) return index;
    }

    // A critical and player-danger read must win over a routine hit if the
    // screen is briefly saturated. Otherwise the oldest lower-priority slot is
    // replaced, which makes the policy deterministic and bounded.
    const incomingPriority = priorityForStyle(incomingStyle);
    let candidate = -1;
    let candidatePriority = Number.POSITIVE_INFINITY;
    let candidateStartTick = Number.POSITIVE_INFINITY;
    for (let index = 0; index < capacity; index++) {
      const currentStyle = style[index]! as CombatImpactStyle;
      const currentPriority = priorityForStyle(currentStyle);
      const currentStartTick = startTick[index]!;
      if (currentPriority > incomingPriority) continue;
      if (currentPriority < candidatePriority || (currentPriority === candidatePriority && currentStartTick < candidateStartTick)) {
        candidate = index;
        candidatePriority = currentPriority;
        candidateStartTick = currentStartTick;
      }
    }
    return candidate;
  }

  function addNewEvents(events: readonly CombatPresentationEventView[], renderTick: number): void {
    for (const event of events) {
      if (!isUsableEvent(event)) continue;
      const eventStyle = styleForEvent(event, includePlayerHitBursts);
      if (eventStyle === null) continue;
      const age = renderTick - Math.floor(event.tick);
      const lifetime = lifetimeForStyle(eventStyle, normalLifetimeTicks, criticalLifetimeTicks, playerHitLifetimeTicks);
      // A future event has not happened yet. Do not remember it, so a later
      // frame can accept it if the feed hands it over again.
      if (age < 0) continue;
      if (age >= lifetime) continue;

      const hashA = hashEvent(event, 0x811c9dc5);
      const hashB = hashEvent(event, 0x9e3779b9);
      if (hasSeen(hashA, hashB)) continue;
      remember(hashA, hashB);

      const slot = findSlot(eventStyle);
      if (slot < 0) continue;
      active[slot] = 1;
      style[slot] = eventStyle;
      startTick[slot] = Math.floor(event.tick);
      x[slot] = event.x;
      y[slot] = event.y;
      scale[slot] = scaleForEvent(event, eventStyle);
      identityA[slot] = hashA;
      identityB[slot] = hashB;
    }
  }

  function packActive(renderTick: number): void {
    let count = 0;
    for (let index = 0; index < capacity; index++) {
      if (active[index] === 0) continue;
      const activeStyle = style[index]! as CombatImpactStyle;
      const recipe = RECIPES[activeStyle];
      const lifetime = lifetimeForStyle(activeStyle, normalLifetimeTicks, criticalLifetimeTicks, playerHitLifetimeTicks);
      const age = Math.max(0, renderTick - startTick[index]!);
      const progress = clamp(age / lifetime, 0, 1);
      const phase = phaseForHash(identityA[index]! ^ identityB[index]!);
      const pop = Math.sin(progress * Math.PI);
      const fade = Math.pow(1 - progress, 0.72);
      const flicker = 0.9 + 0.1 * Math.sin(phase + age * 1.83);
      const baseScale = scale[index]!;

      impacts.style[count] = activeStyle;
      impacts.eventTick[count] = startTick[index]!;
      impacts.x[count] = x[index]!;
      impacts.y[count] = y[index]!;
      impacts.phaseRadians[count] = phase;
      impacts.coreScale[count] = baseScale * (1.06 + pop * (activeStyle === COMBAT_IMPACT_STYLE.criticalEnemyHit ? 0.46 : 0.3));
      impacts.sparkRadius[count] = baseScale * (0.42 + progress * (activeStyle === COMBAT_IMPACT_STYLE.criticalEnemyHit ? 1.86 : 1.32));
      impacts.ringScale[count] = baseScale * (0.3 + progress * (activeStyle === COMBAT_IMPACT_STYLE.playerHit ? 1.42 : 1.12));
      impacts.lift[count] = baseScale * (0.06 + progress * (activeStyle === COMBAT_IMPACT_STYLE.criticalEnemyHit ? 0.32 : 0.2));
      impacts.opacity[count] = fade * flicker;
      impacts.progress[count] = progress;
      impacts.spinRadians[count] = recipe.spinRadians * progress + phase;
      impacts.sparkCount[count] = recipe.sparkCount;
      count++;
    }
    impacts.count = count;
  }

  function reset(): void {
    active.fill(0);
    style.fill(0);
    startTick.fill(0);
    identityA.fill(0);
    identityB.fill(0);
    seenA.fill(0);
    seenB.fill(0);
    seenCount = 0;
    nextSeen = 0;
    impacts.count = 0;
    frame.tick = 0;
    lastRenderTick = -1;
  }

  return {
    capacity,
    normalLifetimeTicks,
    criticalLifetimeTicks,
    playerHitLifetimeTicks,
    update(events, renderTick) {
      const safeRenderTick = Math.max(0, Math.floor(finite(renderTick, 0)));
      if (safeRenderTick < lastRenderTick) reset();
      lastRenderTick = safeRenderTick;
      releaseExpired(safeRenderTick);
      addNewEvents(events, safeRenderTick);
      packActive(safeRenderTick);
      frame.tick = safeRenderTick;
      return frame;
    },
    reset,
  };
}
