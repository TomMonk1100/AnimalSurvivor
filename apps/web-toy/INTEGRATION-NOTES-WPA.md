# WP-A integration notes — ground and figure separation

This packet deliberately does **not** edit `src/render/playcanvas-scene.ts`.
The static forest, ground texture, and Quaternius prop changes are already
live through their existing module imports. The integrator only needs the
following edits to reuse the existing enemy presentation path.

## Import the readability profile

Replace the current single-name import near the top of
`src/render/playcanvas-scene.ts` with:

```ts
import {
  WILDGUARD_ENEMY_CONTACT_SHADOW_OPACITY,
  WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER,
  WILDGUARD_ENEMY_SPRITE_EMISSIVE_FACTOR,
  WILDGUARD_ENEMY_SPRITE_URLS,
} from './wildguard-enemy-sprites';
```

## Lift the existing cutout material, not the simulation or a new VFX batch

`createCutoutSpriteMaterial` currently hardcodes `0.045` in its emissive
assignment. Give that helper an optional `emissiveFactor = 0.045` argument and
use it in the assignment. Pass
`WILDGUARD_ENEMY_SPRITE_EMISSIVE_FACTOR` to the ten existing enemy material
calls (`walker`, `runner`, `brute`, `elite`, `boss`, `ranged`, `charger`,
`denial`, `flanker`, and `support`). Do not change the hit-flash material,
palette-role colors, texture bindings, meshes, or batch capacities.

## Reuse and tune the existing enemy-contact-shadow batch

`enemyShadowBatch`, `enemyShadowMesh`, and `enemyShadowTransforms` already
exist. Do **not** add another mesh, batch, transform store, or pool.

1. In `createShadowMaterial`, replace the literal opacity `0.24` with
   `WILDGUARD_ENEMY_CONTACT_SHADOW_OPACITY`.
2. In the existing `enemyShadowTransforms.update(...)` call, remove the
   `RUN_ENEMY_ROLE.regular` filter so every live enemy role receives the same
   existing shadow. Keep the same previous/current snapshots, alpha, world
   offsets, and `zScale`.
3. Pass `undefined` for the now-absent `roleFilter`, then pass
   `WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER` as the following
   `scaleMultiplier`. The intended tail of the call is:

```ts
  -1,
  undefined,
  WILDGUARD_ENEMY_CONTACT_SHADOW_SCALE_MULTIPLIER,
);
```

The current cone geometry has a 0.5-unit radius, so this produces an ellipse
about 1.35 times an enemy's authoritative radius. It is a compact grounding
cue, not a contact-warning ring.

## Expected post-integration behavior

- All scene-owned enemy roles use the existing fixed-capacity shadow batch.
- The shadow material remains normal-blend, depth-write-disabled, and below
  gameplay entities; there is no new per-frame allocation path.
- Ground/props remain static, and the only changes to snapshots/simulation are
  none. No golden value should change.
