import type { BiomeId } from '@sim';

export interface BossPortraitAsset {
  readonly assetUrl: string;
  readonly assetAlt: string;
}

const BOSS_PORTRAIT_ASSETS: Readonly<Record<BiomeId, BossPortraitAsset>> = Object.freeze({
  forest: Object.freeze({
    assetUrl: new URL('../../../../assets/ui/bosses/final-threat-v1.png', import.meta.url).href,
    assetAlt: 'The Final Threat forest guardian portrait',
  }),
  saltwind: Object.freeze({
    assetUrl: new URL('../../../../assets/ui/bosses/sandglass-sovereign-v1.png', import.meta.url).href,
    assetAlt: 'The Sandglass Sovereign desert guardian portrait',
  }),
});

export function getBossPortraitAsset(biomeId: BiomeId = 'forest'): BossPortraitAsset {
  return BOSS_PORTRAIT_ASSETS[biomeId];
}
