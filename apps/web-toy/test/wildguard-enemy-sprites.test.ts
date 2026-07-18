import { describe, expect, it } from 'vitest';
import {
  WILDGUARD_ENEMY_CONTACT_SHADOW_OPACITY,
  WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER,
  WILDGUARD_ENEMY_SPRITE_EMISSIVE_FACTOR,
  WILDGUARD_ENEMY_SPRITE_URLS,
} from '../src/render/wildguard-enemy-sprites';

describe('Wildguard enemy sprite readability profile', () => {
  it('keeps every authored sprite source while reserving a bounded value lift', () => {
    expect(Object.keys(WILDGUARD_ENEMY_SPRITE_URLS)).toEqual([
      'walker',
      'runner',
      'brute',
      'forestBoss',
    ]);
    expect(WILDGUARD_ENEMY_SPRITE_EMISSIVE_FACTOR).toBeGreaterThan(0.045);
    expect(WILDGUARD_ENEMY_SPRITE_EMISSIVE_FACTOR).toBeLessThanOrEqual(0.1);
  });

  it('uses the existing shadow lane as a compact contact anchor, not a warning ring', () => {
    expect(WILDGUARD_ENEMY_CONTACT_SHADOW_OPACITY).toBeGreaterThanOrEqual(0.3);
    expect(WILDGUARD_ENEMY_CONTACT_SHADOW_OPACITY).toBeLessThanOrEqual(0.36);
    expect(WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER).toBeGreaterThanOrEqual(1.3);
    expect(WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER).toBeLessThanOrEqual(1.4);
  });
});
