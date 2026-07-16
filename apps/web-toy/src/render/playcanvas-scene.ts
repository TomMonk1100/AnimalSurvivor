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
  COMBAT_DAMAGE_SOURCE,
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
import {
  shouldRenderXpPhysicalMarker,
  shouldRenderXpIllustratedAccent,
  shouldRenderXpIllustratedHalo,
} from './xp-visual-density-governor';
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
import { createImpactVfxCompositePresentation } from './impact-vfx-composite-presentation';
import {
  ENEMY_HIT_FLASH_AGE_OPACITY,
  ENEMY_HIT_FLASH_LIFETIME_TICKS,
  createEnemyHitFlashPresentation,
} from './enemy-hit-flash-presentation';
import { createCameraImpactShakePresentation } from './camera-impact-shake';
import {
  PERSISTENT_ZONE_PRIMARY_CAPACITY,
  createPersistentZoneVisualPresentation,
} from './persistent-zone-visual-presentation';
import {
  createWildguardVfxMaterialBank,
  WILDGUARD_VFX_CLIP,
  type WildguardVfxClip,
} from './wildguard-vfx-atlas';
import { createIllustratedVfxPresentation } from './illustrated-vfx-presentation';
import { createSignatureVfxCompositePresentation } from './signature-vfx-composite-presentation';
import {
  CRITICAL_IMPACT_GOLD,
  PROCEDURAL_UNDERPAINT_COLORS,
  type AttackVfxFamily,
} from './attack-vfx-palette';
import {
  createProjectileVisualTruth,
  PLAYER_PROJECTILE_VISUAL_FAMILY,
} from './projectile-visual-truth';
import {
  createHeroSpitProjectileSignaturePresentation,
  heroSpitBodyForwardScaleForRadius,
  heroSpitBodyLateralScaleForRadius,
} from './projectile-signature-vfx-presentation';

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
/**
 * Player attack cards are transparent, which means tall decorative props can
 * otherwise depth-occlude a valid hit read. This layer clears only depth after
 * the world and keeps the compact combat anatomy visible without changing
 * collision, targeting, or the normal-blend material policy.
 */
const COMBAT_VFX_FOREGROUND_LAYER_ID = 71;
const COMBAT_VFX_FOREGROUND_LAYERS = Object.freeze([COMBAT_VFX_FOREGROUND_LAYER_ID]);

/** Matches the forest floor so a dropped frame still reads as intentional terrain. */
const CLEAR_COLOR = new pc.Color(0.12, 0.23, 0.12);

const PLAYER_COLOR = new pc.Color(0.2, 0.9, 0.95); // cyan
// Wildguard combat language: warm = hero power, cold mint/gold = rewards,
// coral/magenta = danger. These lanes stay readable over either arena floor.
// Routine hero projectiles use the muted physical lane. Full gold is reserved
// for the critical-impact core below, so ordinary high-volume shots cannot
// impersonate a crit or turn a dense run into a yellow wash.
const PROJECTILE_COLOR = new pc.Color(
  PROCEDURAL_UNDERPAINT_COLORS.physical.r,
  PROCEDURAL_UNDERPAINT_COLORS.physical.g,
  PROCEDURAL_UNDERPAINT_COLORS.physical.b,
);
// The physical pickup remains a mint marker, but it intentionally sits below
// attack cores in value/saturation. Dense rewards are readable as a trail,
// not a second cyan VFX field.
const PICKUP_COLOR = new pc.Color(0.08, 0.64, 0.42); // quiet mint; accents carry the reward sparkle
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
const WILDGUARD_IMPACT_CORE_URL = new URL(
  '../../../../assets/ui/vfx/wildguard-impact-core-v1.png',
  import.meta.url,
).href;
const WILDGUARD_SIGNATURE_DEBRIS_URL = new URL(
  '../../../../assets/ui/vfx/wildguard-signature-debris-v1.png',
  import.meta.url,
).href;
const WILDGUARD_GROUND_CONTACT_URL = new URL(
  '../../../../assets/ui/vfx/wildguard-ground-contact-v1.png',
  import.meta.url,
).href;
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

/**
 * A white, normal-blend copy of an existing enemy cutout. The four shared
 * materials are constructed once and receive the same alpha masks as their
 * creature counterparts; hit events only write instance transforms into the
 * retained age-bucket pools below.
 */
function createEnemyHitFlashMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  // This is a whole-silhouette confirmation, not a black translucent copy.
  // StandardMaterial multiplies the bound sprite RGB by diffuse before adding
  // emissive; a black diffuse therefore made a valid overlay effectively
  // invisible against dark swarm art. Keep the shared sprite alpha, but start
  // from white so the three P5 opacity buckets have a visible contact read.
  material.diffuse.set(1, 1, 1);
  material.emissive.set(1, 1, 1);
  material.opacity = 1;
  // Keep the source sheet's feathered alpha instead of reintroducing the
  // hard cutout edge used by the normal swarm material.
  material.alphaTest = 0;
  // This is a whole-enemy white/emissive overlay, not a compact glint. Normal
  // blend keeps it readable without turning a dense swarm into additive haze.
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/**
 * The compact textured flash is the one additive layer in an impact stack.
 * Its authored alpha silhouette carries the hot center; body/debris/ring stay
 * normal-blend so a busy swarm does not turn into additive white noise.
 */
function createImpactCoreMaterial(emissive = new pc.Color(0.82, 0.68, 0.3)): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(1, 1, 1);
  material.emissive.copy(emissive);
  material.opacity = 1;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/**
 * Signature debris deliberately uses the muted attack-family underpaint,
 * rather than a second saturated copy of the painted body card. The material
 * is normal-blend and fixed per family, so it can never create a white-noise
 * additive wash under a dense survivor swarm.
 */
const SIGNATURE_DEBRIS_ATLAS_COLUMN: Readonly<Record<AttackVfxFamily, number>> = Object.freeze({
  physical: 0,
  earth: 1,
  venom: 2,
  arcane: 3,
  storm: 3,
  fire: 3,
});

function createSignatureDebrisMaterial(family: AttackVfxFamily, color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  // Keep the hand-authored chip facets while tinting them into the parent
  // family. A normal blend and a tiny emissive floor read as physical debris
  // over the forest rather than another saturated additive core.
  material.diffuse.copy(color);
  material.emissive.set(color.r * 0.08, color.g * 0.08, color.b * 0.08);
  const atlasColumn = SIGNATURE_DEBRIS_ATLAS_COLUMN[family];
  material.diffuseMapTiling.set(0.25, 1);
  material.diffuseMapOffset.set(atlasColumn * 0.25, 0);
  material.opacityMapTiling.set(0.25, 1);
  material.opacityMapOffset.set(atlasColumn * 0.25, 0);
  material.opacity = 1;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/** A soft normal-blend ellipse anchors each card without making a neon ring. */
function createImpactGroundRingMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  // The authored contact texture is intentionally low-alpha so it can sit
  // below a dense swarm. A warm value lift lets that alpha-shaped band remain
  // visible over the dark green floor without increasing the <=0.25 opacity
  // budget or adding an additive layer.
  // Preserve the authored alpha / normal-blend ceiling, but give its quiet
  // ground contact enough value contrast to survive the forest at the legal
  // 0.25 opacity cap. This is deliberately not a brightness or blend-mode
  // escalation: the contact remains a restrained warm anchor below the body.
  material.diffuse.set(1, 1, 0.88);
  material.emissive.set(0.24, 0.17, 0.06);
  material.opacity = 1;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/** A restrained cool variant for Gracie's real projectile contact oval. */
function createHeroSpitGroundContactMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  // It shares the authored alpha ellipse with impact contact, but the cool
  // teal-white tint cleanly separates a moving spit from Gracie's warm fur
  // and the forest floor. This remains normal blend at the same <=0.25 cap.
  material.diffuse.set(0.5, 0.96, 0.9);
  material.emissive.set(0.04, 0.15, 0.13);
  material.opacity = 1;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
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

interface EnemyHitFlashAgeRoute {
  readonly store: VfxTransformStore;
  readonly batch: InstancedCategoryBatch;
}

interface EnemyHitFlashRoute {
  readonly ageRoutes: readonly EnemyHitFlashAgeRoute[];
}

/** A fixed-opacity GPU lane used to make descriptor fades visible without per-cast materials. */
interface VfxOpacityBucket {
  readonly store: VfxTransformStore;
  readonly batch: InstancedCategoryBatch;
  readonly opacity: number;
}

/** Fixed material/transform lanes for the core + physical debris of one attack family. */
interface SignatureVfxRoute {
  readonly coreBuckets: readonly VfxOpacityBucket[];
  readonly debrisBuckets: readonly VfxOpacityBucket[];
}

const ENEMY_HIT_FLASH_RENDER_CAPACITY = 48;
const IMPACT_COMPOSITE_CAPACITY = 48;
const IMPACT_NORMAL_DEBRIS_CAPACITY = IMPACT_COMPOSITE_CAPACITY * 3;
const IMPACT_CRITICAL_DEBRIS_CAPACITY = IMPACT_COMPOSITE_CAPACITY * 7;
/** Matches the rendered-card admission capacity; all signature sublayers are retained pools. */
const SIGNATURE_VFX_COMPOSITE_CAPACITY = 40;
const SIGNATURE_VFX_DEBRIS_CAPACITY = SIGNATURE_VFX_COMPOSITE_CAPACITY * 7;
// Gracie's anatomy is driven by live projectile snapshots, so it owns a small
// dedicated retained lane rather than competing with event-owned signatures.
const HERO_SPIT_SIGNATURE_CAPACITY = 16;
const HERO_SPIT_SIGNATURE_DEBRIS_CAPACITY = HERO_SPIT_SIGNATURE_CAPACITY * 3;
// Four retained opacity steps are enough to preserve a readable per-fragment
// fade without custom instance attributes or a material/entity per cast.
const SIGNATURE_CORE_OPACITY_BUCKETS = Object.freeze([0.18, 0.42, 0.66, 0.82]);
const SIGNATURE_DEBRIS_OPACITY_BUCKETS = Object.freeze([0.08, 0.22, 0.38, 0.52]);
// Signature contacts must survive the forest floor at gameplay scale, but the
// hard production-plan ceiling remains 0.25 normal-blend opacity.
const SIGNATURE_GROUND_OPACITY_BUCKETS = Object.freeze([0.06, 0.14, 0.21, 0.25]);
const IMPACT_CORE_OPACITY_BUCKETS = Object.freeze([0.16, 0.4, 0.68, 0.9]);
const IMPACT_DEBRIS_OPACITY_BUCKETS = Object.freeze([0.08, 0.22, 0.4, 0.6]);
const IMPACT_GROUND_OPACITY_BUCKETS = Object.freeze([0.04, 0.1, 0.17, 0.24]);
// Zone sheets use the stable first body cell for both their event card and
// their instanced footprint. The renderer animates only a slow transform
// breath, which keeps long-lived damage areas readable without an atlas-frame
// flash or a held terminal dissolve.
const PERSISTENT_ZONE_BODY_FRAME = 0;
const GECKO_PAD_SCALE_MULTIPLIER = 0.72;
const RAZORSTEP_PAD_SCALE_MULTIPLIER = 0.78;

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

function attackColorForFamily(family: AttackVfxFamily): pc.Color {
  const color = PROCEDURAL_UNDERPAINT_COLORS[family];
  return new pc.Color(color.r, color.g, color.b);
}

/**
 * The compact core shares one generated texture but receives the exact attack
 * family's underpaint tint. The painted body still carries identity; this
 * only makes the white-hot center land in the same colour language.
 */
function signatureVfxFamilyForClip(clip: WildguardVfxClip): AttackVfxFamily {
  switch (clip) {
    case WILDGUARD_VFX_CLIP.earthWave:
    case WILDGUARD_VFX_CLIP.armadilloRoll:
      return 'earth';
    case WILDGUARD_VFX_CLIP.spitComet:
    case WILDGUARD_VFX_CLIP.pufferPulse:
    case WILDGUARD_VFX_CLIP.geckoPad:
    case WILDGUARD_VFX_CLIP.skunkCloud:
    case WILDGUARD_VFX_CLIP.royalStink:
      return 'venom';
    case WILDGUARD_VFX_CLIP.thornstorm:
    case WILDGUARD_VFX_CLIP.batSonar:
    case WILDGUARD_VFX_CLIP.midnightRadar:
      return 'arcane';
    case WILDGUARD_VFX_CLIP.owlPinions:
    case WILDGUARD_VFX_CLIP.thunderbug:
    case WILDGUARD_VFX_CLIP.fireflyOrbit:
      return 'storm';
    case WILDGUARD_VFX_CLIP.meteorImpact:
      return 'fire';
    default:
      return 'physical';
  }
}

/** Chooses the nearest retained alpha lane for one descriptor's authored fade. */
function opacityBucketIndex(opacity: number, buckets: readonly number[]): number {
  if (!Number.isFinite(opacity) || opacity <= 0) return -1;
  let selected = 0;
  let distance = Math.abs(opacity - buckets[0]!);
  for (let index = 1; index < buckets.length; index++) {
    const nextDistance = Math.abs(opacity - buckets[index]!);
    if (nextDistance < distance) {
      selected = index;
      distance = nextDistance;
    }
  }
  return selected;
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
  // Put short-lived player action anatomy after the forest's opaque/transparent
  // dressing but before the immediate/UI layers. Clearing depth here prevents a
  // non-colliding canopy or boulder from erasing a real player hit; all VFX
  // materials remain normal/additive exactly as authored and still share their
  // fixed retained pools.
  const combatVfxForegroundLayer = new pc.Layer({
    id: COMBAT_VFX_FOREGROUND_LAYER_ID,
    name: 'combat-vfx-foreground',
    clearDepthBuffer: true,
    transparentSortMode: pc.SORTMODE_BACK2FRONT,
  });
  const immediateLayer = app.scene.layers.getLayerById(pc.LAYERID_IMMEDIATE);
  const insertBeforeImmediate = immediateLayer === null
    ? app.scene.layers.layerList.length
    : app.scene.layers.getTransparentIndex(immediateLayer);
  app.scene.layers.insertTransparent(
    combatVfxForegroundLayer,
    insertBeforeImmediate < 0 ? app.scene.layers.layerList.length : insertBeforeImmediate,
  );
  camera.camera!.layers = [...camera.camera!.layers, COMBAT_VFX_FOREGROUND_LAYER_ID];
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
  // These four materials share the same authored alpha masks as the enemy
  // families, but render a brief white emissive overlay on exact hit targets.
  const walkerEnemyHitFlashMaterial = createEnemyHitFlashMaterial();
  const runnerEnemyHitFlashMaterial = createEnemyHitFlashMaterial();
  const bruteEnemyHitFlashMaterial = createEnemyHitFlashMaterial();
  const bossEnemyHitFlashMaterial = createEnemyHitFlashMaterial();
  const markedEnemyMaterial = createFlatMaterial(MARKED_ENEMY_COLOR);
  const hostileProjectileMaterial = createFlatMaterial(HOSTILE_PROJECTILE_COLOR);
  const enemyShadowMaterial = createShadowMaterial();
  const playerMaterial = createCreatureMaterial(PLAYER_COLOR);
  // Normal impacts stay in the shared muted physical lane. The only
  // full-saturation gold core is routed by critical impact style below.
  const impactCoreMaterial = createImpactCoreMaterial(attackColorForFamily('physical'));
  const criticalImpactCoreMaterial = createImpactCoreMaterial(new pc.Color(
    CRITICAL_IMPACT_GOLD.r,
    CRITICAL_IMPACT_GOLD.g,
    CRITICAL_IMPACT_GOLD.b,
  ));
  // Generated core texture, six fixed family tints. They are constructed once
  // and bound to one decoded texture below; casts only choose an existing
  // instanced lane.
  const signatureCoreMaterials: Record<AttackVfxFamily, pc.StandardMaterial> = {
    physical: createImpactCoreMaterial(attackColorForFamily('physical')),
    // Benny's ridge body owns the ochre/umber palette. Its compact impact
    // core is deliberately ivory so it reads as a leading cracked-earth hit,
    // not as a fourth brown mountain in the lane.
    earth: createImpactCoreMaterial(new pc.Color(1, 0.97, 0.84)),
    // Venom's body already owns the teal/magenta family. A near-white core
    // stays visibly separate at the comet head, then lets the painted tail
    // carry the venom hue instead of blending the two layers together.
    venom: createImpactCoreMaterial(new pc.Color(1, 1, 0.88)),
    arcane: createImpactCoreMaterial(attackColorForFamily('arcane')),
    storm: createImpactCoreMaterial(attackColorForFamily('storm')),
    fire: createImpactCoreMaterial(attackColorForFamily('fire')),
  };
  const signatureDebrisMaterials: Record<AttackVfxFamily, pc.StandardMaterial> = {
    physical: createSignatureDebrisMaterial('physical', attackColorForFamily('physical')),
    earth: createSignatureDebrisMaterial('earth', attackColorForFamily('earth')),
    venom: createSignatureDebrisMaterial('venom', attackColorForFamily('venom')),
    arcane: createSignatureDebrisMaterial('arcane', attackColorForFamily('arcane')),
    storm: createSignatureDebrisMaterial('storm', attackColorForFamily('storm')),
    fire: createSignatureDebrisMaterial('fire', attackColorForFamily('fire')),
  };
  const impactGroundRingMaterial = createImpactGroundRingMaterial();
  // Gracie's core/contact use two dedicated fixed materials so their cool
  // muzzle anatomy does not inherit the warm generic impact palette.
  const heroSpitCoreMaterial = createImpactCoreMaterial(new pc.Color(0.58, 1, 0.96));
  const heroSpitGroundContactMaterial = createHeroSpitGroundContactMaterial();

  // The two authored sheets are the actual combat language. The bank owns a
  // finite material per painted cell and preserves native source colors;
  // semantic lanes select a cell/flipbook frame without per-event allocation.
  const wildguardVfxMaterialBank = createWildguardVfxMaterialBank(app.graphicsDevice);
  // Some high-volume lanes apply a batch-scoped opacity override every frame.
  // Keep their two signature-adjacent materials independent from the
  // illustrated-card pool so a future renderer/backend change cannot let an
  // idle threat or projectile lane affect a live hero cast. These are two
  // fixed startup clones sharing the decoded atlas textures—never per-event
  // materials or allocations.
  const isolatedVfxMaterials: pc.StandardMaterial[] = [];
  const isolateVfxMaterial = (source: pc.StandardMaterial): pc.StandardMaterial => {
    const isolated = source.clone();
    isolated.update();
    isolatedVfxMaterials.push(isolated);
    return isolated;
  };
  const playerProjectileAccentMaterial = wildguardVfxMaterialBank.materialForFrame('normalImpact');
  const spitProjectileAccentMaterial = isolateVfxMaterial(
    wildguardVfxMaterialBank.materialForFrame('spitComet', 1),
  );
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
  // Persistent zones are alpha-cutout art, never a filled colored plane. One
  // stable, full-body cell is selected for the whole zone lifetime so the
  // renderer does not turn an active damage area into a fast fade-out.
  const geckoPadMaterial = wildguardVfxMaterialBank.materialForFrame(
    'geckoPad', PERSISTENT_ZONE_BODY_FRAME,
  );
  const razorstepPadMaterial = wildguardVfxMaterialBank.materialForFrame(
    'geckoPad', PERSISTENT_ZONE_BODY_FRAME,
  );
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
    saltwind: isolateVfxMaterial(wildguardVfxMaterialBank.materialForFrame('saltwindEarthTelegraph')),
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
    [walkerEnemyMaterial, chargerEnemyMaterial, supportEnemyMaterial, walkerEnemyHitFlashMaterial],
  );
  const runnerTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.runner,
    [runnerEnemyMaterial, rangedEnemyMaterial, flankerEnemyMaterial, runnerEnemyHitFlashMaterial],
  );
  const bruteTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.brute,
    [bruteEnemyMaterial, eliteEnemyMaterial, denialEnemyMaterial, bruteEnemyHitFlashMaterial],
  );
  const bossTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_ENEMY_SPRITE_URLS.forestBoss,
    [bossEnemyMaterial, bossEnemyHitFlashMaterial],
  );
  // Cores and physical debris deliberately use separate silhouettes. Reusing
  // the faceted core star made every shard read as an identical spark burst;
  // this dedicated matte chip keeps debris normal-blend and recognisably solid.
  const impactCoreTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_IMPACT_CORE_URL,
    [
      impactCoreMaterial,
      criticalImpactCoreMaterial,
      heroSpitCoreMaterial,
      ...Object.values(signatureCoreMaterials),
    ],
  );
  const signatureDebrisTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_SIGNATURE_DEBRIS_URL,
    Object.values(signatureDebrisMaterials),
  );
  const impactGroundContactTextureBinding = bindCutoutSpriteTexture(
    app.graphicsDevice,
    WILDGUARD_GROUND_CONTACT_URL,
    [impactGroundRingMaterial, heroSpitGroundContactMaterial],
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
    { layers: COMBAT_VFX_FOREGROUND_LAYERS },
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
  function createEnemyHitFlashRoute(
    name: string,
    mesh: pc.Mesh,
    material: pc.Material,
  ): EnemyHitFlashRoute {
    const ageRoutes: EnemyHitFlashAgeRoute[] = [];
    for (let age = 0; age < ENEMY_HIT_FLASH_LIFETIME_TICKS; age++) {
      const batch = createInstancedCategoryBatch(
        app.graphicsDevice,
        entitiesRoot,
        `${name}-${age}`,
        ENEMY_HIT_FLASH_RENDER_CAPACITY,
        mesh,
        material,
        0.115,
      );
      batch.setOpacity(ENEMY_HIT_FLASH_AGE_OPACITY[age]!);
      ageRoutes.push({
        store: new VfxTransformStore(ENEMY_HIT_FLASH_RENDER_CAPACITY),
        batch,
      });
    }
    return { ageRoutes };
  }

  // Age-bucketed white overlays approximate an emissive lerp without a
  // material per enemy or a custom instance-colour shader. The slot lifetime
  // is three ticks, so each bucket has one deterministic opacity.
  const enemyHitFlashRoutes = {
    walker: createEnemyHitFlashRoute(
      'enemy-hit-flash-walker', walkerEnemyMesh, walkerEnemyHitFlashMaterial,
    ),
    runner: createEnemyHitFlashRoute(
      'enemy-hit-flash-runner', runnerEnemyMesh, runnerEnemyHitFlashMaterial,
    ),
    brute: createEnemyHitFlashRoute(
      'enemy-hit-flash-brute', bruteEnemyMesh, bruteEnemyHitFlashMaterial,
    ),
    boss: createEnemyHitFlashRoute(
      'enemy-hit-flash-boss', bossEnemyMesh, bossEnemyHitFlashMaterial,
    ),
  } as const;
  const enemyHitFlashAgeRoutes: readonly EnemyHitFlashAgeRoute[] = [
    ...enemyHitFlashRoutes.walker.ageRoutes,
    ...enemyHitFlashRoutes.runner.ageRoutes,
    ...enemyHitFlashRoutes.brute.ageRoutes,
    ...enemyHitFlashRoutes.boss.ageRoutes,
  ];
  const enemyHitFlashBatchViews: readonly InstancedCategoryBatch[] = enemyHitFlashAgeRoutes.map(
    (route) => route.batch,
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
    vfxCardMesh, spitProjectileAccentMaterial, 0.57, COMBAT_VFX_FOREGROUND_LAYERS,
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
    vfxCardMesh, normalImpactMaterial, 0.82, COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const criticalImpactBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'critical-hit-sparks', 48,
    vfxCardMesh, criticalImpactMaterial, 0.86, COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const playerImpactBatch = createInstancedCategoryBatch(
    app.graphicsDevice, entitiesRoot, 'player-danger-bursts', 48,
    vfxCardMesh, playerImpactMaterial, 0.84, COMBAT_VFX_FOREGROUND_LAYERS,
  );
  function createOpacityBuckets(
    name: string,
    capacity: number,
    material: pc.Material,
    localY: number,
    opacities: readonly number[],
    layers?: readonly number[],
  ): readonly VfxOpacityBucket[] {
    return opacities.map((opacity, index) => {
      const batch = createInstancedCategoryBatch(
        app.graphicsDevice,
        entitiesRoot,
        `${name}-${index}`,
        capacity,
        vfxCardMesh,
        material,
        localY,
        layers,
      );
      batch.setOpacity(opacity);
      return Object.freeze({
        store: new VfxTransformStore(capacity),
        batch,
        opacity,
      });
    });
  }

  // One impact is a compact composite: existing normal-blend painted body,
  // then a four-tick textured core, grounded contact, and physical shards.
  // Alpha buckets retain each descriptor's independent envelope without a
  // custom per-instance shader or a material allocation per hit.
  const impactCoreBuckets = createOpacityBuckets(
    'impact-normal-textured-cores',
    IMPACT_COMPOSITE_CAPACITY,
    impactCoreMaterial,
    // Transparent World geometry is sorted back-to-front from its batch
    // origin. Keep the hot anatomy above the 1.56-height illustrated body so
    // it is composed after it; otherwise a valid core can be hidden behind
    // the large normal-blend card it is meant to punctuate.
    2.16,
    IMPACT_CORE_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  // Criticals alone enter this gold core lane. It shares the same texture,
  // envelope, fixed capacity, and opacity buckets as routine impacts; colour
  // is the only deliberate spike, never a second flash system.
  const criticalImpactCoreBuckets = createOpacityBuckets(
    'impact-critical-gold-cores',
    IMPACT_COMPOSITE_CAPACITY,
    criticalImpactCoreMaterial,
    2.16,
    IMPACT_CORE_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const normalImpactDebrisBuckets = createOpacityBuckets(
    'impact-normal-debris',
    IMPACT_NORMAL_DEBRIS_CAPACITY,
    normalImpactMaterial,
    1.9,
    IMPACT_DEBRIS_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const criticalImpactDebrisBuckets = createOpacityBuckets(
    'impact-critical-debris',
    IMPACT_CRITICAL_DEBRIS_CAPACITY,
    criticalImpactMaterial,
    1.92,
    IMPACT_DEBRIS_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const playerImpactDebrisBuckets = createOpacityBuckets(
    'impact-player-debris',
    IMPACT_NORMAL_DEBRIS_CAPACITY,
    playerImpactMaterial,
    1.9,
    IMPACT_DEBRIS_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const impactGroundContactBuckets = createOpacityBuckets(
    'impact-ground-contacts',
    IMPACT_COMPOSITE_CAPACITY,
    impactGroundRingMaterial,
    0.04,
    IMPACT_GROUND_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const impactCompositeBatchViews: readonly InstancedCategoryBatch[] = [
    ...impactCoreBuckets.map((bucket) => bucket.batch),
    ...criticalImpactCoreBuckets.map((bucket) => bucket.batch),
    ...normalImpactDebrisBuckets.map((bucket) => bucket.batch),
    ...criticalImpactDebrisBuckets.map((bucket) => bucket.batch),
    ...playerImpactDebrisBuckets.map((bucket) => bucket.batch),
    ...impactGroundContactBuckets.map((bucket) => bucket.batch),
  ];

  function createSignatureVfxRoute(family: AttackVfxFamily): SignatureVfxRoute {
    return Object.freeze({
      coreBuckets: createOpacityBuckets(
        `signature-${family}-cores`,
        SIGNATURE_VFX_COMPOSITE_CAPACITY,
        signatureCoreMaterials[family],
        // The painted body is intentionally the dominant normal-blend layer,
        // but its short hot core must sort in front of it rather than being
        // structurally present yet occluded by the body card.
        2.16,
        SIGNATURE_CORE_OPACITY_BUCKETS,
        COMBAT_VFX_FOREGROUND_LAYERS,
      ),
      debrisBuckets: createOpacityBuckets(
        `signature-${family}-debris`,
        SIGNATURE_VFX_DEBRIS_CAPACITY,
        signatureDebrisMaterials[family],
        1.9,
        SIGNATURE_DEBRIS_OPACITY_BUCKETS,
        COMBAT_VFX_FOREGROUND_LAYERS,
      ),
    });
  }

  // Six explicit palette lanes keep the generated impact core tied to each
  // attack family without per-cast materials. Their fixed pools are only
  // populated by admitted player signature descriptors below.
  const signatureVfxRoutes: Record<AttackVfxFamily, SignatureVfxRoute> = {
    physical: createSignatureVfxRoute('physical'),
    earth: createSignatureVfxRoute('earth'),
    venom: createSignatureVfxRoute('venom'),
    arcane: createSignatureVfxRoute('arcane'),
    storm: createSignatureVfxRoute('storm'),
    fire: createSignatureVfxRoute('fire'),
  };
  const signatureVfxRouteList: readonly SignatureVfxRoute[] = Object.values(signatureVfxRoutes);
  const signatureGroundContactBuckets = createOpacityBuckets(
    'signature-ground-contacts',
    SIGNATURE_VFX_COMPOSITE_CAPACITY,
    impactGroundRingMaterial,
    // Separate this normal-blend contact from the floor enough to avoid
    // depth fighting; it remains beneath body cards and hot cores.
    0.06,
    SIGNATURE_GROUND_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const signatureCompositeBatchViews: readonly InstancedCategoryBatch[] = [
    ...signatureVfxRouteList.flatMap((route) => [
      ...route.coreBuckets.map((bucket) => bucket.batch),
      ...route.debrisBuckets.map((bucket) => bucket.batch),
    ]),
    ...signatureGroundContactBuckets.map((bucket) => bucket.batch),
  ];

  // Gracie’s Spit Comet has no event-owned body card: its painted body stays
  // on the real projectile snapshot. These retained lanes add only its short
  // hot core, seeded normal-blend tail, and quiet source/impact ground read.
  // The core material is additive; debris and contact retain normal blend.
  const heroSpitSignatureCoreBuckets = createOpacityBuckets(
    'hero-spit-projectile-cores',
    HERO_SPIT_SIGNATURE_CAPACITY,
    heroSpitCoreMaterial,
    2.16,
    SIGNATURE_CORE_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const heroSpitSignatureDebrisBuckets = createOpacityBuckets(
    'hero-spit-projectile-debris',
    HERO_SPIT_SIGNATURE_DEBRIS_CAPACITY,
    signatureDebrisMaterials.venom,
    1.9,
    SIGNATURE_DEBRIS_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const heroSpitSignatureGroundContactBuckets = createOpacityBuckets(
    'hero-spit-projectile-ground-contacts',
    HERO_SPIT_SIGNATURE_CAPACITY * 2,
    heroSpitGroundContactMaterial,
    0.06,
    SIGNATURE_GROUND_OPACITY_BUCKETS,
    COMBAT_VFX_FOREGROUND_LAYERS,
  );
  const heroSpitSignatureBatchViews: readonly InstancedCategoryBatch[] = [
    ...heroSpitSignatureCoreBuckets.map((bucket) => bucket.batch),
    ...heroSpitSignatureDebrisBuckets.map((bucket) => bucket.batch),
    ...heroSpitSignatureGroundContactBuckets.map((bucket) => bucket.batch),
  ];

  /**
   * High-volume world lanes share a deterministic flipbook frame per semantic
   * lane. Signature casts and contacts have their own per-event pool below;
   * this keeps the ambient economy and hostile traffic animated without
   * turning every live mote/projectile into a separate material or entity.
   */
  function refreshAnimatedWorldArt(tick: number): void {
    playerProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('normalImpact', tick));
    playerProjectileAccentBatch.setOpacity(0.46);
    // Spit Comet intentionally uses the stable one-frame P1 body fallback;
    // the isolated material selected at pool creation must not be swapped
    // back onto the shared hero-card material here.
    // This is a single normal-blend card on a real projectile, never a
    // screen wash. Its opacity gives the pale head enough forest contrast
    // while retaining the darker teal contour and all enemy readability.
    spitProjectileAccentBatch.setOpacity(0.78);
    quillProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('quillVolley', tick));
    quillProjectileAccentBatch.setOpacity(0.78);
    owlProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('owlPinions', tick));
    owlProjectileAccentBatch.setOpacity(0.8);
    thornProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('thornstorm', tick));
    thornProjectileAccentBatch.setOpacity(0.74);
    criticalProjectileAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('criticalImpact', tick));
    criticalProjectileAccentBatch.setOpacity(0.68);
    xpAccentBatch.setMaterial(wildguardVfxMaterialBank.materialFor('xpOrbit', tick));
    // A full painted accent plus halo on every late-run mote was the dominant
    // cyan noise in the capture sheet. The physical pickup remains visible;
    // the optional decorative layers are deliberately quiet and density-gated
    // below using stable pickup ids.
    xpAccentBatch.setOpacity(0.34);
    xpHaloBatch.setMaterial(wildguardVfxMaterialBank.materialFor('xpCollect', tick));
    xpHaloBatch.setOpacity(0.08);
    bombAccentBatch.setOpacity(0.92);
    magnetAccentBatch.setOpacity(0.94);
    foodAccentBatch.setOpacity(0.92);
    // Static full-body zone cards retain their silhouette while their slow
    // transform breath carries motion. They are deliberately compact inside
    // the authoritative hit area, so greater upgrade radii still grow the
    // footprint without falsely painting extra collision space.
    zoneBatch.setMaterial(wildguardVfxMaterialBank.materialForFrame('geckoPad', PERSISTENT_ZONE_BODY_FRAME));
    zoneBatch.setOpacity(0.78);
    razorstepZoneBatch.setMaterial(wildguardVfxMaterialBank.materialForFrame('geckoPad', PERSISTENT_ZONE_BODY_FRAME));
    razorstepZoneBatch.setOpacity(0.84);
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
  // cloud, then retains a clearly visible but smaller footprint instead of
  // fading it into the green forest floor. Every simulation-owned zone still
  // exists and damages independently underneath this one-card policy.
  const stinkCloudZoneVisuals = createPersistentZoneVisualPresentation({
    zoneTag: ZONE_TAG.stinkCloud,
    baseOpacity: 0.66,
    scaleMultiplier: 0.68,
    quietOpacityRatio: 0.58,
    fadeInTicks: 10,
    primaryTicks: 42,
    settleTicks: 24,
  });
  const royalStinkZoneVisuals = createPersistentZoneVisualPresentation({
    zoneTag: ZONE_TAG.royalStink,
    baseOpacity: 0.72,
    scaleMultiplier: 0.72,
    quietOpacityRatio: 0.62,
    fadeInTicks: 10,
    primaryTicks: 48,
    settleTicks: 28,
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
    ...impactCoreBuckets.map((bucket) => bucket.store),
    ...criticalImpactCoreBuckets.map((bucket) => bucket.store),
    ...normalImpactDebrisBuckets.map((bucket) => bucket.store),
    ...criticalImpactDebrisBuckets.map((bucket) => bucket.store),
    ...playerImpactDebrisBuckets.map((bucket) => bucket.store),
    ...impactGroundContactBuckets.map((bucket) => bucket.store),
    ...signatureVfxRouteList.flatMap((route) => [
      ...route.coreBuckets.map((bucket) => bucket.store),
      ...route.debrisBuckets.map((bucket) => bucket.store),
    ]),
    ...signatureGroundContactBuckets.map((bucket) => bucket.store),
    ...heroSpitSignatureCoreBuckets.map((bucket) => bucket.store),
    ...heroSpitSignatureDebrisBuckets.map((bucket) => bucket.store),
    ...heroSpitSignatureGroundContactBuckets.map((bucket) => bucket.store),
    ...routedVfxBatches.map((route) => route.store),
    ...enemyHitFlashAgeRoutes.map((route) => route.store),
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
  const impactVfxComposite = createImpactVfxCompositePresentation({
    capacity: IMPACT_COMPOSITE_CAPACITY,
    debrisCapacity: IMPACT_CRITICAL_DEBRIS_CAPACITY,
  });
  const signatureVfxComposite = createSignatureVfxCompositePresentation({
    capacity: SIGNATURE_VFX_COMPOSITE_CAPACITY,
    debrisCapacity: SIGNATURE_VFX_DEBRIS_CAPACITY,
  });
  const heroSpitProjectileSignatureVfx = createHeroSpitProjectileSignaturePresentation({
    projectileCapacity: config.projectileCap,
    capacity: HERO_SPIT_SIGNATURE_CAPACITY,
    debrisCapacity: HERO_SPIT_SIGNATURE_DEBRIS_CAPACITY,
  });
  const enemyHitFlashVisuals = createEnemyHitFlashPresentation({
    capacity: ENEMY_HIT_FLASH_RENDER_CAPACITY,
  });
  const cameraImpactShake = createCameraImpactShakePresentation();
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

  function enemyHitFlashRouteFor(archetype: number, role: number): EnemyHitFlashRoute | null {
    if (role === RUN_ENEMY_ROLE.boss) return enemyHitFlashRoutes.boss;
    if (role === RUN_ENEMY_ROLE.ranged || role === RUN_ENEMY_ROLE.flanker) {
      return enemyHitFlashRoutes.runner;
    }
    if (role === RUN_ENEMY_ROLE.charger || role === RUN_ENEMY_ROLE.support) {
      return enemyHitFlashRoutes.walker;
    }
    if (role === RUN_ENEMY_ROLE.elite || role === RUN_ENEMY_ROLE.denial) {
      return enemyHitFlashRoutes.brute;
    }
    if (role !== RUN_ENEMY_ROLE.regular) return null;
    if (archetype === walkerArchetype) return enemyHitFlashRoutes.walker;
    if (archetype === runnerArchetype) return enemyHitFlashRoutes.runner;
    if (archetype === bruteArchetype) return enemyHitFlashRoutes.brute;
    return null;
  }

  function enemyHitFlashScaleMultiplierFor(archetype: number, role: number): number {
    switch (role) {
      case RUN_ENEMY_ROLE.elite: return ELITE_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.boss: return BOSS_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.ranged: return RANGED_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.charger: return CHARGER_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.denial: return DENIAL_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.flanker: return FLANKER_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.support: return SUPPORT_SCALE_MULTIPLIER;
      case RUN_ENEMY_ROLE.regular:
        if (archetype === walkerArchetype) return 1.65;
        if (archetype === runnerArchetype) return 1.75;
        return 1;
      default: return 1;
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
      impactVfxComposite.reset();
      signatureVfxComposite.reset();
      heroSpitProjectileSignatureVfx.reset();
      enemyHitFlashVisuals.reset();
      cameraImpactShake.reset();
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
      // The compact source code is the direct proof that this is Gracie’s
      // projectile. Do not wait for (or replay) a trait telegraph before
      // giving the real snapshot its body; a reused event must never own it.
      const isGracieSpit = source === COMBAT_DAMAGE_SOURCE.heroSpit;
      const store = isGracieSpit
        ? vfxTransforms.spitProjectileAccent
        : family === PLAYER_PROJECTILE_VISUAL_FAMILY.porcupineQuills
          ? vfxTransforms.quillProjectileAccent
          : family === PLAYER_PROJECTILE_VISUAL_FAMILY.owlPinions
            ? vfxTransforms.owlProjectileAccent
            : family === PLAYER_PROJECTILE_VISUAL_FAMILY.thornstorm
              ? vfxTransforms.thornProjectileAccent
              : vfxTransforms.playerProjectileAccent;
      // Gracie's long head-tail card is tied to the live projectile position
      // and velocity, not an origin telegraph. The old 19x25 accent was too
      // small to survive the survivor camera; this 42x56 minimum makes the
      // real painted anatomy legible without becoming a screen-crossing beam.
      const accentScaleX = isGracieSpit
        ? heroSpitBodyLateralScaleForRadius(curr.projectiles.radius[index]!)
        : coreScale;
      const accentScaleZ = isGracieSpit
        ? heroSpitBodyForwardScaleForRadius(curr.projectiles.radius[index]!)
        : coreScale;
      const accentLift = isGracieSpit ? 0.24 : 0.2;
      store.push(sceneX(worldX), sceneZ(worldY), accentScaleX, 1, accentScaleZ, accentLift, yaw);
      if (isCritical) {
        const starScale = coreScale * 1.28;
        vfxTransforms.criticalProjectileAccent.push(
          sceneX(worldX), sceneZ(worldY), starScale, 1, starScale, 0.36, -yaw,
        );
      }
    }

    // This projector consumes only the copied previous/current `heroSpit`
    // snapshots above. It emits no body card and no cast path, so the long
    // comet cannot double its telegraph or invent travel outside the actual
    // projectile pool. Its impact contact is admitted solely from resolved
    // `gracie-spit` hit evidence copied by the combat presentation bridge.
    const heroSpitSignatures = heroSpitProjectileSignatureVfx.update(
      prev.projectiles,
      curr.projectiles,
      safeAlpha,
      curr.tick,
      pendingCombatImpactEvents,
    );
    for (let index = 0; index < heroSpitSignatures.cores.count; index++) {
      const opacity = heroSpitSignatures.cores.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, SIGNATURE_CORE_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      if (!heroSpitSignatureCoreBuckets[bucketIndex]!.store.push(
        sceneX(heroSpitSignatures.cores.x[index]!),
        sceneZ(heroSpitSignatures.cores.y[index]!),
        heroSpitSignatures.cores.scale[index]!,
        1,
        heroSpitSignatures.cores.scale[index]!,
        2.16,
        Math.PI * 0.5 + heroSpitSignatures.cores.yawRadians[index]!,
      )) continue;
    }
    for (let index = 0; index < heroSpitSignatures.debris.count; index++) {
      const opacity = heroSpitSignatures.debris.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, SIGNATURE_DEBRIS_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      if (!heroSpitSignatureDebrisBuckets[bucketIndex]!.store.push(
        sceneX(heroSpitSignatures.debris.x[index]!),
        sceneZ(heroSpitSignatures.debris.y[index]!),
        heroSpitSignatures.debris.scale[index]!,
        1,
        heroSpitSignatures.debris.scale[index]!,
        heroSpitSignatures.debris.lift[index]!,
        Math.PI * 0.5 + heroSpitSignatures.debris.yawRadians[index]!,
      )) continue;
    }
    for (let index = 0; index < heroSpitSignatures.groundContacts.count; index++) {
      const opacity = heroSpitSignatures.groundContacts.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, SIGNATURE_GROUND_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      if (!heroSpitSignatureGroundContactBuckets[bucketIndex]!.store.push(
        sceneX(heroSpitSignatures.groundContacts.x[index]!),
        sceneZ(heroSpitSignatures.groundContacts.y[index]!),
        heroSpitSignatures.groundContacts.scale[index]!,
        1,
        heroSpitSignatures.groundContacts.scale[index]!,
        0,
        Math.PI * 0.5 + heroSpitSignatures.groundContacts.yawRadians[index]!,
      )) continue;
    }

    const loot = lootVisuals.update(prev, curr, safeAlpha);
    for (let index = 0; index < loot.xp.count; index++) {
      const x = sceneX(loot.xp.x[index]!);
      const z = sceneZ(loot.xp.y[index]!);
      // Runtime pickup radii are deliberately generous for collection; the
      // card scale is therefore art-directed rather than a raw collision read.
      const pickupId = loot.xp.id[index]!;
      const coreScale = loot.xp.scale[index]! * 2.45;
      const haloScale = loot.xp.haloScale[index]! * (qualityTier === 'standard' ? 2.35 : 0);
      const lift = loot.xp.lift[index]! + 0.06;
      const spin = loot.xp.spinRadians[index]!;
      if (shouldRenderXpIllustratedAccent(pickupId, loot.xp.count)) {
        vfxTransforms.xpAccent.push(x, z, coreScale, 1, coreScale, lift + 0.18, spin);
      }
      if (qualityTier === 'standard' && shouldRenderXpIllustratedHalo(pickupId, loot.xp.count)) {
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

    // A successful hit gets a short white silhouette flash on the actual
    // still-live enemy. It is a renderer-only overlay matched by generation
    // id, grouped into three preallocated age buckets, and rate-limited by the
    // policy module before any instanced transform is written.
    const enemyHitFlashes = enemyHitFlashVisuals.update(
      pendingCombatImpactEvents,
      curr.enemies,
      curr.tick,
    );
    for (let index = 0; index < enemyHitFlashes.flashes.count; index++) {
      const age = enemyHitFlashes.flashes.ageTicks[index]!;
      if (age >= ENEMY_HIT_FLASH_LIFETIME_TICKS) continue;
      const archetype = enemyHitFlashes.flashes.archetype[index]!;
      const role = enemyHitFlashes.flashes.role[index]!;
      const route = enemyHitFlashRouteFor(archetype, role);
      if (route === null) continue;
      const ageRoute = route.ageRoutes[age]!;
      const scale = Math.max(0.8, enemyHitFlashes.flashes.radius[index]! * 2
        * enemyHitFlashScaleMultiplierFor(archetype, role) * 1.06);
      ageRoute.store.push(
        sceneX(enemyHitFlashes.flashes.x[index]!),
        sceneZ(enemyHitFlashes.flashes.y[index]!),
        scale,
        1,
        scale,
        0.13,
      );
    }

    // P2 composite anatomy sits around the existing normal-blend impact cards:
    // a <=4-tick textured core, deterministic physical shards, and a quiet
    // contact ring. The pure projector selects crits before routine hits when
    // its fixed pools are pressured; this wiring only writes its packed data.
    const composite = impactVfxComposite.update(impacts);
    for (let index = 0; index < composite.cores.count; index++) {
      const opacity = composite.cores.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, IMPACT_CORE_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      const buckets = composite.cores.style[index] === COMBAT_IMPACT_STYLE.criticalEnemyHit
        ? criticalImpactCoreBuckets
        : impactCoreBuckets;
      if (buckets[bucketIndex]!.store.push(
        sceneX(composite.cores.x[index]!),
        sceneZ(composite.cores.y[index]!),
        composite.cores.scale[index]!,
        1,
        composite.cores.scale[index]!,
        0.02,
        composite.cores.spinRadians[index]!,
      )) continue;
    }
    for (let index = 0; index < composite.debris.count; index++) {
      const style = composite.debris.style[index]!;
      const opacity = composite.debris.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, IMPACT_DEBRIS_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      const buckets = style === COMBAT_IMPACT_STYLE.criticalEnemyHit
        ? criticalImpactDebrisBuckets
        : style === COMBAT_IMPACT_STYLE.playerHit
          ? playerImpactDebrisBuckets
          : normalImpactDebrisBuckets;
      if (!buckets[bucketIndex]!.store.push(
        sceneX(composite.debris.x[index]!),
        sceneZ(composite.debris.y[index]!),
        composite.debris.scale[index]!,
        1,
        composite.debris.scale[index]!,
        composite.debris.lift[index]!,
        composite.debris.yawRadians[index]!,
      )) continue;
    }
    for (let index = 0; index < composite.rings.count; index++) {
      const opacity = composite.rings.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, IMPACT_GROUND_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      if (impactGroundContactBuckets[bucketIndex]!.store.push(
        sceneX(composite.rings.x[index]!),
        sceneZ(composite.rings.y[index]!),
        composite.rings.scale[index]!,
        1,
        composite.rings.scale[index]!,
        0,
        composite.rings.yawRadians[index]!,
      )) continue;
    }

    // Player signature cards receive the same compact anatomy as a contact:
    // the authored card is the body, this retained projector supplies the
    // white-to-family core, physical debris, and a quiet textured ground
    // anchor. Nothing here owns a simulation command, target, or lifetime.
    const signatures = signatureVfxComposite.update(
      curr.tick,
      presentationEvents,
      pendingCombatImpactEvents,
    );
    for (let index = 0; index < signatures.cores.count; index++) {
      const opacity = signatures.cores.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, SIGNATURE_CORE_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      const route = signatureVfxRoutes[signatureVfxFamilyForClip(signatures.cores.clip[index]!)];
      if (!route.coreBuckets[bucketIndex]!.store.push(
        sceneX(signatures.cores.x[index]!),
        sceneZ(signatures.cores.y[index]!),
        signatures.cores.scale[index]!,
        1,
        signatures.cores.scale[index]!,
        signatures.cores.lift[index]!,
        Math.PI * 0.5 + signatures.cores.yawRadians[index]!,
      )) continue;
    }
    for (let index = 0; index < signatures.debris.count; index++) {
      const opacity = signatures.debris.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, SIGNATURE_DEBRIS_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      const route = signatureVfxRoutes[signatureVfxFamilyForClip(signatures.debris.clip[index]!)];
      if (!route.debrisBuckets[bucketIndex]!.store.push(
        sceneX(signatures.debris.x[index]!),
        sceneZ(signatures.debris.y[index]!),
        signatures.debris.scale[index]!,
        1,
        signatures.debris.scale[index]!,
        signatures.debris.lift[index]!,
        Math.PI * 0.5 + signatures.debris.yawRadians[index]!,
      )) continue;
    }
    for (let index = 0; index < signatures.groundContacts.count; index++) {
      const opacity = signatures.groundContacts.opacity[index]!;
      const bucketIndex = opacityBucketIndex(opacity, SIGNATURE_GROUND_OPACITY_BUCKETS);
      if (bucketIndex < 0) continue;
      if (!signatureGroundContactBuckets[bucketIndex]!.store.push(
        sceneX(signatures.groundContacts.x[index]!),
        sceneZ(signatures.groundContacts.y[index]!),
        signatures.groundContacts.scale[index]!,
        1,
        signatures.groundContacts.scale[index]!,
        0,
        Math.PI * 0.5 + signatures.groundContacts.yawRadians[index]!,
      )) continue;
    }
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
    const cameraShake = cameraImpactShake.update(pendingCombatImpactEvents, curr.tick);
    // The cyan sphere is a resilient loading/error fallback. Greg takes over
    // asynchronously once the audited glTF has loaded and initialized.
    playerEntity.enabled = curr.playerAlive && !heroPresentation.ready;
    if (playerEntity.enabled) {
      playerEntity.setLocalPosition(playerSceneX, 0, playerSceneZ);
      const playerScale = curr.playerRadius * 2;
      playerEntity.setLocalScale(playerScale, playerScale, playerScale);
    }

    // Shake is applied after the normal bounded follow calculation, and moves
    // position plus look target together. It therefore cannot change camera
    // clamp semantics or simulation-space aiming—only the rendered framing.
    camera.setPosition(
      cameraSceneX + cameraShake.x,
      CAMERA_HEIGHT,
      cameraSceneZ + cameraShake.y + CAMERA_FOLLOW_BACK_OFFSET,
    );
    camera.lookAt(cameraSceneX + cameraShake.x, 0, cameraSceneZ + cameraShake.y, 0, 0, -1);

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
      0.82,
      undefined,
      undefined,
      lootSpriteMotion,
      shouldRenderXpPhysicalMarker,
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
      GECKO_PAD_SCALE_MULTIPLIER,
    );
    razorstepZoneTransforms.update(
      prev.zones,
      curr.zones,
      alpha,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
      ZONE_TAG.razorstepScythePad,
      RAZORSTEP_PAD_SCALE_MULTIPLIER,
    );
    stinkCloudZoneVisuals.update(
      curr.zones,
      curr.tick,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
    );
    stinkCloudZoneBatch.setMaterial(wildguardVfxMaterialBank.materialForFrame(
      'skunkCloud', PERSISTENT_ZONE_BODY_FRAME,
    ));
    stinkCloudZoneBatch.setOpacity(stinkCloudZoneVisuals.opacity);
    royalStinkZoneVisuals.update(
      curr.zones,
      curr.tick,
      -worldHalfWidth,
      worldHalfHeight,
      -1,
    );
    royalStinkZoneBatch.setMaterial(wildguardVfxMaterialBank.materialForFrame(
      'royalStink', PERSISTENT_ZONE_BODY_FRAME,
    ));
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
    for (const route of enemyHitFlashAgeRoutes) route.batch.sync(route.store);
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
    for (const bucket of impactCoreBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of criticalImpactCoreBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of normalImpactDebrisBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of criticalImpactDebrisBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of playerImpactDebrisBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of impactGroundContactBuckets) bucket.batch.sync(bucket.store);
    for (const route of signatureVfxRouteList) {
      for (const bucket of route.coreBuckets) bucket.batch.sync(bucket.store);
      for (const bucket of route.debrisBuckets) bucket.batch.sync(bucket.store);
    }
    for (const bucket of signatureGroundContactBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of heroSpitSignatureCoreBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of heroSpitSignatureDebrisBuckets) bucket.batch.sync(bucket.store);
    for (const bucket of heroSpitSignatureGroundContactBuckets) bucket.batch.sync(bucket.store);
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
        sumBatchViews(enemyHitFlashBatchViews, 'liveViews') +
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
        sumBatchViews(impactCompositeBatchViews, 'liveViews') +
        sumBatchViews(signatureCompositeBatchViews, 'liveViews') +
        sumBatchViews(heroSpitSignatureBatchViews, 'liveViews') +
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
        sumBatchViews(enemyHitFlashBatchViews, 'highWaterViews') +
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
        sumBatchViews(impactCompositeBatchViews, 'highWaterViews') +
        sumBatchViews(signatureCompositeBatchViews, 'highWaterViews') +
        sumBatchViews(heroSpitSignatureBatchViews, 'highWaterViews') +
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
    for (const route of enemyHitFlashAgeRoutes) route.batch.dispose();
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
    for (const batch of impactCompositeBatchViews) batch.dispose();
    for (const batch of signatureCompositeBatchViews) batch.dispose();
    for (const batch of heroSpitSignatureBatchViews) batch.dispose();
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
    impactCoreTextureBinding.dispose();
    signatureDebrisTextureBinding.dispose();
    impactGroundContactTextureBinding.dispose();
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
    walkerEnemyHitFlashMaterial.destroy();
    runnerEnemyHitFlashMaterial.destroy();
    bruteEnemyHitFlashMaterial.destroy();
    bossEnemyHitFlashMaterial.destroy();
    markedEnemyMaterial.destroy();
    enemyShadowMaterial.destroy();
    projectileMaterial.destroy();
    hostileProjectileMaterial.destroy();
    pickupMaterial.destroy();
    bombPickupMaterial.destroy();
    magnetPickupMaterial.destroy();
    foodPickupMaterial.destroy();
    playerMaterial.destroy();
    impactCoreMaterial.destroy();
    criticalImpactCoreMaterial.destroy();
    heroSpitCoreMaterial.destroy();
    for (const material of Object.values(signatureCoreMaterials)) material.destroy();
      for (const material of Object.values(signatureDebrisMaterials)) material.destroy();
      app.scene.layers.removeTransparent(combatVfxForegroundLayer);
    impactGroundRingMaterial.destroy();
    heroSpitGroundContactMaterial.destroy();
    for (const material of proceduralThreatMaterials) material.destroy();
    for (const material of isolatedVfxMaterials) material.destroy();
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
