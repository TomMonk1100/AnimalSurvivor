import type { EntityId } from '../types.js';

/** Deterministic reducer for Gracie's periodic priority-marking instinct. */
export interface GracieScoutConfig {
  readonly cooldownTicks: number;
  readonly markCount: number;
  readonly targetRangeSquared: number;
}

export const GRACIE_SCOUT_CONTENT_VERSION = 1 as const;

export const DEFAULT_GRACIE_SCOUT_CONFIG: Readonly<GracieScoutConfig> = Object.freeze({
  cooldownTicks: 120,
  markCount: 3,
  targetRangeSquared: 260 * 260,
});

export interface GracieScoutTarget {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
}

export interface GracieScoutState {
  readonly tick: number;
  readonly cooldownTicksRemaining: number;
  readonly facingX: number;
  readonly facingY: number;
}

export interface GracieScoutInput {
  readonly originX: number;
  readonly originY: number;
  readonly moveFacingX: number;
  readonly moveFacingY: number;
  readonly targets: readonly GracieScoutTarget[];
}

export interface GracieScoutPulse {
  readonly kind: 'gracieScoutPulse';
  readonly tick: number;
  readonly originX: number;
  readonly originY: number;
  readonly targetIds: readonly EntityId[];
}

export interface GracieScoutStepResult {
  readonly state: GracieScoutState;
  readonly pulse: GracieScoutPulse | null;
}

export function createGracieScoutState(): GracieScoutState {
  return { tick: -1, cooldownTicksRemaining: 0, facingX: 1, facingY: 0 };
}

export function stepGracieScout(
  previous: Readonly<GracieScoutState>,
  input: Readonly<GracieScoutInput>,
  config: Readonly<GracieScoutConfig> = DEFAULT_GRACIE_SCOUT_CONFIG,
): GracieScoutStepResult {
  const tick = previous.tick + 1;
  const cooldownTicksRemaining = Math.max(0, previous.cooldownTicksRemaining - 1);
  const facing = normalizedFacing(input.moveFacingX, input.moveFacingY, previous.facingX, previous.facingY);
  if (cooldownTicksRemaining > 0) {
    return { state: { tick, cooldownTicksRemaining, facingX: facing.x, facingY: facing.y }, pulse: null };
  }

  const eligible = input.targets
    .map((target) => {
      const dx = target.x - input.originX;
      const dy = target.y - input.originY;
      return { target, distanceSquared: dx * dx + dy * dy, forward: dx * facing.x + dy * facing.y };
    })
    .filter((candidate) => (
      Number.isFinite(candidate.distanceSquared)
      && candidate.distanceSquared <= config.targetRangeSquared
      && candidate.forward > 0
    ))
    .sort((left, right) => left.distanceSquared - right.distanceSquared || left.target.id - right.target.id)
    .slice(0, config.markCount);

  if (eligible.length === 0) {
    return { state: { tick, cooldownTicksRemaining: 0, facingX: facing.x, facingY: facing.y }, pulse: null };
  }
  return {
    state: { tick, cooldownTicksRemaining: config.cooldownTicks, facingX: facing.x, facingY: facing.y },
    pulse: {
      kind: 'gracieScoutPulse',
      tick,
      originX: input.originX,
      originY: input.originY,
      targetIds: eligible.map((candidate) => candidate.target.id),
    },
  };
}

function normalizedFacing(x: number, y: number, fallbackX: number, fallbackY: number): { x: number; y: number } {
  const magnitudeSquared = x * x + y * y;
  if (!Number.isFinite(magnitudeSquared) || magnitudeSquared <= 0) return { x: fallbackX, y: fallbackY };
  const inverseMagnitude = 1 / Math.sqrt(magnitudeSquared);
  return { x: x * inverseMagnitude, y: y * inverseMagnitude };
}
