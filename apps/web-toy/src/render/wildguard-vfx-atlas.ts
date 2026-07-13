/**
 * Compact, shared visual vocabulary for the Wildguard combat overhaul.
 *
 * This atlas is deliberately renderer-owned: it supplies silhouettes and
 * color detail, while the simulation remains the authority for every hit,
 * pickup, and projectile. Keeping the 16 reusable motifs in one texture lets
 * the scene create a bold attack/reward/danger language without a growing
 * collection of one-off runtime images.
 */
export const WILDGUARD_VFX_ATLAS_URL = new URL(
  '../../../../assets/ui/vfx/wildguard-prism-atlas-v1.png',
  import.meta.url,
).href;

export const WILDGUARD_VFX_ATLAS_GRID_SIZE = 4;

export const WILDGUARD_VFX_SPRITE = Object.freeze({
  foxSwipe: 'foxSwipe',
  earthWave: 'earthWave',
  spitComet: 'spitComet',
  shield: 'shield',
  xpDiamond: 'xpDiamond',
  magnet: 'magnet',
  bomb: 'bomb',
  hostileComet: 'hostileComet',
  critStar: 'critStar',
  earthBurst: 'earthBurst',
  wardGlyph: 'wardGlyph',
  hostileSlash: 'hostileSlash',
  windSpiral: 'windSpiral',
  frostBurst: 'frostBurst',
  emberRing: 'emberRing',
  arcaneComet: 'arcaneComet',
} as const);

export type WildguardVfxSprite =
  (typeof WILDGUARD_VFX_SPRITE)[keyof typeof WILDGUARD_VFX_SPRITE];

export interface WildguardVfxAtlasCell {
  /** Zero-based column, measured from the rendered atlas's left edge. */
  readonly column: number;
  /** Zero-based row, measured from the rendered atlas's top edge. */
  readonly row: number;
}

export const WILDGUARD_VFX_ATLAS_CELLS: Readonly<Record<WildguardVfxSprite, WildguardVfxAtlasCell>> = Object.freeze({
  foxSwipe: Object.freeze({ column: 0, row: 0 }),
  earthWave: Object.freeze({ column: 1, row: 0 }),
  spitComet: Object.freeze({ column: 2, row: 0 }),
  shield: Object.freeze({ column: 3, row: 0 }),
  xpDiamond: Object.freeze({ column: 0, row: 1 }),
  magnet: Object.freeze({ column: 1, row: 1 }),
  bomb: Object.freeze({ column: 2, row: 1 }),
  hostileComet: Object.freeze({ column: 3, row: 1 }),
  critStar: Object.freeze({ column: 0, row: 2 }),
  earthBurst: Object.freeze({ column: 1, row: 2 }),
  wardGlyph: Object.freeze({ column: 2, row: 2 }),
  hostileSlash: Object.freeze({ column: 3, row: 2 }),
  windSpiral: Object.freeze({ column: 0, row: 3 }),
  frostBurst: Object.freeze({ column: 1, row: 3 }),
  emberRing: Object.freeze({ column: 2, row: 3 }),
  arcaneComet: Object.freeze({ column: 3, row: 3 }),
});

/**
 * Converts the visual top-left grid coordinate into PlayCanvas texture UV
 * tiling/offset values, whose V origin is bottom-left. The caller can share
 * one decoded texture while each material exposes one semantic VFX motif.
 */
export function wildguardVfxAtlasUv(sprite: WildguardVfxSprite): Readonly<{
  tilingX: number;
  tilingY: number;
  offsetX: number;
  offsetY: number;
}> {
  const cell = WILDGUARD_VFX_ATLAS_CELLS[sprite];
  const tile = 1 / WILDGUARD_VFX_ATLAS_GRID_SIZE;
  return Object.freeze({
    tilingX: tile,
    tilingY: tile,
    offsetX: cell.column * tile,
    offsetY: 1 - (cell.row + 1) * tile,
  });
}
