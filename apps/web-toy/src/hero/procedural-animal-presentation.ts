import * as pc from 'playcanvas';
import type { RenderSnapshot } from '../contracts';
import type { TraitPresentationEventView } from '@sim';
import type { TraitVisualAttachmentView } from '@sim';
import {
  createGregAttachmentSockets,
  type AttachmentNode,
  type AttachmentRequest,
  type GregAttachmentFactory,
  type SocketTransform,
} from './greg-attachment-sockets';
import {
  getGregAttachmentVisualRecipe,
  isGregAttachmentVisualKey,
  type GregMaterialRole,
  type GregPrimitiveShape,
} from './greg-attachment-visuals';
import {
  createMonarchBroodAttachmentMotion,
  type MonarchBroodAttachmentMotion,
  type MonarchBroodMotionNode,
} from './monarch-brood-presentation-motion';
import { createGregTraitVisualProjector } from './greg-trait-visual-projector';
import { getHeroVisualProfile, type HeroId } from './hero-roster';

// The companion art is renderer-only: Vite owns the final hashed URLs while
// the simulation continues to own every position, heading, stat, and trait.
const BENNY_BASTION_ART_URL = new URL(
  '../../../../assets/ui/heroes/benny-bastion-v1.png',
  import.meta.url,
).href;
const GRACIE_SURVEYOR_ART_URL = new URL(
  '../../../../assets/ui/heroes/gracie-surveyor-v1.png',
  import.meta.url,
).href;

export interface ProceduralAnimalPresentation {
  readonly ready: boolean;
  setVisible(visible: boolean): void;
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
 * Converts simulation movement into the PlayCanvas XZ heading used by the
 * procedural animals. Simulation +Y maps to scene -Z, so a north/up movement
 * must face 180 degrees rather than the zero-degree +Z direction.
 */
export function deriveProceduralAnimalHeadingDegrees(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
): number | null {
  const dx = current.playerX - previous.playerX;
  const dy = current.playerY - previous.playerY;
  if (Math.abs(dx) + Math.abs(dy) <= 0.001) return null;
  return Math.atan2(dx, -dy) * 180 / Math.PI;
}

/**
 * A deterministic locomotion pose for the two illustrated founders. Their
 * game art is deliberately a single clean cutout rather than a skeletal rig,
 * so a compact stride (lift, side sway, squash/stretch, and lean) gives them
 * a convincing run read without inventing simulation motion or a wall clock.
 */
export interface ProceduralAnimalLocomotionPose {
  readonly moving: boolean;
  readonly movementMagnitude: number;
  readonly bodyLift: number;
  readonly sideSway: number;
  readonly forwardSway: number;
  readonly widthScale: number;
  readonly lengthScale: number;
  readonly leanDegrees: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampedAlpha(alpha: number): number {
  return Math.min(1, Math.max(0, finite(alpha)));
}

export function projectProceduralAnimalLocomotion(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'tick' | 'playerX' | 'playerY' | 'playerAlive'>,
  alpha: number,
): ProceduralAnimalLocomotionPose {
  const dx = finite(current.playerX) - finite(previous.playerX);
  const dy = finite(current.playerY) - finite(previous.playerY);
  const movementMagnitude = Math.hypot(dx, dy);
  const moving = current.playerAlive && movementMagnitude > 0.1;
  const phaseTick = finite(current.tick) + clampedAlpha(alpha);
  const cadence = moving ? 0.58 + Math.min(0.52, movementMagnitude * 0.18) : 0.16;
  const phase = phaseTick * cadence * Math.PI * 2;
  const stride = Math.sin(phase);
  const footfall = stride * stride;
  if (!moving) {
    return {
      moving: false,
      movementMagnitude,
      bodyLift: 0.06 + Math.sin(phase) * 0.025,
      sideSway: 0,
      forwardSway: 0,
      widthScale: 1,
      lengthScale: 1,
      leanDegrees: 0,
    };
  }
  const strideStrength = 0.16 + Math.min(0.14, movementMagnitude * 0.045);
  return {
    moving: true,
    movementMagnitude,
    bodyLift: 0.08 + footfall * strideStrength,
    sideSway: stride * 0.13,
    forwardSway: Math.cos(phase) * 0.075,
    widthScale: 1 - Math.cos(phase) * 0.045,
    lengthScale: 1 + Math.cos(phase) * 0.075,
    leanDegrees: stride * 3.6,
  };
}

function material(color: pc.Color): pc.StandardMaterial {
  const value = new pc.StandardMaterial();
  value.useLighting = false;
  value.diffuse.copy(color);
  value.emissive.copy(color);
  value.update();
  return value;
}

function primitive(
  parent: pc.Entity,
  name: string,
  type: GregPrimitiveShape,
  value: pc.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  euler: readonly [number, number, number] = [0, 0, 0],
): pc.Entity {
  const child = new pc.Entity(name);
  child.addComponent('render', { type, material: value, castShadows: false, receiveShadows: false });
  parent.addChild(child);
  child.setLocalPosition(...position);
  child.setLocalScale(...scale);
  child.setLocalEulerAngles(...euler);
  return child;
}

function bone(root: pc.Entity, name: string, position: readonly [number, number, number]): pc.Entity {
  const node = new pc.Entity(name);
  root.addChild(node);
  node.setLocalPosition(...position);
  return node;
}

function createAttachmentFactory(
  materials: Readonly<Record<GregMaterialRole, pc.StandardMaterial>>,
  monarchBroodMotion?: MonarchBroodAttachmentMotion,
): GregAttachmentFactory<AttachmentNode, pc.Entity> {
  return {
    create(request: AttachmentRequest): pc.Entity {
      const root = new pc.Entity(request.visualKey);
      if (isGregAttachmentVisualKey(request.visualKey)) {
        const recipe = getGregAttachmentVisualRecipe(request.visualKey);
        for (const part of recipe.parts) {
          const view = primitive(
            root,
            part.id,
            part.shape,
            materials[part.materialRole],
            part.transform.position,
            part.transform.scale,
            part.transform.euler,
          );
          view.enabled = true;
        }
      }
      return root;
    },
    mount(view, parent, transform: SocketTransform): void {
      (parent as unknown as pc.Entity).addChild(view);
      view.setLocalPosition(...transform.position);
      view.setLocalEulerAngles(...transform.euler);
      view.setLocalScale(...transform.scale);
      monarchBroodMotion?.track(view as unknown as MonarchBroodMotionNode, view.name);
    },
    unmount(view): void {
      view.parent?.removeChild(view);
    },
    destroy(view): void {
      monarchBroodMotion?.untrack(view as unknown as MonarchBroodMotionNode);
      view.destroy();
    },
  };
}

function createMaterials(): {
  readonly values: Readonly<Record<GregMaterialRole, pc.StandardMaterial>>;
  dispose(): void;
} {
  const brass = material(new pc.Color(0.95, 0.66, 0.16));
  const cream = material(new pc.Color(1, 0.9, 0.62));
  const teal = material(new pc.Color(0.12, 0.78, 0.68));
  const cobalt = material(new pc.Color(0.2, 0.45, 1));
  const electric = material(new pc.Color(0.68, 0.9, 1));
  const firefly = material(new pc.Color(0.5, 1, 0.3));
  const mantis = material(new pc.Color(0.72, 0.94, 0.42));
  const mantisEdge = material(new pc.Color(0.92, 1, 0.68));
  const gecko = material(new pc.Color(0.12, 0.9, 0.52));
  const geckoGlow = material(new pc.Color(0.66, 1, 0.76));
  const razorstep = material(new pc.Color(0.96, 0.38, 0.7));
  const razorstepEdge = material(new pc.Color(0.74, 0.96, 1));
  const owl = material(new pc.Color(0.48, 0.36, 0.7));
  const owlEdge = material(new pc.Color(0.82, 0.74, 1));
  const bat = material(new pc.Color(0.22, 0.12, 0.34));
  const batGlow = material(new pc.Color(0.78, 0.34, 1));
  const crab = material(new pc.Color(0.96, 0.34, 0.28));
  const crabEdge = material(new pc.Color(1, 0.72, 0.38));
  const armadillo = material(new pc.Color(0.48, 0.52, 0.58));
  const armadilloEdge = material(new pc.Color(0.8, 0.86, 0.9));
  const skunk = material(new pc.Color(0.16, 0.2, 0.28));
  const skunkEdge = material(new pc.Color(0.92, 0.94, 1));
  const monarch = material(new pc.Color(0.98, 0.4, 0.12));
  const monarchEdge = material(new pc.Color(1, 0.78, 0.24));
  const mythicGlow = material(new pc.Color(0.84, 0.34, 1));
  return {
    values: {
      quillPrimary: brass, quillAccent: cream, pufferPrimary: teal, pufferAccent: cream,
      mythicThorn: brass, mythicGlow: teal, coilPrimary: cobalt, coilGlow: electric,
      fireflyPrimary: teal, fireflyGlow: firefly, thunderbugCore: electric,
      mantisPrimary: mantis, mantisAccent: mantisEdge, geckoPrimary: gecko,
      geckoAccent: geckoGlow, razorstepPrimary: razorstep, razorstepAccent: razorstepEdge,
      owlPrimary: owl, owlAccent: owlEdge, batPrimary: bat, batAccent: batGlow,
      crabPrimary: crab, crabAccent: crabEdge, armadilloPrimary: armadillo,
      armadilloAccent: armadilloEdge, skunkPrimary: skunk, skunkAccent: skunkEdge,
      monarchPrimary: monarch, monarchAccent: monarchEdge, launchMythicGlow: mythicGlow,
    },
    dispose(): void {
      for (const value of [
        brass, cream, teal, cobalt, electric, firefly, mantis, mantisEdge, gecko, geckoGlow,
        razorstep, razorstepEdge, owl, owlEdge, bat, batGlow, crab, crabEdge, armadillo,
        armadilloEdge, skunk, skunkEdge, monarch, monarchEdge, mythicGlow,
      ]) {
        value.destroy();
      }
    },
  };
}

interface ProceduralParts {
  readonly body: pc.Entity;
  readonly movingParts: readonly pc.Entity[];
  dispose(): void;
}

/**
 * Cutout materials give the authored companion art a hard, depth-correct
 * silhouette. Keeping the alpha test on the opaque path prevents a soft
 * billboard halo when effects and trait attachments overlap it.
 */
function createHeroCutoutMaterial(): pc.StandardMaterial {
  const value = new pc.StandardMaterial();
  value.useLighting = false;
  value.diffuse.set(1, 1, 1);
  value.emissive.set(0.035, 0.035, 0.035);
  value.opacity = 1;
  value.alphaTest = 0.12;
  value.blendType = pc.BLEND_NONE;
  value.depthWrite = true;
  value.cull = pc.CULLFACE_NONE;
  value.update();
  return value;
}

interface HeroCutout {
  readonly body: pc.Entity;
  dispose(): void;
}

/**
 * Loads a single authored alpha-cutout without putting asset state into the
 * simulation. The entity stays hidden until the image decodes, and a disposed
 * presentation detaches its handlers before releasing GPU resources.
 */
function createHeroCutout(
  device: pc.GraphicsDevice | undefined,
  parent: pc.Entity,
  name: string,
  artUrl: string,
  halfExtent: number,
): HeroCutout {
  const body = new pc.Entity(name);
  parent.addChild(body);
  body.setLocalPosition(0, 0.12, 0);
  body.enabled = false;

  if (device === undefined || typeof Image === 'undefined') {
    return { body, dispose(): void {} };
  }

  const material = createHeroCutoutMaterial();
  const mesh = pc.Mesh.fromGeometry(device, new pc.PlaneGeometry({
    halfExtents: new pc.Vec2(halfExtent, halfExtent),
    widthSegments: 1,
    lengthSegments: 1,
  }));
  body.addComponent('render', {
    meshInstances: [new pc.MeshInstance(mesh, material)],
    castShadows: false,
    receiveShadows: false,
  });

  const texture = new pc.Texture(device, { mipmaps: true });
  texture.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.minFilter = pc.FILTER_LINEAR_MIPMAP_LINEAR;
  texture.magFilter = pc.FILTER_LINEAR;
  material.diffuseMap = texture;
  material.diffuseMapChannel = 'rgb';
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.update();

  let disposed = false;
  const image = new Image();
  image.decoding = 'async';
  image.onload = (): void => {
    if (disposed) return;
    texture.setSource(image);
    material.update();
    body.enabled = true;
  };
  image.onerror = (): void => {
    if (!disposed) body.enabled = false;
  };
  image.src = artUrl;

  return {
    body,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      body.enabled = false;
      image.onload = null;
      image.onerror = null;
      texture.destroy();
      mesh.destroy();
      material.destroy();
    },
  };
}

/**
 * The named attachment bones intentionally survive the move from primitive
 * bodies to painted art. Trait projection therefore remains a read-only view
 * over the same stable sockets for every hero.
 */
function createBenny(root: pc.Entity, device: pc.GraphicsDevice | undefined): ProceduralParts {
  const artRig = bone(root, 'Benny art rig', [0, 0, 0]);
  // Both source illustrations travel toward their lower-left corner. Rotate
  // that authored direction into the renderer's local +Z forward convention.
  artRig.setLocalEulerAngles(0, 135, 0);
  const bodyBone = bone(artRig, 'Body', [0, 0, 0]);
  bone(artRig, 'Head', [0, 0.48, 4.9]);
  bone(artRig, 'Back', [0, 0.2, -0.45]);
  bone(artRig, 'FrontShoulder.L', [-3.55, 0.22, 1.9]);
  bone(artRig, 'FrontShoulder.R', [3.55, 0.22, 1.9]);
  bone(artRig, 'Tail4', [0, 0.18, -5.85]);
  const cutout = createHeroCutout(device, bodyBone, 'benny-bastion-cutout', BENNY_BASTION_ART_URL, 7.1);
  return {
    body: cutout.body,
    movingParts: Object.freeze([]),
    dispose: cutout.dispose,
  };
}

function createGracie(root: pc.Entity, device: pc.GraphicsDevice | undefined): ProceduralParts {
  const artRig = bone(root, 'Gracie art rig', [0, 0, 0]);
  artRig.setLocalEulerAngles(0, 135, 0);
  const bodyBone = bone(artRig, 'Body', [0, 0, 0]);
  bone(artRig, 'Head', [0, 0.5, 4.75]);
  bone(artRig, 'Back', [0, 0.22, -0.55]);
  bone(artRig, 'FrontShoulder.L', [-3.15, 0.2, 1.95]);
  bone(artRig, 'FrontShoulder.R', [3.15, 0.2, 1.95]);
  bone(artRig, 'Tail4', [0, 0.2, -5.45]);
  const cutout = createHeroCutout(device, bodyBone, 'gracie-surveyor-cutout', GRACIE_SURVEYOR_ART_URL, 7.05);
  return {
    body: cutout.body,
    movingParts: Object.freeze([]),
    dispose: cutout.dispose,
  };
}

export function createProceduralAnimalPresentation(
  heroId: Exclude<HeroId, 'greg'>,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
): ProceduralAnimalPresentation {
  const profile = getHeroVisualProfile(heroId);
  const root = new pc.Entity(`${profile.displayName} — ${profile.species}`);
  parent.addChild(root);
  // The cutouts share the original companion footprint so their authored
  // detail remains readable at the same gameplay zoom as Greg.
  root.setLocalScale(2.45, 2.45, 2.45);
  const materials = createMaterials();
  const graphicsDevice = pc.AppBase.getApplication()?.graphicsDevice;
  const visual = heroId === 'benny'
    ? createBenny(root, graphicsDevice)
    : createGracie(root, graphicsDevice);
  // Companion sockets use a larger local coordinate space than Greg's glTF,
  // so maintain their proportionate trait spread while leaving authoritative
  // state untouched.
  const monarchBroodMotion = createMonarchBroodAttachmentMotion({
    orbitRadiusMultiplier: 10,
    wingScaleMultiplier: 4,
  });
  const sockets = createGregAttachmentSockets(
    root as unknown as AttachmentNode,
    createAttachmentFactory(materials.values, monarchBroodMotion),
  );
  const projector = createGregTraitVisualProjector(sockets);
  const baseBodyScale = visual.body.getLocalScale().clone();
  const baseBodyPosition = visual.body.getLocalPosition().clone();
  let visible = false;
  let disposed = false;
  let lastActionTick = Number.NEGATIVE_INFINITY;
  let lastImpactTick = Number.NEGATIVE_INFINITY;

  return {
    get ready() {
      return !disposed;
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      root.enabled = visible;
    },
    update(previous, current, alpha, traitVisualState, traitPresentationEvents = []) {
      if (disposed) return;
      projector.sync(traitVisualState);
      monarchBroodMotion.update(current.tick + alpha);
      if (!visible) return;
      if (traitPresentationEvents.length > 0) lastActionTick = current.tick;
      if (current.playerHp < previous.playerHp) lastImpactTick = current.tick;
      if (current.tick < Math.max(lastActionTick, lastImpactTick)) {
        lastActionTick = Number.NEGATIVE_INFINITY;
        lastImpactTick = Number.NEGATIVE_INFINITY;
      }
      const x = previous.playerX + (current.playerX - previous.playerX) * alpha;
      const y = previous.playerY + (current.playerY - previous.playerY) * alpha;
      root.enabled = current.playerAlive;
      root.setLocalPosition(x - worldHalfWidth, 0, worldHalfHeight - y);
      const heading = deriveProceduralAnimalHeadingDegrees(previous, current);
      if (heading !== null) root.setLocalEulerAngles(0, heading, 0);
      const locomotion = projectProceduralAnimalLocomotion(previous, current, alpha);
      const actionKick = Math.max(0, 1 - (current.tick - lastActionTick) / 9);
      const impactKick = Math.max(0, 1 - (current.tick - lastImpactTick) / 7);
      const reactionScale = 1 + actionKick * 0.08 + impactKick * 0.05;
      visual.body.setLocalPosition(
        baseBodyPosition.x + locomotion.sideSway,
        baseBodyPosition.y + locomotion.bodyLift + actionKick * 0.08,
        baseBodyPosition.z + locomotion.forwardSway + actionKick * 0.18,
      );
      visual.body.setLocalScale(
        baseBodyScale.x * locomotion.widthScale * reactionScale,
        baseBodyScale.y * (1 + actionKick * 0.04),
        baseBodyScale.z * locomotion.lengthScale * reactionScale,
      );
      visual.body.setLocalEulerAngles(actionKick * -3.5, 0, locomotion.leanDegrees);
      for (let index = 0; index < visual.movingParts.length; index++) {
        const part = visual.movingParts[index]!;
        part.setLocalEulerAngles(
          0,
          0,
          locomotion.moving ? locomotion.leanDegrees + Math.sin(current.tick * 0.42 + index) * 4 : 0,
        );
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      projector.clear();
      sockets.clear();
      monarchBroodMotion.clear();
      visual.dispose();
      root.destroy();
      materials.dispose();
    },
  };
}
