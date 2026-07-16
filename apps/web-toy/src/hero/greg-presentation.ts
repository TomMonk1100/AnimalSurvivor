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
import {
  createMonarchBroodAttachmentMotion,
  type MonarchBroodAttachmentMotion,
  type MonarchBroodMotionNode,
} from './monarch-brood-presentation-motion';
import {
  createChimeraSeamAttachmentMotion,
  type ChimeraSeamAttachmentMotion,
  type ChimeraSeamMotionNode,
} from './chimera-seam-presentation';
import {
  createChimeraSeamMaterialBinding,
  type ChimeraSeamMaterialBinding,
} from './chimera-seam-playcanvas';
import { createGregFoxLoader, type GregFoxLoader } from './greg-fox-loader';
import { createGregTraitVisualProjector } from './greg-trait-visual-projector';
import {
  GREG_WALK_REFERENCE_DISTANCE_PER_TICK,
  createGregLocomotionPresentationState,
  projectGregLocomotion,
} from './greg-locomotion-presentation';

// The source fox is long but extremely narrow from above. A modestly widened
// gameplay scale preserves the authored proportions in profile while giving
// Greg a readable top-down silhouette close to the sim's 16-unit footprint.
const GREG_SCALE: readonly [x: number, y: number, z: number] = [14, 8.4, 8.4];

export interface GregPresentation {
  readonly ready: boolean;
  readonly failed: boolean;
  readonly error: Error | null;
  setVisible(visible: boolean): void;
  update(
    previous: RenderSnapshot,
    current: RenderSnapshot,
    alpha: number,
    traitVisualState: readonly TraitVisualAttachmentView[],
    traitPresentationEvents?: readonly GregTraitPresentationEvent[],
  ): void;
  dispose(): void;
}

/** Minimal, structural view used only for a presentation animation pulse. */
export interface GregTraitPresentationEvent {
  readonly kind: string;
  readonly resolvedHitCount?: number;
  /** Set only after the authoritative melee executor acquired a real target. */
  readonly meleeArcResolved?: boolean;
  /** Presentation direction only; a non-zero fallback cannot imply a hit. */
  readonly dirX?: number;
  readonly dirY?: number;
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

/** A chain only counts when simulation resolved at least one target. */
export function hasResolvedChainDamage(events: readonly GregTraitPresentationEvent[]): boolean {
  return events.some((event) => (
    event.kind === 'chainDamage'
    && Number.isFinite(event.resolvedHitCount)
    && event.resolvedHitCount! > 0
  ));
}

/** A Mantis swing is an attack pulse only after authoritative auto-aim resolves a target. */
export function hasResolvedMeleeArc(events: readonly GregTraitPresentationEvent[]): boolean {
  return events.some((event) => event.kind === 'meleeArc' && event.meleeArcResolved === true);
}

export function deriveGregAnimationInput(
  previous: RenderSnapshot,
  current: RenderSnapshot,
  traitPresentationEvents: readonly GregTraitPresentationEvent[] = [],
): GregAnimationInput {
  const dx = current.playerX - previous.playerX;
  const dy = current.playerY - previous.playerY;
  return {
    alive: current.playerAlive,
    movementMagnitude: Math.sqrt(dx * dx + dy * dy),
    attackPulse: hasFreshProjectile(previous, current)
      || hasResolvedChainDamage(traitPresentationEvents)
      || hasResolvedMeleeArc(traitPresentationEvents),
    hitPulse: current.playerHp < previous.playerHp,
  };
}

function clipLoops(name: string): boolean {
  return name === 'Idle' || name === 'Idle_2' || name === 'Idle_2_HeadLow' || name === 'Walk' || name === 'Gallop';
}

function configureAnimations(entity: pc.Entity, loader: GregFoxLoader): ReadonlySet<string> {
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
  return new Set(loader.animationNames);
}

/**
 * Auto-fire can pulse more frequently than an authored fox attack clip can
 * finish. Keeping the base layer in Attack while Greg travels made the fox
 * appear to slide across the meadow. Weapons already communicate their own
 * action through the command presentation, so locomotion wins on the base
 * body layer whenever the player is actually moving.
 */
function selectRenderedAnimationClip(
  animation: Readonly<GregAnimationState>,
  movementMagnitude: number,
  moving: boolean,
  availableClips: ReadonlySet<string>,
): string {
  if (moving) {
    const prefersGallop = movementMagnitude >= GREG_WALK_REFERENCE_DISTANCE_PER_TICK * 0.72;
    if (prefersGallop && availableClips.has('Gallop')) return 'Gallop';
    return availableClips.has('Walk') ? 'Walk' : animation.clip;
  }
  return availableClips.has(animation.clip) ? animation.clip : 'Idle';
}

/**
 * A small deterministic body lift makes movement legible even at the camera's
 * distant survivor-game scale. It is derived only from render tick/alpha and
 * never feeds position or velocity back into the simulation.
 */
function locomotionLift(tick: number, alpha: number, moving: boolean, movementMagnitude: number): number {
  const cadence = moving ? 0.68 + Math.min(0.62, movementMagnitude * 0.18) : 0.24;
  const phase = (tick + alpha) * cadence * Math.PI * 2;
  if (!moving) return 0.08 + Math.sin(phase) * 0.025;
  const strideStrength = 0.12 + Math.min(0.11, movementMagnitude * 0.035);
  // Square the sine so both footfalls produce a compact upward bounce.
  return 0.08 + Math.sin(phase) ** 2 * strideStrength;
}

function createAttachmentFactory(
  materials: Readonly<Record<GregMaterialRole, pc.StandardMaterial>>,
  monarchBroodMotion?: MonarchBroodAttachmentMotion,
  chimeraSeamMotion?: ChimeraSeamAttachmentMotion,
): GregAttachmentFactory<AttachmentNode, pc.Entity> {
  const chimeraSeamBindings = new Map<pc.Entity, ChimeraSeamMaterialBinding>();
  const chimeraSeamPresentations = new Map<pc.Entity, NonNullable<AttachmentRequest['chimeraSeam']>>();

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
        if (request.visualKey === 'chimera-seam:mythic' && request.chimeraSeam !== undefined) {
          const binding = createChimeraSeamMaterialBinding(request.chimeraSeam);
          binding.apply(root);
          chimeraSeamBindings.set(root, binding);
          chimeraSeamPresentations.set(root, request.chimeraSeam);
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
      // Firefly Colony needs a readable continuous body-orbit silhouette even
      // between its short command pulses. The scale is presentation-only;
      // socket ownership and all combat timing remain simulation-owned.
      const fireflyEmphasis = view.name.startsWith('firefly-colony:') ? 1.55 : 1;
      view.setLocalScale(
        transform.scale[0] * fireflyEmphasis,
        transform.scale[1] * fireflyEmphasis,
        transform.scale[2] * fireflyEmphasis,
      );
      monarchBroodMotion?.track(view as unknown as MonarchBroodMotionNode, view.name);
      const chimeraSeam = chimeraSeamPresentations.get(view);
      if (chimeraSeam !== undefined) {
        chimeraSeamMotion?.track(view as unknown as ChimeraSeamMotionNode, chimeraSeam);
      }
    },
    unmount(view): void {
      view.parent?.removeChild(view);
    },
    destroy(view): void {
      monarchBroodMotion?.untrack(view as unknown as MonarchBroodMotionNode);
      chimeraSeamMotion?.untrack(view as unknown as ChimeraSeamMotionNode);
      chimeraSeamPresentations.delete(view);
      chimeraSeamBindings.get(view)?.destroy();
      chimeraSeamBindings.delete(view);
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
  const owl = attachmentMaterial(new pc.Color(0.48, 0.36, 0.7));
  const owlEdge = attachmentMaterial(new pc.Color(0.82, 0.74, 1));
  const bat = attachmentMaterial(new pc.Color(0.22, 0.12, 0.34));
  const batGlow = attachmentMaterial(new pc.Color(0.78, 0.34, 1));
  const crab = attachmentMaterial(new pc.Color(0.96, 0.34, 0.28));
  const crabEdge = attachmentMaterial(new pc.Color(1, 0.72, 0.38));
  const armadillo = attachmentMaterial(new pc.Color(0.48, 0.52, 0.58));
  const armadilloEdge = attachmentMaterial(new pc.Color(0.8, 0.86, 0.9));
  const skunk = attachmentMaterial(new pc.Color(0.16, 0.2, 0.28));
  const skunkEdge = attachmentMaterial(new pc.Color(0.92, 0.94, 1));
  const monarch = attachmentMaterial(new pc.Color(0.98, 0.4, 0.12));
  const monarchEdge = attachmentMaterial(new pc.Color(1, 0.78, 0.24));
  const mythicGlow = attachmentMaterial(new pc.Color(0.84, 0.34, 1));
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
    owlPrimary: owl,
    owlAccent: owlEdge,
    batPrimary: bat,
    batAccent: batGlow,
    crabPrimary: crab,
    crabAccent: crabEdge,
    armadilloPrimary: armadillo,
    armadilloAccent: armadilloEdge,
    skunkPrimary: skunk,
    skunkAccent: skunkEdge,
    monarchPrimary: monarch,
    monarchAccent: monarchEdge,
    launchMythicGlow: mythicGlow,
  };
  const monarchBroodMotion = createMonarchBroodAttachmentMotion();
  const chimeraSeamMotion = createChimeraSeamAttachmentMotion();

  let entity: pc.Entity | null = null;
  let sockets: GregAttachmentSockets<AttachmentNode> | null = null;
  let traitVisualProjector: ReturnType<typeof createGregTraitVisualProjector> | null = null;
  let animation: GregAnimationState = createGregAnimationState();
  let locomotion = createGregLocomotionPresentationState();
  let lastAnimationTick = -1;
  let renderedClip: string | null = null;
  let availableAnimationClips: ReadonlySet<string> = new Set();
  let disposed = false;
  let visible = true;

  void loader.load().then((loaded) => {
    if (disposed) return;
    entity = loaded.entity;
    entity.enabled = visible;
    entity.setLocalScale(...GREG_SCALE);
    availableAnimationClips = configureAnimations(entity, loader);
    renderedClip = 'Idle';
    sockets = createGregAttachmentSockets(
      entity as unknown as AttachmentNode,
      createAttachmentFactory(attachmentMaterials, monarchBroodMotion, chimeraSeamMotion),
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
    setVisible(nextVisible) {
      visible = nextVisible;
      if (entity !== null) entity.enabled = visible;
    },
    update(previous, current, alpha, traitVisualState, traitPresentationEvents = []) {
      if (entity === null) return;
      traitVisualProjector?.sync(traitVisualState);
      monarchBroodMotion.update(current.tick + alpha);
      chimeraSeamMotion.update(current.tick + alpha);
      entity.enabled = visible && current.playerAlive;
      if (current.tick < locomotion.sampledTick) {
        locomotion = createGregLocomotionPresentationState();
        animation = createGregAnimationState();
        lastAnimationTick = -1;
        renderedClip = null;
      }
      const pose = projectGregLocomotion(locomotion, previous, current, alpha);
      locomotion = pose.state;
      entity.setLocalPosition(
        pose.x - worldHalfWidth,
        locomotionLift(current.tick, alpha, pose.animation.moving, pose.movementMagnitude),
        worldHalfHeight - pose.y,
      );
      entity.setLocalEulerAngles(0, pose.headingDegrees, 0);

      if (current.tick !== lastAnimationTick) {
        const baseInput = deriveGregAnimationInput(previous, current, traitPresentationEvents);
        animation = advanceGregAnimation(animation, {
          ...baseInput,
          movementMagnitude: pose.movementMagnitude,
          locomotionMoving: pose.animation.moving,
          locomotionBlendSeconds: pose.animation.transitionDurationSeconds,
        });
        lastAnimationTick = current.tick;
      }

      const nextClip = selectRenderedAnimationClip(
        animation,
        pose.movementMagnitude,
        pose.animation.moving,
        availableAnimationClips,
      );
      // Re-enter non-locomotion actions (hit / idle attack) when the reducer
      // asks for it, but never interrupt a visible walk/gallop with the rapid
      // auto-fire pulse that originally caused the sliding read.
      const isLocomotionClip = nextClip === 'Walk' || nextClip === 'Gallop';
      if (nextClip !== renderedClip || (animation.restart && !isLocomotionClip)) {
        entity.anim?.baseLayer?.transition(nextClip, animation.transitionDurationSeconds);
        renderedClip = nextClip;
      }
      entity.anim!.speed = nextClip === 'Gallop'
        ? Math.max(1.12, pose.animation.walkPlaybackRate * 1.18)
        : isLocomotionClip ? pose.animation.walkPlaybackRate : 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      traitVisualProjector?.clear();
      traitVisualProjector = null;
      sockets?.clear();
      sockets = null;
      monarchBroodMotion.clear();
      chimeraSeamMotion.clear();
      loader.dispose();
      entity = null;
      renderedClip = null;
      availableAnimationClips = new Set();
      visible = false;
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
      owl.destroy();
      owlEdge.destroy();
      bat.destroy();
      batGlow.destroy();
      crab.destroy();
      crabEdge.destroy();
      armadillo.destroy();
      armadilloEdge.destroy();
      skunk.destroy();
      skunkEdge.destroy();
      monarch.destroy();
      monarchEdge.destroy();
      mythicGlow.destroy();
    },
  };
}
