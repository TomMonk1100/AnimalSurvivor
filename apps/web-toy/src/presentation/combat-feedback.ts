/**
 * Renderer-only combat feedback projected from two adjacent app-owned
 * snapshots. This module deliberately knows nothing about PlayCanvas, DOM, or
 * live simulation pools: all of its output is a small immutable description a
 * renderer may turn into flashes, rings, decals, or HUD feedback.
 *
 * A single transition yields at most one cue of each kind. That coalesces
 * burst/projectile pressure before it reaches presentation code and keeps the
 * output bounded at five records per simulation tick.
 */
import type { CategorySnapshot, RenderSnapshot } from '../contracts';

export type CombatFeedbackCueKind =
  | 'player-death'
  | 'player-hit'
  | 'attack'
  | 'pickup'
  | 'enemy-death';

/** All cue lifetimes are fixed simulation ticks; no wall-clock time is read. */
export const COMBAT_FEEDBACK_LIFETIME_TICKS: Readonly<Record<CombatFeedbackCueKind, number>> = Object.freeze({
  'player-death': 90,
  'player-hit': 14,
  attack: 8,
  pickup: 10,
  'enemy-death': 16,
});

/**
 * The default matches the current simulation's 40-unit pickup range. A caller
 * using a different simulation config can pass its player.pickupRadius below
 * without changing the frozen app snapshot contract.
 */
export const DEFAULT_PICKUP_COLLECTION_RADIUS = 40;

/** A compact, immutable renderer instruction. `expiresAtTick` is exclusive. */
export interface CombatFeedbackCue {
  /** Simulation tick at which this feedback was observed. */
  readonly tick: number;
  readonly kind: CombatFeedbackCueKind;
  /** World-space position from the app-owned render snapshots. */
  readonly x: number;
  readonly y: number;
  /** Readability weight in [1, 4]; coalesced events grow sub-linearly. */
  readonly intensity: number;
  /** Deterministic duration measured in simulation ticks. */
  readonly lifetimeTicks: number;
  /** Exclusive end tick: active while the render tick is below this value. */
  readonly expiresAtTick: number;
}

/** Immutable cue collection for one current render snapshot. */
export interface CombatFeedbackSnapshot {
  readonly tick: number;
  readonly cues: readonly CombatFeedbackCue[];
}

export interface CombatFeedbackProjectorOptions {
  /** Pickup collection radius in world units; defaults to the current sim's 40. */
  readonly pickupCollectionRadius?: number;
}

const EMPTY_CUES: readonly CombatFeedbackCue[] = Object.freeze([]);
const MAX_INTENSITY = 4;
const PLAYER_HIT_DAMAGE_UNIT = 10;

interface PositionAggregate {
  readonly count: number;
  readonly x: number;
  readonly y: number;
}

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

function resolvePickupCollectionRadius(options: CombatFeedbackProjectorOptions | undefined): number {
  const radius = options?.pickupCollectionRadius ?? DEFAULT_PICKUP_COLLECTION_RADIUS;
  requireNonNegativeFinite('pickupCollectionRadius', radius);
  return radius;
}

function idsIn(snapshot: CategorySnapshot): Set<number> {
  const ids = new Set<number>();
  for (let index = 0; index < snapshot.count; index++) {
    ids.add(snapshot.id[index]!);
  }
  return ids;
}

function countNew(current: CategorySnapshot, previous: CategorySnapshot): number {
  const previousIds = idsIn(previous);
  let count = 0;
  for (let index = 0; index < current.count; index++) {
    if (!previousIds.has(current.id[index]!)) count++;
  }
  return count;
}

function aggregateMissing(
  previous: CategorySnapshot,
  current: CategorySnapshot,
  include: (index: number) => boolean,
): PositionAggregate | null {
  const currentIds = idsIn(current);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < previous.count; index++) {
    if (currentIds.has(previous.id[index]!) || !include(index)) continue;
    count++;
    sumX += previous.x[index]!;
    sumY += previous.y[index]!;
  }
  return count === 0 ? null : { count, x: sumX / count, y: sumY / count };
}

function coalescedIntensity(count: number): number {
  // Square-root growth lets a large burst read stronger without making it
  // visually noisier than a player hit or terminal death.
  return Math.min(MAX_INTENSITY, Math.max(1, Math.sqrt(count)));
}

function createCue(
  tick: number,
  kind: CombatFeedbackCueKind,
  x: number,
  y: number,
  intensity: number,
): CombatFeedbackCue {
  const lifetimeTicks = COMBAT_FEEDBACK_LIFETIME_TICKS[kind];
  return Object.freeze({
    tick,
    kind,
    x,
    y,
    intensity,
    lifetimeTicks,
    expiresAtTick: tick + lifetimeTicks,
  });
}

function freezeSnapshot(tick: number, cues: CombatFeedbackCue[] | null): CombatFeedbackSnapshot {
  return Object.freeze({
    tick,
    cues: cues === null ? EMPTY_CUES : Object.freeze(cues),
  });
}

/**
 * Derives coalesced renderer feedback from one fixed-tick transition. The
 * output priority is player death, player hit, attack, pickup, enemy death;
 * that deterministic order lets a fixed-capacity consumer preserve the most
 * important signals when it is full.
 */
export function projectCombatFeedback(
  previous: RenderSnapshot,
  current: RenderSnapshot,
  options?: CombatFeedbackProjectorOptions,
): CombatFeedbackSnapshot {
  const pickupCollectionRadius = resolvePickupCollectionRadius(options);
  const tick = current.tick;
  let cues: CombatFeedbackCue[] | null = null;
  const add = (cue: CombatFeedbackCue): void => {
    (cues ??= []).push(cue);
  };

  if (previous.playerAlive && !current.playerAlive) {
    add(createCue(tick, 'player-death', current.playerX, current.playerY, MAX_INTENSITY));
  }

  if (current.playerHp < previous.playerHp) {
    const damage = previous.playerHp - current.playerHp;
    add(createCue(
      tick,
      'player-hit',
      current.playerX,
      current.playerY,
      Math.min(MAX_INTENSITY, Math.max(1, damage / PLAYER_HIT_DAMAGE_UNIT)),
    ));
  }

  const newProjectiles = countNew(current.projectiles, previous.projectiles);
  if (newProjectiles > 0) {
    // Snapshot data does not expose projectile ownership. Anchoring the pulse
    // on Greg gives the existing all-player projectile slice a readable attack
    // cue without inventing any gameplay provenance in presentation.
    add(createCue(
      tick,
      'attack',
      current.playerX,
      current.playerY,
      coalescedIntensity(newProjectiles),
    ));
  }

  const collectedPickups = aggregateMissing(
    previous.pickups,
    current.pickups,
    (index) => {
      const dx = previous.pickups.x[index]! - current.playerX;
      const dy = previous.pickups.y[index]! - current.playerY;
      const pickupRadius = Math.max(0, previous.pickups.radius[index]!);
      const maxDistance = pickupCollectionRadius + pickupRadius;
      return dx * dx + dy * dy <= maxDistance * maxDistance;
    },
  );
  if (collectedPickups !== null) {
    add(createCue(
      tick,
      'pickup',
      collectedPickups.x,
      collectedPickups.y,
      coalescedIntensity(collectedPickups.count),
    ));
  }

  const deadEnemies = aggregateMissing(previous.enemies, current.enemies, () => true);
  if (deadEnemies !== null) {
    add(createCue(
      tick,
      'enemy-death',
      deadEnemies.x,
      deadEnemies.y,
      coalescedIntensity(deadEnemies.count),
    ));
  }

  return freezeSnapshot(tick, cues);
}
