import { RUN_ENEMY_ROLE } from '@sim';
import type { CategorySnapshot } from '../contracts';

export interface BossHealthPresentation {
  readonly id: number;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  /** Clamped health fraction for an HTML/CSS progress treatment. */
  readonly fraction: number;
  readonly percent: number;
}

const BOSS_LABEL = 'The Final Threat';

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Finds the authoritative boss role in an app-owned enemy snapshot and turns
 * its copied health values into safe UI data. Invalid max health hides the bar
 * rather than inventing a progress value for malformed presentation input.
 */
export function presentBossHealth(enemies: CategorySnapshot): BossHealthPresentation | null {
  for (let index = 0; index < enemies.count; index++) {
    if (enemies.role[index] !== RUN_ENEMY_ROLE.boss) continue;
    const max = finiteOr(enemies.maxHp[index]!, 0);
    if (max <= 0) return null;
    const current = clamp(finiteOr(enemies.hp[index]!, 0), 0, max);
    const fraction = current / max;
    return Object.freeze({
      id: enemies.id[index]!,
      label: BOSS_LABEL,
      current,
      max,
      fraction,
      percent: Math.round(fraction * 100),
    });
  }
  return null;
}
