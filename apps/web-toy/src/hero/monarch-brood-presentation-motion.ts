/**
 * Renderer-only Monarch Brood motion.
 *
 * The simulation owns the companion attack and only publishes its immutable
 * attachment view. This module deliberately derives all movement from the
 * rendered fixed-tick value, so it cannot feed visual timing back into combat
 * or replay state.
 */

export type MonarchBroodVisualKey = 'monarch-brood:bud' | 'monarch-brood:adapted';

export interface MonarchBroodMotionVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The small PlayCanvas surface this renderer-only helper needs. */
export interface MonarchBroodMotionNode {
  readonly name: string;
  readonly children: readonly MonarchBroodMotionNode[];
  getLocalPosition(): MonarchBroodMotionVector;
  getLocalEulerAngles(): MonarchBroodMotionVector;
  getLocalScale(): MonarchBroodMotionVector;
  setLocalPosition(x: number, y: number, z: number): void;
  setLocalEulerAngles(x: number, y: number, z: number): void;
  setLocalScale(x: number, y: number, z: number): void;
}

export interface MonarchBroodMotionOptions {
  /** Widens the authored companion ring without changing its source recipe. */
  readonly orbitRadiusMultiplier?: number;
  /** Lets a smaller hero silhouette keep the companions legible. */
  readonly wingScaleMultiplier?: number;
}

export interface MonarchBroodMotionPose {
  readonly orbitYawDegrees: number;
  readonly rootHover: number;
}

export interface MonarchBroodAttachmentMotion {
  /** Returns false for non-Monarch attachment keys. */
  track(root: MonarchBroodMotionNode, visualKey: string): boolean;
  untrack(root: MonarchBroodMotionNode): void;
  update(renderTick: number): void;
  clear(): void;
  readonly trackedCount: number;
}

interface Transform {
  readonly position: MonarchBroodMotionVector;
  readonly euler: MonarchBroodMotionVector;
  readonly scale: MonarchBroodMotionVector;
}

interface TrackedWing {
  readonly node: MonarchBroodMotionNode;
  readonly transform: Transform;
}

interface TrackedAttachment {
  readonly key: MonarchBroodVisualKey;
  readonly root: MonarchBroodMotionNode;
  readonly rootTransform: Transform;
  readonly wings: readonly TrackedWing[];
  readonly glow: TrackedWing | null;
}

const BUD_ORBIT_DEGREES_PER_TICK = 2;
const ADAPTED_ORBIT_DEGREES_PER_TICK = 2.4;
const WING_FLAP_RADIANS_PER_TICK = 0.44;

function copyVector(value: MonarchBroodMotionVector): MonarchBroodMotionVector {
  return { x: value.x, y: value.y, z: value.z };
}

function readTransform(node: MonarchBroodMotionNode): Transform {
  return {
    position: copyVector(node.getLocalPosition()),
    euler: copyVector(node.getLocalEulerAngles()),
    scale: copyVector(node.getLocalScale()),
  };
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function safeRenderTick(renderTick: number): number {
  return Number.isFinite(renderTick) ? renderTick : 0;
}

function isWing(node: MonarchBroodMotionNode): boolean {
  return node.name.startsWith('monarch-') && node.name !== 'monarch-glow';
}

export function isMonarchBroodVisualKey(value: string): value is MonarchBroodVisualKey {
  return value === 'monarch-brood:bud' || value === 'monarch-brood:adapted';
}

/**
 * Projects the stage-specific companion orbit directly from tick time. Bud
 * mirrors the two-companion cadence and Adapted moves at its faster cadence.
 */
export function projectMonarchBroodMotion(
  visualKey: MonarchBroodVisualKey,
  renderTick: number,
): MonarchBroodMotionPose {
  const tick = safeRenderTick(renderTick);
  const adapted = visualKey === 'monarch-brood:adapted';
  const orbitDegreesPerTick = adapted ? ADAPTED_ORBIT_DEGREES_PER_TICK : BUD_ORBIT_DEGREES_PER_TICK;
  return Object.freeze({
    orbitYawDegrees: normalizeDegrees(tick * orbitDegreesPerTick),
    rootHover: Math.sin(tick * 0.13) * (adapted ? 0.065 : 0.05),
  });
}

/**
 * Tracks only the two Monarch attachment recipes. It changes mounted render
 * entities in place and keeps no simulation-owned state or gameplay clocks.
 */
export function createMonarchBroodAttachmentMotion(
  options: MonarchBroodMotionOptions = {},
): MonarchBroodAttachmentMotion {
  const orbitRadiusMultiplier = positiveFinite(options.orbitRadiusMultiplier, 1.65);
  const wingScaleMultiplier = positiveFinite(options.wingScaleMultiplier, 1.15);
  const tracked = new Map<MonarchBroodMotionNode, TrackedAttachment>();

  function applyMotion(attachment: TrackedAttachment, renderTick: number): void {
    const tick = safeRenderTick(renderTick);
    const pose = projectMonarchBroodMotion(attachment.key, tick);
    const root = attachment.rootTransform;
    attachment.root.setLocalPosition(
      root.position.x,
      root.position.y + pose.rootHover,
      root.position.z,
    );
    attachment.root.setLocalEulerAngles(
      root.euler.x,
      root.euler.y + pose.orbitYawDegrees,
      root.euler.z,
    );

    for (let index = 0; index < attachment.wings.length; index++) {
      const wing = attachment.wings[index]!;
      const phase = tick * WING_FLAP_RADIANS_PER_TICK + index * 1.7;
      const flap = Math.sin(phase);
      const hover = Math.sin(tick * 0.23 + index * 1.31) * 0.06;
      const base = wing.transform;
      wing.node.setLocalPosition(
        base.position.x * orbitRadiusMultiplier,
        base.position.y + hover,
        base.position.z * orbitRadiusMultiplier,
      );
      wing.node.setLocalEulerAngles(
        base.euler.x + flap * 34,
        base.euler.y,
        base.euler.z + flap * 12,
      );
      wing.node.setLocalScale(
        base.scale.x * wingScaleMultiplier * (1 + flap * 0.08),
        base.scale.y * wingScaleMultiplier * (0.55 + (flap + 1) * 0.325),
        base.scale.z * wingScaleMultiplier * (1 + flap * 0.12),
      );
    }

    if (attachment.glow !== null) {
      const base = attachment.glow.transform;
      const glowPulse = 1 + Math.sin(tick * 0.29) * 0.22;
      attachment.glow.node.setLocalPosition(
        base.position.x,
        base.position.y + 0.04 + Math.sin(tick * 0.22) * 0.035,
        base.position.z,
      );
      attachment.glow.node.setLocalEulerAngles(base.euler.x, base.euler.y, base.euler.z);
      attachment.glow.node.setLocalScale(
        base.scale.x * glowPulse,
        base.scale.y * glowPulse,
        base.scale.z * glowPulse,
      );
    }
  }

  return {
    track(root, visualKey) {
      if (!isMonarchBroodVisualKey(visualKey)) return false;
      const wings = root.children
        .filter(isWing)
        .map((node) => ({ node, transform: readTransform(node) }));
      const glowNode = root.children.find((node) => node.name === 'monarch-glow');
      tracked.set(root, {
        key: visualKey,
        root,
        rootTransform: readTransform(root),
        wings,
        glow: glowNode === undefined ? null : { node: glowNode, transform: readTransform(glowNode) },
      });
      return true;
    },
    untrack(root) {
      tracked.delete(root);
    },
    update(renderTick) {
      for (const attachment of tracked.values()) applyMotion(attachment, renderTick);
    },
    clear() {
      tracked.clear();
    },
    get trackedCount() {
      return tracked.size;
    },
  };
}
