/**
 * WebGL2 PlayCanvas scene renderer implementing `RendererAdapter`.
 *
 * DEVICE / API CHOICE — `pc.Application` vs `pc.AppBase` + `createGraphicsDevice`:
 * We use `pc.Application`. Its default `createDevice()` (see
 * `playcanvas/build/playcanvas/src/framework/application.js`) always opens the
 * canvas directly with `canvas.getContext('webgl2', ...)` via
 * `WebglGraphicsDevice` — there is no async `createGraphicsDevice()` /
 * WebGPU-detection path at all in that code path. That makes "WebGL2 device;
 * WebGPU optional and not required" trivially true, and lets the whole app be
 * constructed synchronously (no `await app.init(...)` dance).
 *
 * We deliberately do NOT call `app.start()`. `start()` would hand PlayCanvas
 * its own internal `requestAnimationFrame` loop (`AppBase.tick`), which would
 * then race against whatever fixed-tick + rAF loop the app shell uses to call
 * `render(prev, curr, alpha)`. Instead, every call to `render()` mutates the
 * scene graph for the interpolated frame and then calls the public,
 * synchronous `app.render()` once (one `syncHierarchy` + one draw pass, see
 * `AppBase.render()`), so frame pacing is entirely owned by the caller. Note
 * `app.render()` calls `updateCanvasSize()` internally, but that is a no-op
 * unless `resolutionMode === RESOLUTION_AUTO` (we never set that — we own
 * sizing ourselves in `resize()`), so it never fights our DPR-capped sizing.
 *
 * COORDINATE MAPPING: the sim's 2D world is (x right, y up) over
 * [0, worldWidth] x [0, worldHeight]. We map it onto the XZ ground plane of a
 * PlayCanvas 3D scene: sceneX = simX - worldWidth/2, sceneZ = worldHeight/2 -
 * simY. This inversion makes simulation +Y appear as screen-up because the
 * camera's up direction is world -Z. SceneY = 0 for every entity. The camera
 * is an orthographic
 * camera placed above the play area at (playerSceneX, CAMERA_HEIGHT,
 * playerSceneZ) and rotated -90 degrees about X so it looks straight down the
 * -Y axis at the XZ plane — the standard PlayCanvas top-down camera pose. It
 * re-centers on the interpolated player position every frame (follow camera).
 *
 * INSTANCED PATH: enemies, projectiles, and pickups each use one
 * `pc.MeshInstance` with a dynamic per-instance transform `pc.VertexBuffer`.
 * The CPU writes complete column-major matrices for the current snapshot and
 * updates `instancingCount`; no entity node exists per sim object. One shared
 * low-poly sphere mesh and one flat material per category produce one draw
 * call per non-empty category. The player remains a normal entity because it
 * is unique and will later be replaced by the hero model.
 *
 * RESOLUTION CAP: `resize()` sizes the drawing buffer to CSS size *
 * min(devicePixelRatio, RESOLUTION_CAP) via `graphicsDevice.maxPixelRatio` +
 * `graphicsDevice.resizeCanvas(cssWidth, cssHeight)`, bounding fill cost on
 * high-DPR desktop and mobile screens alike. RESOLUTION_CAP = 2.
 *
 * CONTEXT LOSS: we add our own `webglcontextlost` / `webglcontextrestored`
 * listeners (in addition to PlayCanvas's internal ones) so we can surface a
 * `contextLost` flag through `stats()` and stop issuing draws immediately on
 * loss, without throwing and without touching simulation state (we never
 * touch it regardless). `preventDefault()` is called on `webglcontextlost` so
 * the browser allows context restoration. On `webglcontextrestored` we clear
 * the flag: PlayCanvas's `GraphicsDevice` already re-uploads / rebuilds
 * GPU-side resources (buffers, shaders, textures) for the meshes/materials it
 * is still tracking as part of its own context-restore handling, since we
 * only ever create resources through `pc.Entity` / `pc.StandardMaterial`,
 * never raw WebGL objects.
 */
import * as pc from 'playcanvas';
import type { SimConfig } from '@sim';
import type { TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import { DEFAULT_CONFIG, RUN_ENEMY_ROLE, ZONE_TAG } from '@sim';
import type {
  RendererAdapter,
  RendererStats,
  RenderSnapshot,
  ViewCategory,
} from '../contracts';
import { lerp } from './interpolation';
import { createInstancedCategoryBatch } from './instanced-category-batch';
import type { InstancedCategoryBatch } from './instanced-category-batch';
import { InstancedTransformStore } from './instanced-transform-store';
import { createGregPresentation } from '../hero/greg-presentation';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';
import { createCombatFeedbackPresentation } from './combat-feedback-presentation';
import { createTraitCommandPresentation } from './trait-command-presentation';
import { createArenaGridPresentation } from './arena-grid-presentation';
import { createForestClearingPresentation } from './forest-clearing-presentation';

/** Backing-store size cap: CSS size * min(devicePixelRatio, RESOLUTION_CAP). */
const RESOLUTION_CAP = 2;

/** World units above the play plane the follow camera sits at. */
const CAMERA_HEIGHT = 600;

/**
 * Half-height (world units) of the orthographic camera's visible viewport.
 * A tighter frame keeps Greg, nearby threats, and XP motes readable at a
 * glance without introducing a lagging camera or touching simulation space.
 */
const CAMERA_ORTHO_HEIGHT = 360;

/** Matches the forest floor so a dropped frame still reads as intentional terrain. */
const CLEAR_COLOR = new pc.Color(0.09, 0.17, 0.1);

const PLAYER_COLOR = new pc.Color(0.2, 0.9, 0.95); // cyan
const CATEGORY_COLORS: Record<ViewCategory, pc.Color> = {
  enemy: new pc.Color(0.86, 0.2, 0.24), // red
  projectile: new pc.Color(0.95, 0.85, 0.2), // yellow
  pickup: new pc.Color(0.27, 0.9, 0.36), // green
  zone: new pc.Color(0.24, 1, 0.58), // mint Gecko pad
};
const HOSTILE_PROJECTILE_COLOR = new pc.Color(1, 0.32, 0.1); // orange-red
/** Fixed role treatments: never a unique material or mesh per enemy. */
const ELITE_ENEMY_COLOR = new pc.Color(1, 0.58, 0.12); // amber
const BOSS_ENEMY_COLOR = new pc.Color(0.72, 0.22, 0.95); // violet
const RANGED_ENEMY_COLOR = new pc.Color(0.18, 0.52, 1); // cobalt-blue
const RAZORSTEP_ZONE_COLOR = new pc.Color(0.82, 1, 0.36); // lime scythe pad
const ELITE_SCALE_MULTIPLIER = 1.35;
const BOSS_SCALE_MULTIPLIER = 2.2;
const RANGED_SCALE_MULTIPLIER = 1.12;

/** One shared unlit/flat material per category (+ player). No per-unit materials. */
function createFlatMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.update();
  return material;
}

/** Persistent pads read as translucent ground decals rather than solid mobs. */
function createZoneMaterial(color: pc.Color): pc.StandardMaterial {
  const material = createFlatMaterial(color);
  material.opacity = 0.4;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.update();
  return material;
}

function toFiniteNumberOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createRenderer(canvas: HTMLCanvasElement, config: SimConfig = DEFAULT_CONFIG): RendererAdapter {
  const worldHalfWidth = config.worldWidth / 2;
  const worldHalfHeight = config.worldHeight / 2;

  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    },
  });

  let contextLost = false;
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
  };
  const onContextRestored = (): void => {
    contextLost = false;
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  // --- Scene root, camera, materials -----------------------------------
  // Environmental art lives in a separate, static root beneath all gameplay
  // meshes. It has no colliders or render-loop updates, so it cannot affect
  // deterministic simulation state or compete with pooled entity ownership.
  const environmentRoot = new pc.Entity('environment');
  app.root.addChild(environmentRoot);
  const forestClearingPresentation = createForestClearingPresentation(
    app.graphicsDevice,
    environmentRoot,
    config.worldWidth,
    config.worldHeight,
  );
  const arenaGridPresentation = createArenaGridPresentation(
    app.graphicsDevice,
    environmentRoot,
    config.worldWidth,
    config.worldHeight,
  );
  const entitiesRoot = new pc.Entity('entities');
  app.root.addChild(entitiesRoot);

  const camera = new pc.Entity('camera');
  camera.addComponent('camera', {
    projection: pc.PROJECTION_ORTHOGRAPHIC,
    orthoHeight: CAMERA_ORTHO_HEIGHT,
    nearClip: 1,
    farClip: CAMERA_HEIGHT * 2,
    clearColor: CLEAR_COLOR,
  });
  camera.setEulerAngles(-90, 0, 0);
  camera.setPosition(0, CAMERA_HEIGHT, 0);
  app.root.addChild(camera);

  // The swarm primitives are intentionally emissive, but authored hero glTFs
  // use normal lit materials. A soft ambient fill plus one shadowless key keeps
  // Greg's colors readable from the top-down camera without adding shadow-map
  // cost or changing deterministic simulation behavior.
  app.scene.ambientLight = new pc.Color(0.55, 0.58, 0.65);
  const heroKeyLight = new pc.Entity('hero-key-light');
  heroKeyLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 0.92, 0.82),
    intensity: 1.1,
    castShadows: false,
  });
  heroKeyLight.setEulerAngles(48, 32, 0);
  app.root.addChild(heroKeyLight);

  const materials: Record<ViewCategory, pc.StandardMaterial> = {
    enemy: createFlatMaterial(CATEGORY_COLORS.enemy),
    projectile: createFlatMaterial(CATEGORY_COLORS.projectile),
    pickup: createFlatMaterial(CATEGORY_COLORS.pickup),
    zone: createZoneMaterial(CATEGORY_COLORS.zone),
  };
  const eliteEnemyMaterial = createFlatMaterial(ELITE_ENEMY_COLOR);
  const bossEnemyMaterial = createFlatMaterial(BOSS_ENEMY_COLOR);
  const rangedEnemyMaterial = createFlatMaterial(RANGED_ENEMY_COLOR);
  const hostileProjectileMaterial = createFlatMaterial(HOSTILE_PROJECTILE_COLOR);
  const razorstepZoneMaterial = createZoneMaterial(RAZORSTEP_ZONE_COLOR);
  const playerMaterial = createFlatMaterial(PLAYER_COLOR);

  const playerEntity = new pc.Entity('player');
  playerEntity.addComponent('render', {
    type: 'sphere',
    material: playerMaterial,
    castShadows: false,
    receiveShadows: false,
  });
  playerEntity.enabled = false;
  entitiesRoot.addChild(playerEntity);
  const gregPresentation = createGregPresentation(app, entitiesRoot, worldHalfWidth, worldHalfHeight);
  const combatFeedbackPresentation = createCombatFeedbackPresentation(
    app.graphicsDevice,
    entitiesRoot,
    worldHalfWidth,
    worldHalfHeight,
  );
  const traitCommandPresentation = createTraitCommandPresentation(
    app.graphicsDevice,
    entitiesRoot,
    worldHalfWidth,
    worldHalfHeight,
  );

  // --- Hardware-instanced category views ---------------------------------
  // Regular enemies, elites, bosses, and ranged enemies use fixed batches.
  // That gives the three authored special roles a one-glance color/scale read
  // while keeping draw-call growth bounded at three extra draws, never one
  // draw or material per enemy. Projectiles and pickups retain the shared
  // sphere.
  const categoryMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.SphereGeometry({ latitudeBands: 8, longitudeBands: 8 }),
  );
  const eliteEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.CylinderGeometry({ radius: 0.55, height: 1, heightSegments: 1, capSegments: 6 }),
  );
  const bossEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.62, height: 1.25, heightSegments: 1, capSegments: 5 }),
  );
  const zoneMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({
      halfExtents: new pc.Vec2(0.5, 0.5),
      widthSegments: 1,
      lengthSegments: 1,
    }),
  );
  const batches: Record<ViewCategory, InstancedCategoryBatch> = {
    enemy: createInstancedCategoryBatch(
      app.graphicsDevice,
      entitiesRoot,
      'enemy',
      config.enemyCap,
      categoryMesh,
      materials.enemy,
    ),
    projectile: createInstancedCategoryBatch(
      app.graphicsDevice,
      entitiesRoot,
      'projectile',
      config.projectileCap,
      categoryMesh,
      materials.projectile,
    ),
    pickup: createInstancedCategoryBatch(
      app.graphicsDevice,
      entitiesRoot,
      'pickup',
      config.pickupCap,
      categoryMesh,
      materials.pickup,
    ),
    zone: createInstancedCategoryBatch(
      app.graphicsDevice,
      entitiesRoot,
      'gecko-pad',
      config.zoneCap,
      zoneMesh,
      materials.zone,
      0.08,
    ),
  };
  const eliteEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'elite-enemy',
    config.enemyCap,
    eliteEnemyMesh,
    eliteEnemyMaterial,
  );
  const bossEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'boss-enemy',
    config.enemyCap,
    bossEnemyMesh,
    bossEnemyMaterial,
  );
  const rangedEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'ranged-enemy',
    config.enemyCap,
    eliteEnemyMesh,
    rangedEnemyMaterial,
  );
  const hostileProjectileBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'hostile-projectile',
    config.projectileCap,
    categoryMesh,
    hostileProjectileMaterial,
  );
  const razorstepZoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'razorstep-pad',
    config.zoneCap,
    zoneMesh,
    razorstepZoneMaterial,
    0.09,
  );

  const transformStores: Record<ViewCategory, InstancedTransformStore> = {
    enemy: new InstancedTransformStore(config.enemyCap),
    projectile: new InstancedTransformStore(config.projectileCap),
    pickup: new InstancedTransformStore(config.pickupCap),
    zone: new InstancedTransformStore(config.zoneCap),
  };
  const eliteEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const bossEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const rangedEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const hostileProjectileTransforms = new InstancedTransformStore(config.projectileCap);
  const razorstepZoneTransforms = new InstancedTransformStore(config.zoneCap);

  let ready = true;
  let lastDrawCalls = 0;

  function resize(): void {
    const cssWidth = Math.max(1, canvas.clientWidth);
    const cssHeight = Math.max(1, canvas.clientHeight);
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    app.graphicsDevice.maxPixelRatio = Math.min(dpr, RESOLUTION_CAP);
    app.graphicsDevice.resizeCanvas(cssWidth, cssHeight);
  }
  resize();

  function render(
    prev: RenderSnapshot,
    curr: RenderSnapshot,
    alpha: number,
    traitVisualState: readonly TraitVisualAttachmentView[],
    combatFeedback: CombatFeedbackSnapshot,
    traitPresentationEvents: readonly TraitPresentationEventView[],
  ): void {
    if (contextLost) {
      return;
    }

    const playerWorldX = lerp(prev.playerX, curr.playerX, alpha);
    const playerWorldY = lerp(prev.playerY, curr.playerY, alpha);
    const playerSceneX = playerWorldX - worldHalfWidth;
    // Camera-up is world -Z, so simulation +Y must map to scene -Z.
    const playerSceneZ = worldHalfHeight - playerWorldY;

    gregPresentation.update(prev, curr, alpha, traitVisualState);
    combatFeedbackPresentation.update(combatFeedback);
    traitCommandPresentation.update(curr.tick, traitPresentationEvents);
    // The cyan sphere is a resilient loading/error fallback. Greg takes over
    // asynchronously once the audited glTF has loaded and initialized.
    playerEntity.enabled = curr.playerAlive && !gregPresentation.ready;
    if (playerEntity.enabled) {
      playerEntity.setLocalPosition(playerSceneX, 0, playerSceneZ);
      const playerScale = curr.playerRadius * 2;
      playerEntity.setLocalScale(playerScale, playerScale, playerScale);
    }

    camera.setPosition(playerSceneX, CAMERA_HEIGHT, playerSceneZ);

    transformStores.enemy.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.regular,
    );
    eliteEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.elite,
      ELITE_SCALE_MULTIPLIER,
    );
    bossEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.boss,
      BOSS_SCALE_MULTIPLIER,
    );
    rangedEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.ranged,
      RANGED_SCALE_MULTIPLIER,
    );
    transformStores.projectile.update(
      prev.projectiles,
      curr.projectiles,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      0,
    );
    hostileProjectileTransforms.update(
      prev.projectiles,
      curr.projectiles,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      1,
    );
    transformStores.pickup.update(
      prev.pickups,
      curr.pickups,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
    );
    transformStores.zone.update(
      prev.zones,
      curr.zones,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      ZONE_TAG.geckoPad,
    );
    razorstepZoneTransforms.update(
      prev.zones,
      curr.zones,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      ZONE_TAG.razorstepScythePad,
    );
    batches.enemy.sync(transformStores.enemy);
    eliteEnemyBatch.sync(eliteEnemyTransforms);
    bossEnemyBatch.sync(bossEnemyTransforms);
    rangedEnemyBatch.sync(rangedEnemyTransforms);
    batches.projectile.sync(transformStores.projectile);
    hostileProjectileBatch.sync(hostileProjectileTransforms);
    batches.pickup.sync(transformStores.pickup);
    batches.zone.sync(transformStores.zone);
    razorstepZoneBatch.sync(razorstepZoneTransforms);

    // app.render() is called manually rather than through app.tick(), so
    // ApplicationStats.updateBasic() never transfers the device counter into
    // app.stats.drawCalls.total. Measure the counter delta around this render
    // instead; otherwise the HUD misleadingly reports zero while drawing.
    const deviceWithCounter = app.graphicsDevice as pc.GraphicsDevice & { _drawCallsPerFrame?: number };
    const beforeDraws = deviceWithCounter._drawCallsPerFrame ?? 0;
    app.render();
    const afterDraws = deviceWithCounter._drawCallsPerFrame ?? beforeDraws;
    lastDrawCalls = Math.max(0, afterDraws - beforeDraws);
  }

  function stats(): RendererStats {
    return {
      drawCalls: toFiniteNumberOrFallback(lastDrawCalls, -1),
      liveViews:
        batches.enemy.liveViews +
        eliteEnemyBatch.liveViews +
        bossEnemyBatch.liveViews +
        rangedEnemyBatch.liveViews +
        batches.projectile.liveViews +
        hostileProjectileBatch.liveViews +
        batches.pickup.liveViews +
        batches.zone.liveViews +
        razorstepZoneBatch.liveViews,
      highWaterViews:
        batches.enemy.highWaterViews +
        eliteEnemyBatch.highWaterViews +
        bossEnemyBatch.highWaterViews +
        rangedEnemyBatch.highWaterViews +
        batches.projectile.highWaterViews +
        hostileProjectileBatch.highWaterViews +
        batches.pickup.highWaterViews +
        batches.zone.highWaterViews +
        razorstepZoneBatch.highWaterViews,
      contextLost: contextLost ? 1 : 0,
    };
  }

  function dispose(): void {
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    ready = false;
    batches.enemy.dispose();
    eliteEnemyBatch.dispose();
    bossEnemyBatch.dispose();
    rangedEnemyBatch.dispose();
    batches.projectile.dispose();
    hostileProjectileBatch.dispose();
    batches.pickup.dispose();
    batches.zone.dispose();
    razorstepZoneBatch.dispose();
    categoryMesh.destroy();
    eliteEnemyMesh.destroy();
    bossEnemyMesh.destroy();
    zoneMesh.destroy();
    materials.enemy.destroy();
    eliteEnemyMaterial.destroy();
    bossEnemyMaterial.destroy();
    rangedEnemyMaterial.destroy();
    materials.projectile.destroy();
    hostileProjectileMaterial.destroy();
    materials.pickup.destroy();
    materials.zone.destroy();
    razorstepZoneMaterial.destroy();
    playerMaterial.destroy();
    traitCommandPresentation.dispose();
    combatFeedbackPresentation.dispose();
    gregPresentation.dispose();
    arenaGridPresentation.dispose();
    forestClearingPresentation.dispose();
    app.destroy();
  }

  return {
    render,
    resize,
    stats,
    get ready(): boolean {
      return ready;
    },
    dispose,
  };
}
