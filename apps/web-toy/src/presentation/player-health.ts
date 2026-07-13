export interface PlayerHealthPresentation {
  readonly current: number;
  readonly max: number;
  readonly fraction: number;
  readonly percent: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Converts authoritative snapshot HP into safe, presentation-only bar data. */
export function presentPlayerHealth(
  currentHp: number,
  maxHp: number,
): PlayerHealthPresentation | null {
  const safeMax = finiteOr(maxHp, 0);
  if (safeMax <= 0) return null;
  const safeCurrent = Math.min(safeMax, Math.max(0, finiteOr(currentHp, 0)));
  const fraction = safeCurrent / safeMax;
  return Object.freeze({
    current: safeCurrent,
    max: safeMax,
    fraction,
    percent: Math.round(fraction * 100),
  });
}
