import { describe, expect, it } from 'vitest';
import { formatBuildLabel } from '../src/build-info';

describe('build identity presentation', () => {
  it('keeps the visible label tied to the immutable build id', () => {
    expect(formatBuildLabel({
      schemaVersion: 1,
      product: 'AnimalSurvivor',
      version: '1.2.3',
      buildId: '1.2.3+abc1234.deadbeef.cafebabe',
      commitSha: 'abc1234',
      sourceState: 'clean',
      buildTimestamp: '2026-07-12T00:00:00.000Z',
      contentFingerprint: 'deadbeef',
      assetManifestHash: 'cafebabe',
      deploymentBaseUrl: './',
    })).toBe('Build 1.2.3+abc1234.deadbeef.cafebabe');
  });

  it('marks a local dirty build instead of presenting it as reviewed', () => {
    expect(formatBuildLabel({
      schemaVersion: 1,
      product: 'AnimalSurvivor',
      version: '1.2.3',
      buildId: '1.2.3+abc1234.deadbeef.cafebabe',
      commitSha: 'abc1234',
      sourceState: 'dirty',
      buildTimestamp: '2026-07-12T00:00:00.000Z',
      contentFingerprint: 'deadbeef',
      assetManifestHash: 'cafebabe',
      deploymentBaseUrl: './',
    })).toContain('dirty source');
  });
});
