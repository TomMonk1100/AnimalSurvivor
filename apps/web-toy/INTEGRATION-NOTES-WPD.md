# WP-D integration notes — incoming-danger channel

`apps/web-toy/src/render/enemy-threat-presentation.ts` now returns bounded
renderer-only danger descriptors. Apply this note only in the shared
`apps/web-toy/src/render/playcanvas-scene.ts` threat setup/render block; do
not add simulation writes or modify snapshot contracts.

## 1. Presenter configuration

Replace the existing `createEnemyThreatPresentation` options with the complete
live semantic budget below. The descriptor module clamps policy lanes and
throws on a custom combined budget above 128.

```ts
const enemyThreatVisuals = createEnemyThreatPresentation({
  maxProjectileTrails: 72,
  maxMuzzlePops: 12,
  maxShooterWindups: 12,
  maxTelegraphs: 16,
  maxContactRings: 8,
  maxEliteBossAuras: 4,
  shooterOuterRange: config.enemyBehavior.elitePreferredRange
    + config.enemyBehavior.eliteRangeBand,
  ticksPerSecond: config.hz,
});
```

This is `72 projectile + 12 muzzle + 12 shooter + 16 telegraph + 8 contact +
4 aura = 124` live visual semantics. The muzzle lane is deliberately capped
at 12 even though each projectile descriptor can carry an optional retained
pop.

## 2. Existing projectile loop

Import `HOSTILE_PROJECTILE_SCENE_CORE_MULTIPLIER` with the existing threat
symbols and retain the scene-side `2.1` multiplication through that constant:

```ts
const coreScale = projectile.headRadius
  * HOSTILE_PROJECTILE_SCENE_CORE_MULTIPLIER
  * (projectile.critical ? 1.2 : 1);
```

`headRadius` is already multiplied by `3.8 / 2.1` in the descriptor, so
changing the scene multiplier to `3.8` as well would double-amplify the core.
For the tail, replace the hard-coded `0.8` floor with the descriptor value:

```ts
Math.max(projectile.tailMinimumSceneWidth, projectile.tailWidth * 2.5)
```

Add one `VfxTransformStore(12)` and one direct instanced card batch named
`hostile-muzzle-pops` (coral `hostileThorn` frame, normal blend opacity `0.88`).
Add it to the existing transform clear/sync/telemetry/dispose paths alongside
`hostileProjectileAccent` and `hostileTrailAccent`. In the projectile loop,
when `projectile.muzzlePop !== null`, push this fixed lane once:

```ts
const muzzle = projectile.muzzlePop;
vfxTransforms.hostileMuzzlePop.push(
  sceneX(muzzle.x), sceneZ(muzzle.y),
  muzzle.scale * 2, 1, muzzle.scale * 2,
  0.24,
  Math.atan2(Math.cos(projectile.headingRadians), -Math.sin(projectile.headingRadians)),
);
```

Count successful pushes and set its batch opacity to `0.88` when nonzero,
otherwise `0`. Do not average its age: the descriptor expresses its complete
8-tick grow/shrink lifetime through scale so the shared-material constraint is
honored. Update the animated material refresh with the same `hostileThorn`
family if the batch is direct rather than routed.

## 3. New shooter routes

Create two fixed routed VFX batches and include both in `routedVfxBatches` so
the existing opacity reset/sync, telemetry, and disposal machinery handles
them:

| Route | Mesh/material lane | Capacity | Local Y / push lift | Purpose |
| --- | --- | ---: | --- | --- |
| `hostile-shooter-wedges` | `vfxCardMesh`, hostile telegraph material | 12 | `0.16` / `0.07` | coral directional aim wedge |
| `hostile-shooter-inhale-rings` | `vfxRingMesh`, hostile ring material | 12 | `0.19` / `0.14` | contracting final-charge ring |

The wedge uses the existing lane-warning geometry (not a stretched painted
character/effect card); leave a short scene comment marking that geometric
exception. For each `threat.shooterWindups` descriptor:

```ts
const x = sceneX(windup.x);
const z = sceneZ(windup.y);
const yaw = Math.atan2(windup.dirX, -windup.dirY);
const pulse = 0.92 + windup.pulse * 0.16;
if (hostileShooterWedgeRoute.store.push(
  x, z,
  Math.max(5, windup.wedgeThickness * 2.4) * pulse,
  1,
  windup.wedgeLength * pulse,
  0.07,
  yaw,
)) recordRoutedBatchOpacity(hostileShooterWedgeRoute, windup.wedgeOpacity);
if (windup.hasInhale && hostileShooterInhaleRoute.store.push(
  x, z,
  windup.inhaleRadius * 2,
  1,
  windup.inhaleRadius * 2,
  0.14,
  windup.pulse,
)) recordRoutedBatchOpacity(hostileShooterInhaleRoute, windup.inhaleOpacity);
```

The lane yaw is intentionally the existing `Math.atan2(dirX, -dirY)` world-to-
scene convention. The 120-tick descriptor pulse changes geometry only; it is
not a faster luminance envelope.

## 4. Rebudget existing danger routes

Change every threat telegraph route capacity from `24` to `16`, every contact
ring route from `16` to `8`, and each elite/boss aura route from `6` to `4`.
Those route capacities are per palette; the presenter enforces the combined
semantic budget above.

## 5. Dark outline routes

The descriptors carry `outlineScale`, `outlineOpacity`, and
`outlineThickness`. They are zero for unoutlined records.

Create dark procedural materials using `ENEMY_THREAT_PALETTES.<palette>.outline`
and fixed routed batches as follows:

| Route family | Mesh | Capacity per palette | Local Y / push lift |
| --- | --- | ---: | --- |
| boss + saltwind lane outline | `vfxCardMesh` | 16 | `0.15` / `0.045` |
| boss + saltwind radial outline | `vfxRingMesh` | 16 | `0.15` / `0.045` |
| elite + boss aura outline | `vfxRingMesh` | 4 | `0.13` / `0.055` |

Add all routes to `routedVfxBatches`. For outlined boss telegraphs, push the
dark lane/ring **before** the regular telegraph, scale it with
`outlineScale`, use `outlineThickness` for lane width, and record
`outlineOpacity`. Branch by `telegraph.style`: `lane` uses the same yaw as
above; `radial` uses a uniform ring. `arrival` has zero outline fields by
design. For `eliteBossAuras`, push the dark ring before the existing primary
aura using `aura.outerRadius * 2 * aura.outlineScale`, lift `0.055`, and
`aura.outlineOpacity`. Elite aura size itself must remain unchanged.

## 6. Visual order and validation

All lifts above are above ground decals and beneath UI. Keep current primary
telegraph lift `0.06`, contact lift `0.12`, and aura lift `0.08`; the dark
outline lifts sit just beneath their primary geometry. No per-instance alpha
or new material/entity per threat is needed.

After wiring, run the owned typecheck/lint/tests plus the root capture and
flash gates. The expected capture read is: no out-of-range shooter cue; coral
wedge then inhale precedes a shooter; hostile launch has one small source pop;
projectiles/telegraphs outrank sparse collision-distance contact rings.
