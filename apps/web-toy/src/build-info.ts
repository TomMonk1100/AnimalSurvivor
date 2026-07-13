export interface BuildInfo {
  readonly schemaVersion: number;
  readonly product: string;
  readonly version: string;
  readonly buildId: string;
  readonly commitSha: string;
  readonly sourceState: 'clean' | 'dirty' | 'unknown';
  readonly buildTimestamp: string;
  readonly contentFingerprint: string;
  readonly assetManifestHash: string;
  readonly deploymentBaseUrl: string;
}

declare const __ANIMAL_SURVIVOR_BUILD_INFO__: BuildInfo;

const DEVELOPMENT_BUILD_INFO: BuildInfo = Object.freeze({
  schemaVersion: 1,
  product: 'AnimalSurvivor',
  version: '0.1.0',
  buildId: '0.1.0+dev',
  commitSha: 'unknown',
  sourceState: 'unknown',
  buildTimestamp: 'unknown',
  contentFingerprint: 'unknown',
  assetManifestHash: 'unknown',
  deploymentBaseUrl: './',
});

export const BUILD_INFO: BuildInfo = typeof __ANIMAL_SURVIVOR_BUILD_INFO__ === 'undefined'
  ? DEVELOPMENT_BUILD_INFO
  : __ANIMAL_SURVIVOR_BUILD_INFO__;

export function formatBuildLabel(info: BuildInfo = BUILD_INFO): string {
  const state = info.sourceState === 'clean' ? '' : ` · ${info.sourceState} source`;
  return `Build ${info.buildId}${state}`;
}
