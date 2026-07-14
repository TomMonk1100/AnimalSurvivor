/**
 * Deterministic renderer-only impact shake.
 *
 * This policy deliberately consumes copied combat event views. It never slows
 * the fixed tick, alters camera follow targets, or feeds a result back to the
 * simulation. The scene applies the returned offset after its normal follow
 * clamp, which keeps the shake legible without changing world navigation.
 */
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';

export const CAMERA_IMPACT_SHAKE_DURATION_TICKS = 5;
export const CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS = 20;
export const CAMERA_IMPACT_SHAKE_MAX_WORLD_UNITS = 2;
export const CAMERA_IMPACT_SHAKE_CRIT_HISTORY_CAPACITY = 32;

export interface CameraImpactShakeFrame {
  tick: number;
  x: number;
  y: number;
  active: boolean;
}

export interface CameraImpactShakePresentation {
  update(events: readonly CombatPresentationEventView[], renderTick: number): CameraImpactShakeFrame;
  reset(): void;
}

const SEEN_EVENT_CAPACITY = 192;

function normalizedTick(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
}

function mixHash(hash: number, value: number): number {
  return Math.imul(hash ^ (value >>> 0), 0x01000193) >>> 0;
}

function mixText(hash: number, value: string): number {
  let result = mixHash(hash, value.length);
  for (let index = 0; index < value.length; index++) result = mixHash(result, value.charCodeAt(index));
  return result;
}

function eventIdentity(event: CombatPresentationEventView): number {
  let hash = mixText(0x811c9dc5, event.kind);
  hash = mixHash(hash, normalizedTick(event.tick));
  hash = mixHash(hash, Math.round(event.amount * 1000));
  hash = mixHash(hash, typeof event.targetId === 'number' ? event.targetId : mixText(0x9e3779b9, event.targetId));
  hash = mixText(hash, event.sourceId);
  return mixHash(hash, event.critical ? 1 : 0);
}

function usableEvent(event: CombatPresentationEventView): boolean {
  return Number.isFinite(event.tick) && Number.isFinite(event.amount);
}

function isCriticalEnemyHit(event: CombatPresentationEventView): boolean {
  return event.kind === 'enemyHit' && event.critical && event.amount > 0;
}

function phaseForIdentity(identity: number): number {
  return (identity >>> 0) / 0x1_0000_0000 * Math.PI * 2;
}

/**
 * A small bounded history lets only the top quartile of recent crit amounts
 * disturb the framing. Insertion sort is over 32 retained values at most and
 * uses a typed scratch buffer allocated once at construction.
 */
function percentile75(values: Float32Array, count: number, scratch: Float32Array): number {
  if (count <= 0) return 0;
  for (let index = 0; index < count; index++) scratch[index] = values[index]!;
  for (let index = 1; index < count; index++) {
    const value = scratch[index]!;
    let cursor = index - 1;
    while (cursor >= 0 && scratch[cursor]! > value) {
      scratch[cursor + 1] = scratch[cursor]!;
      cursor--;
    }
    scratch[cursor + 1] = value;
  }
  return scratch[Math.floor((count - 1) * 0.75)]!;
}

export function createCameraImpactShakePresentation(): CameraImpactShakePresentation {
  const seen = new Uint32Array(SEEN_EVENT_CAPACITY);
  let seenCount = 0;
  let nextSeen = 0;
  const criticalAmounts = new Float32Array(CAMERA_IMPACT_SHAKE_CRIT_HISTORY_CAPACITY);
  const criticalScratch = new Float32Array(CAMERA_IMPACT_SHAKE_CRIT_HISTORY_CAPACITY);
  let criticalCount = 0;
  let nextCritical = 0;
  const frame: CameraImpactShakeFrame = { tick: 0, x: 0, y: 0, active: false };
  let lastRenderTick = -1;
  let lastShakeTick = -CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS;
  let activeStartTick = -1;
  let activeAmplitude = 0;
  let activePhase = 0;

  function hasSeen(identity: number): boolean {
    for (let index = 0; index < seenCount; index++) {
      if (seen[index] === identity) return true;
    }
    return false;
  }

  function remember(identity: number): void {
    seen[nextSeen] = identity;
    nextSeen = (nextSeen + 1) % SEEN_EVENT_CAPACITY;
    if (seenCount < SEEN_EVENT_CAPACITY) seenCount++;
  }

  function rememberCritical(amount: number): void {
    criticalAmounts[nextCritical] = amount;
    nextCritical = (nextCritical + 1) % CAMERA_IMPACT_SHAKE_CRIT_HISTORY_CAPACITY;
    if (criticalCount < CAMERA_IMPACT_SHAKE_CRIT_HISTORY_CAPACITY) criticalCount++;
  }

  function startShake(eventTick: number, amplitude: number, identity: number): void {
    if (eventTick - lastShakeTick < CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS) return;
    lastShakeTick = eventTick;
    activeStartTick = eventTick;
    activeAmplitude = Math.min(CAMERA_IMPACT_SHAKE_MAX_WORLD_UNITS, Math.max(0, amplitude));
    activePhase = phaseForIdentity(identity);
  }

  function writeFrame(tick: number): void {
    const age = tick - activeStartTick;
    if (age < 0 || age >= CAMERA_IMPACT_SHAKE_DURATION_TICKS || activeAmplitude <= 0) {
      frame.x = 0;
      frame.y = 0;
      frame.active = false;
      return;
    }

    const release = Math.pow(1 - age / CAMERA_IMPACT_SHAKE_DURATION_TICKS, 1.35);
    const angle = activePhase + age * 2.35;
    // The scalar remains within [0.42, 1], so the vector magnitude cannot
    // exceed the two-world-unit hard cap even at tick zero.
    const microPulse = 0.71 + 0.29 * Math.cos(activePhase * 0.5 + age * 3.1);
    const magnitude = activeAmplitude * release * microPulse;
    frame.x = Math.cos(angle) * magnitude;
    frame.y = Math.sin(angle) * magnitude;
    frame.active = magnitude > 1e-4;
  }

  function reset(): void {
    seen.fill(0);
    seenCount = 0;
    nextSeen = 0;
    criticalAmounts.fill(0);
    criticalScratch.fill(0);
    criticalCount = 0;
    nextCritical = 0;
    lastRenderTick = -1;
    lastShakeTick = -CAMERA_IMPACT_SHAKE_GLOBAL_RATE_LIMIT_TICKS;
    activeStartTick = -1;
    activeAmplitude = 0;
    activePhase = 0;
    frame.tick = 0;
    frame.x = 0;
    frame.y = 0;
    frame.active = false;
  }

  return {
    update(events, renderTick) {
      const tick = normalizedTick(renderTick);
      if (tick < lastRenderTick) reset();
      lastRenderTick = tick;

      for (const event of events) {
        if (!usableEvent(event)) continue;
        const eventTick = normalizedTick(event.tick);
        if (eventTick > tick) continue;
        const identity = eventIdentity(event);
        if (hasSeen(identity)) continue;
        remember(identity);

        if (isCriticalEnemyHit(event)) {
          const threshold = percentile75(criticalAmounts, criticalCount, criticalScratch);
          const qualifies = criticalCount < 4 || event.amount >= threshold;
          // Record after measuring the percentile so a new outlier does not
          // lower its own admission bar.
          rememberCritical(event.amount);
          if (qualifies) startShake(eventTick, 1.25, identity);
        } else if (event.kind === 'playerHit') {
          startShake(eventTick, 1.8, identity);
        }
      }

      writeFrame(tick);
      frame.tick = tick;
      return frame;
    },
    reset,
  };
}
