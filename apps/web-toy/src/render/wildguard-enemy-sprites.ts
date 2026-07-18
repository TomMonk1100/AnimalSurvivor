/**
 * Authored Wildguard creature silhouettes used by the instanced renderer.
 *
 * These URLs intentionally live beside renderer code rather than simulation
 * content: the simulation only exposes stable numeric archetypes, while this
 * catalog decides how those read in the forest. The source imagery and exact
 * generation prompts are recorded in the asset ledger and release notes.
 */
export const WILDGUARD_ENEMY_SPRITE_URLS = Object.freeze({
  walker: new URL('../../../../assets/ui/enemies/bramblehog-v1.png', import.meta.url).href,
  runner: new URL('../../../../assets/ui/enemies/thornwing-v1.png', import.meta.url).href,
  brute: new URL('../../../../assets/ui/enemies/rootback-v1.png', import.meta.url).href,
  forestBoss: new URL('../../../../assets/ui/enemies/hollowhart-warden-v1.png', import.meta.url).href,
});

export type WildguardEnemySpriteId = keyof typeof WILDGUARD_ENEMY_SPRITE_URLS;

/**
 * Small unlit value lift for authored enemy cutouts. This keeps their painted
 * dark fur readable over the quieter forest without turning their silhouettes
 * into a new danger-color lane.
 */
export const WILDGUARD_ENEMY_SPRITE_EMISSIVE_FACTOR = 0.085;

/** Existing scene-owned contact shadows become legible at this normal-blend opacity. */
export const WILDGUARD_ENEMY_CONTACT_SHADOW_OPACITY = 0.34;

/**
 * Multiplier passed to the existing transform store. Its cone mesh has a
 * 0.5-unit radius, so this yields a contact ellipse roughly 1.35× each
 * enemy's authoritative radius rather than a warning-ring-sized footprint.
 */
export const WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER = 1.35;
