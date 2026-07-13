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
 * camera placed above and just behind the play area at
 * (playerSceneX, CAMERA_HEIGHT, playerSceneZ + CAMERA_FOLLOW_BACK_OFFSET).
 * It looks at the interpolated player with world -Z held as screen-up. That
 * shallow storybook perspective makes the hero, faceted creatures, and layered
 * forest floor read as a place rather than a debug map while keeping simulation
 * +Y screen-up and the follow target completely renderer-owned.
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
import type { BiomeId, SimConfig } from '@sim';
import { getPaletteDefinition, isPaletteId, type PaletteId } from '../profile/palettes';
import type { TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import { DEFAULT_CONFIG, RUN_ENEMY_ROLE, ZONE_TAG } from '@sim';
import type {
  HeroId,
  RendererAdapter,
  RendererStats,
  RenderQualityTier,
  RenderSnapshot,
} from '../contracts';
import { lerp } from './interpolation';
import { createInstancedCategoryBatch } from './instanced-category-batch';
import { InstancedTransformStore, type SpriteMotionOptions } from './instanced-transform-store';
import { createHeroPresentation } from '../hero/hero-presentation';
import type { CombatFeedbackSnapshot } from '../presentation/combat-feedback';
import { createCombatFeedbackPresentation } from './combat-feedback-presentation';
import { createTraitCommandPresentation } from './trait-command-presentation';
import { createArenaGridPresentation } from './arena-grid-presentation';
import { createForestClearingPresentation } from './forest-clearing-presentation';
import { createQuaterniusGladePresentation } from './quaternius-glade-presentation';
import { createContextLossController } from './context-loss-controller';
import { WILDGUARD_ENEMY_SPRITE_URLS } from './wildguard-enemy-sprites';
import { clampCameraTarget } from './camera-bounds';

/** Backing-store size cap: CSS size * min(devicePixelRatio, RESOLUTION_CAP). */
const RESOLUTION_CAP = 2;

/** World units above the play plane the follow camera sits at. */
const CAMERA_HEIGHT = 600;

/** A presentation-only shallow perspective offset behind the hero. */
const CAMERA_FOLLOW_BACK_OFFSET = 520;

/**
 * Half-height (world units) of the orthographic camera's visible viewport.
 * A tighter frame keeps Greg, nearby threats, and XP motes readable at a
 * glance without introducing a lagging camera or touching simulation space.
 */
const CAMERA_ORTHO_HEIGHT = 190;

/** Matches the forest floor so a dropped frame still reads as intentional terrain. */
const CLEAR_COLOR = new pc.Color(0.12, 0.23, 0.12);

const PLAYER_COLOR = new pc.Color(0.2, 0.9, 0.95); // cyan
const PROJECTILE_COLOR = new pc.Color(0.95, 0.85, 0.2); // yellow
const PICKUP_COLOR = new pc.Color(0.27, 0.9, 0.36); // green
const GECKO_PAD_COLOR = new pc.Color(0.24, 1, 0.58); // mint
const HOSTILE_PROJECTILE_COLOR = new pc.Color(1, 0.32, 0.1); // orange-red
/** Fixed role treatments: never a unique material or mesh per enemy. */
const ELITE_ENEMY_COLOR = new pc.Color(1, 0.58, 0.12); // amber
const RANGED_ENEMY_COLOR = new pc.Color(0.18, 0.52, 1); // cobalt-blue
const CHARGER_ENEMY_COLOR = new pc.Color(1, 0.58, 0.16); // hot amber
const DENIAL_ENEMY_COLOR = new pc.Color(0.55, 0.35, 0.9); // dusk violet
const FLANKER_ENEMY_COLOR = new pc.Color(1, 0.24, 0.5); // hot pink
const SUPPORT_ENEMY_COLOR = new pc.Color(0.28, 0.95, 0.42); // healing green
const MARKED_ENEMY_COLOR = new pc.Color(0.76, 0.3, 1); // Bat Ears weak-point halo
const RAZORSTEP_ZONE_COLOR = new pc.Color(0.82, 1, 0.36); // lime scythe pad
const STINK_CLOUD_ZONE_COLOR = new pc.Color(0.82, 0.32, 0.9); // violet hazard cloud
const ROYAL_STINK_ZONE_COLOR = new pc.Color(1, 0.48, 0.18); // royal orange hazard
const ELITE_SCALE_MULTIPLIER = 1.35;
const BOSS_SCALE_MULTIPLIER = 2.2;
const RANGED_SCALE_MULTIPLIER = 1.62;
const CHARGER_SCALE_MULTIPLIER = 1.58;
const DENIAL_SCALE_MULTIPLIER = 1.16;
const FLANKER_SCALE_MULTIPLIER = 1.54;
const SUPPORT_SCALE_MULTIPLIER = 1.56;
const MARKED_ENEMY_SCALE_MULTIPLIER = 1.45;

/**
 * All authored enemy sheets are rendered advancing toward lower-left. The
 * instanced store subtracts this fixed art heading from scene-space velocity
 * so the pictured nose follows actual movement instead of every swarm member
 * being frozen at the same diagonal.
 */
const ENEMY_SPRITE_ART_FACING_RADIANS = -Math.PI / 4;

/** One shared unlit/flat material per category (+ player). No per-unit materials. */
function createFlatMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.update();
  return material;
}

/**
 * Faceted creatures need a little real light to read as an illustrated world,
 * while attacks/pickups intentionally keep the flat emissive treatment above.
 */
function createCreatureMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = true;
  material.diffuse.copy(color);
  material.emissive.set(color.r * 0.12, color.g * 0.12, color.b * 0.12);
  material.specular.set(0.1, 0.1, 0.1);
  material.gloss = 0.26;
  material.update();
  return material;
}

/**
 * Cutout art is deliberately alpha-tested, not alpha-blended: hundreds of
 * overlapping swarm members remain crisp, depth-correct, and cheap without
 * the fuzzy sorting artifacts that make flat billboards feel like a prototype.
 */
function createCutoutSpriteMaterial(tint: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.copy(tint);
  material.emissive.set(tint.r * 0.045, tint.g * 0.045, tint.b * 0.045);
  material.opacity = 1;
  material.alphaTest = 0.14;
  material.blendType = pc.BLEND_NONE;
  material.depthWrite = true;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

interface CutoutTextureBinding {
  dispose(): void;
}

/** Shares one decoded texture across its role-tinted material family. */
function bindCutoutSpriteTexture(
  device: pc.GraphicsDevice,
  url: string,
  materials: readonly pc.StandardMaterial[],
): CutoutTextureBinding {
  const texture = new pc.Texture(device, { mipmaps: true });
  texture.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.minFilter = pc.FILTER_LINEAR_MIPMAP_LINEAR;
  texture.magFilter = pc.FILTER_LINEAR;

  for (const material of materials) {
    material.diffuseMap = texture;
    material.diffuseMapChannel = 'rgb';
    material.opacityMap = texture;
    material.opacityMapChannel = 'a';
    material.update();
  }

  let disposed = false;
  if (typeof Image !== 'undefined') {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (disposed) return;
      texture.setSource(image);
      for (const material of materials) material.update();
    };
    image.src = url;
  }

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      texture.destroy();
    },
  };
}

/** A short, soft creature contact shadow kept below gameplay entities. */
function createShadowMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.set(0, 0, 0);
  material.opacity = 0.24;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
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

function parseHexColor(hex: string): pc.Color {
  const value = Number.parseInt(hex.slice(1), 16);
  return new pc.Color(
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  );
}

function clearColorForPalette(biomeId: BiomeId, paletteId: PaletteId): pc.Color {
  const biomeBase = biomeId === 'saltwind'
    ? new pc.Color(0.16, 0.12, 0.1)
    : CLEAR_COLOR;
  const palette = parseHexColor(getPaletteDefinition(paletteId).primary);
  return new pc.Color(
    biomeBase.r * 0.78 + palette.r * 0.22,
    biomeBase.g * 0.78 + palette.g * 0.22,
    biomeBase.b * 0.78 + palette.b * 0.22,
  );
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  config: SimConfig = DEFAULT_CONFIG,
  initialHeroId: HeroId = 'greg',
  initialBiomeId: BiomeId = 'forest',
  initialQualityTier: RenderQualityTier = 'standard',
  initialPaletteId: PaletteId = 'forest',
): RendererAdapter {
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

  const contextLoss = createContextLossController();
  const onContextLost = (event: Event): void => {
    contextLoss.handleLost(event);
  };
  const onContextRestored = (): void => {
    contextLoss.handleRestored();
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
    initialBiomeId,
  );
  // High-detail CC0 props establish an authored opening vignette while the
  // instanced procedural clearing keeps the rest of the arena affordable.
  // Saltwind deliberately skips these forest props and retains its own ruin
  // dressing from the static environment presentation.
  const quaterniusGladePresentation = initialBiomeId === 'forest'
    ? createQuaterniusGladePresentation(app, environmentRoot, config.worldWidth, config.worldHeight)
    : null;
  const arenaGridPresentation = createArenaGridPresentation(
    app.graphicsDevice,
    environmentRoot,
    config.worldWidth,
    config.worldHeight,
  );
  const entitiesRoot = new pc.Entity('entities');
  app.root.addChild(entitiesRoot);

  const camera = new pc.Entity('camera');
  let paletteId = initialPaletteId;
  const clearColor = clearColorForPalette(initialBiomeId, paletteId);
  camera.addComponent('camera', {
    projection: pc.PROJECTION_ORTHOGRAPHIC,
    orthoHeight: CAMERA_ORTHO_HEIGHT,
    nearClip: 1,
    farClip: CAMERA_HEIGHT * 2,
    clearColor,
  });
  // Filmic mapping keeps the warm sun, dense greens, and bright combat reads
  // in one controlled range instead of clipping the generated ground art.
  camera.camera!.gammaCorrection = pc.GAMMA_SRGB;
  camera.camera!.toneMapping = pc.TONEMAP_ACES;
  camera.setPosition(0, CAMERA_HEIGHT, CAMERA_FOLLOW_BACK_OFFSET);
  camera.lookAt(0, 0, 0, 0, 0, -1);
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

  const projectileMaterial = createFlatMaterial(PROJECTILE_COLOR);
  const pickupMaterial = createFlatMaterial(PICKUP_COLOR);
  const zoneMaterial = createZoneMaterial(GECKO_PAD_COLOR);

  // Each art family keeps a small set of shared tint materials. The texture is
  // decoded only once per family, while role colors preserve the immediate
  // mechanical read that the old primitive batches provided.
  const walkerEnemyMaterial = createCutoutSpriteMaterial(new pc.Color(1, 1, 1));
  const runnerEnemyMaterial = createCutoutSpriteMaterial(new pc.Color(1, 1, 1));
  const bruteEnemyMaterial = createCutoutSpriteMaterial(new pc.Color(1, 1, 1));
  const eliteEnemyMaterial = createCutoutSpriteMaterial(ELITE_ENEMY_COLOR);
  const bossEnemyMaterial = createCutoutSpriteMaterial(new pc.Color(1, 1, 1));
  const rangedEnemyMaterial = createCutoutSpriteMaterial(RANGED_ENEMY_COLOR);
  const chargerEnemyMaterial = createCutoutSpriteMaterial(CHARGER_ENEMY_COLOR);
  const denialEnemyMaterial = createCutoutSpriteMaterial(DENIAL_ENEMY_COLOR);
  const flankerEnemyMaterial = createCutoutSpriteMaterial(FLANKER_ENEMY_COLOR);
  const supportEnemyMaterial = createCutoutSpriteMaterial(SUPPORT_ENEMY_COLOR);
  const markedEnemyMaterial = createFlatMaterial(MARKED_ENEMY_COLOR);
  const hostileProjectileMaterial = createFlatMaterial(HOSTILE_PROJECTILE_COLOR);
  const razorstepZoneMaterial = createZoneMaterial(RAZORSTEP_ZONE_COLOR);
  const stinkCloudZoneMaterial = createZoneMaterial(STINK_CLOUD_ZONE_COLOR);
  const royalStinkZoneMaterial = createZoneMaterial(ROYAL_STINK_ZONE_COLOR);
  const enemyShadowMaterial = createShadowMaterial();
  const playerMaterial = createCreatureMaterial(PLAYER_COLOR);

  const walkerTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.walker,
    [walkerEnemyMaterial, chargerEnemyMaterial, supportEnemyMaterial],
  );
  const runnerTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.runner,
    [runnerEnemyMaterial, rangedEnemyMaterial, flankerEnemyMaterial],
  );
  const bruteTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.brute,
    [bruteEnemyMaterial, eliteEnemyMaterial, denialEnemyMaterial],
  );
  const bossTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.forestBoss,
    [bossEnemyMaterial],
  );

  const playerEntity = new pc.Entity('player');
  playerEntity.addComponent('render', {
    type: 'sphere',
    material: playerMaterial,
    castShadows: false,
    receiveShadows: false,
  });
  playerEntity.enabled = false;
  entitiesRoot.addChild(playerEntity);
  const heroPresentation = createHeroPresentation(
    app,
    entitiesRoot,
    worldHalfWidth,
    worldHalfHeight,
    initialHeroId,
  );
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
  // Every hostile role is still one fixed GPU batch, but core archetypes now
  // map to authored cutout silhouettes instead of recolored primitive cones.
  // That retains bounded draw-call growth while making a mixed swarm readable
  // from the first second of play.
  const walkerEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({ halfExtents: new pc.Vec2(0.76, 0.76), widthSegments: 1, lengthSegments: 1 }),
  );
  const runnerEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({ halfExtents: new pc.Vec2(0.82, 0.82), widthSegments: 1, lengthSegments: 1 }),
  );
  const bruteEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({ halfExtents: new pc.Vec2(0.98, 0.66), widthSegments: 1, lengthSegments: 1 }),
  );
  const bossEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({ halfExtents: new pc.Vec2(1.02, 1.02), widthSegments: 1, lengthSegments: 1 }),
  );
  const projectileMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    // Four facets read as a thrown thorn / magic shard from above, not one
    // more glowing circle in a busy survivor frame.
    new pc.ConeGeometry({ baseRadius: 0.44, height: 1.05, heightSegments: 1, capSegments: 4 }),
  );
  const pickupMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.36, height: 0.92, heightSegments: 1, capSegments: 4 }),
  );
  const markedEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.38, height: 0.14, heightSegments: 1, capSegments: 4 }),
  );
  const enemyShadowMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.5, height: 0.04, heightSegments: 1, capSegments: 4 }),
  );
  const zoneMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({
      halfExtents: new pc.Vec2(0.5, 0.5),
      widthSegments: 1,
      lengthSegments: 1,
    }),
  );
  const walkerEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'bramblehog-swarm',
    config.enemyCap,
    walkerEnemyMesh,
    walkerEnemyMaterial,
    0.07,
  );
  const runnerEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'thornwing-swarm',
    config.enemyCap,
    runnerEnemyMesh,
    runnerEnemyMaterial,
    0.07,
  );
  const bruteEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'rootback-swarm',
    config.enemyCap,
    bruteEnemyMesh,
    bruteEnemyMaterial,
    0.07,
  );
  const projectileBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'projectile',
    config.projectileCap,
    projectileMesh,
    projectileMaterial,
  );
  const pickupBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'pickup',
    config.pickupCap,
    pickupMesh,
    pickupMaterial,
    0.22,
  );
  const zoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'gecko-pad',
    config.zoneCap,
    zoneMesh,
    zoneMaterial,
    0.08,
  );
  const eliteEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'elite-enemy',
    config.enemyCap,
    bruteEnemyMesh,
    eliteEnemyMaterial,
    0.07,
  );
  const enemyShadowBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'enemy-contact-shadow',
    config.enemyCap,
    enemyShadowMesh,
    enemyShadowMaterial,
    -0.18,
  );
  const bossEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'boss-enemy',
    config.enemyCap,
    bossEnemyMesh,
    bossEnemyMaterial,
    0.08,
  );
  const rangedEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'ranged-enemy',
    config.enemyCap,
    runnerEnemyMesh,
    rangedEnemyMaterial,
    0.07,
  );
  const chargerEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'charger-enemy',
    config.enemyCap,
    walkerEnemyMesh,
    chargerEnemyMaterial,
    0.07,
  );
  const denialEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'denial-enemy',
    config.enemyCap,
    bruteEnemyMesh,
    denialEnemyMaterial,
    0.07,
  );
  const flankerEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'flanker-enemy',
    config.enemyCap,
    runnerEnemyMesh,
    flankerEnemyMaterial,
    0.07,
  );
  const supportEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'support-enemy',
    config.enemyCap,
    walkerEnemyMesh,
    supportEnemyMaterial,
    0.07,
  );
  const markedEnemyBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'marked-enemy-crest',
    config.enemyCap,
    markedEnemyMesh,
    markedEnemyMaterial,
    0.12,
  );
  const hostileProjectileBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'hostile-projectile',
    config.projectileCap,
    projectileMesh,
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
  const stinkCloudZoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'stink-cloud',
    config.zoneCap,
    zoneMesh,
    stinkCloudZoneMaterial,
    0.1,
  );
  const royalStinkZoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'royal-stink',
    config.zoneCap,
    zoneMesh,
    royalStinkZoneMaterial,
    0.11,
  );

  const transformStores = {
    projectile: new InstancedTransformStore(config.projectileCap),
    pickup: new InstancedTransformStore(config.pickupCap),
    zone: new InstancedTransformStore(config.zoneCap),
  };
  const archetypeIndex = (name: string, fallback: number): number => {
    const index = config.archetypes.findIndex((archetype) => archetype.name === name);
    return index === -1 ? fallback : index;
  };
  const walkerArchetype = archetypeIndex('walker', 0);
  const runnerArchetype = archetypeIndex('runner', 1);
  const bruteArchetype = archetypeIndex('brute', 2);
  const walkerEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const runnerEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const bruteEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const eliteEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const enemyShadowTransforms = new InstancedTransformStore(config.enemyCap);
  const bossEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const rangedEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const chargerEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const denialEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const flankerEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const supportEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const markedEnemyTransforms = new InstancedTransformStore(config.enemyCap);
  const hostileProjectileTransforms = new InstancedTransformStore(config.projectileCap);
  const razorstepZoneTransforms = new InstancedTransformStore(config.zoneCap);
  const stinkCloudZoneTransforms = new InstancedTransformStore(config.zoneCap);
  const royalStinkZoneTransforms = new InstancedTransformStore(config.zoneCap);
  // This one mutable object is intentionally reused on every frame. Its clock
  // is derived from prev/curr snapshot ticks below, never from wall time, and
  // it is passed only to alpha-cutout enemy planes (not projectiles or zones).
  const enemySpriteMotion: SpriteMotionOptions = {
    timeSeconds: 0,
    artFacingRadians: ENEMY_SPRITE_ART_FACING_RADIANS,
    movementThreshold: 0.012,
    pulseRadiansPerSecond: 5.6,
    longAxisPulse: 0.028,
    crossAxisPulse: 0.018,
    liftPulse: 0.026,
    facingSwayRadians: 0.035,
  };

  let ready = true;
  let lastDrawCalls = 0;
  let qualityTier: RenderQualityTier = initialQualityTier;
  let resolutionCap = qualityTier === 'reduced' ? 1 : RESOLUTION_CAP;
  let cameraAspect = 1;

  function resize(): void {
    const cssWidth = Math.max(1, canvas.clientWidth);
    const cssHeight = Math.max(1, canvas.clientHeight);
    cameraAspect = cssWidth / cssHeight;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    app.graphicsDevice.maxPixelRatio = Math.min(dpr, resolutionCap);
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
    if (contextLoss.lost) {
      return;
    }

    const playerWorldX = lerp(prev.playerX, curr.playerX, alpha);
    const playerWorldY = lerp(prev.playerY, curr.playerY, alpha);
    const playerSceneX = playerWorldX - worldHalfWidth;
    // Camera-up is world -Z, so simulation +Y must map to scene -Z.
    const playerSceneZ = worldHalfHeight - playerWorldY;
    const cameraTarget = clampCameraTarget({
      targetX: playerWorldX,
      targetY: playerWorldY,
      worldWidth: config.worldWidth,
      worldHeight: config.worldHeight,
      aspect: cameraAspect,
      orthoHalfHeight: CAMERA_ORTHO_HEIGHT,
      cameraHeight: CAMERA_HEIGHT,
      followBackOffset: CAMERA_FOLLOW_BACK_OFFSET,
    });
    const cameraSceneX = cameraTarget.x - worldHalfWidth;
    const cameraSceneZ = worldHalfHeight - cameraTarget.y;

    heroPresentation.update(prev, curr, alpha, traitVisualState, traitPresentationEvents);
    combatFeedbackPresentation.update(combatFeedback);
    traitCommandPresentation.update(curr.tick, traitPresentationEvents);
    // The cyan sphere is a resilient loading/error fallback. Greg takes over
    // asynchronously once the audited glTF has loaded and initialized.
    playerEntity.enabled = curr.playerAlive && !heroPresentation.ready;
    if (playerEntity.enabled) {
      playerEntity.setLocalPosition(playerSceneX, 0, playerSceneZ);
      const playerScale = curr.playerRadius * 2;
      playerEntity.setLocalScale(playerScale, playerScale, playerScale);
    }

    camera.setPosition(cameraSceneX, CAMERA_HEIGHT, cameraSceneZ + CAMERA_FOLLOW_BACK_OFFSET);
    camera.lookAt(cameraSceneX, 0, cameraSceneZ, 0, 0, -1);

    enemySpriteMotion.timeSeconds = lerp(prev.tick, curr.tick, alpha) / config.hz;
    walkerEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.regular,
      1.65,
      undefined,
      walkerArchetype,
      enemySpriteMotion,
    );
    runnerEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.regular,
      1.75,
      undefined,
      runnerArchetype,
      enemySpriteMotion,
    );
    bruteEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.regular,
      1,
      undefined,
      bruteArchetype,
      enemySpriteMotion,
    );
    enemyShadowTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.regular,
      1.65,
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
      undefined,
      undefined,
      enemySpriteMotion,
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
      undefined,
      undefined,
      enemySpriteMotion,
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
      undefined,
      undefined,
      enemySpriteMotion,
    );
    chargerEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.charger,
      CHARGER_SCALE_MULTIPLIER,
      undefined,
      undefined,
      enemySpriteMotion,
    );
    denialEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.denial,
      DENIAL_SCALE_MULTIPLIER,
      undefined,
      undefined,
      enemySpriteMotion,
    );
    flankerEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.flanker,
      FLANKER_SCALE_MULTIPLIER,
      undefined,
      undefined,
      enemySpriteMotion,
    );
    supportEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      RUN_ENEMY_ROLE.support,
      SUPPORT_SCALE_MULTIPLIER,
      undefined,
      undefined,
      enemySpriteMotion,
    );
    markedEnemyTransforms.update(
      prev.enemies,
      curr.enemies,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      undefined,
      MARKED_ENEMY_SCALE_MULTIPLIER,
      1,
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
    stinkCloudZoneTransforms.update(
      prev.zones,
      curr.zones,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      ZONE_TAG.stinkCloud,
    );
    royalStinkZoneTransforms.update(
      prev.zones,
      curr.zones,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      ZONE_TAG.royalStink,
    );
    walkerEnemyBatch.sync(walkerEnemyTransforms);
    runnerEnemyBatch.sync(runnerEnemyTransforms);
    bruteEnemyBatch.sync(bruteEnemyTransforms);
    enemyShadowBatch.sync(enemyShadowTransforms);
    eliteEnemyBatch.sync(eliteEnemyTransforms);
    bossEnemyBatch.sync(bossEnemyTransforms);
    rangedEnemyBatch.sync(rangedEnemyTransforms);
    chargerEnemyBatch.sync(chargerEnemyTransforms);
    denialEnemyBatch.sync(denialEnemyTransforms);
    flankerEnemyBatch.sync(flankerEnemyTransforms);
    supportEnemyBatch.sync(supportEnemyTransforms);
    markedEnemyBatch.sync(markedEnemyTransforms);
    projectileBatch.sync(transformStores.projectile);
    hostileProjectileBatch.sync(hostileProjectileTransforms);
    pickupBatch.sync(transformStores.pickup);
    zoneBatch.sync(transformStores.zone);
    razorstepZoneBatch.sync(razorstepZoneTransforms);
    stinkCloudZoneBatch.sync(stinkCloudZoneTransforms);
    royalStinkZoneBatch.sync(royalStinkZoneTransforms);

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
        walkerEnemyBatch.liveViews +
        runnerEnemyBatch.liveViews +
        bruteEnemyBatch.liveViews +
        enemyShadowBatch.liveViews +
        eliteEnemyBatch.liveViews +
        bossEnemyBatch.liveViews +
        rangedEnemyBatch.liveViews +
        chargerEnemyBatch.liveViews +
        denialEnemyBatch.liveViews +
        flankerEnemyBatch.liveViews +
        supportEnemyBatch.liveViews +
        markedEnemyBatch.liveViews +
        projectileBatch.liveViews +
        hostileProjectileBatch.liveViews +
        pickupBatch.liveViews +
        zoneBatch.liveViews +
        razorstepZoneBatch.liveViews +
        stinkCloudZoneBatch.liveViews +
        royalStinkZoneBatch.liveViews,
      highWaterViews:
        walkerEnemyBatch.highWaterViews +
        runnerEnemyBatch.highWaterViews +
        bruteEnemyBatch.highWaterViews +
        enemyShadowBatch.highWaterViews +
        eliteEnemyBatch.highWaterViews +
        bossEnemyBatch.highWaterViews +
        rangedEnemyBatch.highWaterViews +
        chargerEnemyBatch.highWaterViews +
        denialEnemyBatch.highWaterViews +
        flankerEnemyBatch.highWaterViews +
        supportEnemyBatch.highWaterViews +
        markedEnemyBatch.highWaterViews +
        projectileBatch.highWaterViews +
        hostileProjectileBatch.highWaterViews +
        pickupBatch.highWaterViews +
        zoneBatch.highWaterViews +
        razorstepZoneBatch.highWaterViews +
        stinkCloudZoneBatch.highWaterViews +
        royalStinkZoneBatch.highWaterViews,
      contextLost: contextLoss.lost ? 1 : 0,
    };
  }

  function setQualityTier(nextTier: RenderQualityTier): void {
    if (nextTier !== 'standard' && nextTier !== 'reduced') {
      throw new RangeError(`unknown render quality tier: ${String(nextTier)}`);
    }
    if (qualityTier === nextTier) return;
    qualityTier = nextTier;
    resolutionCap = nextTier === 'reduced' ? 1 : RESOLUTION_CAP;
    resize();
  }

  function setPalette(nextPaletteId: string): void {
    if (!isPaletteId(nextPaletteId)) {
      throw new RangeError(`unknown render palette: ${nextPaletteId}`);
    }
    paletteId = nextPaletteId;
    const nextClearColor = clearColorForPalette(initialBiomeId, paletteId);
    camera.camera!.clearColor.copy(nextClearColor);
  }

  function dispose(): void {
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    ready = false;
    walkerEnemyBatch.dispose();
    runnerEnemyBatch.dispose();
    bruteEnemyBatch.dispose();
    enemyShadowBatch.dispose();
    eliteEnemyBatch.dispose();
    bossEnemyBatch.dispose();
    rangedEnemyBatch.dispose();
    chargerEnemyBatch.dispose();
    denialEnemyBatch.dispose();
    flankerEnemyBatch.dispose();
    supportEnemyBatch.dispose();
    markedEnemyBatch.dispose();
    projectileBatch.dispose();
    hostileProjectileBatch.dispose();
    pickupBatch.dispose();
    zoneBatch.dispose();
    razorstepZoneBatch.dispose();
    stinkCloudZoneBatch.dispose();
    royalStinkZoneBatch.dispose();
    walkerEnemyMesh.destroy();
    runnerEnemyMesh.destroy();
    bruteEnemyMesh.destroy();
    projectileMesh.destroy();
    pickupMesh.destroy();
    bossEnemyMesh.destroy();
    markedEnemyMesh.destroy();
    enemyShadowMesh.destroy();
    zoneMesh.destroy();
    walkerTextureBinding.dispose();
    runnerTextureBinding.dispose();
    bruteTextureBinding.dispose();
    bossTextureBinding.dispose();
    walkerEnemyMaterial.destroy();
    runnerEnemyMaterial.destroy();
    bruteEnemyMaterial.destroy();
    eliteEnemyMaterial.destroy();
    bossEnemyMaterial.destroy();
    rangedEnemyMaterial.destroy();
    chargerEnemyMaterial.destroy();
    denialEnemyMaterial.destroy();
    flankerEnemyMaterial.destroy();
    supportEnemyMaterial.destroy();
    markedEnemyMaterial.destroy();
    enemyShadowMaterial.destroy();
    projectileMaterial.destroy();
    hostileProjectileMaterial.destroy();
    pickupMaterial.destroy();
    zoneMaterial.destroy();
    razorstepZoneMaterial.destroy();
    stinkCloudZoneMaterial.destroy();
    royalStinkZoneMaterial.destroy();
    playerMaterial.destroy();
    traitCommandPresentation.dispose();
    combatFeedbackPresentation.dispose();
    heroPresentation.dispose();
    quaterniusGladePresentation?.dispose();
    arenaGridPresentation.dispose();
    forestClearingPresentation.dispose();
    app.destroy();
  }

  return {
    setHero(heroId): void {
      heroPresentation.setHero(heroId);
    },
    render,
    resize,
    setQualityTier,
    setPalette,
    stats,
    get ready(): boolean {
      return ready;
    },
    dispose,
  };
}
