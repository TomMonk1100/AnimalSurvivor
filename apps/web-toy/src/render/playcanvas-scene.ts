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
import {
  DEFAULT_CONFIG,
  idSlot,
  POWER_PICKUP_KIND,
  powerPickupCapacityForXpCap,
  RUN_ENEMY_ROLE,
  ZONE_TAG,
} from '@sim';
import { getPaletteDefinition, isPaletteId, type PaletteId } from '../profile/palettes';
import type { RunDirectorEventView, TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import type {
  HeroId,
  RendererAdapter,
  RendererStats,
  RenderQualityTier,
  RenderSnapshot,
} from '../contracts';
import { lerp } from './interpolation';
import {
  createInstancedCategoryBatch,
  type InstancedCategoryBatch,
} from './instanced-category-batch';
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
import { createDamageNumberPresentation } from './damage-number-presentation';
import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';
import { projectCombatDefensePresentationEvents } from '../presentation/combat-defense-presentation';
import {
  createEnemyThreatPresentation,
  ENEMY_THREAT_PALETTES,
  type EnemyThreatPaletteId,
} from './enemy-threat-presentation';
import {
  createLootVisualPresentation,
  LOOT_VISUAL_STYLE,
} from './loot-visual-presentation';
import { VfxTransformStore } from './vfx-transform-store';
import {
  COMBAT_IMPACT_STYLE,
  createCombatImpactPresentation,
} from './combat-impact-presentation';
import {
  PERSISTENT_ZONE_PRIMARY_CAPACITY,
  createPersistentZoneVisualPresentation,
} from './persistent-zone-visual-presentation';
import {
  createWildguardVfxMaterialBank,
} from './wildguard-vfx-atlas';
import { createIllustratedVfxPresentation } from './illustrated-vfx-presentation';
import {
  createProjectileVisualTruth,
  PLAYER_PROJECTILE_VISUAL_FAMILY,
} from './projectile-visual-truth';

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
// Wildguard combat language: warm = hero power, cold mint/gold = rewards,
// coral/magenta = danger. These lanes stay readable over either arena floor.
const PROJECTILE_COLOR = new pc.Color(1, 0.76, 0.18); // heroic gold
const PICKUP_COLOR = new pc.Color(0.16, 1, 0.66); // cold mint, never grass green
const BOMB_PICKUP_COLOR = new pc.Color(1, 0.3, 0.1); // urgent ember-orange
const MAGNET_PICKUP_COLOR = new pc.Color(0.4, 0.62, 1); // map-wide pull blue
const FOOD_PICKUP_COLOR = new pc.Color(0.44, 1, 0.22); // bright restorative bloom
const HOSTILE_PROJECTILE_COLOR = new pc.Color(1, 0.22, 0.24); // hot coral-red
/** Fixed role treatments: never a unique material or mesh per enemy. */
const ELITE_ENEMY_COLOR = new pc.Color(1, 0.58, 0.12); // amber
const RANGED_ENEMY_COLOR = new pc.Color(0.18, 0.52, 1); // cobalt-blue
const CHARGER_ENEMY_COLOR = new pc.Color(1, 0.58, 0.16); // hot amber
const DENIAL_ENEMY_COLOR = new pc.Color(0.55, 0.35, 0.9); // dusk violet
const FLANKER_ENEMY_COLOR = new pc.Color(1, 0.24, 0.5); // hot pink
const SUPPORT_ENEMY_COLOR = new pc.Color(0.28, 0.95, 0.42); // healing green
const MARKED_ENEMY_COLOR = new pc.Color(0.76, 0.3, 1); // Bat Ears weak-point halo
const ELITE_SCALE_MULTIPLIER = 1.35;
const BOSS_SCALE_MULTIPLIER = 2.2;
const RANGED_SCALE_MULTIPLIER = 1.62;
const CHARGER_SCALE_MULTIPLIER = 1.58;
const DENIAL_SCALE_MULTIPLIER = 1.16;
const FLANKER_SCALE_MULTIPLIER = 1.54;
const SUPPORT_SCALE_MULTIPLIER = 1.56;
const MARKED_ENEMY_SCALE_MULTIPLIER = 1.45;

/** Optional extension kept outside the frozen generic renderer contract. */
export interface DamageNumberRendererControls {
  setDamageNumbersEnabled(enabled: boolean): void;
  setDamageNumberEvents(events: readonly CombatPresentationEventView[]): void;
  /**
   * Hands off already-resolved defensive combat outcomes for renderer-only
   * shields, armor blocks, and dodges. This never feeds back into the sim.
   */
  setCombatPresentationEvents(events: readonly CombatPresentationEventView[]): void;
  /** Supplies time-bounded director warnings to the renderer's danger layer. */
  setDirectorEvents?(events: readonly RunDirectorEventView[]): void;
}

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

/**
 * Exact danger geometry deliberately remains a compact procedural layer.
 * The painted VFX cards carry identity and impact; these rings and lanes
 * retain the unambiguous footprint players need to dodge under heavy swarm
 * density.
 */
function createTelegraphMaterial(color: pc.Color, opacity: number): pc.StandardMaterial {
  const material = createFlatMaterial(color);
  material.opacity = opacity;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
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

interface VfxRoutedBatch {
  readonly store: VfxTransformStore;
  readonly batch: InstancedCategoryBatch;
  /** The art-directed maximum opacity before descriptor attenuation. */
  readonly baseOpacity: number;
  opacityTotal: number;
  opacityCount: number;
}

/**
 * Descriptor families are routed into a small number of retained instanced
 * draws. The material uniform is batch-scoped, so an opacity average avoids
 * per-instance material churn while still making the descriptor's fade value
 * visible on the GPU.
 */
function resetRoutedBatchOpacity(route: VfxRoutedBatch): void {
  route.opacityTotal = 0;
  route.opacityCount = 0;
}

function recordRoutedBatchOpacity(route: VfxRoutedBatch, opacity: number): void {
  const safeOpacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0;
  route.opacityTotal += safeOpacity;
  route.opacityCount++;
}

function syncRoutedBatchOpacity(route: VfxRoutedBatch): void {
  const averageOpacity = route.opacityCount > 0
    ? route.opacityTotal / route.opacityCount
    : 0;
  route.batch.setOpacity(route.baseOpacity * averageOpacity);
}

function sumBatchViews(
  batches: readonly InstancedCategoryBatch[],
  field: 'liveViews' | 'highWaterViews',
): number {
  let total = 0;
  for (const batch of batches) total += batch[field];
  return total;
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
): RendererAdapter & DamageNumberRendererControls {
  const worldHalfWidth = config.worldWidth / 2;
  const worldHalfHeight = config.worldHeight / 2;
  // Mirror the simulation's separate bounded token pool. This is a renderer
  // capacity only; it never owns collection, drops, or token lifetime.
  const powerPickupCapacity = powerPickupCapacityForXpCap(config.pickupCap);

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
  const bombPickupMaterial = createFlatMaterial(BOMB_PICKUP_COLOR);
  const magnetPickupMaterial = createFlatMaterial(MAGNET_PICKUP_COLOR);
  const foodPickupMaterial = createFlatMaterial(FOOD_PICKUP_COLOR);
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
  const enemyShadowMaterial = createShadowMaterial();
  const playerMaterial = createCreatureMaterial(PLAYER_COLOR);

  // The two authored sheets are the actual combat language. The bank owns a
  // finite material per painted cell and preserves native source colors;
  // semantic lanes select a cell/flipbook frame without per-event allocation.
  const wildguardVfxMaterialBank = createWildguardVfxMaterialBank(app.graphicsDevice);
  const playerProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('normalImpact');
  const spitProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('spitComet', 1);
  // Trait projectile art is selected only after the renderer has tied a
  // command to a real live projectile identity. Each family remains one
  // shared flipbook material and one bounded instanced draw.
  const quillProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('quillVolley');
  const owlProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('owlPinions');
  const thornProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('thornstorm');
  const criticalProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('criticalImpact');
  const xpAccentMaterial = wildguardVfxMaterialBank.materialForFrame('xpOrbit');
  const xpHaloMaterial = wildguardVfxMaterialBank.materialForFrame('xpCollect');
  const bombAccentMaterial = wildguardVfxMaterialBank.materialForFrame('bomb');
  const magnetAccentMaterial = wildguardVfxMaterialBank.materialForFrame('magnet');
  const foodAccentMaterial = wildguardVfxMaterialBank.materialForFrame('food');
  const xpMoteCollectionMaterial = wildguardVfxMaterialBank.materialForFrame('xpCollect');
  const xpGemCollectionMaterial = wildguardVfxMaterialBank.materialForFrame('xpOrbit', 1);
  const xpPrismCollectionMaterial = wildguardVfxMaterialBank.materialForFrame('masterXp');
  const bombCollectionMaterial = wildguardVfxMaterialBank.materialForFrame('bomb');
  const magnetCollectionMaterial = wildguardVfxMaterialBank.materialForFrame('magnet');
  const foodCollectionMaterial = wildguardVfxMaterialBank.materialForFrame('food');
  // Persistent zones are alpha-cutout art, never a filled colored plane. The
  // bank owns these materials, and `refreshAnimatedWorldArt` advances their
  // finite frames once per semantic lane without making per-zone resources.
  // Frame zero is Gecko's spawn leaf and frame three is its decay scatter.
  // Persistent pads deliberately begin in the two readable living frames;
  // refreshAnimatedWorldArt alternates those frames while the sim zone lives.
  const geckoPadMaterial = wildguardVfxMaterialBank.materialForFrame('geckoPad', 1);
  const razorstepPadMaterial = wildguardVfxMaterialBank.materialForFrame('geckoPad', 2);
  const skunkCloudMaterial = wildguardVfxMaterialBank.materialForFrame('skunkCloud');
  const royalStinkMaterial = wildguardVfxMaterialBank.materialForFrame('royalStink');
  const hostileProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('hostileThorn', 1);
  const hostileTrailAccentMaterial = wildguardVfxMaterialBank.materialForFrame('hostileThorn', 2);
  // Painted hostile thorns identify the threat while flat, palette-specific
  // rings retain the exact warning geometry. Each remains a bounded lane.
  const threatTelegraphMaterials: Record<EnemyThreatPaletteId, pc.StandardMaterial> = {
    hostile: wildguardVfxMaterialBank.materialForFrame('hostileThorn', 0),
    charger: wildguardVfxMaterialBank.materialForFrame('hostileThorn', 1),
    elite: wildguardVfxMaterialBank.materialForFrame('hostileThorn', 2),
    boss: wildguardVfxMaterialBank.materialForFrame('hostileThorn', 1),
    saltwind: wildguardVfxMaterialBank.materialForFrame('earthWave', 1),
    support: wildguardVfxMaterialBank.materialForFrame('fluffyShield', 1),
  };
  const threatRingMaterials: Record<EnemyThreatPaletteId, pc.StandardMaterial> = {
    hostile: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.hostile.accent), 0.72),
    charger: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.charger.primary), 0.74),
    elite: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.elite.primary), 0.74),
    boss: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.boss.primary), 0.82),
    saltwind: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.saltwind.accent), 0.74),
    support: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.support.accent), 0.58),
  };
  const eliteAuraMaterials = {
    elite: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.elite.primary), 0.58),
    boss: createTelegraphMaterial(parseHexColor(ENEMY_THREAT_PALETTES.boss.accent), 0.72),
  } as const;
  const normalImpactMaterial = wildguardVfxMaterialBank.materialForFrame('normalImpact');
  const criticalImpactMaterial = wildguardVfxMaterialBank.materialForFrame('criticalImpact');
  const playerImpactMaterial = wildguardVfxMaterialBank.materialForFrame('playerImpact');
  const proceduralThreatMaterials: readonly pc.StandardMaterial[] = [
    ...Object.values(threatRingMaterials),
    eliteAuraMaterials.elite,
    eliteAuraMaterials.boss,
  ];

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
  const damageNumberPresentation = createDamageNumberPresentation(canvas, CAMERA_ORTHO_HEIGHT);

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
  // Rare tokens use deliberately distinct silhouettes as well as colors: a
  // faceted charge (Bomb), a ring (Magnet), and a rounded food orb. Each
  // remains one bounded instanced draw batch, never one entity per pickup.
  const bombPickupMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.62, height: 1.14, heightSegments: 1, capSegments: 6 }),
  );
  const magnetPickupMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.TorusGeometry({ tubeRadius: 0.17, ringRadius: 0.46, segments: 10, sides: 6 }),
  );
  const foodPickupMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.SphereGeometry({ radius: 0.54, latitudeBands: 5, longitudeBands: 7 }),
  );
  const markedEnemyMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.38, height: 0.14, heightSegments: 1, capSegments: 4 }),
  );
  const enemyShadowMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.ConeGeometry({ baseRadius: 0.5, height: 0.04, heightSegments: 1, capSegments: 4 }),
  );
  // VFX use two normalized silhouettes: a textured top-down card for core,
  // comet, burst, and telegraph marks; and a faceted ring for spatial danger
  // reads. They are reused by every fixed instanced visual layer below.
  const vfxCardMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.PlaneGeometry({ halfExtents: new pc.Vec2(0.5, 0.5), widthSegments: 1, lengthSegments: 1 }),
  );
  const vfxRingMesh = pc.Mesh.fromGeometry(
    app.graphicsDevice,
    new pc.TorusGeometry({ tubeRadius: 0.09, ringRadius: 0.46, segments: 14, sides: 5 }),
  );
  // This bounded card pool is the primary illustrated layer for hero casts
  // and resolved contact beats. It sits above precise procedural telegraphs
  // but consumes only copied presentation events and never writes simulation.
  const illustratedVfxPresentation = createIllustratedVfxPresentation(
    app.graphicsDevice,
    entitiesRoot,
    worldHalfWidth,
    worldHalfHeight,
    wildguardVfxMaterialBank,
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
  const bombPickupBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'bomb-pickup',
    powerPickupCapacity,
    bombPickupMesh,
    bombPickupMaterial,
    0.28,
  );
  const magnetPickupBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'magnet-pickup',
    powerPickupCapacity,
    magnetPickupMesh,
    magnetPickupMaterial,
    0.3,
  );
  const foodPickupBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'food-pickup',
    powerPickupCapacity,
    foodPickupMesh,
    foodPickupMaterial,
    0.3,
  );
  const zoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'gecko-pad',
    config.zoneCap,
    vfxCardMesh,
    geckoPadMaterial,
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
  const playerProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'hero-projectile-accent', config.projectileCap,
    vfxCardMesh, playerProjectileAccentMaterial, 0.54,
  );
  const spitProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'spit-projectile-accent', config.projectileCap,
    vfxCardMesh, spitProjectileAccentMaterial, 0.57,
  );
  const quillProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'quill-projectile-accent', config.projectileCap,
    vfxCardMesh, quillProjectileAccentMaterial, 0.56,
  );
  const owlProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'owl-projectile-accent', config.projectileCap,
    vfxCardMesh, owlProjectileAccentMaterial, 0.58,
  );
  const thornProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'thornstorm-projectile-accent', config.projectileCap,
    vfxCardMesh, thornProjectileAccentMaterial, 0.55,
  );
  const criticalProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'critical-projectile-accent', config.projectileCap,
    vfxCardMesh, criticalProjectileAccentMaterial, 0.66,
  );
  const xpAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'xp-prism-accent', config.pickupCap,
    vfxCardMesh, xpAccentMaterial, 0.5,
  );
  const xpHaloBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'xp-reward-halo', config.pickupCap,
    vfxCardMesh, xpHaloMaterial, 0.31,
  );
  const bombAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'bomb-reward-accent', powerPickupCapacity,
    vfxCardMesh, bombAccentMaterial, 0.68,
  );
  const magnetAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'magnet-reward-accent', powerPickupCapacity,
    vfxCardMesh, magnetAccentMaterial, 0.67,
  );
  const foodAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'food-reward-accent', powerPickupCapacity,
    vfxCardMesh, foodAccentMaterial, 0.66,
  );
  function createRoutedVfxBatch(
    name: string,
    capacity: number,
    mesh: pc.Mesh,
    material: pc.Material,
    localY: number,
    baseOpacity: number,
  ): VfxRoutedBatch {
    return {
      store: new VfxTransformStore(capacity),
      batch: createInstancedCategoryBatch(
        app.graphicsDevice, entitiesRoot, name, capacity, mesh, material, localY,
      ),
      baseOpacity,
      opacityTotal: 0,
      opacityCount: 0,
    };
  }

  // The collection pool is globally capped at 72 descriptors. Each semantic
  // route receives the same fixed backing capacity, while the presenter
  // guarantees the *combined* live count never exceeds that 72-item budget.
  const xpMoteCollectionRoute = createRoutedVfxBatch(
    'xp-mote-collection-comets', 72, vfxCardMesh, xpMoteCollectionMaterial, 0.58, 0.82,
  );
  const xpGemCollectionRoute = createRoutedVfxBatch(
    'xp-gem-collection-comets', 72, vfxCardMesh, xpGemCollectionMaterial, 0.58, 0.88,
  );
  const xpPrismCollectionRoute = createRoutedVfxBatch(
    'xp-prism-collection-novas', 72, vfxCardMesh, xpPrismCollectionMaterial, 0.58, 0.96,
  );
  const bombCollectionRoute = createRoutedVfxBatch(
    'bomb-collection-novas', 72, vfxCardMesh, bombCollectionMaterial, 0.58, 0.96,
  );
  const magnetCollectionRoute = createRoutedVfxBatch(
    'magnet-collection-vortices', 72, vfxCardMesh, magnetCollectionMaterial, 0.58, 0.9,
  );
  const foodCollectionRoute = createRoutedVfxBatch(
    'food-collection-blooms', 72, vfxCardMesh, foodCollectionMaterial, 0.58, 0.9,
  );
  const collectionRoutes: readonly VfxRoutedBatch[] = [
    xpMoteCollectionRoute,
    xpGemCollectionRoute,
    xpPrismCollectionRoute,
    bombCollectionRoute,
    magnetCollectionRoute,
    foodCollectionRoute,
  ];

  const hostileProjectileAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'hostile-projectile-core', 72,
    vfxCardMesh, hostileProjectileAccentMaterial, 0.72,
  );
  const hostileTrailAccentBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'hostile-projectile-trails', 72,
    vfxCardMesh, hostileTrailAccentMaterial, 0.48,
  );
  const threatTelegraphRoutes: Record<EnemyThreatPaletteId, VfxRoutedBatch> = {
    hostile: createRoutedVfxBatch('hostile-telegraphs', 24, vfxCardMesh, threatTelegraphMaterials.hostile, 0.16, 0.62),
    charger: createRoutedVfxBatch('charger-telegraphs', 24, vfxCardMesh, threatTelegraphMaterials.charger, 0.16, 0.68),
    elite: createRoutedVfxBatch('elite-telegraphs', 24, vfxCardMesh, threatTelegraphMaterials.elite, 0.16, 0.7),
    boss: createRoutedVfxBatch('boss-telegraphs', 24, vfxCardMesh, threatTelegraphMaterials.boss, 0.16, 0.78),
    saltwind: createRoutedVfxBatch('saltwind-telegraphs', 24, vfxCardMesh, threatTelegraphMaterials.saltwind, 0.16, 0.7),
    support: createRoutedVfxBatch('support-telegraphs', 24, vfxCardMesh, threatTelegraphMaterials.support, 0.16, 0.6),
  };
  const threatRingRoutes: Record<EnemyThreatPaletteId, VfxRoutedBatch> = {
    hostile: createRoutedVfxBatch('hostile-contact-rings', 16, vfxRingMesh, threatRingMaterials.hostile, 0.19, 0.72),
    charger: createRoutedVfxBatch('charger-contact-rings', 16, vfxRingMesh, threatRingMaterials.charger, 0.19, 0.74),
    elite: createRoutedVfxBatch('elite-contact-rings', 16, vfxRingMesh, threatRingMaterials.elite, 0.19, 0.74),
    boss: createRoutedVfxBatch('boss-contact-rings', 16, vfxRingMesh, threatRingMaterials.boss, 0.19, 0.82),
    saltwind: createRoutedVfxBatch('saltwind-contact-rings', 16, vfxRingMesh, threatRingMaterials.saltwind, 0.19, 0.74),
    support: createRoutedVfxBatch('support-contact-rings', 16, vfxRingMesh, threatRingMaterials.support, 0.19, 0.58),
  };
  const eliteAuraRoutes = {
    elite: createRoutedVfxBatch('elite-aura-glyphs', 6, vfxCardMesh, eliteAuraMaterials.elite, 0.14, 0.58),
    boss: createRoutedVfxBatch('boss-aura-glyphs', 6, vfxCardMesh, eliteAuraMaterials.boss, 0.14, 0.72),
  } as const;
  const threatTelegraphRouteList = Object.values(threatTelegraphRoutes);
  const threatRingRouteList = Object.values(threatRingRoutes);
  const eliteAuraRouteList: readonly VfxRoutedBatch[] = [eliteAuraRoutes.elite, eliteAuraRoutes.boss];
  const routedVfxBatches: readonly VfxRoutedBatch[] = [
    ...collectionRoutes,
    ...threatTelegraphRouteList,
    ...threatRingRouteList,
    ...eliteAuraRouteList,
  ];
  const routedVfxBatchViews: readonly InstancedCategoryBatch[] = routedVfxBatches.map(
    (route) => route.batch,
  );
  const normalImpactBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'enemy-hit-sparks', 48,
    vfxCardMesh, normalImpactMaterial, 0.82,
  );
  const criticalImpactBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'critical-hit-sparks', 48,
    vfxCardMesh, criticalImpactMaterial, 0.86,
  );
  const playerImpactBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'player-danger-bursts', 48,
    vfxCardMesh, playerImpactMaterial, 0.84,
  );

  /**
   * High-volume world lanes share a deterministic flipbook frame per semantic
   * lane. Signature casts and contacts have their own per-event pool below;
   * this keeps the ambient economy and hostile traffic animated without
   * turning every live mote/projectile into a separate material or entity.
   */
  function refreshAnimatedWorldArt(tick: number): void {
    playerProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('normalImpact', tick));
    playerProjectileAccentBatch.setOpacity(0.46);
    spitProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('spitComet', tick));
    spitProjectileAccentBatch.setOpacity(0.6);
    quillProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('quillVolley', tick));
    quillProjectileAccentBatch.setOpacity(0.78);
    owlProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('owlPinions', tick));
    owlProjectileAccentBatch.setOpacity(0.8);
    thornProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('thornstorm', tick));
    thornProjectileAccentBatch.setOpacity(0.74);
    criticalProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('criticalImpact', tick));
    criticalProjectileAccentBatch.setOpacity(0.68);
    xpAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('xpOrbit', tick));
    xpAccentBatch.setOpacity(0.98);
    xpHaloBatch.setMaterial(wildguardVfxMaterialBank.materialFor('xpOrbit', tick + 6));
    xpHaloBatch.setOpacity(0.44);
    bombAccentBatch.setOpacity(0.92);
    magnetAccentBatch.setOpacity(0.94);
    foodAccentBatch.setOpacity(0.92);
    // Every persistent combat field advances through native-alpha painted
    // frames. The slight phase offsets distinguish the movement trail, its
    // upgraded scythe field, and the two stink variants while retaining one
    // material switch per bounded instanced lane.
    const geckoLivingFrame = 1 + Math.floor(tick / 5) % 2;
    const razorstepLivingFrame = 1 + Math.floor((tick + 3) / 5) % 2;
    zoneBatch.setMaterial(wildguardVfxMaterialBank.materialForFrame('geckoPad', geckoLivingFrame));
    zoneBatch.setOpacity(0.7);
    razorstepZoneBatch.setMaterial(wildguardVfxMaterialBank.materialForFrame('geckoPad', razorstepLivingFrame));
    razorstepZoneBatch.setOpacity(0.76);
    stinkCloudZoneBatch.setMaterial(wildguardVfxMaterialBank.materialFor('skunkCloud', tick + 2));
    royalStinkZoneBatch.setMaterial(wildguardVfxMaterialBank.materialFor('royalStink', tick + 4));
    hostileProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('hostileThorn', tick));
    hostileTrailAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('hostileThorn', tick + 3));
  }
  const razorstepZoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'razorstep-pad',
    config.zoneCap,
    vfxCardMesh,
    razorstepPadMaterial,
    0.09,
  );
  const stinkCloudZoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'stink-cloud',
    PERSISTENT_ZONE_PRIMARY_CAPACITY,
    vfxCardMesh,
    skunkCloudMaterial,
    0.1,
  );
  const royalStinkZoneBatch = createInstancedCategoryBatch(
    app.graphicsDevice,
    entitiesRoot,
    'royal-stink',
    PERSISTENT_ZONE_PRIMARY_CAPACITY,
    vfxCardMesh,
    royalStinkMaterial,
    0.11,
  );

  const transformStores = {
    projectile: new InstancedTransformStore(config.projectileCap),
    pickup: new InstancedTransformStore(config.pickupCap),
    bombPickup: new InstancedTransformStore(powerPickupCapacity),
    magnetPickup: new InstancedTransformStore(powerPickupCapacity),
    foodPickup: new InstancedTransformStore(powerPickupCapacity),
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
  // A Master Skunk can keep several authoritative damage zones alive. The
  // renderer deliberately promotes only the newest one to a bright painted
  // cloud and lets it settle to a quiet footprint, preventing fog from
  // masking Greg while preserving every simulation-owned zone underneath.
  const stinkCloudZoneVisuals = createPersistentZoneVisualPresentation({
    zoneTag: ZONE_TAG.stinkCloud,
    baseOpacity: 0.54,
    scaleMultiplier: 0.78,
    quietOpacityRatio: 0.22,
  });
  const royalStinkZoneVisuals = createPersistentZoneVisualPresentation({
    zoneTag: ZONE_TAG.royalStink,
    baseOpacity: 0.6,
    scaleMultiplier: 0.82,
    quietOpacityRatio: 0.24,
  });
  // These stores are all fixed-capacity and renderer-owned. They turn the
  // projection modules' bounded descriptors into GPU instance matrices with
  // no per-entity scene nodes or simulation writes.
  const vfxTransforms = {
    playerProjectileAccent: new VfxTransformStore(config.projectileCap),
    spitProjectileAccent: new VfxTransformStore(config.projectileCap),
    quillProjectileAccent: new VfxTransformStore(config.projectileCap),
    owlProjectileAccent: new VfxTransformStore(config.projectileCap),
    thornProjectileAccent: new VfxTransformStore(config.projectileCap),
    criticalProjectileAccent: new VfxTransformStore(config.projectileCap),
    xpAccent: new VfxTransformStore(config.pickupCap),
    xpHalo: new VfxTransformStore(config.pickupCap),
    bombAccent: new VfxTransformStore(powerPickupCapacity),
    magnetAccent: new VfxTransformStore(powerPickupCapacity),
    foodAccent: new VfxTransformStore(powerPickupCapacity),
    hostileProjectileAccent: new VfxTransformStore(72),
    hostileTrailAccent: new VfxTransformStore(72),
    normalImpacts: new VfxTransformStore(48),
    criticalImpacts: new VfxTransformStore(48),
    playerImpacts: new VfxTransformStore(48),
  };
  // Kept as a retained array so resetting all VFX pools does not allocate an
  // `Object.values(...)` array in the frame loop.
  const vfxTransformStores: readonly VfxTransformStore[] = [
    vfxTransforms.playerProjectileAccent,
    vfxTransforms.spitProjectileAccent,
    vfxTransforms.quillProjectileAccent,
    vfxTransforms.owlProjectileAccent,
    vfxTransforms.thornProjectileAccent,
    vfxTransforms.criticalProjectileAccent,
    vfxTransforms.xpAccent,
    vfxTransforms.xpHalo,
    vfxTransforms.bombAccent,
    vfxTransforms.magnetAccent,
    vfxTransforms.foodAccent,
    vfxTransforms.hostileProjectileAccent,
    vfxTransforms.hostileTrailAccent,
    vfxTransforms.normalImpacts,
    vfxTransforms.criticalImpacts,
    vfxTransforms.playerImpacts,
    ...routedVfxBatches.map((route) => route.store),
  ];
  const lootVisuals = createLootVisualPresentation({
    xpCapacity: config.pickupCap,
    powerCapacity: powerPickupCapacity,
    collectionCapacity: 72,
  });
  const enemyThreatVisuals = createEnemyThreatPresentation({
    maxProjectileTrails: 72,
    maxTelegraphs: 24,
    maxContactRings: 16,
    maxEliteBossAuras: 6,
  });
  const combatImpactVisuals = createCombatImpactPresentation({ capacity: 48 });
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
  const lootSpriteMotion: SpriteMotionOptions = {
    timeSeconds: 0,
    artFacingRadians: 0,
    movementThreshold: 0.002,
    pulseRadiansPerSecond: 7.4,
    longAxisPulse: 0.11,
    crossAxisPulse: 0.08,
    liftPulse: 0.08,
    facingSwayRadians: 0.08,
  };

  let ready = true;
  let lastDrawCalls = 0;
  let qualityTier: RenderQualityTier = initialQualityTier;
  let resolutionCap = qualityTier === 'reduced' ? 1 : RESOLUTION_CAP;
  let cameraAspect = 1;
  const emptyTraitPresentationEvents: readonly TraitPresentationEventView[] = Object.freeze([]);
  const emptyCombatPresentationEvents: readonly CombatPresentationEventView[] = Object.freeze([]);
  const emptyDirectorEvents: readonly RunDirectorEventView[] = Object.freeze([]);
  let pendingCombatDefenseEvents: readonly TraitPresentationEventView[] = emptyTraitPresentationEvents;
  let pendingCombatImpactEvents: readonly CombatPresentationEventView[] = emptyCombatPresentationEvents;
  let pendingDirectorEvents: readonly RunDirectorEventView[] = emptyDirectorEvents;
  let lastVisualTick = -1;
  const previousProjectileIndexBySlot = new Int32Array(config.projectileCap);
  const previousProjectileStampBySlot = new Uint32Array(config.projectileCap);
  let previousProjectileLookupStamp = 0;
  // Retains only renderer-owned visual family ids; it never modifies a
  // snapshot or the deterministic projectile pool.
  const projectileVisualTruth = createProjectileVisualTruth(config.projectileCap, config.hz);
  const threatOwnedTraitTelegraphScratch: TraitPresentationEventView[] = [];

  function collectionRouteForStyle(style: number): VfxRoutedBatch | null {
    switch (style) {
      case LOOT_VISUAL_STYLE.xpMote: return xpMoteCollectionRoute;
      case LOOT_VISUAL_STYLE.xpGem: return xpGemCollectionRoute;
      case LOOT_VISUAL_STYLE.xpPrism: return xpPrismCollectionRoute;
      case LOOT_VISUAL_STYLE.bomb: return bombCollectionRoute;
      case LOOT_VISUAL_STYLE.magnet: return magnetCollectionRoute;
      case LOOT_VISUAL_STYLE.food: return foodCollectionRoute;
      default: return null;
    }
  }

  function isThreatOwnedTraitTelegraph(event: TraitPresentationEventView): boolean {
    if (event.kind !== 'telegraph') return false;
    switch (event.tag) {
      case 'boss-charge':
      case 'boss-volley':
      case 'saltwind-charge':
      case 'saltwind-sandstorm':
      case 'support-pulse':
        return true;
      default:
        return false;
    }
  }

  /**
   * Boss/support telegraphs are rendered by the threat system, which owns
   * their palette, opacity, and warning hierarchy. Keep trait-command effects
   * for player commands so an enemy warning does not get drawn twice.
   */
  function traitCommandEventsWithoutThreatTelegraphs(
    events: readonly TraitPresentationEventView[],
  ): readonly TraitPresentationEventView[] {
    let firstThreatEvent = -1;
    for (let index = 0; index < events.length; index++) {
      if (isThreatOwnedTraitTelegraph(events[index]!)) {
        firstThreatEvent = index;
        break;
      }
    }
    if (firstThreatEvent < 0) return events;
    threatOwnedTraitTelegraphScratch.length = 0;
    for (const event of events) {
      if (!isThreatOwnedTraitTelegraph(event)) threatOwnedTraitTelegraphScratch.push(event);
    }
    return threatOwnedTraitTelegraphScratch;
  }

  function nextPreviousProjectileLookupStamp(): number {
    previousProjectileLookupStamp = (previousProjectileLookupStamp + 1) >>> 0;
    if (previousProjectileLookupStamp === 0) {
      previousProjectileStampBySlot.fill(0);
      previousProjectileLookupStamp = 1;
    }
    return previousProjectileLookupStamp;
  }

  function resize(): void {
    const cssWidth = Math.max(1, canvas.clientWidth);
    const cssHeight = Math.max(1, canvas.clientHeight);
    cameraAspect = cssWidth / cssHeight;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    app.graphicsDevice.maxPixelRatio = Math.min(dpr, resolutionCap);
    app.graphicsDevice.resizeCanvas(cssWidth, cssHeight);
  }
  resize();

  function sceneX(worldX: number): number {
    return worldX - worldHalfWidth;
  }

  function sceneZ(worldY: number): number {
    return worldHalfHeight - worldY;
  }

  /**
   * Composes all high-polish world VFX from read-only snapshot/event views.
   * This is intentionally the only integration point: every individual layer
   * is still an instanced batch and all presentation modules have a strict
   * fixed budget, so visual intensity cannot turn into simulation or scene
   * graph growth.
   */
  function writeCombatVisualOverhaul(
    prev: RenderSnapshot,
    curr: RenderSnapshot,
    alpha: number,
    presentationEvents: readonly TraitPresentationEventView[],
  ): void {
    if (curr.tick < lastVisualTick) {
      lootVisuals.reset();
      enemyThreatVisuals.reset();
      combatImpactVisuals.reset();
      projectileVisualTruth.reset();
    }
    lastVisualTick = curr.tick;
    refreshAnimatedWorldArt(curr.tick);
    for (const store of vfxTransformStores) store.reset();
    for (const route of routedVfxBatches) resetRoutedBatchOpacity(route);

    const safeAlpha = Math.min(1, Math.max(0, alpha));
    const projectileLookupStamp = nextPreviousProjectileLookupStamp();
    for (let index = 0; index < prev.projectiles.count; index++) {
      const id = prev.projectiles.id[index]!;
      const slot = idSlot(id);
      if (slot >= previousProjectileIndexBySlot.length) continue;
      previousProjectileIndexBySlot[slot] = index;
      previousProjectileStampBySlot[slot] = projectileLookupStamp;
    }
    projectileVisualTruth.update(curr.projectiles, presentationEvents, curr.tick);

    // Player projectiles retain their cheap physical core batch below, then
    // receive exactly one source-aware illustrated accent at their real copied
    // position. A family card is never given invented event-radius travel:
    // unknown/ambiguous traits remain generic, and a confident attribution
    // replaces rather than stacks the generic player accent.
    for (let index = 0; index < curr.projectiles.count; index++) {
      if (curr.projectiles.role[index] !== 0) continue;
      const id = curr.projectiles.id[index]!;
      const slot = idSlot(id);
      const previousIndex = slot < previousProjectileIndexBySlot.length
        && previousProjectileStampBySlot[slot] === projectileLookupStamp
        && prev.projectiles.id[previousProjectileIndexBySlot[slot]!] === id
        ? previousProjectileIndexBySlot[slot]!
        : -1;
      const velocityX = curr.projectiles.velocityX[index] ?? 0;
      const velocityY = curr.projectiles.velocityY[index] ?? 0;
      // A newly spawned/reused slot has no matching prior snapshot. Rendering
      // it at its authoritative current point avoids a one-frame backwards
      // streak from an unrelated predecessor's velocity or position.
      const worldX = previousIndex >= 0
        ? lerp(prev.projectiles.x[previousIndex]!, curr.projectiles.x[index]!, safeAlpha)
        : curr.projectiles.x[index]!;
      const worldY = previousIndex >= 0
        ? lerp(prev.projectiles.y[previousIndex]!, curr.projectiles.y[index]!, safeAlpha)
        : curr.projectiles.y[index]!;
      const baseScale = Math.max(3.6, curr.projectiles.radius[index]! * 2.25);
      const isCritical = curr.projectiles.critical[index] === 1;
      const source = curr.projectiles.source[index] ?? 0;
      const yaw = Math.atan2(velocityX, -velocityY);
      const coreScale = baseScale * (isCritical ? 1.22 : 1);
      const family = projectileVisualTruth.familyFor(id, source);
      const store = family === PLAYER_PROJECTILE_VISUAL_FAMILY.gracieSpit
        ? vfxTransforms.spitProjectileAccent
        : family === PLAYER_PROJECTILE_VISUAL_FAMILY.porcupineQuills
          ? vfxTransforms.quillProjectileAccent
          : family === PLAYER_PROJECTILE_VISUAL_FAMILY.owlPinions
            ? vfxTransforms.owlProjectileAccent
            : family === PLAYER_PROJECTILE_VISUAL_FAMILY.thornstorm
              ? vfxTransforms.thornProjectileAccent
              : vfxTransforms.playerProjectileAccent;
      store.push(sceneX(worldX), sceneZ(worldY), coreScale, 1, coreScale, 0.2, yaw);
      if (isCritical) {
        const starScale = coreScale * 1.28;
        vfxTransforms.criticalProjectileAccent.push(
          sceneX(worldX), sceneZ(worldY), starScale, 1, starScale, 0.36, -yaw,
        );
      }
    }

    const loot = lootVisuals.update(prev, curr, safeAlpha);
    for (let index = 0; index < loot.xp.count; index++) {
      const x = sceneX(loot.xp.x[index]!);
      const z = sceneZ(loot.xp.y[index]!);
      // Runtime pickup radii are deliberately generous for collection; the
      // card scale is therefore art-directed rather than a raw collision read.
      const coreScale = loot.xp.scale[index]! * 3.35;
      const haloScale = loot.xp.haloScale[index]! * (qualityTier === 'standard' ? 3.35 : 0);
      const lift = loot.xp.lift[index]! + 0.06;
      const spin = loot.xp.spinRadians[index]!;
      vfxTransforms.xpAccent.push(x, z, coreScale, 1, coreScale, lift + 0.18, spin);
      if (qualityTier === 'standard') {
        vfxTransforms.xpHalo.push(x, z, haloScale, 1, haloScale, lift, -spin * 0.6);
      }
    }
    for (let index = 0; index < loot.power.count; index++) {
      const style = loot.power.style[index]!;
      const x = sceneX(loot.power.x[index]!);
      const z = sceneZ(loot.power.y[index]!);
      const scale = loot.power.scale[index]! * 1.16;
      const lift = loot.power.lift[index]! + 0.22;
      const spin = loot.power.spinRadians[index]!;
      if (style === LOOT_VISUAL_STYLE.bomb) {
        vfxTransforms.bombAccent.push(x, z, scale, 1, scale, lift, spin);
      } else if (style === LOOT_VISUAL_STYLE.magnet) {
        vfxTransforms.magnetAccent.push(x, z, scale, 1, scale, lift, spin);
      } else if (style === LOOT_VISUAL_STYLE.food) {
        vfxTransforms.foodAccent.push(x, z, scale, 1, scale, lift, spin);
      }
    }
    if (qualityTier === 'standard') {
      for (let index = 0; index < loot.collections.count; index++) {
        const route = collectionRouteForStyle(loot.collections.style[index]!);
        if (route === null) continue;
        const written = route.store.pushRibbon(
          sceneX(loot.collections.tailX[index]!),
          sceneZ(loot.collections.tailY[index]!),
          sceneX(loot.collections.headX[index]!),
          sceneZ(loot.collections.headY[index]!),
          Math.max(0.7, loot.collections.trailWidth[index]! * 3.1),
          0.42,
        );
        if (written) recordRoutedBatchOpacity(route, loot.collections.opacity[index]!);
      }
    }

    const threat = enemyThreatVisuals.update({
      previous: prev,
      current: curr,
      alpha: safeAlpha,
      directorEvents: pendingDirectorEvents,
      traitPresentationEvents: presentationEvents,
    });
    pendingDirectorEvents = emptyDirectorEvents;
    let hostileProjectileOpacityTotal = 0;
    let hostileProjectileOpacityCount = 0;
    for (const projectile of threat.hostileProjectiles) {
      const coreScale = projectile.headRadius * 2.1 * (projectile.critical ? 1.2 : 1);
      const coreWritten = vfxTransforms.hostileProjectileAccent.push(
        sceneX(projectile.headX), sceneZ(projectile.headY), coreScale, 1, coreScale, 0.28,
        Math.atan2(Math.cos(projectile.headingRadians), -Math.sin(projectile.headingRadians)),
      );
      if (coreWritten) {
        hostileProjectileOpacityTotal += projectile.opacity;
        hostileProjectileOpacityCount++;
      }
      if (qualityTier === 'standard') {
        vfxTransforms.hostileTrailAccent.pushRibbon(
          sceneX(projectile.tailX), sceneZ(projectile.tailY),
          sceneX(projectile.headX), sceneZ(projectile.headY),
          Math.max(0.8, projectile.tailWidth * 2.5),
          0.1,
        );
      }
    }
    for (const telegraph of threat.telegraphs) {
      const x = sceneX(telegraph.x);
      const z = sceneZ(telegraph.y);
      const pulse = 0.78 + telegraph.pulse * 0.38;
      const route = threatTelegraphRoutes[telegraph.palette];
      let written = false;
      if (telegraph.style === 'lane') {
        const yaw = Math.atan2(telegraph.dirX, -telegraph.dirY);
        written = route.store.push(
          x, z,
          Math.max(7, telegraph.thickness * 2.4) * pulse,
          1,
          Math.max(telegraph.radius * 1.15, telegraph.length) * pulse,
          0.06,
          yaw,
        );
      } else {
        const scale = Math.max(18, telegraph.radius * 2) * pulse;
        written = route.store.push(x, z, scale, 1, scale, 0.06, telegraph.pulse * Math.PI);
      }
      if (written) recordRoutedBatchOpacity(route, telegraph.opacity);
    }
    for (const ring of threat.contactRings) {
      const scale = ring.radius * 2 * (0.92 + ring.pulse * 0.2);
      const route = threatRingRoutes[ring.palette];
      if (route.store.push(sceneX(ring.x), sceneZ(ring.y), scale, 1, scale, 0.12, ring.pulse)) {
        recordRoutedBatchOpacity(route, ring.opacity);
      }
    }
    for (const aura of threat.eliteBossAuras) {
      const scale = aura.outerRadius * 2 * (0.9 + aura.pulse * 0.14);
      const route = eliteAuraRoutes[aura.palette];
      if (route.store.push(sceneX(aura.x), sceneZ(aura.y), scale, 1, scale, 0.08, -aura.pulse)) {
        recordRoutedBatchOpacity(route, aura.opacity);
      }
    }
    for (const route of routedVfxBatches) syncRoutedBatchOpacity(route);
    const hostileProjectileOpacity = hostileProjectileOpacityCount > 0
      ? hostileProjectileOpacityTotal / hostileProjectileOpacityCount
      : 0;
    hostileProjectileAccentBatch.setOpacity(0.98 * hostileProjectileOpacity);
    hostileTrailAccentBatch.setOpacity(0.72 * hostileProjectileOpacity);

    // Exact resolved combat events provide the contact beat. The projector
    // retains them for a handful of simulation ticks, so a clean ivory spark
    // or an oversized white-gold crit burst remains legible even if a browser
    // frame lands between fixed updates.
    const impacts = combatImpactVisuals.update(pendingCombatImpactEvents, curr.tick);
    let normalImpactOpacityTotal = 0;
    let normalImpactOpacityCount = 0;
    let criticalImpactOpacityTotal = 0;
    let criticalImpactOpacityCount = 0;
    let playerImpactOpacityTotal = 0;
    let playerImpactOpacityCount = 0;
    for (let index = 0; index < impacts.impacts.count; index++) {
      const style = impacts.impacts.style[index]!;
      const impactOpacity = Math.min(1, Math.max(0, impacts.impacts.opacity[index]!));
      const scale = impacts.impacts.coreScale[index]! * (0.68 + impactOpacity * 0.32);
      const lift = impacts.impacts.lift[index]! + 0.3;
      const spin = impacts.impacts.spinRadians[index]!;
      const store = style === COMBAT_IMPACT_STYLE.criticalEnemyHit
        ? vfxTransforms.criticalImpacts
        : style === COMBAT_IMPACT_STYLE.playerHit
          ? vfxTransforms.playerImpacts
          : vfxTransforms.normalImpacts;
      const written = store.push(
        sceneX(impacts.impacts.x[index]!),
        sceneZ(impacts.impacts.y[index]!),
        scale,
        1,
        scale,
        lift,
        spin,
      );
      if (!written) continue;
      if (style === COMBAT_IMPACT_STYLE.criticalEnemyHit) {
        criticalImpactOpacityTotal += impactOpacity;
        criticalImpactOpacityCount++;
      } else if (style === COMBAT_IMPACT_STYLE.playerHit) {
        playerImpactOpacityTotal += impactOpacity;
        playerImpactOpacityCount++;
      } else {
        normalImpactOpacityTotal += impactOpacity;
        normalImpactOpacityCount++;
      }
    }
    normalImpactBatch.setOpacity(
      normalImpactOpacityCount > 0 ? 0.78 * normalImpactOpacityTotal / normalImpactOpacityCount : 0,
    );
    criticalImpactBatch.setOpacity(
      criticalImpactOpacityCount > 0 ? criticalImpactOpacityTotal / criticalImpactOpacityCount : 0,
    );
    playerImpactBatch.setOpacity(
      playerImpactOpacityCount > 0 ? 0.88 * playerImpactOpacityTotal / playerImpactOpacityCount : 0,
    );
  }

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

    const presentationEvents = pendingCombatDefenseEvents.length === 0
      ? traitPresentationEvents
      : traitPresentationEvents.length === 0
        ? pendingCombatDefenseEvents
        : [...traitPresentationEvents, ...pendingCombatDefenseEvents];
    // Input events are per rendered frame; consume the supplemental bridge so
    // repeated render calls cannot replay one block/dodge as multiple effects.
    pendingCombatDefenseEvents = emptyTraitPresentationEvents;

    heroPresentation.update(prev, curr, alpha, traitVisualState, presentationEvents);
    combatFeedbackPresentation.update(combatFeedback);
    traitCommandPresentation.update(
      curr.tick,
      traitCommandEventsWithoutThreatTelegraphs(presentationEvents),
    );
    illustratedVfxPresentation.update(
      curr.tick,
      presentationEvents,
      pendingCombatImpactEvents,
      traitVisualState,
    );
    damageNumberPresentation.update(curr.tick, cameraTarget.x, cameraTarget.y, cameraAspect);
    writeCombatVisualOverhaul(prev, curr, alpha, presentationEvents);
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

    const presentationTimeSeconds = lerp(prev.tick, curr.tick, alpha) / config.hz;
    enemySpriteMotion.timeSeconds = presentationTimeSeconds;
    lootSpriteMotion.timeSeconds = presentationTimeSeconds;
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
      undefined,
      1,
      undefined,
      undefined,
      lootSpriteMotion,
    );
    // Collision radii are intentionally generous for rare pickups, so keep
    // their visual scale readable rather than rendering a 12-unit collection
    // radius as a giant world object. The role filter is the copied sim kind.
    transformStores.bombPickup.update(
      prev.powerPickups,
      curr.powerPickups,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      POWER_PICKUP_KIND.bomb,
      0.42,
      undefined,
      undefined,
      lootSpriteMotion,
    );
    transformStores.magnetPickup.update(
      prev.powerPickups,
      curr.powerPickups,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      POWER_PICKUP_KIND.magnet,
      0.4,
      undefined,
      undefined,
      lootSpriteMotion,
    );
    transformStores.foodPickup.update(
      prev.powerPickups,
      curr.powerPickups,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      POWER_PICKUP_KIND.food,
      0.38,
      undefined,
      undefined,
      lootSpriteMotion,
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
    stinkCloudZoneVisuals.update(
      curr.zones,
      curr.tick,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
    );
    stinkCloudZoneBatch.setOpacity(stinkCloudZoneVisuals.opacity);
    royalStinkZoneVisuals.update(
      curr.zones,
      curr.tick,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
    );
    royalStinkZoneBatch.setOpacity(royalStinkZoneVisuals.opacity);
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
    playerProjectileAccentBatch.sync(vfxTransforms.playerProjectileAccent);
    spitProjectileAccentBatch.sync(vfxTransforms.spitProjectileAccent);
    quillProjectileAccentBatch.sync(vfxTransforms.quillProjectileAccent);
    owlProjectileAccentBatch.sync(vfxTransforms.owlProjectileAccent);
    thornProjectileAccentBatch.sync(vfxTransforms.thornProjectileAccent);
    criticalProjectileAccentBatch.sync(vfxTransforms.criticalProjectileAccent);
    pickupBatch.sync(transformStores.pickup);
    xpAccentBatch.sync(vfxTransforms.xpAccent);
    xpHaloBatch.sync(vfxTransforms.xpHalo);
    bombPickupBatch.sync(transformStores.bombPickup);
    magnetPickupBatch.sync(transformStores.magnetPickup);
    foodPickupBatch.sync(transformStores.foodPickup);
    bombAccentBatch.sync(vfxTransforms.bombAccent);
    magnetAccentBatch.sync(vfxTransforms.magnetAccent);
    foodAccentBatch.sync(vfxTransforms.foodAccent);
    hostileProjectileAccentBatch.sync(vfxTransforms.hostileProjectileAccent);
    hostileTrailAccentBatch.sync(vfxTransforms.hostileTrailAccent);
    for (const route of routedVfxBatches) route.batch.sync(route.store);
    normalImpactBatch.sync(vfxTransforms.normalImpacts);
    criticalImpactBatch.sync(vfxTransforms.criticalImpacts);
    playerImpactBatch.sync(vfxTransforms.playerImpacts);
    zoneBatch.sync(transformStores.zone);
    razorstepZoneBatch.sync(razorstepZoneTransforms);
    stinkCloudZoneBatch.sync(stinkCloudZoneVisuals.transforms);
    royalStinkZoneBatch.sync(royalStinkZoneVisuals.transforms);

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
        playerProjectileAccentBatch.liveViews +
        spitProjectileAccentBatch.liveViews +
        quillProjectileAccentBatch.liveViews +
        owlProjectileAccentBatch.liveViews +
        thornProjectileAccentBatch.liveViews +
        criticalProjectileAccentBatch.liveViews +
        pickupBatch.liveViews +
        xpAccentBatch.liveViews +
        xpHaloBatch.liveViews +
        bombPickupBatch.liveViews +
        magnetPickupBatch.liveViews +
        foodPickupBatch.liveViews +
        bombAccentBatch.liveViews +
        magnetAccentBatch.liveViews +
        foodAccentBatch.liveViews +
        hostileProjectileAccentBatch.liveViews +
        hostileTrailAccentBatch.liveViews +
        sumBatchViews(routedVfxBatchViews, 'liveViews') +
        normalImpactBatch.liveViews +
        criticalImpactBatch.liveViews +
        playerImpactBatch.liveViews +
        illustratedVfxPresentation.liveSlots +
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
        playerProjectileAccentBatch.highWaterViews +
        spitProjectileAccentBatch.highWaterViews +
        quillProjectileAccentBatch.highWaterViews +
        owlProjectileAccentBatch.highWaterViews +
        thornProjectileAccentBatch.highWaterViews +
        criticalProjectileAccentBatch.highWaterViews +
        pickupBatch.highWaterViews +
        xpAccentBatch.highWaterViews +
        xpHaloBatch.highWaterViews +
        bombPickupBatch.highWaterViews +
        magnetPickupBatch.highWaterViews +
        foodPickupBatch.highWaterViews +
        bombAccentBatch.highWaterViews +
        magnetAccentBatch.highWaterViews +
        foodAccentBatch.highWaterViews +
        hostileProjectileAccentBatch.highWaterViews +
        hostileTrailAccentBatch.highWaterViews +
        sumBatchViews(routedVfxBatchViews, 'highWaterViews') +
        normalImpactBatch.highWaterViews +
        criticalImpactBatch.highWaterViews +
        playerImpactBatch.highWaterViews +
        illustratedVfxPresentation.highWaterSlots +
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
    playerProjectileAccentBatch.dispose();
    spitProjectileAccentBatch.dispose();
    quillProjectileAccentBatch.dispose();
    owlProjectileAccentBatch.dispose();
    thornProjectileAccentBatch.dispose();
    criticalProjectileAccentBatch.dispose();
    pickupBatch.dispose();
    xpAccentBatch.dispose();
    xpHaloBatch.dispose();
    bombPickupBatch.dispose();
    magnetPickupBatch.dispose();
    foodPickupBatch.dispose();
    bombAccentBatch.dispose();
    magnetAccentBatch.dispose();
    foodAccentBatch.dispose();
    hostileProjectileAccentBatch.dispose();
    hostileTrailAccentBatch.dispose();
    for (const route of routedVfxBatches) route.batch.dispose();
    normalImpactBatch.dispose();
    criticalImpactBatch.dispose();
    playerImpactBatch.dispose();
    illustratedVfxPresentation.dispose();
    zoneBatch.dispose();
    razorstepZoneBatch.dispose();
    stinkCloudZoneBatch.dispose();
    royalStinkZoneBatch.dispose();
    walkerEnemyMesh.destroy();
    runnerEnemyMesh.destroy();
    bruteEnemyMesh.destroy();
    projectileMesh.destroy();
    pickupMesh.destroy();
    bombPickupMesh.destroy();
    magnetPickupMesh.destroy();
    foodPickupMesh.destroy();
    bossEnemyMesh.destroy();
    markedEnemyMesh.destroy();
    enemyShadowMesh.destroy();
    vfxCardMesh.destroy();
    vfxRingMesh.destroy();
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
    bombPickupMaterial.destroy();
    magnetPickupMaterial.destroy();
    foodPickupMaterial.destroy();
    playerMaterial.destroy();
    for (const material of proceduralThreatMaterials) material.destroy();
    wildguardVfxMaterialBank.dispose();
    damageNumberPresentation.dispose();
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
    setDamageNumbersEnabled(enabled): void {
      damageNumberPresentation.setEnabled(enabled);
    },
    setDamageNumberEvents(events): void {
      damageNumberPresentation.setEvents(events);
    },
    setCombatPresentationEvents(events): void {
      pendingCombatDefenseEvents = projectCombatDefensePresentationEvents(events);
      pendingCombatImpactEvents = events;
    },
    setDirectorEvents(events): void {
      // The driver owns the source array and calls this immediately before
      // render; the threat presenter consumes/copies only its fixed-tick facts.
      pendingDirectorEvents = events;
    },
    setPalette,
    stats,
    get ready(): boolean {
      return ready;
    },
    dispose,
  };
}
