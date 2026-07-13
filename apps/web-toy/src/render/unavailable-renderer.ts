import type {
  HeroId,
  RendererAdapter,
  RendererStats,
  RenderSnapshot,
  RenderQualityTier,
} from '../contracts';
import type { TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';

const UNAVAILABLE_STATS: RendererStats = Object.freeze({
  drawCalls: -1,
  liveViews: 0,
  highWaterViews: 0,
  contextLost: 0,
});

/**
 * Safe presentation fallback for browsers that cannot create WebGL2. It is
 * intentionally unable to render or mutate gameplay; the app shell pauses the
 * fixed-tick driver while this adapter is active and surfaces the reason.
 */
export function createUnavailableRenderer(): RendererAdapter {
  return {
    setHero(_heroId: HeroId): void {},
    render(
      _prev: RenderSnapshot,
      _curr: RenderSnapshot,
      _alpha: number,
      _traitVisualState: readonly TraitVisualAttachmentView[],
      _combatFeedback: CombatFeedbackSnapshot,
      _traitPresentationEvents: readonly TraitPresentationEventView[],
    ): void {},
    resize(): void {},
    setQualityTier(_tier: RenderQualityTier): void {},
    setPalette(_paletteId: string): void {},
    stats(): RendererStats { return UNAVAILABLE_STATS; },
    get ready(): boolean { return false; },
    dispose(): void {},
  };
}
