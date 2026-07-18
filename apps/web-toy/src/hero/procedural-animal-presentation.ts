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
import {
  createChimeraSeamAttachmentMotion,
  type ChimeraSeamAttachmentMotion,
  type ChimeraSeamMotionNode,
} from './chimera-seam-presentation';
import {
  createChimeraSeamMaterialBinding,
  type ChimeraSeamMaterialBinding,
} from './chimera-seam-playcanvas';
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
const SCOUT_POUNCER_ART_URL = new URL(
  '../../../../assets/ui/heroes/scout-pouncer-v1.png',
  import.meta.url,
).href;

/**
 * World-facing half extents for the authored cutouts before the shared hero
 * root scale. Scout remains the largest friendly silhouette at combat zoom.
 */
export const SCOUT_CUTOUT_HALF_EXTENT = 8.2;
export const BENNY_CUTOUT_HALF_EXTENT = 8.1;
export const GRACIE_CUTOUT_HALF_EXTENT = 8.05;

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

export const PROCEDURAL_ANIMAL_MOVEMENT_THRESHOLD = 0.1;
export const PROCEDURAL_ANIMAL_ROOT_SCALE = 2.45;
/** The canonical 0.5 Hz ceiling for persistent idle motion. */
export const PROCEDURAL_ANIMAL_IDLE_BREATH_PERIOD_TICKS = 120;
export const PROCEDURAL_ANIMAL_IDLE_BREATH_SCALE = 0.02;
export const PROCEDURAL_ANIMAL_LANDING_KICK_TICKS = 3;
export const PROCEDURAL_ANIMAL_LANDING_KICK_SCALE = 0.04;
export const PROCEDURAL_ANIMAL_MAX_TURN_BANK_DEGREES = 8;
export const PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY = 8;
export const PROCEDURAL_ANIMAL_FOOTFALL_DUST_LIFETIME_TICKS = 18;
export const PROCEDURAL_ANIMAL_FOOTFALL_DUST_MIN_SCALE = 2.5;
export const PROCEDURAL_ANIMAL_FOOTFALL_DUST_MAX_SCALE = 4;
export const PROCEDURAL_ANIMAL_FOOTFALL_DUST_OPACITY = 0.42;

const TWO_PI = Math.PI * 2;
const EMPTY_DUST_BIRTH_TICK = -2_147_483_648;
const FOOTFALL_DIAGONAL_A_MASK = 0b1001;
const FOOTFALL_DIAGONAL_B_MASK = 0b0110;

export interface ProceduralAnimalGaitTuning {
  readonly strideCyclesPerTick: number;
  readonly strideSpeedGain: number;
  readonly maxStrideCyclesPerTick: number;
  readonly bodyLift: number;
  readonly sideSway: number;
  readonly forwardSway: number;
  readonly widthAmplitude: number;
  readonly lengthAmplitude: number;
  readonly yawWagDegrees: number;
  readonly leanDegrees: number;
  readonly turnBankDegrees: number;
  readonly dustScale: number;
}

/**
 * Every founder uses the same camera-plane gait contract while retaining an
 * authored weight: Benny is deliberate, Scout is balanced, Gracie is quick.
 */
export const PROCEDURAL_ANIMAL_GAIT_TUNING: Readonly<Record<HeroId, ProceduralAnimalGaitTuning>> = Object.freeze({
  greg: Object.freeze({
    strideCyclesPerTick: 0.072,
    strideSpeedGain: 0.014,
    maxStrideCyclesPerTick: 0.102,
    bodyLift: 0.05,
    sideSway: 0.16,
    forwardSway: 0.12,
    widthAmplitude: 0.07,
    lengthAmplitude: 0.085,
    yawWagDegrees: 6.4,
    leanDegrees: 4.8,
    turnBankDegrees: 8,
    dustScale: 3.5,
  }),
  benny: Object.freeze({
    strideCyclesPerTick: 0.058,
    strideSpeedGain: 0.01,
    maxStrideCyclesPerTick: 0.082,
    bodyLift: 0.04,
    sideSway: 0.1,
    forwardSway: 0.07,
    widthAmplitude: 0.065,
    lengthAmplitude: 0.07,
    yawWagDegrees: 5.2,
    leanDegrees: 4.4,
    turnBankDegrees: 7,
    dustScale: 4,
  }),
  gracie: Object.freeze({
    strideCyclesPerTick: 0.082,
    strideSpeedGain: 0.014,
    maxStrideCyclesPerTick: 0.112,
    bodyLift: 0.055,
    sideSway: 0.18,
    forwardSway: 0.13,
    widthAmplitude: 0.075,
    lengthAmplitude: 0.09,
    yawWagDegrees: 6.8,
    leanDegrees: 5.4,
    turnBankDegrees: 8,
    dustScale: 3.1,
  }),
});

/**
 * Converts simulation movement into the PlayCanvas XZ heading used by the
 * procedural animals. Simulation +Y maps to scene -Z, so a north/up movement
 * must face 180 degrees rather than the zero-degree +Z direction.
 */
export function deriveProceduralAnimalHeadingDegrees(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
): number | null {
  const dx = finite(current.playerX) - finite(previous.playerX);
  const dy = finite(current.playerY) - finite(previous.playerY);
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
  readonly yawWagDegrees: number;
  readonly leanDegrees: number;
  readonly landingKick: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampedAlpha(alpha: number): number {
  return Math.min(1, Math.max(0, finite(alpha)));
}

function locomotionPhase(
  tick: number,
  alpha: number,
  moving: boolean,
  movementMagnitude: number,
  heroId: HeroId,
): number {
  const tuning = PROCEDURAL_ANIMAL_GAIT_TUNING[heroId];
  if (!moving) {
    return (finite(tick) + clampedAlpha(alpha))
      / PROCEDURAL_ANIMAL_IDLE_BREATH_PERIOD_TICKS * TWO_PI;
  }
  const cadence = Math.min(
    tuning.maxStrideCyclesPerTick,
    tuning.strideCyclesPerTick + Math.max(0, movementMagnitude) * tuning.strideSpeedGain,
  );
  return (finite(tick) + clampedAlpha(alpha)) * cadence * TWO_PI;
}

function strideCadence(movementMagnitude: number, heroId: HeroId): number {
  const tuning = PROCEDURAL_ANIMAL_GAIT_TUNING[heroId];
  return Math.min(
    tuning.maxStrideCyclesPerTick,
    tuning.strideCyclesPerTick + Math.max(0, movementMagnitude) * tuning.strideSpeedGain,
  );
}

function movementMagnitude(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
): number {
  return Math.hypot(
    finite(current.playerX) - finite(previous.playerX),
    finite(current.playerY) - finite(previous.playerY),
  );
}

function isMoving(
  magnitude: number,
  current: Pick<RenderSnapshot, 'playerAlive'>,
): boolean {
  return current.playerAlive && magnitude > PROCEDURAL_ANIMAL_MOVEMENT_THRESHOLD;
}

function landingKickForPhase(phase: number, cadence: number): number {
  if (!(cadence > 0)) return 0;
  const halfCycles = phase / Math.PI;
  const distanceToBeat = Math.abs(halfCycles - Math.round(halfCycles));
  const ticksFromBeat = distanceToBeat / (cadence * 2);
  if (ticksFromBeat >= PROCEDURAL_ANIMAL_LANDING_KICK_TICKS) return 0;
  const fade = 1 - ticksFromBeat / PROCEDURAL_ANIMAL_LANDING_KICK_TICKS;
  return PROCEDURAL_ANIMAL_LANDING_KICK_SCALE * fade * fade;
}

export function projectProceduralAnimalLocomotion(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'tick' | 'playerX' | 'playerY' | 'playerAlive'>,
  alpha: number,
  heroId: HeroId = 'greg',
): ProceduralAnimalLocomotionPose {
  const magnitude = movementMagnitude(previous, current);
  const moving = isMoving(magnitude, current);
  const phase = locomotionPhase(current.tick, alpha, moving, magnitude, heroId);
  const stride = Math.sin(phase);
  const footfall = stride * stride;
  if (!moving) {
    const breathing = current.playerAlive ? Math.sin(phase) * PROCEDURAL_ANIMAL_IDLE_BREATH_SCALE : 0;
    return {
      moving: false,
      movementMagnitude: magnitude,
      bodyLift: current.playerAlive ? 0.035 + breathing * 0.5 : 0,
      sideSway: 0,
      forwardSway: 0,
      widthScale: 1 + breathing,
      lengthScale: 1 + breathing,
      yawWagDegrees: 0,
      leanDegrees: 0,
      landingKick: 0,
    };
  }
  const tuning = PROCEDURAL_ANIMAL_GAIT_TUNING[heroId];
  const landingKick = landingKickForPhase(phase, strideCadence(magnitude, heroId));
  return {
    moving: true,
    movementMagnitude: magnitude,
    bodyLift: 0.035 + footfall * tuning.bodyLift,
    sideSway: stride * tuning.sideSway,
    forwardSway: Math.cos(phase) * tuning.forwardSway,
    widthScale: 1 - Math.cos(phase) * tuning.widthAmplitude,
    lengthScale: 1 + Math.cos(phase) * tuning.lengthAmplitude,
    yawWagDegrees: stride * tuning.yawWagDegrees,
    leanDegrees: stride * tuning.leanDegrees,
    landingKick,
  };
}

/**
 * Four deterministic contact phases for flat cutout art. The cutouts do not
 * pretend to contain hidden skeletal legs; instead, grounded hoof/paw marks
 * alternate in diagonal pairs so movement reads as a real gait at play scale.
 */
export interface ProceduralAnimalGaitPose {
  readonly moving: boolean;
  readonly stridePhase: number;
  readonly frontLeftLift: number;
  readonly frontRightLift: number;
  readonly rearLeftLift: number;
  readonly rearRightLift: number;
}

export function projectProceduralAnimalGait(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'tick' | 'playerX' | 'playerY' | 'playerAlive'>,
  alpha: number,
  heroId: HeroId = 'greg',
): ProceduralAnimalGaitPose {
  const magnitude = movementMagnitude(previous, current);
  const moving = isMoving(magnitude, current);
  const phase = locomotionPhase(current.tick, alpha, moving, magnitude, heroId);
  if (!moving) {
    return {
      moving: false,
      stridePhase: phase,
      frontLeftLift: 0,
      frontRightLift: 0,
      rearLeftLift: 0,
      rearRightLift: 0,
    };
  }
  const liftStrength = 0.18 + Math.min(0.26, magnitude * 0.07);
  const diagonalA = Math.max(0, Math.sin(phase)) * liftStrength;
  const diagonalB = Math.max(0, -Math.sin(phase)) * liftStrength;
  return {
    moving: true,
    stridePhase: phase,
    frontLeftLift: diagonalA,
    frontRightLift: diagonalB,
    rearLeftLift: diagonalB,
    rearRightLift: diagonalA,
  };
}

/**
 * A deterministic two-paw/hoof event derived from the same zero crossings as
 * the gait. The bit mask maps to front-left, front-right, rear-left,
 * rear-right markers and never requests more than two puffs in one tick.
 */
export function projectProceduralAnimalFootfallDustSpawnMask(
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'tick' | 'playerX' | 'playerY' | 'playerAlive'>,
  heroId: HeroId = 'greg',
): number {
  const magnitude = movementMagnitude(previous, current);
  if (!isMoving(magnitude, current)) return 0;
  const previousPhase = locomotionPhase(current.tick - 1, 0, true, magnitude, heroId);
  const currentPhase = locomotionPhase(current.tick, 0, true, magnitude, heroId);
  const previousStride = Math.sin(previousPhase);
  const currentStride = Math.sin(currentPhase);
  if (previousStride <= 0 && currentStride > 0) return FOOTFALL_DIAGONAL_A_MASK;
  if (previousStride >= 0 && currentStride < 0) return FOOTFALL_DIAGONAL_B_MASK;
  return 0;
}

/** A local ring allocator guarantees that no more than eight dust puffs live. */
export class FixedFootfallDustAllocator {
  readonly birthTicks = new Int32Array(PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY);
  #nextSlot = 0;

  constructor() {
    this.birthTicks.fill(EMPTY_DUST_BIRTH_TICK);
  }

  claim(tick: number): number {
    const slot = this.#nextSlot;
    this.#nextSlot = (this.#nextSlot + 1) % PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY;
    this.birthTicks[slot] = Math.floor(finite(tick));
    return slot;
  }

  reset(): void {
    this.birthTicks.fill(EMPTY_DUST_BIRTH_TICK);
    this.#nextSlot = 0;
  }

  activeCount(tick: number): number {
    const currentTick = finite(tick);
    let count = 0;
    for (let index = 0; index < this.birthTicks.length; index++) {
      const age = currentTick - this.birthTicks[index]!;
      if (age >= 0 && age < PROCEDURAL_ANIMAL_FOOTFALL_DUST_LIFETIME_TICKS) count++;
    }
    return count;
  }
}

/** Converts a shortest heading delta into the bounded local cutout bank. */
export function projectProceduralAnimalTurnBankDegrees(
  previousHeadingDegrees: number,
  currentHeadingDegrees: number,
  heroId: HeroId = 'greg',
): number {
  if (!Number.isFinite(previousHeadingDegrees) || !Number.isFinite(currentHeadingDegrees)) return 0;
  const rawDelta = (currentHeadingDegrees - previousHeadingDegrees + 540) % 360 - 180;
  const limit = Math.min(
    PROCEDURAL_ANIMAL_MAX_TURN_BANK_DEGREES,
    PROCEDURAL_ANIMAL_GAIT_TUNING[heroId].turnBankDegrees,
  );
  return Math.min(limit, Math.max(-limit, rawDelta * 0.16));
}

export type ProceduralAnimalActionKind =
  | 'none'
  | 'scout-swipe'
  | 'trample'
  | 'brace'
  | 'spit'
  | 'scout'
  | 'fluffy-shield'
  | 'armor-block';

export interface ProceduralAnimalActionReaction {
  readonly kind: ProceduralAnimalActionKind;
  readonly strength: number;
  readonly bodyLift: number;
  readonly forwardKick: number;
  readonly pitchDegrees: number;
  readonly rollDegrees: number;
  readonly widthScale: number;
  readonly heightScale: number;
  readonly lengthScale: number;
  readonly footfallKick: number;
}

/** Classifies only the active companion's signature events, never every trait cue. */
export function classifyProceduralAnimalAction(
  heroId: HeroId,
  event: Pick<TraitPresentationEventView, 'sourceId' | 'tag'>,
): ProceduralAnimalActionKind {
  const tag = event.tag ?? '';
  const matches = (identity: string): boolean => event.sourceId === identity || tag === identity;
  if (heroId === 'greg') {
    // Scout is a presentation swap only. The stable simulation identity and
    // its authoritative event ids stay `greg-*` for replay compatibility.
    if (matches('greg-fox-swipe') || matches('greg-rush-rake')) return 'scout-swipe';
    return 'none';
  }
  if (heroId === 'benny') {
    if (matches('benny-trample-wave') || event.sourceId === 'benny-trample') return 'trample';
    if (matches('benny-brace')) return 'brace';
    if (matches('armor-block')) return 'armor-block';
    return 'none';
  }
  if (matches('gracie-spit')) return 'spit';
  if (matches('gracie-scout')) return 'scout';
  if (matches('fluffy-shield')) return 'fluffy-shield';
  return 'none';
}

/**
 * A compact reaction layer for illustrated cutouts. It is tick/alpha based
 * and only offsets renderer-owned art; player position, heading, and hit
 * resolution remain exclusively simulation owned.
 */
export function projectProceduralAnimalActionReaction(
  kind: ProceduralAnimalActionKind,
  actionTick: number,
  currentTick: number,
  alpha: number,
): ProceduralAnimalActionReaction {
  const zero: ProceduralAnimalActionReaction = {
    kind: 'none', strength: 0, bodyLift: 0, forwardKick: 0, pitchDegrees: 0,
    rollDegrees: 0, widthScale: 0, heightScale: 0, lengthScale: 0, footfallKick: 0,
  };
  if (kind === 'none' || !Number.isFinite(actionTick)) return zero;
  const lifetime = kind === 'trample' ? 12 : kind === 'fluffy-shield' ? 18 : kind === 'scout-swipe' ? 11 : 10;
  const age = Math.max(0, finite(currentTick) + clampedAlpha(alpha) - actionTick);
  if (age >= lifetime) return zero;
  const envelope = 1 - age / lifetime;
  const strength = envelope * (0.68 + Math.sin(Math.min(1, age * 0.62) * Math.PI) * 0.32);
  switch (kind) {
    case 'scout-swipe': return {
      kind, strength, bodyLift: 0.14 * strength, forwardKick: 0.44 * strength,
      pitchDegrees: -10.5 * strength, rollDegrees: Math.sin(age * 2.5) * 2.6 * strength,
      widthScale: 0.04 * strength, heightScale: -0.03 * strength,
      lengthScale: 0.16 * strength, footfallKick: 0.74 * strength,
    };
    case 'trample': return {
      kind, strength, bodyLift: 0.18 * strength, forwardKick: 0.42 * strength,
      pitchDegrees: -10 * strength, rollDegrees: Math.sin(age * 1.5) * 1.8 * strength,
      widthScale: 0.11 * strength, heightScale: -0.07 * strength,
      lengthScale: 0.16 * strength, footfallKick: strength,
    };
    case 'brace': return {
      kind, strength, bodyLift: 0.07 * strength, forwardKick: -0.1 * strength,
      pitchDegrees: 3.8 * strength, rollDegrees: 0,
      widthScale: 0.12 * strength, heightScale: -0.05 * strength,
      lengthScale: -0.06 * strength, footfallKick: 0.62 * strength,
    };
    case 'spit': return {
      kind, strength, bodyLift: 0.11 * strength, forwardKick: 0.3 * strength,
      pitchDegrees: -7 * strength, rollDegrees: Math.sin(age * 2.1) * 1.2 * strength,
      widthScale: 0.025 * strength, heightScale: 0.04 * strength,
      lengthScale: 0.12 * strength, footfallKick: 0.18 * strength,
    };
    case 'scout': return {
      kind, strength, bodyLift: 0.06 * strength, forwardKick: 0.09 * strength,
      pitchDegrees: -2.2 * strength, rollDegrees: 1.8 * strength,
      widthScale: 0.015 * strength, heightScale: 0.025 * strength,
      lengthScale: 0.04 * strength, footfallKick: 0,
    };
    case 'fluffy-shield': return {
      kind, strength, bodyLift: 0.09 * strength, forwardKick: 0,
      pitchDegrees: 0, rollDegrees: Math.sin(age * 1.4) * 1.6 * strength,
      widthScale: 0.08 * strength, heightScale: 0.08 * strength,
      lengthScale: 0.08 * strength, footfallKick: 0,
    };
    case 'armor-block': return {
      kind, strength, bodyLift: 0.045 * strength, forwardKick: -0.04 * strength,
      pitchDegrees: 2 * strength, rollDegrees: 0,
      widthScale: 0.1 * strength, heightScale: -0.035 * strength,
      lengthScale: -0.04 * strength, footfallKick: 0.48 * strength,
    };
  }
  return zero;
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
  chimeraSeamMotion?: ChimeraSeamAttachmentMotion,
): GregAttachmentFactory<AttachmentNode, pc.Entity> {
  const chimeraSeamBindings = new Map<pc.Entity, ChimeraSeamMaterialBinding>();
  const chimeraSeamPresentations = new Map<pc.Entity, NonNullable<AttachmentRequest['chimeraSeam']>>();

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
        if (request.visualKey === 'chimera-seam:mythic' && request.chimeraSeam !== undefined) {
          const binding = createChimeraSeamMaterialBinding(request.chimeraSeam);
          binding.apply(root);
          chimeraSeamBindings.set(root, binding);
          chimeraSeamPresentations.set(root, request.chimeraSeam);
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
  readonly artRig: pc.Entity;
  readonly body: pc.Entity;
  readonly movingParts: readonly pc.Entity[];
  readonly footfalls: readonly FootfallMarker[];
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

interface FootfallMarker {
  readonly entity: pc.Entity;
  readonly baseX: number;
  readonly baseZ: number;
  readonly baseWidth: number;
  readonly baseLength: number;
  readonly gaitIndex: 0 | 1 | 2 | 3;
}

interface FootfallRig {
  readonly markers: readonly FootfallMarker[];
  dispose(): void;
}

function createFootfallMaterial(): pc.StandardMaterial {
  const value = new pc.StandardMaterial();
  value.useLighting = false;
  value.diffuse.set(0, 0, 0);
  value.emissive.set(0, 0, 0);
  value.opacity = 0.34;
  value.blendType = pc.BLEND_NORMAL;
  value.depthWrite = false;
  value.cull = pc.CULLFACE_NONE;
  value.update();
  return value;
}

/**
 * Four small contact marks give the authored flat cutouts a readable gait
 * without falsifying their art as a hidden skeletal model. They are built once
 * and only receive deterministic renderer-local transforms during a run.
 */
function createFootfallRig(root: pc.Entity, heroId: HeroId): FootfallRig {
  const value = createFootfallMaterial();
  const spread = heroId === 'benny' ? 2.92 : heroId === 'greg' ? 2.68 : 2.48;
  const front = heroId === 'benny' ? 2.5 : heroId === 'greg' ? 2.44 : 2.34;
  const rear = heroId === 'benny' ? -2.56 : heroId === 'greg' ? -2.5 : -2.38;
  const markers: FootfallMarker[] = [];
  const entries: readonly [string, number, number, 0 | 1 | 2 | 3][] = [
    ['front-left', -spread, front, 0],
    ['front-right', spread, front, 1],
    ['rear-left', -spread, rear, 2],
    ['rear-right', spread, rear, 3],
  ];
  for (const [name, x, z, gaitIndex] of entries) {
    const entity = new pc.Entity(`${heroId}-footfall-${name}`);
    entity.addComponent('render', {
      type: 'sphere', material: value, castShadows: false, receiveShadows: false,
    });
    root.addChild(entity);
    entity.setLocalPosition(x, 0.025, z);
    entity.setLocalScale(1.12, 0.035, 0.82);
    entity.enabled = false;
    markers.push({
      entity, baseX: x, baseZ: z, baseWidth: 1.12, baseLength: 0.82, gaitIndex,
    });
  }
  return {
    markers: Object.freeze(markers),
    dispose(): void {
      value.destroy();
    },
  };
}

function updateFootfalls(
  markers: readonly FootfallMarker[],
  gait: ProceduralAnimalGaitPose,
  reaction: ProceduralAnimalActionReaction,
): void {
  for (const marker of markers) {
    // Keep this scalar selection inside the fixed marker loop. A four-item
    // array here would allocate on every rendered frame of a moving hero.
    let lift = gait.frontLeftLift;
    switch (marker.gaitIndex) {
      case 1:
        lift = gait.frontRightLift;
        break;
      case 2:
        lift = gait.rearLeftLift;
        break;
      case 3:
        lift = gait.rearRightLift;
        break;
      default:
        break;
    }
    const contact = 1 - Math.min(0.72, lift * 1.8);
    const stamp = reaction.footfallKick * (marker.gaitIndex < 2 ? 1 : 0.72);
    marker.entity.setLocalPosition(
      marker.baseX,
      0.025 + lift * 0.14,
      marker.baseZ - reaction.forwardKick * (marker.gaitIndex < 2 ? 0.2 : -0.08),
    );
    marker.entity.setLocalScale(
      marker.baseWidth * (0.58 + contact * 0.38 + stamp * 0.22),
      0.035,
      marker.baseLength * (0.62 + contact * 0.42 + stamp * 0.34),
    );
    marker.entity.enabled = gait.moving || reaction.footfallKick > 0.02;
  }
}

interface FootfallDustPuff {
  readonly entity: pc.Entity;
  readonly meshInstance: pc.MeshInstance;
  baseScale: number;
}

interface FootfallDustPool {
  readonly root: pc.Entity;
  readonly material: pc.StandardMaterial;
  readonly allocator: FixedFootfallDustAllocator;
  readonly puffs: readonly FootfallDustPuff[];
  lastSpawnTick: number;
}

function createFootfallDustMaterial(): pc.StandardMaterial {
  const value = new pc.StandardMaterial();
  // Earth-tone dust deliberately stays outside the ivory, coral, and mint/gold
  // reserved lanes. It is a quiet contact read, not a new combat effect.
  value.useLighting = false;
  value.diffuse.set(0.34, 0.22, 0.13);
  value.emissive.set(0.055, 0.032, 0.014);
  value.opacity = PROCEDURAL_ANIMAL_FOOTFALL_DUST_OPACITY;
  value.blendType = pc.BLEND_NORMAL;
  value.depthWrite = false;
  value.cull = pc.CULLFACE_NONE;
  value.update();
  return value;
}

/**
 * This is intentionally a tiny local pool rather than a shared scene batch:
 * it is owned by one hero presentation, never exceeds eight puffs, and needs
 * no renderer-wide route or gameplay-facing state.
 */
function createFootfallDustPool(parent: pc.Entity, heroId: HeroId): FootfallDustPool {
  const root = new pc.Entity(`${heroId}-footfall-dust-pool`);
  root.enabled = false;
  parent.addChild(root);
  const material = createFootfallDustMaterial();
  const puffs: FootfallDustPuff[] = [];
  for (let index = 0; index < PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY; index++) {
    const entity = new pc.Entity(`${heroId}-footfall-dust-${index}`);
    entity.addComponent('render', {
      type: 'sphere', material, castShadows: false, receiveShadows: false,
    });
    root.addChild(entity);
    entity.setLocalScale(0, 0, 0);
    entity.enabled = false;
    const meshInstance = entity.render!.meshInstances[0]!;
    meshInstance.setParameter('material_opacity', 0);
    puffs.push({ entity, meshInstance, baseScale: 0 });
  }
  return {
    root,
    material,
    allocator: new FixedFootfallDustAllocator(),
    puffs: Object.freeze(puffs),
    lastSpawnTick: Number.NEGATIVE_INFINITY,
  };
}

function clearFootfallDust(pool: FootfallDustPool): void {
  pool.allocator.reset();
  pool.lastSpawnTick = Number.NEGATIVE_INFINITY;
  for (const puff of pool.puffs) {
    puff.baseScale = 0;
    puff.entity.enabled = false;
    puff.meshInstance.setParameter('material_opacity', 0);
  }
}

function disposeFootfallDust(pool: FootfallDustPool): void {
  clearFootfallDust(pool);
  pool.root.destroy();
  pool.material.destroy();
}

function setFootfallDustVisible(pool: FootfallDustPool, visible: boolean): void {
  if (!visible) clearFootfallDust(pool);
  pool.root.enabled = visible;
}

function spawnFootfallDust(
  pool: FootfallDustPool,
  sceneX: number,
  sceneZ: number,
  headingDegrees: number,
  scale: number,
  tick: number,
): void {
  const slot = pool.allocator.claim(tick);
  const puff = pool.puffs[slot]!;
  puff.baseScale = scale;
  puff.entity.setLocalPosition(sceneX, 0.04, sceneZ);
  puff.entity.setLocalEulerAngles(0, headingDegrees, 0);
  puff.entity.setLocalScale(scale * 0.78, 0.026, scale * 0.58);
  puff.meshInstance.setParameter('material_opacity', PROCEDURAL_ANIMAL_FOOTFALL_DUST_OPACITY);
  puff.entity.enabled = true;
}

function updateFootfallDust(
  pool: FootfallDustPool,
  markers: readonly FootfallMarker[],
  previous: Pick<RenderSnapshot, 'playerX' | 'playerY'>,
  current: Pick<RenderSnapshot, 'tick' | 'playerX' | 'playerY' | 'playerAlive'>,
  alpha: number,
  heroId: HeroId,
  worldHalfWidth: number,
  worldHalfHeight: number,
  headingDegrees: number,
): void {
  const tick = Math.floor(finite(current.tick));
  if (tick < pool.lastSpawnTick) clearFootfallDust(pool);
  if (tick !== pool.lastSpawnTick) {
    const mask = projectProceduralAnimalFootfallDustSpawnMask(previous, current, heroId);
    if (mask !== 0) {
      const radians = headingDegrees * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const heroSceneX = finite(current.playerX) - worldHalfWidth;
      const heroSceneZ = worldHalfHeight - finite(current.playerY);
      const tuning = PROCEDURAL_ANIMAL_GAIT_TUNING[heroId];
      for (const marker of markers) {
        if ((mask & (1 << marker.gaitIndex)) === 0) continue;
        const localX = marker.baseX * PROCEDURAL_ANIMAL_ROOT_SCALE;
        const localZ = marker.baseZ * PROCEDURAL_ANIMAL_ROOT_SCALE;
        const sceneX = heroSceneX + localX * cosine + localZ * sine;
        const sceneZ = heroSceneZ - localX * sine + localZ * cosine;
        const diagonalScale = marker.gaitIndex === 0 || marker.gaitIndex === 3 ? 1 : 0.92;
        const scale = Math.min(
          PROCEDURAL_ANIMAL_FOOTFALL_DUST_MAX_SCALE,
          Math.max(PROCEDURAL_ANIMAL_FOOTFALL_DUST_MIN_SCALE, tuning.dustScale * diagonalScale),
        );
        spawnFootfallDust(pool, sceneX, sceneZ, headingDegrees, scale, tick);
      }
    }
    pool.lastSpawnTick = tick;
  }
  const renderTick = finite(current.tick) + clampedAlpha(alpha);
  for (let index = 0; index < pool.puffs.length; index++) {
    const puff = pool.puffs[index]!;
    const birthTick = pool.allocator.birthTicks[index]!;
    const age = renderTick - birthTick;
    if (age < 0 || age >= PROCEDURAL_ANIMAL_FOOTFALL_DUST_LIFETIME_TICKS) {
      puff.entity.enabled = false;
      continue;
    }
    const progress = age / PROCEDURAL_ANIMAL_FOOTFALL_DUST_LIFETIME_TICKS;
    const fade = 1 - progress;
    const expansion = 0.78 + progress * 0.36;
    puff.entity.setLocalScale(
      puff.baseScale * expansion,
      0.026,
      puff.baseScale * (0.58 + progress * 0.22),
    );
    puff.meshInstance.setParameter('material_opacity', PROCEDURAL_ANIMAL_FOOTFALL_DUST_OPACITY * fade * fade);
    puff.entity.enabled = pool.root.enabled;
  }
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
function createScout(root: pc.Entity, device: pc.GraphicsDevice | undefined): ProceduralParts {
  const artRig = bone(root, 'Scout art rig', [0, 0, 0]);
  // The Scout cutout lunges toward its lower-left corner, matching the other
  // companion source art. Rotate that direction into local +Z once here.
  artRig.setLocalEulerAngles(0, 135, 0);
  const bodyBone = bone(artRig, 'Body', [0, 0, 0]);
  bone(artRig, 'Head', [0, 0.52, 4.7]);
  bone(artRig, 'Back', [0, 0.24, -0.5]);
  bone(artRig, 'FrontShoulder.L', [-3.32, 0.2, 1.82]);
  bone(artRig, 'FrontShoulder.R', [3.32, 0.2, 1.82]);
  bone(artRig, 'Tail4', [0, 0.24, -5.58]);
  const cutout = createHeroCutout(
    device,
    bodyBone,
    'scout-pouncer-cutout',
    SCOUT_POUNCER_ART_URL,
    SCOUT_CUTOUT_HALF_EXTENT,
  );
  const footfalls = createFootfallRig(root, 'greg');
  return {
    artRig,
    body: cutout.body,
    movingParts: Object.freeze([]),
    footfalls: footfalls.markers,
    dispose(): void {
      cutout.dispose();
      footfalls.dispose();
    },
  };
}

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
  const cutout = createHeroCutout(
    device,
    bodyBone,
    'benny-bastion-cutout',
    BENNY_BASTION_ART_URL,
    BENNY_CUTOUT_HALF_EXTENT,
  );
  const footfalls = createFootfallRig(root, 'benny');
  return {
    artRig,
    body: cutout.body,
    movingParts: Object.freeze([]),
    footfalls: footfalls.markers,
    dispose(): void {
      cutout.dispose();
      footfalls.dispose();
    },
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
  const cutout = createHeroCutout(
    device,
    bodyBone,
    'gracie-surveyor-cutout',
    GRACIE_SURVEYOR_ART_URL,
    GRACIE_CUTOUT_HALF_EXTENT,
  );
  const footfalls = createFootfallRig(root, 'gracie');
  return {
    artRig,
    body: cutout.body,
    movingParts: Object.freeze([]),
    footfalls: footfalls.markers,
    dispose(): void {
      cutout.dispose();
      footfalls.dispose();
    },
  };
}

export function createProceduralAnimalPresentation(
  heroId: HeroId,
  parent: pc.Entity,
  worldHalfWidth: number,
  worldHalfHeight: number,
): ProceduralAnimalPresentation {
  const profile = getHeroVisualProfile(heroId);
  const root = new pc.Entity(`${profile.displayName} — ${profile.species}`);
  parent.addChild(root);
  // The cutouts share the original companion footprint so their authored
  // detail remains readable at the same gameplay zoom as Greg.
  root.setLocalScale(
    PROCEDURAL_ANIMAL_ROOT_SCALE,
    PROCEDURAL_ANIMAL_ROOT_SCALE,
    PROCEDURAL_ANIMAL_ROOT_SCALE,
  );
  const materials = createMaterials();
  const graphicsDevice = pc.AppBase.getApplication()?.graphicsDevice;
  const visual = heroId === 'greg'
    ? createScout(root, graphicsDevice)
    : heroId === 'benny'
      ? createBenny(root, graphicsDevice)
      : createGracie(root, graphicsDevice);
  // Companion sockets use a larger local coordinate space than Greg's glTF,
  // so maintain their proportionate trait spread while leaving authoritative
  // state untouched.
  const monarchBroodMotion = createMonarchBroodAttachmentMotion({
    orbitRadiusMultiplier: 10,
    wingScaleMultiplier: 4,
  });
  const chimeraSeamMotion = createChimeraSeamAttachmentMotion();
  const sockets = createGregAttachmentSockets(
    root as unknown as AttachmentNode,
    createAttachmentFactory(materials.values, monarchBroodMotion, chimeraSeamMotion),
  );
  const projector = createGregTraitVisualProjector(sockets);
  const baseBodyScale = visual.body.getLocalScale().clone();
  const baseBodyPosition = visual.body.getLocalPosition().clone();
  const baseArtRigYawDegrees = visual.artRig.getLocalEulerAngles().y;
  const footfallDust = createFootfallDustPool(parent, heroId);
  let visible = false;
  let disposed = false;
  let lastActionTick = Number.NEGATIVE_INFINITY;
  let lastActionKind: ProceduralAnimalActionKind = 'none';
  let lastImpactTick = Number.NEGATIVE_INFINITY;
  let lastHeadingDegrees: number | null = null;
  let headingSampleTick = Number.NEGATIVE_INFINITY;
  let turnBankDegrees = 0;

  return {
    get ready() {
      return !disposed;
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      root.enabled = visible;
      setFootfallDustVisible(footfallDust, visible);
    },
    update(previous, current, alpha, traitVisualState, traitPresentationEvents = []) {
      if (disposed) return;
      projector.sync(traitVisualState);
      monarchBroodMotion.update(current.tick + alpha);
      chimeraSeamMotion.update(current.tick + alpha);
      if (!visible) return;
      for (const event of traitPresentationEvents) {
        const action = classifyProceduralAnimalAction(heroId, event);
        if (action === 'none') continue;
        const eventTick = Math.min(current.tick, Math.max(0, Math.floor(finite(event.tick, current.tick))));
        if (eventTick >= lastActionTick) {
          lastActionTick = eventTick;
          lastActionKind = action;
        }
      }
      if (current.playerHp < previous.playerHp) lastImpactTick = current.tick;
      if (current.tick < Math.max(lastActionTick, lastImpactTick)) {
        lastActionTick = Number.NEGATIVE_INFINITY;
        lastActionKind = 'none';
        lastImpactTick = Number.NEGATIVE_INFINITY;
      }
      const x = previous.playerX + (current.playerX - previous.playerX) * alpha;
      const y = previous.playerY + (current.playerY - previous.playerY) * alpha;
      root.enabled = current.playerAlive;
      root.setLocalPosition(x - worldHalfWidth, 0, worldHalfHeight - y);
      const heading = deriveProceduralAnimalHeadingDegrees(previous, current);
      if (heading !== null) root.setLocalEulerAngles(0, heading, 0);
      if (current.tick < headingSampleTick) {
        lastHeadingDegrees = null;
        headingSampleTick = Number.NEGATIVE_INFINITY;
        turnBankDegrees = 0;
      }
      if (current.tick !== headingSampleTick) {
        turnBankDegrees = heading === null || lastHeadingDegrees === null
          ? turnBankDegrees * 0.45
          : projectProceduralAnimalTurnBankDegrees(lastHeadingDegrees, heading, heroId);
        if (heading !== null) lastHeadingDegrees = heading;
        headingSampleTick = current.tick;
      }
      const locomotion = projectProceduralAnimalLocomotion(previous, current, alpha, heroId);
      const gait = projectProceduralAnimalGait(previous, current, alpha, heroId);
      const actionReaction = projectProceduralAnimalActionReaction(
        lastActionKind,
        lastActionTick,
        current.tick,
        alpha,
      );
      const impactKick = Math.max(0, 1 - (current.tick + clampedAlpha(alpha) - lastImpactTick) / 7);
      const impactScale = 1 + impactKick * 0.05;
      const landingScale = 1 + locomotion.landingKick;
      visual.body.setLocalPosition(
        baseBodyPosition.x + locomotion.sideSway,
        baseBodyPosition.y + locomotion.bodyLift + actionReaction.bodyLift + impactKick * 0.05,
        baseBodyPosition.z + locomotion.forwardSway + actionReaction.forwardKick,
      );
      visual.body.setLocalScale(
        baseBodyScale.x * locomotion.widthScale * (1 + actionReaction.widthScale) * impactScale * landingScale,
        baseBodyScale.y * (1 + actionReaction.heightScale + impactKick * 0.025) * landingScale,
        baseBodyScale.z * locomotion.lengthScale * (1 + actionReaction.lengthScale) * impactScale * landingScale,
      );
      visual.artRig.setLocalEulerAngles(0, baseArtRigYawDegrees + locomotion.yawWagDegrees, 0);
      visual.body.setLocalEulerAngles(
        actionReaction.pitchDegrees - impactKick * 2.5,
        0,
        locomotion.leanDegrees + turnBankDegrees + actionReaction.rollDegrees,
      );
      updateFootfalls(visual.footfalls, gait, actionReaction);
      if (current.playerAlive) {
        updateFootfallDust(
          footfallDust,
          visual.footfalls,
          previous,
          current,
          alpha,
          heroId,
          worldHalfWidth,
          worldHalfHeight,
          heading ?? lastHeadingDegrees ?? 0,
        );
      } else {
        clearFootfallDust(footfallDust);
      }
      for (let index = 0; index < visual.movingParts.length; index++) {
        const part = visual.movingParts[index]!;
        part.setLocalEulerAngles(
          0,
          0,
          locomotion.moving
            ? locomotion.leanDegrees + Math.sin(current.tick * 0.42 + index) * 4 + actionReaction.rollDegrees
            : actionReaction.rollDegrees,
        );
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      projector.clear();
      sockets.clear();
      monarchBroodMotion.clear();
      chimeraSeamMotion.clear();
      visual.dispose();
      disposeFootfallDust(footfallDust);
      root.destroy();
      materials.dispose();
    },
  };
}
