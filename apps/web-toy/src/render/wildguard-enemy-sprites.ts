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
