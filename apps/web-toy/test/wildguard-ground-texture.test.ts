import { describe, expect, it } from 'vitest';
import {
  WILDGUARD_GLADE_GROUND_DIFFUSE_TINT,
  WILDGUARD_GLADE_GROUND_EMISSIVE_LIFT,
  WILDGUARD_GLADE_GROUND_URL,
} from '../src/render/wildguard-ground-texture';

function luminance([red, green, blue]: readonly [number, number, number]): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

describe('Wildguard ground texture readability treatment', () => {
  it('retains the authored asset while constraining texture contrast', () => {
    expect(WILDGUARD_GLADE_GROUND_URL).toContain('storybook-glade-ground-v1.jpg');
    expect(luminance(WILDGUARD_GLADE_GROUND_EMISSIVE_LIFT)).toBeGreaterThan(0.12);
    expect(luminance(WILDGUARD_GLADE_GROUND_DIFFUSE_TINT)).toBeLessThanOrEqual(0.56);
    expect(WILDGUARD_GLADE_GROUND_DIFFUSE_TINT[1]).toBeGreaterThan(
      WILDGUARD_GLADE_GROUND_DIFFUSE_TINT[0],
    );
  });
});
