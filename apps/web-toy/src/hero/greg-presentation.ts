import * as pc from 'playcanvas';
import type { RenderSnapshot } from '../contracts';
import type { TraitVisualAttachmentView } from '@sim';
import {
  advanceGregAnimation,
  createGregAnimationState,
  type GregAnimationInput,
  type GregAnimationState,
} from './greg-animation-state';
import {
  createGregAttachmentSockets,
  type AttachmentNode,
  type AttachmentRequest,
  type GregAttachmentFactory,
  type GregAttachmentSockets,
  type SocketTransform,
} from './greg-attachment-sockets';
import {
  getGregAttachmentVisualRecipe,
  isGregAttachmentVisualKey,
  type GregMaterialRole,
  type GregPrimitiveShape,
} from './greg-attachment-visuals';
import { createGregFoxLoader, type GregFoxLoader } from './greg-fox-loader';
import { createGregTraitVisualProjector } from './greg-trait-visual-projector';
import {
  createGregLocomotionPresentationState,
  projectGregLocomotion,
} from './greg-locomotion-presentation';

// The source fox is long but extremely narrow from above. A modestly widened
// gameplay scale preserves the authored proportions in profile while giving
// Greg a readable top-down silhouette close to the sim's 16-unit footprint.
const GREG_SCALE: readonly [x: number, y: number, z: number] = [10, 6, 6];

export interface GregPresentation {
  readonly ready: boolean;
  readonly failed: boolean;
  readonly error: Error | null;
  update(
    previous: RenderSnapshot,
    current: RenderSnapshot,
    alpha: number,
    traitVisualState: readonly TraitVisualAttachmentView[],
  ): void;
  dispose(): void;
}

export function hasFreshProjectile(previous: RenderSnapshot, current: RenderSnapshot): boolean {
  const prev = previous.projectiles;
  const curr = current.projectiles;
  for (let currentIndex = 0; currentIndex < curr.count; currentIndex++) {
    const id = curr.id[currentIndex]!;
    let found = false;
    for (let previousIndex = 0; previousIndex < prev.count; previousIndex++) {
      if (prev.id[previousIndex] === id) {
        found = true;
        break;
      }
    }
    if (!found) return true;
  }
  return false;
}

export function deriveGregAnimationInput(
  previous: RenderSnapshot,
  current: RenderSnapshot,
): GregAnimationInput {
  const dx = current.playerX - previous.playerX;
  const dy = current.playerY - previous.playerY;
  return {
    alive: current.playerAlive,
    movementMagnitude: Math.sqrt(dx * dx + dy * dy),
    attackPulse: hasFreshProjectile(previous, current),
    hitPulse: current.playerHp < previous.playerHp,
  };
}

function clipLoops(name: string): boolean {
  return name === 'Idle' || name === 'Idle_2' || name === 'Idle_2_HeadLow' || name === 'Walk' || name === 'Gallop';
}

function configureAnimations(entity: pc.Entity, loader: GregFoxLoader): void {
  entity.addComponent('anim', { activate: true, speed: 1 });
  const states = loader.animationNames.map((name) => ({
    name,
    speed: 1,
    loop: clipLoops(name),
    defaultState: name === 'Idle',
  }));
  entity.anim!.loadStateGraph({
    layers: [{
      name: 'Base',
      states: [{ name: 'START', speed: 1 }, ...states],
      transitions: [{ from: 'START', to: 'Idle' }],
    }],
    parameters: {},
  });
  for (let index = 0; index < loader.animationClips.length; index++) {
    const clip = loader.animationClips[index]!;
    const authoredName = loader.animationNames[index]!;
    entity.anim!.assignAnimation(
      authoredName,
      clip.resource as pc.AnimTrack,
      'Base',
      1,
      clipLoops(authoredName),
    );
  }
  entity.anim!.baseLayer?.transition('Idle', 0);
}

function createAttachmentFactory(
  materials: Readonly<Record<GregMaterialRole, pc.StandardMaterial>>,
): GregAttachmentFactory<AttachmentNode, pc.Entity> {
  function primitive(
    parent: pc.Entity,
    name: string,
    type: GregPrimitiveShape,
    material: pc.Material,
  ): pc.Entity {
    const child = new pc.Entity(name);
    child.addComponent('render', { type, material, castShadows: false, receiveShadows: false });
    parent.addChild(child);
    return child;
  }

  return {
    create(request: AttachmentRequest): pc.Entity {
      const root = new pc.Entity(request.visualKey);
      if (isGregAttachmentVisualKey(request.visualKey)) {
        const recipe = getGregAttachmentVisualRecipe(request.visualKey);
        for (const part of recipe.parts) {
          const view = primitive(root, part.id, part.shape, materials[part.materialRole]);
          view.setLocalPosition(...part.transform.position);
          view.setLocalEulerAngles(...part.transform.euler);
          view.setLocalScale(...part.transform.scale);
        }
      } else {
        const marker = primitive(root, 'unknown-attachment', 'sphere', materials.quillAccent);
        marker.setLocalScale(0.12, 0.12, 0.12);
      }
      return root;
    },
    mount(view, parent, transform: SocketTransform): void {
      (parent as unknown as pc.Entity).addChild(view);
      view.setLocalPosition(...transform.position);
      view.setLocalEulerAngles(...transform.euler);
      view.setLocalScale(...transform.scale);
    },
    unmount(view): void {
      view.parent?.removeChild(view);
    },
    destroy(view): void {
      view.destroy();
    },
  };
}

/** Loads Greg asynchronously while the renderer keeps its primitive fallback. */
export function createGregPresentation(
  app: pc.Application,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
): GregPresentation {
  const loader = createGregFoxLoader({ assets: app.assets, root: parent });
  function attachmentMaterial(color: pc.Color): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.diffuse.copy(color);
    material.emissive.copy(color);
    material.update();
    return material;
  }
  const brass = attachmentMaterial(new pc.Color(0.95, 0.66, 0.16));
  const cream = attachmentMaterial(new pc.Color(1, 0.9, 0.62));
  const teal = attachmentMaterial(new pc.Color(0.12, 0.78, 0.68));
  const cobalt = attachmentMaterial(new pc.Color(0.2, 0.45, 1));
  const electric = attachmentMaterial(new pc.Color(0.68, 0.9, 1));
  const firefly = attachmentMaterial(new pc.Color(0.5, 1, 0.3));
  const mantis = attachmentMaterial(new pc.Color(0.72, 0.94, 0.42));
  const mantisEdge = attachmentMaterial(new pc.Color(0.92, 1, 0.68));
  const gecko = attachmentMaterial(new pc.Color(0.12, 0.9, 0.52));
  const geckoGlow = attachmentMaterial(new pc.Color(0.66, 1, 0.76));
  const razorstep = attachmentMaterial(new pc.Color(0.96, 0.38, 0.7));
  const razorstepEdge = attachmentMaterial(new pc.Color(0.74, 0.96, 1));
  const attachmentMaterials: Readonly<Record<GregMaterialRole, pc.StandardMaterial>> = {
    quillPrimary: brass,
    quillAccent: cream,
    pufferPrimary: teal,
    pufferAccent: cream,
    mythicThorn: brass,
    mythicGlow: teal,
    coilPrimary: cobalt,
    coilGlow: electric,
    fireflyPrimary: teal,
    fireflyGlow: firefly,
    thunderbugCore: electric,
    mantisPrimary: mantis,
    mantisAccent: mantisEdge,
    geckoPrimary: gecko,
    geckoAccent: geckoGlow,
    razorstepPrimary: razorstep,
    razorstepAccent: razorstepEdge,
  };

  let entity: pc.Entity | null = null;
  let sockets: GregAttachmentSockets<AttachmentNode> | null = null;
  let traitVisualProjector: ReturnType<typeof createGregTraitVisualProjector> | null = null;
  let animation: GregAnimationState = createGregAnimationState();
  let locomotion = createGregLocomotionPresentationState();
  let lastAnimationTick = -1;
  let disposed = false;

  void loader.load().then((loaded) => {
    if (disposed) return;
    entity = loaded.entity;
    entity.setLocalScale(...GREG_SCALE);
    configureAnimations(entity, loader);
    sockets = createGregAttachmentSockets(
      entity as unknown as AttachmentNode,
      createAttachmentFactory(attachmentMaterials),
    );
    traitVisualProjector = createGregTraitVisualProjector(sockets);
  }).catch(() => {
    // Loader exposes the error; the renderer intentionally keeps its fallback.
  });

  return {
    get ready() {
      return loader.ready && entity !== null;
    },
    get failed() {
      return loader.state === 'error';
    },
    get error() {
      return loader.error;
    },
    update(previous, current, alpha, traitVisualState) {
      if (entity === null) return;
      traitVisualProjector?.sync(traitVisualState);
      entity.enabled = current.playerAlive;
      if (current.tick < locomotion.sampledTick) {
        locomotion = createGregLocomotionPresentationState();
        animation = createGregAnimationState();
        lastAnimationTick = -1;
      }
      const pose = projectGregLocomotion(locomotion, previous, current, alpha);
      locomotion = pose.state;
      entity.setLocalPosition(pose.x - worldHalfWidth, 0, worldHalfHeight - pose.y);
      entity.setLocalEulerAngles(0, pose.headingDegrees, 0);

      if (current.tick !== lastAnimationTick) {
        const baseInput = deriveGregAnimationInput(previous, current);
        animation = advanceGregAnimation(animation, {
          ...baseInput,
          movementMagnitude: pose.movementMagnitude,
          locomotionMoving: pose.animation.moving,
          locomotionBlendSeconds: pose.animation.transitionDurationSeconds,
        });
        lastAnimationTick = current.tick;
        if (animation.restart) {
          entity.anim?.baseLayer?.transition(animation.clip, animation.transitionDurationSeconds);
        }
        entity.anim!.speed = animation.kind === 'movement' ? pose.animation.walkPlaybackRate : 1;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      traitVisualProjector?.clear();
      traitVisualProjector = null;
      sockets?.clear();
      sockets = null;
      loader.dispose();
      entity = null;
      brass.destroy();
      cream.destroy();
      teal.destroy();
      cobalt.destroy();
      electric.destroy();
      firefly.destroy();
      mantis.destroy();
      mantisEdge.destroy();
      gecko.destroy();
      geckoGlow.destroy();
      razorstep.destroy();
      razorstepEdge.destroy();
    },
  };
}
