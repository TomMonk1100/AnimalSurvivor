/**
 * Renderer-only rank treatment for illustrated attack cards.
 *
 * Trait ranks are already part of the simulation-owned visual snapshot. This
 * module only reads that snapshot and converts it into a bounded presentation
 * profile; it never changes a command, hitbox, cooldown, or deterministic
 * state.
 */
import type { TraitVisualAttachmentView } from '@sim';

export type IllustratedVfxRankVisual = Pick<
  TraitVisualAttachmentView,
  'enabled' | 'isMaster' | 'rank' | 'sourceId'
>;

export interface IllustratedVfxRankProfile {
  /** Normalized independent attack rank, always in the R1–R5 presentation range. */
  readonly rank: 1 | 2 | 3 | 4 | 5;
  /** Master remains explicit even though it normally coincides with R5. */
  readonly isMaster: boolean;
  /** Bounded card-size multiplier. R5 never exceeds 1.16×; Master 1.2×. */
  readonly scaleMultiplier: number;
  /** Bounded material-opacity multiplier. */
  readonly opacityMultiplier: number;
  /** Bounded lifetime multiplier; higher ranks linger slightly longer. */
  readonly lifetimeMultiplier: number;
  /** Enables one small, rate-limited Master sparkle on eligible cast events. */
  readonly showMasterAccent: boolean;
}

const RANK_PROFILES: Readonly<Record<1 | 2 | 3 | 4 | 5, IllustratedVfxRankProfile>> = Object.freeze({
  1: Object.freeze({
    rank: 1,
    isMaster: false,
    scaleMultiplier: 0.88,
    opacityMultiplier: 0.78,
    lifetimeMultiplier: 0.88,
    showMasterAccent: false,
  }),
  2: Object.freeze({
    rank: 2,
    isMaster: false,
    scaleMultiplier: 0.94,
    opacityMultiplier: 0.85,
    lifetimeMultiplier: 0.94,
    showMasterAccent: false,
  }),
  3: Object.freeze({
    rank: 3,
    isMaster: false,
    scaleMultiplier: 1,
    opacityMultiplier: 0.91,
    lifetimeMultiplier: 1,
    showMasterAccent: false,
  }),
  4: Object.freeze({
    rank: 4,
    isMaster: false,
    scaleMultiplier: 1.08,
    opacityMultiplier: 0.96,
    lifetimeMultiplier: 1.06,
    showMasterAccent: false,
  }),
  5: Object.freeze({
    rank: 5,
    isMaster: false,
    scaleMultiplier: 1.16,
    opacityMultiplier: 1,
    lifetimeMultiplier: 1.12,
    showMasterAccent: false,
  }),
});

export const DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE = RANK_PROFILES[1];

export const MASTER_ILLUSTRATED_VFX_RANK_PROFILE: IllustratedVfxRankProfile = Object.freeze({
  ...RANK_PROFILES[5],
  isMaster: true,
  // Master stays readable, not screen-filling: it is only 4% larger than R5.
  scaleMultiplier: 1.2,
  lifetimeMultiplier: 1.16,
  showMasterAccent: true,
});

function rankFor(visual: IllustratedVfxRankVisual): 1 | 2 | 3 | 4 | 5 {
  if (visual.isMaster === true) return 5;
  switch (visual.rank) {
    case 2: return 2;
    case 3: return 3;
    case 4: return 4;
    case 5: return 5;
    default: return 1;
  }
}

/**
 * Resolves the strongest enabled visual state for the command's source. The
 * compact/legacy absence of rank deliberately degrades to R1 rather than
 * inventing progression from renderer state.
 */
export function illustratedVfxRankProfileForSource(
  visuals: readonly IllustratedVfxRankVisual[],
  sourceId: string,
): IllustratedVfxRankProfile {
  let selected: IllustratedVfxRankVisual | undefined;
  let selectedRank = 0;
  for (const visual of visuals) {
    if (visual.enabled !== true || visual.sourceId !== sourceId) continue;
    const rank = rankFor(visual);
    if (
      selected === undefined
      || rank > selectedRank
      || (rank === selectedRank && visual.isMaster === true && selected.isMaster !== true)
    ) {
      selected = visual;
      selectedRank = rank;
    }
  }
  if (selected === undefined) return DEFAULT_ILLUSTRATED_VFX_RANK_PROFILE;
  return selected.isMaster === true
    ? MASTER_ILLUSTRATED_VFX_RANK_PROFILE
    : RANK_PROFILES[rankFor(selected)];
}
