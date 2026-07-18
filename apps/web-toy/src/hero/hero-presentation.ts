import * as pc from 'playcanvas';
import type { TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import type { RenderSnapshot } from '../contracts';
import { getHeroVisualProfile, type HeroId } from './hero-roster';
import { createProceduralAnimalPresentation } from './procedural-animal-presentation';

/** The shared 0.5 Hz ceiling used by the enemy-threat breath loops. */
export const HERO_ANCHOR_BREATH_PERIOD_TICKS = 120;
export const HERO_ANCHOR_BREATH_SCALE = 0.022;
// Player collision radius is deliberately much smaller than the authored
// cutout footprint. These values keep the ivory locator visibly *outside*
// the largest scaled companion instead of hiding beneath its card.
export const HERO_ANCHOR_SHADOW_RADIUS_MULTIPLIER = 2.42;
export const HERO_ANCHOR_SHADOW_ASPECT = 0.72;
export const HERO_ANCHOR_INNER_RING_RADIUS_MULTIPLIER = 2.58;
export const HERO_ANCHOR_OUTER_RING_RADIUS_MULTIPLIER = 3.12;
export const HERO_ANCHOR_DAMAGE_PULSE_RADIUS_MULTIPLIER = 3.75;
export const HERO_ANCHOR_DAMAGE_PULSE_DURATION_TICKS = 10;
export const HERO_ANCHOR_SHADOW_OPACITY = 0.3;
export const HERO_ANCHOR_INNER_RING_OPACITY = 0.48;
export const HERO_ANCHOR_OUTER_RING_OPACITY = 0.6;
export const HERO_ANCHOR_DAMAGE_PULSE_OPACITY = 0.58;
export const HERO_ANCHOR_RING_SEGMENTS = 48;
export const HERO_ANCHOR_IVORY_HEX = '#f3ead4';
export const HERO_ANCHOR_PULSE_IVORY_HEX = '#fffbe9';

const HERO_ANCHOR_IVORY = new pc.Color(0.953, 0.918, 0.831);
const HERO_ANCHOR_PULSE_IVORY = new pc.Color(1, 0.984, 0.914);
const HERO_ANCHOR_RING_HEIGHT = 0.16;
const HERO_ANCHOR_PULSE_HEIGHT = 0.17;
const HERO_ANCHOR_SHADOW_HEIGHT = -0.48;

type GroundPoint = readonly [number, number];

interface GroundMeshBuilder {
  readonly positions: number[];
  readonly indices: number[];
}

function appendVertex(builder: GroundMeshBuilder, point: GroundPoint): number {
  const index = builder.positions.length / 3;
  builder.positions.push(point[0], 0, point[1]);
  return index;
}

function appendQuad(
  builder: GroundMeshBuilder,
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  d: GroundPoint,
): void {
  const aIndex = appendVertex(builder, a);
  const bIndex = appendVertex(builder, b);
  const cIndex = appendVertex(builder, c);
  const dIndex = appendVertex(builder, d);
  builder.indices.push(aIndex, bIndex, cIndex, aIndex, cIndex, dIndex);
}

function appendTriangle(
  builder: GroundMeshBuilder,
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
): void {
  builder.indices.push(appendVertex(builder, a), appendVertex(builder, b), appendVertex(builder, c));
}

function createGroundMesh(device: pc.GraphicsDevice, build: (builder: GroundMeshBuilder) => void): pc.Mesh {
  const builder: GroundMeshBuilder = { positions: [], indices: [] };
  build(builder);
  const geometry = new pc.Geometry();
  geometry.positions = builder.positions;
  geometry.normals = Array.from({ length: builder.positions.length }, (_value, index) => index % 3 === 1 ? 1 : 0);
  geometry.indices = builder.indices;
  return pc.Mesh.fromGeometry(device, geometry);
}

function createHeroAnchorShadowMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    const center: GroundPoint = [0, 0];
    for (let index = 0; index < HERO_ANCHOR_RING_SEGMENTS; index++) {
      const start = index / HERO_ANCHOR_RING_SEGMENTS * Math.PI * 2;
      const end = (index + 1) / HERO_ANCHOR_RING_SEGMENTS * Math.PI * 2;
      appendTriangle(
        builder,
        center,
        [Math.cos(start), Math.sin(start)],
        [Math.cos(end), Math.sin(end)],
      );
    }
  });
}

/** A thin annulus stays legible at camera distance without becoming an AoE decal. */
function createHeroAnchorRingMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    const innerRadius = 0.87;
    for (let index = 0; index < HERO_ANCHOR_RING_SEGMENTS; index++) {
      const start = index / HERO_ANCHOR_RING_SEGMENTS * Math.PI * 2;
      const end = (index + 1) / HERO_ANCHOR_RING_SEGMENTS * Math.PI * 2;
      appendQuad(
        builder,
        [Math.cos(start) * innerRadius, Math.sin(start) * innerRadius],
        [Math.cos(start), Math.sin(start)],
        [Math.cos(end), Math.sin(end)],
        [Math.cos(end) * innerRadius, Math.sin(end) * innerRadius],
      );
    }
  });
}

function createHeroAnchorRingMaterial(color: pc.Color, opacity: number): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.opacity = opacity;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/** A quiet grounding shadow shared by all three hero presentations. */
function createHeroShadowMaterial(): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.set(0, 0, 0);
  material.opacity = HERO_ANCHOR_SHADOW_OPACITY;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampedAlpha(alpha: number): number {
  return Math.min(1, Math.max(0, finite(alpha)));
}

function easeOutCubic(progress: number): number {
  const inverse = 1 - progress;
  return 1 - inverse * inverse * inverse;
}

export interface HeroAnchorPose {
  readonly breathScale: number;
  readonly shadowRadius: number;
  readonly innerRingRadius: number;
  readonly outerRingRadius: number;
  readonly pulseRingRadius: number;
  readonly pulseOpacity: number;
  readonly pulseActive: boolean;
}

export interface MutableHeroAnchorPose {
  breathScale: number;
  shadowRadius: number;
  innerRingRadius: number;
  outerRingRadius: number;
  pulseRingRadius: number;
  pulseOpacity: number;
  pulseActive: boolean;
}

function createMutableHeroAnchorPose(): MutableHeroAnchorPose {
  return {
    breathScale: 1,
    shadowRadius: 0,
    innerRingRadius: 0,
    outerRingRadius: 0,
    pulseRingRadius: 0,
    pulseOpacity: 0,
    pulseActive: false,
  };
}

/**
 * Pure, fixed-tick anchor projection. The pulse is intentionally a single
 * outward locator rather than a repeated flash, preserving the flash budget.
 */
export function writeHeroAnchorPose(
  out: MutableHeroAnchorPose,
  playerRadius: number,
  tick: number,
  alpha: number,
  lastDamageTick: number,
): void {
  const radius = Math.max(0, finite(playerRadius));
  const renderTick = finite(tick) + clampedAlpha(alpha);
  const breath = 1 + Math.sin(renderTick / HERO_ANCHOR_BREATH_PERIOD_TICKS * Math.PI * 2)
    * HERO_ANCHOR_BREATH_SCALE;
  const shadowRadius = radius * HERO_ANCHOR_SHADOW_RADIUS_MULTIPLIER * breath;
  const innerRingRadius = radius * HERO_ANCHOR_INNER_RING_RADIUS_MULTIPLIER * breath;
  const outerRingRadius = radius * HERO_ANCHOR_OUTER_RING_RADIUS_MULTIPLIER * breath;
  const pulseAge = renderTick - lastDamageTick;
  const pulseActive = Number.isFinite(lastDamageTick)
    && pulseAge >= 0
    && pulseAge < HERO_ANCHOR_DAMAGE_PULSE_DURATION_TICKS;
  const pulseProgress = pulseActive
    ? Math.min(1, Math.max(0, pulseAge / HERO_ANCHOR_DAMAGE_PULSE_DURATION_TICKS))
    : 1;
  const pulseRadius = radius * (
    HERO_ANCHOR_OUTER_RING_RADIUS_MULTIPLIER
      + (HERO_ANCHOR_DAMAGE_PULSE_RADIUS_MULTIPLIER - HERO_ANCHOR_OUTER_RING_RADIUS_MULTIPLIER)
        * easeOutCubic(pulseProgress)
  ) * breath;
  const pulseFade = 1 - pulseProgress;
  out.breathScale = breath;
  out.shadowRadius = shadowRadius;
  out.innerRingRadius = innerRingRadius;
  out.outerRingRadius = outerRingRadius;
  out.pulseRingRadius = pulseRadius;
  out.pulseOpacity = HERO_ANCHOR_DAMAGE_PULSE_OPACITY * pulseFade * pulseFade;
  out.pulseActive = pulseActive;
}

/** Pure convenience wrapper for tests and one-off inspection. */
export function projectHeroAnchorPose(
  playerRadius: number,
  tick: number,
  alpha: number,
  lastDamageTick: number,
): HeroAnchorPose {
  const pose = createMutableHeroAnchorPose();
  writeHeroAnchorPose(pose, playerRadius, tick, alpha, lastDamageTick);
  return pose;
}

export interface HeroPresentation {
  readonly ready: boolean;
  readonly failed: boolean;
  setHero(heroId: HeroId): void;
  update(
    previous: RenderSnapshot,
    current: RenderSnapshot,
    alpha: number,
    traitVisualState: readonly TraitVisualAttachmentView[],
    traitPresentationEvents?: readonly TraitPresentationEventView[],
  ): void;
  dispose(): void;
}

/**
 * Keeps the three founder presentations behind one renderer-only surface. All
 * three project the same authoritative trait visual state, so the
 * body-as-loadout rule survives personal visual swaps without changing run
 * state, replay IDs, or combat behavior.
 */
export function createHeroPresentation(
  app: pc.Application,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
  initialHeroId: HeroId = 'greg',
): HeroPresentation {
  getHeroVisualProfile(initialHeroId);
  // `greg` remains the stable deterministic hero id. Its current presentation
  // is Scout, an owner-authored dog cutout with fixed-tick gait/action motion.
  const scout = createProceduralAnimalPresentation('greg', parent, worldHalfWidth, worldHalfHeight);
  const benny = createProceduralAnimalPresentation('benny', parent, worldHalfWidth, worldHalfHeight);
  const gracie = createProceduralAnimalPresentation('gracie', parent, worldHalfWidth, worldHalfHeight);
  const shadowMesh = createHeroAnchorShadowMesh(app.graphicsDevice);
  const ringMesh = createHeroAnchorRingMesh(app.graphicsDevice);
  const shadowMaterial = createHeroShadowMaterial();
  const innerRingMaterial = createHeroAnchorRingMaterial(
    HERO_ANCHOR_IVORY,
    HERO_ANCHOR_INNER_RING_OPACITY,
  );
  const outerRingMaterial = createHeroAnchorRingMaterial(
    HERO_ANCHOR_IVORY,
    HERO_ANCHOR_OUTER_RING_OPACITY,
  );
  const pulseRingMaterial = createHeroAnchorRingMaterial(
    HERO_ANCHOR_PULSE_IVORY,
    HERO_ANCHOR_DAMAGE_PULSE_OPACITY,
  );
  const heroShadow = new pc.Entity('hero-blob-shadow');
  heroShadow.addComponent('render', {
    meshInstances: [new pc.MeshInstance(shadowMesh, shadowMaterial)],
    castShadows: false,
    receiveShadows: false,
  });
  heroShadow.setLocalPosition(0, HERO_ANCHOR_SHADOW_HEIGHT, 0);
  heroShadow.enabled = false;
  parent.addChild(heroShadow);
  const heroInnerRing = new pc.Entity('hero-anchor-inner-ring');
  heroInnerRing.addComponent('render', {
    meshInstances: [new pc.MeshInstance(ringMesh, innerRingMaterial)],
    castShadows: false,
    receiveShadows: false,
  });
  heroInnerRing.setLocalPosition(0, HERO_ANCHOR_RING_HEIGHT, 0);
  heroInnerRing.enabled = false;
  parent.addChild(heroInnerRing);
  const heroOuterRing = new pc.Entity('hero-anchor-outer-ring');
  heroOuterRing.addComponent('render', {
    meshInstances: [new pc.MeshInstance(ringMesh, outerRingMaterial)],
    castShadows: false,
    receiveShadows: false,
  });
  heroOuterRing.setLocalPosition(0, HERO_ANCHOR_RING_HEIGHT, 0);
  heroOuterRing.enabled = false;
  parent.addChild(heroOuterRing);
  const pulseMeshInstance = new pc.MeshInstance(ringMesh, pulseRingMaterial);
  const heroDamagePulse = new pc.Entity('hero-anchor-damage-pulse');
  heroDamagePulse.addComponent('render', {
    meshInstances: [pulseMeshInstance],
    castShadows: false,
    receiveShadows: false,
  });
  heroDamagePulse.setLocalPosition(0, HERO_ANCHOR_PULSE_HEIGHT, 0);
  heroDamagePulse.enabled = false;
  parent.addChild(heroDamagePulse);
  let activeHeroId = initialHeroId;
  let disposed = false;
  let lastDamageTick = Number.NEGATIVE_INFINITY;
  const anchorPose = createMutableHeroAnchorPose();

  function syncVisibility(): void {
    scout.setVisible(activeHeroId === 'greg');
    benny.setVisible(activeHeroId === 'benny');
    gracie.setVisible(activeHeroId === 'gracie');
  }
  syncVisibility();

  return {
    get ready() {
      return activeHeroId === 'greg' ? scout.ready : activeHeroId === 'benny' ? benny.ready : gracie.ready;
    },
    get failed() {
      return false;
    },
    setHero(heroId) {
      if (disposed) return;
      getHeroVisualProfile(heroId);
      activeHeroId = heroId;
      syncVisibility();
    },
    update(previous, current, alpha, traitVisualState, traitPresentationEvents = []) {
      if (disposed) return;
      if (activeHeroId === 'greg') {
        scout.update(previous, current, alpha, traitVisualState, traitPresentationEvents);
      } else if (activeHeroId === 'benny') {
        benny.update(previous, current, alpha, traitVisualState, traitPresentationEvents);
      } else {
        gracie.update(previous, current, alpha, traitVisualState, traitPresentationEvents);
      }
      const x = previous.playerX + (current.playerX - previous.playerX) * alpha;
      const y = previous.playerY + (current.playerY - previous.playerY) * alpha;
      if (current.tick < lastDamageTick) lastDamageTick = Number.NEGATIVE_INFINITY;
      if (current.playerHp < previous.playerHp) lastDamageTick = current.tick;
      writeHeroAnchorPose(
        anchorPose,
        current.playerRadius,
        current.tick,
        alpha,
        lastDamageTick,
      );
      const sceneX = x - worldHalfWidth;
      const sceneZ = worldHalfHeight - y;
      heroShadow.setLocalPosition(sceneX, HERO_ANCHOR_SHADOW_HEIGHT, sceneZ);
      heroShadow.setLocalScale(
        anchorPose.shadowRadius,
        1,
        anchorPose.shadowRadius * HERO_ANCHOR_SHADOW_ASPECT,
      );
      heroInnerRing.setLocalPosition(sceneX, HERO_ANCHOR_RING_HEIGHT, sceneZ);
      heroInnerRing.setLocalScale(anchorPose.innerRingRadius, 1, anchorPose.innerRingRadius);
      heroOuterRing.setLocalPosition(sceneX, HERO_ANCHOR_RING_HEIGHT, sceneZ);
      heroOuterRing.setLocalScale(anchorPose.outerRingRadius, 1, anchorPose.outerRingRadius);
      heroDamagePulse.setLocalPosition(sceneX, HERO_ANCHOR_PULSE_HEIGHT, sceneZ);
      heroDamagePulse.setLocalScale(anchorPose.pulseRingRadius, 1, anchorPose.pulseRingRadius);
      pulseMeshInstance.setParameter('material_opacity', anchorPose.pulseOpacity);
      heroShadow.enabled = current.playerAlive;
      heroInnerRing.enabled = current.playerAlive;
      heroOuterRing.enabled = current.playerAlive;
      heroDamagePulse.enabled = current.playerAlive && anchorPose.pulseActive;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scout.dispose();
      benny.dispose();
      gracie.dispose();
      heroShadow.destroy();
      heroInnerRing.destroy();
      heroOuterRing.destroy();
      heroDamagePulse.destroy();
      shadowMesh.destroy();
      shadowMaterial.destroy();
      ringMesh.destroy();
      innerRingMaterial.destroy();
      outerRingMaterial.destroy();
      pulseRingMaterial.destroy();
    },
  };
}
