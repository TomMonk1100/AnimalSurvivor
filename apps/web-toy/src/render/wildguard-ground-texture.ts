/** Project-bound generated ground art used by the Forest Arsenal renderer. */
export const WILDGUARD_GLADE_GROUND_URL = new URL(
  '../../../../assets/ui/terrain/storybook-glade-ground-v1.jpg',
  import.meta.url,
).href;

/**
 * Compresses the textured floor's bright/dark range without recoloring the
 * authored glade. The diffuse tint lowers highlight contrast while the
 * emissive lift keeps its darkest speckle from impersonating enemy silhouettes.
 */
export const WILDGUARD_GLADE_GROUND_DIFFUSE_TINT = Object.freeze([0.48, 0.56, 0.36] as const);

/** Static green shadow lift paired with `WILDGUARD_GLADE_GROUND_DIFFUSE_TINT`. */
export const WILDGUARD_GLADE_GROUND_EMISSIVE_LIFT = Object.freeze([0.12, 0.17, 0.08] as const);
