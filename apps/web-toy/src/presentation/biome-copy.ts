import type { BiomeId } from '@sim';

export interface BiomePresentationCopy {
  readonly bossName: string;
  readonly bossWarningTitle: string;
  readonly bossWarningDetail: string;
  readonly bossArrivalTitle: string;
  readonly bossArrivalDetail: string;
}

const BIOME_COPY: Readonly<Record<BiomeId, BiomePresentationCopy>> = Object.freeze({
  forest: Object.freeze({
    bossName: 'The Final Threat',
    bossWarningTitle: 'The undergrowth has gone quiet',
    bossWarningDetail: 'A great threat is approaching.',
    bossArrivalTitle: 'The final threat has arrived',
    bossArrivalDetail: 'Survive, adapt, and bring it down.',
  }),
  saltwind: Object.freeze({
    bossName: 'The Sandglass Sovereign',
    bossWarningTitle: 'The ruins begin to sing',
    bossWarningDetail: 'The Sandglass Sovereign is approaching.',
    bossArrivalTitle: 'The Sandglass Sovereign has awakened',
    bossArrivalDetail: 'Outlast the sandstorm and break the sovereign.',
  }),
});

export function getBiomePresentationCopy(biomeId: BiomeId = 'forest'): BiomePresentationCopy {
  return BIOME_COPY[biomeId];
}
