import { describe, expect, it } from 'vitest';
import { getBossPortraitAsset } from '../src/presentation/boss-art';

describe('boss portrait presentation', () => {
  it('keeps Forest and Saltwind apex portraits distinct and bundled', () => {
    const forest = getBossPortraitAsset('forest');
    const saltwind = getBossPortraitAsset('saltwind');
    expect(forest.assetUrl).toContain('final-threat-v1.png');
    expect(saltwind.assetUrl).toContain('sandglass-sovereign-v1.png');
    expect(forest.assetUrl).not.toBe(saltwind.assetUrl);
    expect(forest.assetAlt).toContain('forest guardian');
    expect(saltwind.assetAlt).toContain('desert guardian');
  });
});
