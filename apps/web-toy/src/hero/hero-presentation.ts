import * as pc from 'playcanvas';
import type { TraitPresentationEventView, TraitVisualAttachmentView } from '@sim';
import type { RenderSnapshot } from '../contracts';
import { getHeroVisualProfile, type HeroId } from './hero-roster';
import { createProceduralAnimalPresentation } from './procedural-animal-presentation';

const HERO_SIGIL_COLORS: Readonly<Record<HeroId, pc.Color>> = Object.freeze({
  greg: new pc.Color(0.95, 0.66, 0.16),
  benny: new pc.Color(0.86, 0.58, 0.3),
  gracie: new pc.Color(0.45, 0.84, 0.68),
});
const HERO_SIGIL_SCALE = 12;
const HERO_SIGIL_HEIGHT = 0.16;
const HERO_SHADOW_RADIUS = 15;
const HERO_SHADOW_HEIGHT = -0.48;

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

/** A small pointed leaf blade with deliberate negative space between its neighbours. */
function appendLeafBlade(
  builder: GroundMeshBuilder,
  root: GroundPoint,
  tip: GroundPoint,
  halfWidth: number,
): void {
  const deltaX = tip[0] - root[0];
  const deltaZ = tip[1] - root[1];
  const length = Math.hypot(deltaX, deltaZ);
  if (!(length > 1e-6)) return;
  const normalX = -deltaZ / length * halfWidth;
  const normalZ = deltaX / length * halfWidth;
  const middleX = root[0] + deltaX * 0.48;
  const middleZ = root[1] + deltaZ * 0.48;
  appendQuad(
    builder,
    root,
    [middleX + normalX, middleZ + normalZ],
    tip,
    [middleX - normalX, middleZ - normalZ],
  );
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

/**
 * A three-leaf wayfinder crest replaces the old targeting-ring language.
 *
 * It deliberately leaves open ground between the blades so the player reads a
 * quiet heraldic mark beneath the hero, not a selection outline or damage
 * radius. The crest is fixed to the camera-facing frame because player facing
 * is not part of the authoritative render snapshot.
 */
function createWildguardWayfinderMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendLeafBlade(builder, [0, 0.16], [0, -0.72], 0.09);
    appendLeafBlade(builder, [-0.62, 0.28], [-0.14, -0.16], 0.075);
    appendLeafBlade(builder, [0.62, 0.28], [0.14, -0.16], 0.075);
  });
}

/** A hand-cut leaf-litter shadow avoids a generic circular decal under the hero. */
function createHeroShadowMesh(device: pc.GraphicsDevice): pc.Mesh {
  return createGroundMesh(device, (builder) => {
    appendQuad(builder, [-0.54, -0.08], [-0.18, -0.34], [0.48, -0.16], [0.56, 0.12]);
    appendQuad(builder, [-0.56, 0.12], [-0.18, -0.34], [0.34, 0.36], [-0.3, 0.42]);
  });
}

function createHeroSigilMaterial(color: pc.Color): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.opacity = 0.38;
  material.blendType = pc.BLEND_ADDITIVEALPHA;
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
  material.opacity = 0.28;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
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
  const sigilMesh = createWildguardWayfinderMesh(app.graphicsDevice);
  const sigilMaterial = createHeroSigilMaterial(HERO_SIGIL_COLORS[initialHeroId]!);
  const shadowMesh = createHeroShadowMesh(app.graphicsDevice);
  const shadowMaterial = createHeroShadowMaterial();
  const heroShadow = new pc.Entity('hero-blob-shadow');
  heroShadow.addComponent('render', {
    meshInstances: [new pc.MeshInstance(shadowMesh, shadowMaterial)],
    castShadows: false,
    receiveShadows: false,
  });
  heroShadow.setLocalPosition(0, HERO_SHADOW_HEIGHT, 0);
  heroShadow.setLocalScale(HERO_SHADOW_RADIUS, 1, HERO_SHADOW_RADIUS * 0.76);
  heroShadow.enabled = false;
  parent.addChild(heroShadow);
  const wayfinderSigil = new pc.Entity('hero-wayfinder-sigil');
  wayfinderSigil.addComponent('render', {
    meshInstances: [new pc.MeshInstance(sigilMesh, sigilMaterial)],
    castShadows: false,
    receiveShadows: false,
  });
  wayfinderSigil.setLocalPosition(0, HERO_SIGIL_HEIGHT, 0);
  wayfinderSigil.setLocalScale(HERO_SIGIL_SCALE, 1, HERO_SIGIL_SCALE);
  wayfinderSigil.enabled = false;
  parent.addChild(wayfinderSigil);
  let activeHeroId = initialHeroId;
  let disposed = false;

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
      sigilMaterial.emissive.copy(HERO_SIGIL_COLORS[heroId]!);
      sigilMaterial.update();
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
      const shadowPulse = 1 + Math.sin(current.tick * 0.09) * 0.025;
      heroShadow.setLocalPosition(x - worldHalfWidth, HERO_SHADOW_HEIGHT, worldHalfHeight - y);
      heroShadow.setLocalScale(
        HERO_SHADOW_RADIUS * shadowPulse,
        1,
        HERO_SHADOW_RADIUS * 0.76 * shadowPulse,
      );
      heroShadow.enabled = current.playerAlive;
      wayfinderSigil.setLocalPosition(x - worldHalfWidth, HERO_SIGIL_HEIGHT, worldHalfHeight - y);
      wayfinderSigil.enabled = current.playerAlive;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scout.dispose();
      benny.dispose();
      gracie.dispose();
      heroShadow.destroy();
      wayfinderSigil.destroy();
      shadowMesh.destroy();
      shadowMaterial.destroy();
      sigilMesh.destroy();
      sigilMaterial.destroy();
    },
  };
}
