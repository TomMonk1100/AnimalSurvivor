/**
 * Snapshot-owned anatomy for Gracie's real Spit Comet projectiles.
 *
 * This is deliberately separate from the trait-event signature projector:
 * Gracie emits an authoritative projectile before her cast telegraph, and a
 * long-lived projectile must never inherit a fabricated event trajectory.
 * Every descriptor below is derived from a copied current/previous projectile
 * snapshot. Impact contacts are the one exception, and only exist when an
 * authoritative resolved `gracie-spit` combat event says a hit occurred.
 */
import { COMBAT_DAMAGE_SOURCE, idSlot } from '@sim';
import type { CategorySnapshot } from '../contracts';
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';
import { easeOutCubic, envelope } from './vfx-easing';

const TAU = Math.PI * 2;
const DEFAULT_CAPACITY = 16;
const MAX_CAPACITY = 48;
const MAX_DEBRIS_PER_PROJECTILE = 3;
const DEFAULT_CORE_LIFETIME_TICKS = 4;
const DEFAULT_IMPACT_CONTACT_LIFETIME_TICKS = 10;
const HERO_SPIT_IMPACT_DEBRIS_LIFETIME_TICKS = 7;
const HERO_SPIT_IMPACT_DEBRIS_DECAY_PER_TICK = 0.84;
const MIN_CORE_LIFETIME_TICKS = 2;
const MAX_CORE_LIFETIME_TICKS = 4;
const EMPTY_COMBAT_EVENTS: readonly CombatPresentationEventView[] = Object.freeze([]);

/**
 * The body is intentionally oversized relative to its collision radius: at
 * the survivor camera it needs a roughly 56-world-unit visible long axis to
 * read as a projectile rather than the old tiny cyan dot. The card itself is
 * still placed directly on the real snapshot in the scene adapter.
 */
export const HERO_SPIT_BODY_MIN_LATERAL_SCALE = 42;
export const HERO_SPIT_BODY_MIN_FORWARD_SCALE = 56;
export const HERO_SPIT_BODY_VISUAL_FOOTPRINT = HERO_SPIT_BODY_MIN_FORWARD_SCALE;
export const HERO_SPIT_CORE_LIFETIME_TICKS = DEFAULT_CORE_LIFETIME_TICKS;
/** Two quiet drops for routine shots; a crit receives one extra, never a spray. */
export const HERO_SPIT_ROUTINE_DROPLET_COUNT = 2;
export const HERO_SPIT_CRITICAL_DROPLET_COUNT = MAX_DEBRIS_PER_PROJECTILE;
/** A resolved real hit gets a compact two-piece cool impact, three only on a crit. */
export const HERO_SPIT_IMPACT_ROUTINE_DROPLET_COUNT = 2;
export const HERO_SPIT_IMPACT_CRITICAL_DROPLET_COUNT = MAX_DEBRIS_PER_PROJECTILE;
/** Bounded head offset makes the launch read as a muzzle, not hero overlap. */
export const HERO_SPIT_MUZZLE_OFFSET_RATIO = 0.29;
/** Keeps the tiny normal receiver visibly ahead of, but still attached to, the real head. */
export const HERO_SPIT_TRAVEL_CONTACT_LEAD_RATIO = 0.1;
/** Production-plan normal-blend ceiling for the quiet ground anchor. */
export const HERO_SPIT_GROUND_CONTACT_OPACITY_CAP = 0.25;

export const HERO_SPIT_CONTACT_KIND = Object.freeze({
  travel: 1,
  impact: 2,
} as const);

export type HeroSpitContactKind =
  (typeof HERO_SPIT_CONTACT_KIND)[keyof typeof HERO_SPIT_CONTACT_KIND];

export interface HeroSpitProjectileSignatureOptions {
  /** Fixed maximum simultaneous real heroSpit projectiles admitted to anatomy lanes. */
  readonly capacity?: number;
  /** Fixed normal-blend tail lane; three routine flakes or seven critical flakes each. */
  readonly debrisCapacity?: number;
  /** The hot additive core is constrained to two through four simulation ticks. */
  readonly coreLifetimeTicks?: number;
  /** Retained resolved-hit contact life, expressed in simulation ticks. */
  readonly impactContactLifetimeTicks?: number;
  /** Source pool capacity for generation-safe identity tables. */
  readonly projectileCapacity: number;
}

export interface HeroSpitCoreDescriptorBuffer {
  count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
}

export interface HeroSpitDebrisDescriptorBuffer {
  count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly lift: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
}

export interface HeroSpitGroundContactDescriptorBuffer {
  count: number;
  readonly kind: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly scale: Float32Array;
  readonly opacity: Float32Array;
  readonly yawRadians: Float32Array;
}

export interface HeroSpitProjectileSignatureFrame {
  tick: number;
  /** Hot additive core; it is never a duplicate telegraph/card trajectory. */
  readonly cores: HeroSpitCoreDescriptorBuffer;
  /** Seeded normal-blend tail flakes following the real projectile snapshot. */
  readonly debris: HeroSpitDebrisDescriptorBuffer;
  /** Quiet live travel anchor plus resolved-hit contacts only. */
  readonly groundContacts: HeroSpitGroundContactDescriptorBuffer;
}

export interface HeroSpitProjectileSignaturePresentation {
  readonly capacity: number;
  readonly debrisCapacity: number;
  readonly coreLifetimeTicks: number;
  readonly impactContactLifetimeTicks: number;
  update(
    previous: CategorySnapshot,
    current: CategorySnapshot,
    alpha: number,
    currentTick: number,
    combatEvents?: readonly CombatPresentationEventView[],
  ): HeroSpitProjectileSignatureFrame;
  reset(): void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Shared with the scene body card so the attached anatomy never drifts from it. */
export function heroSpitBodyLateralScaleForRadius(radius: number): number {
  const baseScale = Math.max(3.6, finite(radius) * 2.25);
  return Math.max(HERO_SPIT_BODY_MIN_LATERAL_SCALE, baseScale * 1.8);
}

/** Shared long-axis scale and tail footprint for a real copied projectile radius. */
export function heroSpitBodyForwardScaleForRadius(radius: number): number {
  const baseScale = Math.max(3.6, finite(radius) * 2.25);
  return Math.max(HERO_SPIT_BODY_MIN_FORWARD_SCALE, baseScale * 2.25);
}

function positiveInteger(value: number, fallback: number, maximum: number): number {
  return clamp(Math.floor(finite(value, fallback)), 1, maximum);
}

function normalizedCoreLifetime(value: number | undefined): number {
  return clamp(
    Math.floor(finite(value ?? DEFAULT_CORE_LIFETIME_TICKS, DEFAULT_CORE_LIFETIME_TICKS)),
    MIN_CORE_LIFETIME_TICKS,
    MAX_CORE_LIFETIME_TICKS,
  );
}

function normalizedImpactLifetime(value: number | undefined): number {
  return clamp(
    Math.floor(finite(value ?? DEFAULT_IMPACT_CONTACT_LIFETIME_TICKS, DEFAULT_IMPACT_CONTACT_LIFETIME_TICKS)),
    2,
    20,
  );
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function isHeroSpit(snapshot: CategorySnapshot, index: number): boolean {
  return snapshot.role[index] === 0
    && snapshot.source[index] === COMBAT_DAMAGE_SOURCE.heroSpit;
}

function mixHash(seed: number, value: number): number {
  let hash = (seed ^ value) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return hash;
}

function mixNumber(seed: number, value: number): number {
  const scaled = Math.round(finite(value) * 64);
  return mixHash(seed, scaled);
}

function mixText(seed: number, value: string): number {
  let hash = seed;
  for (let index = 0; index < value.length; index++) {
    hash = mixHash(hash, value.charCodeAt(index));
  }
  return hash;
}

function impactKey(event: CombatPresentationEventView): number {
  let hash = 0x9e3779b9;
  hash = mixHash(hash, Math.floor(finite(event.tick)));
  hash = mixText(hash, event.sourceId);
  hash = typeof event.targetId === 'string'
    ? mixText(hash, event.targetId)
    : mixNumber(hash, event.targetId);
  hash = mixNumber(hash, event.x);
  hash = mixNumber(hash, event.y);
  hash = mixNumber(hash, event.amount);
  hash = mixHash(hash, event.critical ? 1 : 0);
  return hash === 0 ? 1 : hash;
}

function seededUnit(seed: number): number {
  const value = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) >>> 0;
  return value / 0x1_0000_0000;
}

/**
 * A compact snapshot projector with fully retained typed-array state. It never
 * emits a body card: PlayCanvas retains one body card per real projectile;
 * these descriptors merely make that card anatomically legible.
 */
export function createHeroSpitProjectileSignaturePresentation(
  options: HeroSpitProjectileSignatureOptions,
): HeroSpitProjectileSignaturePresentation {
  const projectileCapacity = positiveInteger(options.projectileCapacity, 1, 65_535);
  const capacity = positiveInteger(options.capacity ?? DEFAULT_CAPACITY, DEFAULT_CAPACITY, MAX_CAPACITY);
  const debrisCapacity = positiveInteger(
    options.debrisCapacity ?? capacity * MAX_DEBRIS_PER_PROJECTILE,
    capacity * MAX_DEBRIS_PER_PROJECTILE,
    MAX_CAPACITY * MAX_DEBRIS_PER_PROJECTILE,
  );
  const coreLifetimeTicks = normalizedCoreLifetime(options.coreLifetimeTicks);
  const impactContactLifetimeTicks = normalizedImpactLifetime(options.impactContactLifetimeTicks);
  const previousIndexBySlot = new Int32Array(projectileCapacity);
  const previousStampBySlot = new Uint32Array(projectileCapacity);
  let previousLookupStamp = 0;
  const trackedIdBySlot = new Int32Array(projectileCapacity);
  const trackedActiveBySlot = new Uint8Array(projectileCapacity);
  const trackedStartTickBySlot = new Int32Array(projectileCapacity);
  const directionXBySlot = new Float32Array(projectileCapacity);
  const directionYBySlot = new Float32Array(projectileCapacity);
  const directionKnownBySlot = new Uint8Array(projectileCapacity);
  const impactActive = new Uint8Array(capacity);
  const impactTick = new Int32Array(capacity);
  const impactX = new Float32Array(capacity);
  const impactY = new Float32Array(capacity);
  const impactCritical = new Uint8Array(capacity);
  const impactSeed = new Uint32Array(capacity);
  const seenImpactKeys = new Uint32Array(capacity * 3);
  let seenImpactCount = 0;
  let seenImpactCursor = 0;
  let lastTick = -1;

  const cores: HeroSpitCoreDescriptorBuffer = {
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    opacity: new Float32Array(capacity),
    yawRadians: new Float32Array(capacity),
  };
  const debris: HeroSpitDebrisDescriptorBuffer = {
    count: 0,
    x: new Float32Array(debrisCapacity),
    y: new Float32Array(debrisCapacity),
    scale: new Float32Array(debrisCapacity),
    lift: new Float32Array(debrisCapacity),
    opacity: new Float32Array(debrisCapacity),
    yawRadians: new Float32Array(debrisCapacity),
  };
  const groundContacts: HeroSpitGroundContactDescriptorBuffer = {
    count: 0,
    kind: new Uint8Array(capacity * 2),
    x: new Float32Array(capacity * 2),
    y: new Float32Array(capacity * 2),
    scale: new Float32Array(capacity * 2),
    opacity: new Float32Array(capacity * 2),
    yawRadians: new Float32Array(capacity * 2),
  };
  const frame: HeroSpitProjectileSignatureFrame = { tick: 0, cores, debris, groundContacts };

  function reset(): void {
    previousIndexBySlot.fill(0);
    previousStampBySlot.fill(0);
    previousLookupStamp = 0;
    trackedIdBySlot.fill(0);
    trackedActiveBySlot.fill(0);
    trackedStartTickBySlot.fill(0);
    directionXBySlot.fill(0);
    directionYBySlot.fill(0);
    directionKnownBySlot.fill(0);
    impactActive.fill(0);
    impactTick.fill(0);
    impactX.fill(0);
    impactY.fill(0);
    impactCritical.fill(0);
    impactSeed.fill(0);
    seenImpactKeys.fill(0);
    seenImpactCount = 0;
    seenImpactCursor = 0;
    cores.count = 0;
    debris.count = 0;
    groundContacts.count = 0;
    lastTick = -1;
  }

  function nextPreviousLookupStamp(): number {
    previousLookupStamp = (previousLookupStamp + 1) >>> 0;
    if (previousLookupStamp === 0) {
      previousStampBySlot.fill(0);
      previousLookupStamp = 1;
    }
    return previousLookupStamp;
  }

  function hasSeenImpact(key: number): boolean {
    for (let index = 0; index < seenImpactCount; index++) {
      if (seenImpactKeys[index] === key) return true;
    }
    return false;
  }

  function retainSeenImpact(key: number): void {
    if (seenImpactCount < seenImpactKeys.length) {
      seenImpactKeys[seenImpactCount++] = key;
      return;
    }
    seenImpactKeys[seenImpactCursor] = key;
    seenImpactCursor = (seenImpactCursor + 1) % seenImpactKeys.length;
  }

  function admissionSlotForImpact(critical: boolean): number {
    for (let index = 0; index < impactActive.length; index++) {
      if (impactActive[index] === 0) return index;
    }
    let selected = 0;
    let selectedTick = Number.POSITIVE_INFINITY;
    for (let index = 0; index < impactActive.length; index++) {
      // An incoming critical may replace an older routine contact, but a
      // routine impact never displaces a retained critical under pressure.
      if (!critical && impactCritical[index] === 1) continue;
      const tick = impactTick[index]!;
      if (tick < selectedTick) {
        selected = index;
        selectedTick = tick;
      }
    }
    return selectedTick === Number.POSITIVE_INFINITY ? -1 : selected;
  }

  function absorbImpactEvents(events: readonly CombatPresentationEventView[], tick: number): void {
    for (let index = 0; index < events.length; index++) {
      const event = events[index]!;
      if (event.kind !== 'enemyHit' || event.sourceId !== 'gracie-spit') continue;
      const eventTick = Math.floor(finite(event.tick, tick));
      if (eventTick > tick || tick - eventTick > impactContactLifetimeTicks) continue;
      const key = impactKey(event);
      if (hasSeenImpact(key)) continue;
      const slot = admissionSlotForImpact(event.critical);
      if (slot < 0) continue;
      retainSeenImpact(key);
      impactActive[slot] = 1;
      impactTick[slot] = eventTick;
      impactX[slot] = finite(event.x);
      impactY[slot] = finite(event.y);
      impactCritical[slot] = event.critical ? 1 : 0;
      impactSeed[slot] = key;
    }
  }

  function updateDirection(
    current: CategorySnapshot,
    currentIndex: number,
    previous: CategorySnapshot,
    previousIndex: number,
    slot: number,
  ): void {
    let x = finite(current.velocityX[currentIndex]!);
    let y = finite(current.velocityY[currentIndex]!);
    if (Math.hypot(x, y) <= 1e-5 && previousIndex >= 0) {
      x = finite(current.x[currentIndex]!) - finite(previous.x[previousIndex]!);
      y = finite(current.y[currentIndex]!) - finite(previous.y[previousIndex]!);
    }
    const length = Math.hypot(x, y);
    if (length > 1e-5) {
      const normalizedX = x / length;
      const normalizedY = y / length;
      directionXBySlot[slot] = normalizedX;
      directionYBySlot[slot] = normalizedY;
      directionKnownBySlot[slot] = 1;
      return;
    }
    if (directionKnownBySlot[slot] === 1) {
      return;
    }
    directionXBySlot[slot] = 1;
    directionYBySlot[slot] = 0;
    directionKnownBySlot[slot] = 1;
  }

  function writeCore(
    x: number,
    y: number,
    directionX: number,
    directionY: number,
    visualFootprint: number,
    ageTicks: number,
  ): void {
    if (ageTicks < 0 || ageTicks >= coreLifetimeTicks || cores.count >= capacity) return;
    const index = cores.count++;
    const progress = ageTicks / coreLifetimeTicks;
    const entry = easeOutCubic((ageTicks + 1) / coreLifetimeTicks);
    const release = 1 - progress * progress;
    // The body remains centered on the authoritative projectile snapshot in
    // the scene. Only this compact hot point sits ahead of that anchor, so a
    // new cast reads as a muzzle release instead of fusing into Gracie.
    const headOffset = visualFootprint * HERO_SPIT_MUZZLE_OFFSET_RATIO;
    cores.x[index] = x + directionX * headOffset;
    cores.y[index] = y + directionY * headOffset;
    cores.scale[index] = visualFootprint * (0.17 + 0.06 * entry);
    cores.opacity[index] = clamp(0.82 * entry * release, 0, 0.82);
    cores.yawRadians[index] = Math.atan2(directionY, directionX);
  }

  function writeTail(
    projectileId: number,
    x: number,
    y: number,
    directionX: number,
    directionY: number,
    visualFootprint: number,
    critical: boolean,
    ageTicks: number,
  ): void {
    const count = critical ? HERO_SPIT_CRITICAL_DROPLET_COUNT : HERO_SPIT_ROUTINE_DROPLET_COUNT;
    const entry = easeOutCubic(Math.min(1, (ageTicks + 1) / 4));
    for (let fragment = 0; fragment < count && debris.count < debrisCapacity; fragment++) {
      const index = debris.count++;
      const seed = mixHash(projectileId >>> 0, fragment + 1);
      // Put the two routine flecks on opposite shoulders of the true body
      // tail. The signed lane makes them read as an intentional pair rather
      // than two random ground specks, while every coordinate still derives
      // from this exact copied projectile snapshot.
      const lane = count <= 1 ? 0 : fragment / (count - 1) * 2 - 1;
      const lateral = (lane * 0.3 + (seededUnit(seed) - 0.5) * 0.09)
        * visualFootprint;
      const distance = visualFootprint * (0.56 + fragment * 0.18 + seededUnit(seed ^ 0xa511e9b3) * 0.05);
      const sideX = -directionY;
      const sideY = directionX;
      const angle = Math.atan2(directionY, directionX);
      debris.x[index] = x - directionX * distance + sideX * lateral;
      debris.y[index] = y - directionY * distance + sideY * lateral;
      debris.scale[index] = visualFootprint * (0.105 + (fragment % 2) * 0.016);
      debris.lift[index] = 0.11 + visualFootprint * (0.009 + (fragment % 2) * 0.002);
      debris.opacity[index] = clamp((critical ? 0.6 : 0.56) * entry * (0.94 - fragment * 0.07), 0, 0.6);
      debris.yawRadians[index] = angle + (seededUnit(seed ^ 0x7f4a7c15) - 0.5) * 0.5;
    }
  }

  function writeTravelContact(
    x: number,
    y: number,
    directionX: number,
    directionY: number,
    visualFootprint: number,
    ageTicks: number,
  ): void {
    if (groundContacts.count >= capacity * 2) return;
    const index = groundContacts.count++;
    const entry = easeOutCubic(Math.min(1, (ageTicks + 1) / 4));
    groundContacts.kind[index] = HERO_SPIT_CONTACT_KIND.travel;
    // The tiny cool oval lives directly under the real snapshot-owned comet
    // head, matching the compact core's bounded offset. It does not predict a
    // future location or turn a projectile into a second area effect.
    const headOffset = visualFootprint * (HERO_SPIT_MUZZLE_OFFSET_RATIO + HERO_SPIT_TRAVEL_CONTACT_LEAD_RATIO);
    groundContacts.x[index] = x + directionX * headOffset;
    groundContacts.y[index] = y + directionY * headOffset;
    // The texture itself is an oval. Keep this anchor small enough to read as
    // a cool contact shadow rather than a second area effect under Gracie.
    groundContacts.scale[index] = visualFootprint * (0.27 + 0.025 * entry);
    groundContacts.opacity[index] = clamp(0.25 * entry, 0, HERO_SPIT_GROUND_CONTACT_OPACITY_CAP);
    groundContacts.yawRadians[index] = Math.atan2(directionY, directionX);
  }

  function writeImpactAnatomy(tick: number): void {
    for (let slot = 0; slot < impactActive.length; slot++) {
      if (impactActive[slot] === 0) continue;
      const ageTicks = tick - impactTick[slot]!;
      if (ageTicks < 0 || ageTicks > HERO_SPIT_IMPACT_DEBRIS_LIFETIME_TICKS) continue;
      const critical = impactCritical[slot] === 1;
      const progress = clamp(ageTicks / HERO_SPIT_IMPACT_DEBRIS_LIFETIME_TICKS, 0, 1);
      const entry = easeOutCubic(Math.min(1, (ageTicks + 1) / HERO_SPIT_CORE_LIFETIME_TICKS));

      // This is an actual resolved `gracie-spit` position, not a guessed
      // terminal point. A four-tick cool core gives the contact a visible
      // local peak even when the long live body card is still on screen.
      if (ageTicks < coreLifetimeTicks && cores.count < capacity) {
        const index = cores.count++;
        const release = 1 - (ageTicks / coreLifetimeTicks) ** 2;
        cores.x[index] = impactX[slot]!;
        cores.y[index] = impactY[slot]!;
        cores.scale[index] = HERO_SPIT_BODY_VISUAL_FOOTPRINT * (0.24 + 0.09 * entry);
        cores.opacity[index] = clamp((critical ? 0.84 : 0.76) * entry * release, 0, 0.84);
        cores.yawRadians[index] = seededUnit(impactSeed[slot]!) * TAU;
      }

      const count = critical
        ? HERO_SPIT_IMPACT_CRITICAL_DROPLET_COUNT
        : HERO_SPIT_IMPACT_ROUTINE_DROPLET_COUNT;
      const fade = envelope(
        (ageTicks + 0.5) / (HERO_SPIT_IMPACT_DEBRIS_LIFETIME_TICKS + 0.5),
        0.05,
        0.58,
      );
      const distanceDecay = (1 - Math.pow(HERO_SPIT_IMPACT_DEBRIS_DECAY_PER_TICK, ageTicks + 1))
        / (1 - HERO_SPIT_IMPACT_DEBRIS_DECAY_PER_TICK);
      for (let fragment = 0; fragment < count && debris.count < debrisCapacity; fragment++) {
        const index = debris.count++;
        const seed = mixHash(impactSeed[slot]!, fragment + 1);
        const angle = seededUnit(seed) * TAU;
        const travel = HERO_SPIT_BODY_VISUAL_FOOTPRINT
          * (0.05 + seededUnit(seed ^ 0xa511e9b3) * 0.026) * distanceDecay;
        const distance = HERO_SPIT_BODY_VISUAL_FOOTPRINT * (0.18 + fragment * 0.1) + travel;
        const launchLift = HERO_SPIT_BODY_VISUAL_FOOTPRINT
          * (0.022 + seededUnit(seed ^ 0x7f4a7c15) * 0.012);
        const gravity = HERO_SPIT_BODY_VISUAL_FOOTPRINT * 0.0018 * ageTicks * ageTicks;
        debris.x[index] = impactX[slot]! + Math.cos(angle) * distance;
        debris.y[index] = impactY[slot]! + Math.sin(angle) * distance;
        debris.scale[index] = HERO_SPIT_BODY_VISUAL_FOOTPRINT * (0.095 + (fragment % 2) * 0.016);
        debris.lift[index] = Math.max(0.04, 0.12 + launchLift - gravity);
        debris.opacity[index] = clamp((critical ? 0.6 : 0.56) * fade * (1 - progress * 0.16), 0, 0.6);
        debris.yawRadians[index] = angle + ageTicks * (0.12 + seededUnit(seed ^ 0x9e3779b9) * 0.1);
      }
    }
  }

  function writeImpactContacts(tick: number): void {
    for (let slot = 0; slot < impactActive.length; slot++) {
      if (impactActive[slot] === 0) continue;
      const ageTicks = tick - impactTick[slot]!;
      if (ageTicks < 0 || ageTicks > impactContactLifetimeTicks) {
        impactActive[slot] = 0;
        continue;
      }
      if (groundContacts.count >= capacity * 2) return;
      const index = groundContacts.count++;
      const progress = clamp(ageTicks / impactContactLifetimeTicks, 0, 1);
      const envelopeOpacity = envelope(progress === 0 ? 0.06 : progress, 0.06, 0.58);
      groundContacts.kind[index] = HERO_SPIT_CONTACT_KIND.impact;
      groundContacts.x[index] = impactX[slot]!;
      groundContacts.y[index] = impactY[slot]!;
      groundContacts.scale[index] = HERO_SPIT_BODY_VISUAL_FOOTPRINT
        * (impactCritical[slot] === 1 ? 0.42 : 0.36)
        * (0.94 + 0.16 * easeOutCubic(progress));
      groundContacts.opacity[index] = clamp(
        envelopeOpacity * (impactCritical[slot] === 1 ? 0.25 : 0.25),
        0,
        HERO_SPIT_GROUND_CONTACT_OPACITY_CAP,
      );
      groundContacts.yawRadians[index] = (slot * 0.71 + impactTick[slot]! * 0.13) % TAU;
    }
  }

  return {
    capacity,
    debrisCapacity,
    coreLifetimeTicks,
    impactContactLifetimeTicks,
    update(
      previous,
      current,
      alpha,
      currentTick,
      combatEvents = EMPTY_COMBAT_EVENTS,
    ): HeroSpitProjectileSignatureFrame {
      const tick = Math.floor(finite(currentTick));
      if (tick < lastTick) reset();
      lastTick = tick;
      const safeAlpha = clamp(finite(alpha), 0, 1);
      const previousStamp = nextPreviousLookupStamp();
      for (let index = 0; index < previous.count; index++) {
        const slot = idSlot(previous.id[index]!);
        if (slot >= projectileCapacity) continue;
        previousIndexBySlot[slot] = index;
        previousStampBySlot[slot] = previousStamp;
      }
      cores.count = 0;
      debris.count = 0;
      groundContacts.count = 0;
      absorbImpactEvents(combatEvents, tick);

      for (let index = 0; index < current.count; index++) {
        if (!isHeroSpit(current, index)) continue;
        const projectileId = current.id[index]!;
        const slot = idSlot(projectileId);
        if (slot >= projectileCapacity) continue;
        const previousIndex = previousStampBySlot[slot] === previousStamp
          && previous.id[previousIndexBySlot[slot]!] === projectileId
          ? previousIndexBySlot[slot]!
          : -1;
        if (trackedActiveBySlot[slot] === 0 || trackedIdBySlot[slot] !== projectileId) {
          trackedIdBySlot[slot] = projectileId;
          trackedActiveBySlot[slot] = 1;
          trackedStartTickBySlot[slot] = tick;
          directionKnownBySlot[slot] = 0;
        }
        const ageTicks = Math.max(0, tick - trackedStartTickBySlot[slot]!);
        const x = previousIndex >= 0
          ? lerp(previous.x[previousIndex]!, current.x[index]!, safeAlpha)
          : finite(current.x[index]!);
        const y = previousIndex >= 0
          ? lerp(previous.y[previousIndex]!, current.y[index]!, safeAlpha)
          : finite(current.y[index]!);
        updateDirection(current, index, previous, previousIndex, slot);
        const directionX = directionXBySlot[slot]!;
        const directionY = directionYBySlot[slot]!;
        const visualFootprint = heroSpitBodyForwardScaleForRadius(current.radius[index]!);
        const critical = current.critical[index] === 1;
        writeCore(x, y, directionX, directionY, visualFootprint, ageTicks);
        writeTail(projectileId, x, y, directionX, directionY, visualFootprint, critical, ageTicks);
        writeTravelContact(x, y, directionX, directionY, visualFootprint, ageTicks);
      }
      writeImpactAnatomy(tick);
      writeImpactContacts(tick);
      frame.tick = tick;
      return frame;
    },
    reset,
  };
}
