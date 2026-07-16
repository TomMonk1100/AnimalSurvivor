/**
 * Renderer-only Wild Splice seam projection.
 *
 * A Chimera seam is intentionally derived from immutable attachment metadata
 * and the rendered fixed-tick value. It never writes back to simulation,
 * replay, combat, or the trait runtime. Keeping the palette and motion here
 * lets every hero presentation share one finite seam recipe without falling
 * back to a generic Mythic colour.
 */

import {
  ATTACK_VFX_FAMILY,
  paletteLaneForChimeraSource,
  PROCEDURAL_UNDERPAINT_COLORS,
  type AttackVfxFamily,
  type AttackVfxRgb,
} from '../render/attack-vfx-palette';

export interface ChimeraSeamAttachmentPresentation {
  /** The authoritative evolution/source id being projected, never authored here. */
  readonly sourceId: string;
  /** The two immutable parent trait ids retained by the fusion result. */
  readonly parents: readonly [string, string];
  /** Optional because legacy snapshots remain readable; unknown values use Steady motion. */
  readonly temperamentId: string | null;
}

export interface ChimeraSeamPalette {
  readonly primaryLane: AttackVfxFamily;
  readonly accentLane: AttackVfxFamily;
  readonly primary: AttackVfxRgb;
  readonly accent: AttackVfxRgb;
  readonly knot: AttackVfxRgb;
  /** Gilded gets muted seam flecks; full critical gold remains reserved for impacts. */
  readonly fleck: AttackVfxRgb | null;
}

const FALLBACK_LANES = Object.freeze({
  primary: ATTACK_VFX_FAMILY.physical,
  accent: ATTACK_VFX_FAMILY.physical,
});

const MUTED_GILDED_FLECK: AttackVfxRgb = Object.freeze({ r: 0.74, g: 0.57, b: 0.2 });

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function tint(color: AttackVfxRgb, multiplier: number): AttackVfxRgb {
  return Object.freeze({
    r: clampUnit(color.r * multiplier),
    g: clampUnit(color.g * multiplier),
    b: clampUnit(color.b * multiplier),
  });
}

function mix(first: AttackVfxRgb, second: AttackVfxRgb, weight: number): AttackVfxRgb {
  const normalized = clampUnit(weight);
  return Object.freeze({
    r: first.r + (second.r - first.r) * normalized,
    g: first.g + (second.g - first.g) * normalized,
    b: first.b + (second.b - first.b) * normalized,
  });
}

function paletteLanesFor(
  presentation: ChimeraSeamAttachmentPresentation,
): { readonly primary: AttackVfxFamily; readonly accent: AttackVfxFamily } {
  const direct = paletteLaneForChimeraSource(presentation.sourceId);
  if (direct !== null) return direct;

  // Synthesized ids are normally canonical already. This defensive fallback
  // still derives a family pair from the published parents if an older client
  // supplied a compact source id.
  const parentDerived = paletteLaneForChimeraSource(
    `chimera:${presentation.parents[0]}+${presentation.parents[1]}`,
  );
  return parentDerived ?? FALLBACK_LANES;
}

/**
 * Resolves the actual two parent palette lanes for the one reusable seam mesh.
 * Same-family outcomes deliberately use two luminance-separated shades so the
 * braid remains legible without inventing a new colour lane.
 */
export function paletteForChimeraSeam(
  presentation: ChimeraSeamAttachmentPresentation,
): ChimeraSeamPalette {
  const lanes = paletteLanesFor(presentation);
  const primaryBase = PROCEDURAL_UNDERPAINT_COLORS[lanes.primary];
  const accentBase = PROCEDURAL_UNDERPAINT_COLORS[lanes.accent];
  const sameFamily = lanes.primary === lanes.accent;
  const primary = sameFamily ? tint(primaryBase, 1.12) : primaryBase;
  const accent = sameFamily ? tint(accentBase, 0.72) : accentBase;
  const knot = mix(primary, accent, 0.5);
  const fleck = presentation.temperamentId === 'gilded'
    ? mix(knot, MUTED_GILDED_FLECK, 0.58)
    : null;
  return Object.freeze({
    primaryLane: lanes.primary,
    accentLane: lanes.accent,
    primary,
    accent,
    knot,
    fleck,
  });
}

export interface ChimeraSeamMotionVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Minimal PlayCanvas-shaped surface required by the renderer-only motion. */
export interface ChimeraSeamMotionNode {
  readonly name: string;
  readonly children: readonly ChimeraSeamMotionNode[];
  getLocalPosition(): ChimeraSeamMotionVector;
  getLocalEulerAngles(): ChimeraSeamMotionVector;
  getLocalScale(): ChimeraSeamMotionVector;
  setLocalPosition(x: number, y: number, z: number): void;
  setLocalEulerAngles(x: number, y: number, z: number): void;
  setLocalScale(x: number, y: number, z: number): void;
}

export interface ChimeraSeamMotionPose {
  readonly temperamentId: string;
  readonly rootHover: number;
  readonly rootYawDegrees: number;
  readonly rootScale: number;
  readonly primaryOffsetX: number;
  readonly primaryOffsetY: number;
  readonly accentOffsetX: number;
  readonly accentOffsetY: number;
  readonly primaryTwistDegrees: number;
  readonly accentTwistDegrees: number;
  readonly primaryLength: number;
  readonly accentLength: number;
  readonly knotPulse: number;
  readonly echoScale: number;
  readonly echoOffsetY: number;
  readonly fleckScale: number;
  readonly fleckLift: number;
}

export interface ChimeraSeamAttachmentMotion {
  /** Returns false for an attachment that is not the finite reusable seam recipe. */
  track(root: ChimeraSeamMotionNode, presentation: ChimeraSeamAttachmentPresentation): boolean;
  untrack(root: ChimeraSeamMotionNode): void;
  update(renderTick: number): void;
  clear(): void;
  readonly trackedCount: number;
}

interface Transform {
  readonly position: ChimeraSeamMotionVector;
  readonly euler: ChimeraSeamMotionVector;
  readonly scale: ChimeraSeamMotionVector;
}

interface TrackedPart {
  readonly node: ChimeraSeamMotionNode;
  readonly transform: Transform;
}

interface TrackedSeam {
  readonly root: ChimeraSeamMotionNode;
  readonly presentation: ChimeraSeamAttachmentPresentation;
  readonly rootTransform: Transform;
  readonly primary: TrackedPart | null;
  readonly accent: TrackedPart | null;
  readonly knot: TrackedPart | null;
  readonly echo: TrackedPart | null;
  readonly flecks: readonly TrackedPart[];
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function copyVector(value: ChimeraSeamMotionVector): ChimeraSeamMotionVector {
  return { x: value.x, y: value.y, z: value.z };
}

function readTransform(node: ChimeraSeamMotionNode): Transform {
  return {
    position: copyVector(node.getLocalPosition()),
    euler: copyVector(node.getLocalEulerAngles()),
    scale: copyVector(node.getLocalScale()),
  };
}

function knownTemperament(value: string | null): string {
  switch (value) {
    case 'steady':
    case 'twitchy':
    case 'hearty':
    case 'long-arm':
    case 'compact':
    case 'echo':
    case 'magnet-hearted':
    case 'skittish':
    case 'gilded':
    case 'doubled-down':
    case 'bulwark':
    case 'seismic':
    case 'prismatic':
    case 'colossus':
    case 'apex-whisper':
    case 'show-off':
      return value;
    default:
      return 'steady';
  }
}

/**
 * Creates a stable shape/motion tell per temperament. The result is pure and
 * tick-derived, so a paused/replayed frame never acquires a second visual
 * clock or changes the authoritative run.
 */
export function projectChimeraSeamMotion(
  presentation: ChimeraSeamAttachmentPresentation,
  renderTick: number,
): ChimeraSeamMotionPose {
  const tick = finite(renderTick);
  const temperamentId = knownTemperament(presentation.temperamentId);
  const quick = Math.sin(tick * 0.31);
  const slow = Math.sin(tick * 0.11);
  let rootHover = Math.sin(tick * 0.09) * 0.025;
  let rootYawDegrees = Math.sin(tick * 0.12) * 7;
  let rootScale = 1 + Math.sin(tick * 0.16) * 0.045;
  let primaryOffsetX = Math.sin(tick * 0.23) * 0.07;
  let primaryOffsetY = Math.cos(tick * 0.19) * 0.025;
  let accentOffsetX = -primaryOffsetX;
  let accentOffsetY = -primaryOffsetY;
  let primaryTwistDegrees = Math.sin(tick * 0.28) * 12;
  let accentTwistDegrees = -primaryTwistDegrees;
  let primaryLength = 1;
  let accentLength = 1;
  let knotPulse = 1 + Math.sin(tick * 0.26) * 0.12;
  let echoScale = 0.001;
  let echoOffsetY = 0;
  let fleckScale = 0.001;
  let fleckLift = 0;

  switch (temperamentId) {
    case 'twitchy': {
      const jitterX = Math.sin(tick * 1.73) * 0.075 + Math.sin(tick * 2.47) * 0.035;
      const jitterY = Math.sin(tick * 2.19) * 0.045;
      rootHover += jitterY * 0.45;
      rootYawDegrees += Math.sin(tick * 2.91) * 14;
      primaryOffsetX += jitterX;
      accentOffsetX -= jitterX;
      primaryOffsetY += jitterY;
      accentOffsetY -= jitterY;
      primaryTwistDegrees += Math.sin(tick * 2.13) * 27;
      accentTwistDegrees = -primaryTwistDegrees;
      knotPulse = 1 + quick * 0.22;
      break;
    }
    case 'hearty':
      rootScale = 1.12 + slow * 0.085;
      primaryLength = 1.24;
      accentLength = 1.18;
      knotPulse = 1.16 + Math.sin(tick * 0.13) * 0.18;
      break;
    case 'long-arm':
      primaryOffsetX *= 2.5;
      accentOffsetX *= 2.5;
      primaryLength = 1.42;
      accentLength = 1.36;
      rootScale = 1.05;
      break;
    case 'compact':
      rootScale = 0.84 + slow * 0.03;
      primaryOffsetX *= 0.45;
      accentOffsetX *= 0.45;
      primaryLength = 0.72;
      accentLength = 0.72;
      knotPulse = 1.26 + quick * 0.13;
      break;
    case 'echo':
      echoScale = 0.88 + Math.sin(tick * 0.2) * 0.13;
      echoOffsetY = Math.sin(tick * 0.17 + 1.2) * 0.09;
      break;
    case 'magnet-hearted':
      primaryOffsetX = Math.sin(tick * 0.38) * 0.035;
      accentOffsetX = -primaryOffsetX;
      primaryOffsetY = Math.cos(tick * 0.38) * 0.065;
      accentOffsetY = -primaryOffsetY;
      rootScale = 1 + Math.sin(tick * 0.19) * 0.085;
      knotPulse = 1.22 + Math.sin(tick * 0.38) * 0.2;
      break;
    case 'skittish':
      rootHover += Math.sin(tick * 1.47) * 0.04;
      rootYawDegrees += Math.sin(tick * 1.91) * 18;
      primaryOffsetX += Math.sin(tick * 1.71) * 0.1;
      accentOffsetX -= Math.sin(tick * 1.71) * 0.1;
      primaryTwistDegrees += Math.sin(tick * 1.11) * 21;
      accentTwistDegrees = -primaryTwistDegrees;
      break;
    case 'gilded':
      fleckScale = 0.74 + Math.max(0, quick) * 0.58;
      fleckLift = Math.sin(tick * 0.22) * 0.13;
      knotPulse = 1.08 + Math.sin(tick * 0.24) * 0.19;
      break;
    case 'doubled-down':
      echoScale = 0.78;
      echoOffsetY = Math.sin(tick * 0.24) * 0.055;
      primaryOffsetX *= 1.7;
      accentOffsetX *= 1.7;
      break;
    case 'bulwark': {
      const beat = Math.max(0, Math.sin(tick * 0.18));
      rootScale = 1 + beat * 0.12;
      knotPulse = 1.14 + beat * 0.52;
      primaryLength = 1.12;
      accentLength = 1.12;
      break;
    }
    case 'seismic':
      rootHover = -0.028 + Math.sin(tick * 0.13) * 0.012;
      rootYawDegrees = Math.sin(tick * 0.16) * 3.5;
      primaryLength = 1.26;
      accentLength = 1.26;
      knotPulse = 1.25 + Math.max(0, Math.sin(tick * 0.2)) * 0.3;
      break;
    case 'prismatic':
      // The braid rotates its two existing parent colours; it never cycles to
      // an unowned hue just to signal rarity.
      rootYawDegrees = tick * 1.8;
      primaryOffsetX = Math.cos(tick * 0.32) * 0.16;
      primaryOffsetY = Math.sin(tick * 0.32) * 0.09;
      accentOffsetX = -primaryOffsetX;
      accentOffsetY = -primaryOffsetY;
      primaryTwistDegrees = tick * 3.8;
      accentTwistDegrees = -primaryTwistDegrees;
      break;
    case 'colossus':
      rootScale = 1.38 + Math.sin(tick * 0.07) * 0.08;
      rootHover = Math.sin(tick * 0.07) * 0.045;
      primaryLength = 1.5;
      accentLength = 1.42;
      knotPulse = 1.26 + Math.sin(tick * 0.11) * 0.14;
      break;
    case 'apex-whisper': {
      const helix = tick * 0.56;
      rootScale = 1.16 + Math.sin(tick * 0.16) * 0.06;
      rootYawDegrees = tick * 1.2;
      primaryOffsetX = Math.cos(helix) * 0.23;
      primaryOffsetY = Math.sin(helix) * 0.12;
      accentOffsetX = -primaryOffsetX;
      accentOffsetY = -primaryOffsetY;
      primaryTwistDegrees = helix * 180 / Math.PI;
      accentTwistDegrees = -primaryTwistDegrees;
      primaryLength = 1.3;
      accentLength = 1.3;
      echoScale = 0.62;
      echoOffsetY = Math.cos(helix) * 0.08;
      break;
    }
    case 'show-off':
      rootScale = 1.03 + Math.max(0, Math.sin(tick * 0.29)) * 0.28;
      rootYawDegrees += Math.sin(tick * 0.29) * 24;
      knotPulse = 1.18 + Math.max(0, Math.sin(tick * 0.29)) * 0.38;
      primaryLength = 1.18;
      accentLength = 1.18;
      break;
    case 'steady':
      break;
    default:
      break;
  }

  return Object.freeze({
    temperamentId,
    rootHover,
    rootYawDegrees,
    rootScale,
    primaryOffsetX,
    primaryOffsetY,
    accentOffsetX,
    accentOffsetY,
    primaryTwistDegrees,
    accentTwistDegrees,
    primaryLength,
    accentLength,
    knotPulse,
    echoScale,
    echoOffsetY,
    fleckScale,
    fleckLift,
  });
}

function findPart(root: ChimeraSeamMotionNode, name: string): TrackedPart | null {
  const node = root.children.find((candidate) => candidate.name === name);
  return node === undefined ? null : { node, transform: readTransform(node) };
}

function applyPart(
  part: TrackedPart | null,
  offset: ChimeraSeamMotionVector,
  eulerOffset: ChimeraSeamMotionVector,
  scaleMultiplier: ChimeraSeamMotionVector,
): void {
  if (part === null) return;
  const base = part.transform;
  part.node.setLocalPosition(
    base.position.x + offset.x,
    base.position.y + offset.y,
    base.position.z + offset.z,
  );
  part.node.setLocalEulerAngles(
    base.euler.x + eulerOffset.x,
    base.euler.y + eulerOffset.y,
    base.euler.z + eulerOffset.z,
  );
  part.node.setLocalScale(
    base.scale.x * scaleMultiplier.x,
    base.scale.y * scaleMultiplier.y,
    base.scale.z * scaleMultiplier.z,
  );
}

/** Tracks finite mesh parts only; renderer state stays bounded by active fusions. */
export function createChimeraSeamAttachmentMotion(): ChimeraSeamAttachmentMotion {
  const tracked = new Map<ChimeraSeamMotionNode, TrackedSeam>();

  function apply(seam: TrackedSeam, renderTick: number): void {
    const pose = projectChimeraSeamMotion(seam.presentation, renderTick);
    const root = seam.rootTransform;
    seam.root.setLocalPosition(root.position.x, root.position.y + pose.rootHover, root.position.z);
    seam.root.setLocalEulerAngles(root.euler.x, root.euler.y + pose.rootYawDegrees, root.euler.z);
    seam.root.setLocalScale(
      root.scale.x * pose.rootScale,
      root.scale.y * pose.rootScale,
      root.scale.z * pose.rootScale,
    );

    applyPart(seam.primary, {
      x: pose.primaryOffsetX,
      y: pose.primaryOffsetY,
      z: 0,
    }, {
      x: 0,
      y: 0,
      z: pose.primaryTwistDegrees,
    }, { x: 1, y: pose.primaryLength, z: 1 });
    applyPart(seam.accent, {
      x: pose.accentOffsetX,
      y: pose.accentOffsetY,
      z: 0,
    }, {
      x: 0,
      y: 0,
      z: pose.accentTwistDegrees,
    }, { x: 1, y: pose.accentLength, z: 1 });
    applyPart(seam.knot, { x: 0, y: 0, z: 0 }, { x: 0, y: pose.rootYawDegrees * 0.18, z: 0 }, {
      x: pose.knotPulse,
      y: pose.knotPulse,
      z: pose.knotPulse,
    });
    applyPart(seam.echo, { x: 0, y: pose.echoOffsetY, z: 0 }, {
      x: 0,
      y: 0,
      z: pose.primaryTwistDegrees * 0.55,
    }, {
      x: pose.echoScale,
      y: pose.echoScale,
      z: pose.echoScale,
    });
    for (let index = 0; index < seam.flecks.length; index++) {
      const sign = index % 2 === 0 ? -1 : 1;
      applyPart(seam.flecks[index]!, {
        x: sign * (0.04 + pose.fleckScale * 0.06),
        y: pose.fleckLift + Math.sin(finite(renderTick) * 0.37 + index) * 0.05,
        z: 0,
      }, { x: 0, y: pose.rootYawDegrees * sign, z: 0 }, {
        x: pose.fleckScale,
        y: pose.fleckScale,
        z: pose.fleckScale,
      });
    }
  }

  return {
    track(root, presentation) {
      if (root.name !== 'chimera-seam:mythic') return false;
      tracked.set(root, {
        root,
        presentation,
        rootTransform: readTransform(root),
        primary: findPart(root, 'braid-primary'),
        accent: findPart(root, 'braid-accent'),
        knot: findPart(root, 'splice-knot'),
        echo: findPart(root, 'braid-echo'),
        flecks: root.children
          .filter((candidate) => candidate.name.startsWith('gilded-fleck-'))
          .map((node) => ({ node, transform: readTransform(node) })),
      });
      return true;
    },
    untrack(root) {
      tracked.delete(root);
    },
    update(renderTick) {
      for (const seam of tracked.values()) apply(seam, renderTick);
    },
    clear() {
      tracked.clear();
    },
    get trackedCount() {
      return tracked.size;
    },
  };
}
