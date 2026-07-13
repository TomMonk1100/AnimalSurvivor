/**
 * Deterministic, simulation-facing policy for Greg's Rush Rake instinct.
 *
 * This module deliberately owns no pools and spawns no entities. Integration
 * supplies integer movement distance, explicit near-miss events, and a stable
 * cluster list once per fixed simulation tick. When charged, the reducer emits
 * one immutable command that combat can expand into three claw waves.
 */

export interface RushRakeConfig {
  /** Integer milli-world-units of travel needed to trigger. */
  readonly chargeDistanceMilliunits: number;
  /** Charge added for each explicit near-miss event (shortens distance remaining). */
  readonly nearMissBonusMilliunits: number;
  /** Fixed-tick spacing between the three emitted waves. */
  readonly waveSpacingTicks: number;
  /** Maximum squared world distance at which a cluster can be targeted. */
  readonly targetRangeSquared: number;
}

/** Bump when authored Rush Rake behavior changes without changing its shape. */
export const GREG_RUSH_RAKE_CONTENT_VERSION = 2 as const;

export const DEFAULT_RUSH_RAKE_CONFIG: Readonly<RushRakeConfig> = Object.freeze({
  // Greg travels 2 world units per normal simulation tick. The old 12-unit
  // threshold recharged a complete 3×3 piercing burst about ten times per
  // second while walking, turning basic movement into unearned screen clear.
  // This is a deliberate 1.25-second cadence: visible, powerful, and earned.
  chargeDistanceMilliunits: 150_000,
  // A close dodge should still matter without allowing a single crowded frame
  // to replace the movement requirement entirely.
  nearMissBonusMilliunits: 10_000,
  // Give the three rakes enough breathing room to read as a committed combo,
  // rather than one indistinguishable projectile clump.
  waveSpacingTicks: 12,
  targetRangeSquared: 80 * 80,
});

export interface RushRakeCluster {
  /** Stable generation-guarded entity id or another integration-owned stable id. */
  readonly id: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Informational for future balancing; targeting does not depend on array order. */
  readonly memberCount: number;
}

export interface RushRakeInput {
  /** Non-negative integer distance travelled during this fixed tick, in milli-units. */
  readonly distanceMovedMilliunits: number;
  /** Explicit deterministic event count for this tick. Never inferred from rendering. */
  readonly nearMissCount: number;
  readonly originX: number;
  readonly originY: number;
  /** Current movement-facing vector. Zero retains the previous facing. */
  readonly moveFacingX: number;
  readonly moveFacingY: number;
  /** Candidate cluster centroids. Ordering has no effect on the result. */
  readonly clusters: readonly RushRakeCluster[];
}

export interface RushRakeState {
  /** Last completed reducer tick. Initial state is tick -1. */
  readonly tick: number;
  readonly chargeMilliunits: number;
  /** Normalized last non-zero movement-facing direction. */
  readonly facingX: number;
  readonly facingY: number;
}

export interface RushRakeWave {
  readonly index: 0 | 1 | 2;
  /** Offset from command.tick, in fixed simulation ticks. */
  readonly tickOffset: number;
}

export interface RushRakeBurstCommand {
  readonly kind: 'gregRushRakeBurst';
  readonly tick: number;
  readonly originX: number;
  readonly originY: number;
  /** Unit direction shared by all three waves. */
  readonly aimX: number;
  readonly aimY: number;
  /** Null means no eligible forward cluster; aim uses movement-facing fallback. */
  readonly targetClusterId: number | null;
  readonly waves: readonly [RushRakeWave, RushRakeWave, RushRakeWave];
}

export interface RushRakeStepResult {
  readonly state: RushRakeState;
  readonly command: RushRakeBurstCommand | null;
}

export function createRushRakeState(): RushRakeState {
  return { tick: -1, chargeMilliunits: 0, facingX: 1, facingY: 0 };
}

/**
 * Pure, allocation-light reducer. Call exactly once per fixed simulation tick.
 * Invalid/negative integer event inputs are safely treated as zero.
 */
export function stepRushRake(
  previous: Readonly<RushRakeState>,
  input: Readonly<RushRakeInput>,
  config: Readonly<RushRakeConfig> = DEFAULT_RUSH_RAKE_CONFIG,
): RushRakeStepResult {
  const tick = previous.tick + 1;
  const movement = nonNegativeInteger(input.distanceMovedMilliunits);
  const nearMisses = nonNegativeInteger(input.nearMissCount);
  const nearMissBonus = nearMisses * config.nearMissBonusMilliunits;
  const charge = Math.min(
    config.chargeDistanceMilliunits,
    Math.max(0, previous.chargeMilliunits + movement + nearMissBonus),
  );
  const facing = normalizedFacing(input.moveFacingX, input.moveFacingY, previous.facingX, previous.facingY);

  if (charge < config.chargeDistanceMilliunits) {
    return {
      state: { tick, chargeMilliunits: charge, facingX: facing.x, facingY: facing.y },
      command: null,
    };
  }

  const target = selectMovementFacingNearestCluster(input, facing.x, facing.y, config.targetRangeSquared);
  const aim = target === null
    ? facing
    : normalizedFacing(target.centerX - input.originX, target.centerY - input.originY, facing.x, facing.y);

  return {
    state: { tick, chargeMilliunits: 0, facingX: facing.x, facingY: facing.y },
    command: {
      kind: 'gregRushRakeBurst',
      tick,
      originX: input.originX,
      originY: input.originY,
      aimX: aim.x,
      aimY: aim.y,
      targetClusterId: target?.id ?? null,
      waves: [
        { index: 0, tickOffset: 0 },
        { index: 1, tickOffset: config.waveSpacingTicks },
        { index: 2, tickOffset: config.waveSpacingTicks * 2 },
      ],
    },
  };
}

function selectMovementFacingNearestCluster(
  input: Readonly<RushRakeInput>,
  facingX: number,
  facingY: number,
  targetRangeSquared: number,
): RushRakeCluster | null {
  let best: RushRakeCluster | null = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of input.clusters) {
    if (!Number.isFinite(candidate.centerX) || !Number.isFinite(candidate.centerY)) continue;
    const dx = candidate.centerX - input.originX;
    const dy = candidate.centerY - input.originY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > targetRangeSquared) continue;
    if (dx * facingX + dy * facingY <= 0) continue;

    if (
      distanceSquared < bestDistanceSquared ||
      (distanceSquared === bestDistanceSquared && (best === null || candidate.id < best.id))
    ) {
      best = candidate;
      bestDistanceSquared = distanceSquared;
    }
  }
  return best;
}

function normalizedFacing(x: number, y: number, fallbackX: number, fallbackY: number): { x: number; y: number } {
  const magnitudeSquared = x * x + y * y;
  if (!Number.isFinite(magnitudeSquared) || magnitudeSquared <= 0) return { x: fallbackX, y: fallbackY };
  const inverseMagnitude = 1 / Math.sqrt(magnitudeSquared);
  return { x: x * inverseMagnitude, y: y * inverseMagnitude };
}

function nonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}
