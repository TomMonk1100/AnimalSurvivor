/** PlayCanvas material binding for the finite, renderer-only Chimera seam. */

import * as pc from 'playcanvas';
import {
  paletteForChimeraSeam,
  type ChimeraSeamAttachmentPresentation,
  type ChimeraSeamPalette,
} from './chimera-seam-presentation';

export interface ChimeraSeamMaterialBinding {
  readonly palette: ChimeraSeamPalette;
  /** Applies the parent-derived materials to the known reusable seam parts. */
  apply(root: pc.Entity): void;
  /** Releases the short-lived materials when the seam attachment is removed. */
  destroy(): void;
}

function seamMaterial(color: { readonly r: number; readonly g: number; readonly b: number }, opacity: number): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(color.r, color.g, color.b);
  material.emissive.set(color.r, color.g, color.b);
  material.opacity = opacity;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.update();
  return material;
}

function applyMaterial(root: pc.Entity, name: string, material: pc.StandardMaterial): void {
  const child = root.children.find((candidate) => candidate.name === name);
  const entity = child as pc.Entity | undefined;
  if (entity?.render === undefined) return;
  for (const mesh of entity.render.meshInstances) mesh.material = material;
}

/**
 * Builds per-instance seam materials from the actual immutable parent pair.
 * This remains a tiny bounded allocation (one seam has five materials) and is
 * deliberately destroyed with its renderer-only attachment.
 */
export function createChimeraSeamMaterialBinding(
  presentation: ChimeraSeamAttachmentPresentation,
): ChimeraSeamMaterialBinding {
  const palette = paletteForChimeraSeam(presentation);
  const primary = seamMaterial(palette.primary, 0.35);
  const accent = seamMaterial(palette.accent, 0.45);
  const knot = seamMaterial(palette.knot, 0.42);
  const echo = seamMaterial(palette.accent, 0.24);
  const fleck = seamMaterial(palette.fleck ?? palette.knot, palette.fleck === null ? 0.001 : 0.38);
  const materials = [primary, accent, knot, echo, fleck] as const;

  return {
    palette,
    apply(root) {
      applyMaterial(root, 'braid-primary', primary);
      applyMaterial(root, 'braid-accent', accent);
      applyMaterial(root, 'splice-knot', knot);
      applyMaterial(root, 'braid-echo', echo);
      applyMaterial(root, 'gilded-fleck-left', fleck);
      applyMaterial(root, 'gilded-fleck-right', fleck);
    },
    destroy() {
      for (const material of materials) material.destroy();
    },
  };
}
