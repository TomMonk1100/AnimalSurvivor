import type { CombatFeedbackCue } from '../presentation/combat-feedback';

export interface CombatFeedbackVisual {
  /** Normalized fixed-tick age, clamped to the cue lifetime. */
  readonly progress: number;
  /** Visible outer radius in simulation world units. */
  readonly radius: number;
  /** Visible ring tube thickness in simulation world units. */
  readonly thickness: number;
  /** Per-instance additive opacity in [0, 1]. */
  readonly opacity: number;
}

const BASE_RADIUS: Readonly<Record<CombatFeedbackCue['kind'], number>> = Object.freeze({
  'player-death': 28,
  'player-hit': 18,
  attack: 12,
  pickup: 11,
  'enemy-death': 14,
});

const BASE_OPACITY: Readonly<Record<CombatFeedbackCue['kind'], number>> = Object.freeze({
  'player-death': 0.94,
  'player-hit': 0.92,
  attack: 0.78,
  pickup: 0.84,
  'enemy-death': 0.86,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Projects a compact cue into renderer-only ring geometry. Tick time, not
 * wall-clock time, controls every value so rendering cannot affect replay.
 */
export function projectCombatFeedbackVisual(
  cue: CombatFeedbackCue,
  renderTick: number,
): CombatFeedbackVisual {
  const safeLifetime = Math.max(1, cue.lifetimeTicks);
  const progress = clamp((renderTick - cue.tick) / safeLifetime, 0, 1);
  const baseRadius = BASE_RADIUS[cue.kind] * cue.intensity;
  const radius = baseRadius * (0.62 + progress * 0.58);
  // A slight ease-out keeps the beginning crisp while the final few fixed
  // ticks fall away instead of popping off at expiry.
  const opacity = BASE_OPACITY[cue.kind] * (1 - progress) * (1 - progress * 0.35);
  return Object.freeze({
    progress,
    radius,
    thickness: Math.max(0.9, radius * 0.058),
    opacity,
  });
}
