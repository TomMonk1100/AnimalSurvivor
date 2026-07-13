import { describe, expect, it } from 'vitest';
import {
  createMonarchBroodAttachmentMotion,
  isMonarchBroodVisualKey,
  projectMonarchBroodMotion,
  type MonarchBroodMotionNode,
} from '../src/hero/monarch-brood-presentation-motion';

interface Vector {
  x: number;
  y: number;
  z: number;
}

class FakeNode implements MonarchBroodMotionNode {
  readonly children: readonly FakeNode[];
  private position: Vector;
  private euler: Vector;
  private scale: Vector;

  constructor(
    readonly name: string,
    children: readonly FakeNode[] = [],
    position: Vector = { x: 0, y: 0, z: 0 },
    euler: Vector = { x: 0, y: 0, z: 0 },
    scale: Vector = { x: 1, y: 1, z: 1 },
  ) {
    this.children = children;
    this.position = { ...position };
    this.euler = { ...euler };
    this.scale = { ...scale };
  }

  getLocalPosition(): Vector {
    return { ...this.position };
  }

  getLocalEulerAngles(): Vector {
    return { ...this.euler };
  }

  getLocalScale(): Vector {
    return { ...this.scale };
  }

  setLocalPosition(x: number, y: number, z: number): void {
    this.position = { x, y, z };
  }

  setLocalEulerAngles(x: number, y: number, z: number): void {
    this.euler = { x, y, z };
  }

  setLocalScale(x: number, y: number, z: number): void {
    this.scale = { x, y, z };
  }
}

function monarchRoot(adapted = false): {
  readonly root: FakeNode;
  readonly wings: readonly FakeNode[];
  readonly glow: FakeNode;
} {
  const names = adapted
    ? ['monarch-north', 'monarch-east', 'monarch-south', 'monarch-west']
    : ['monarch-left', 'monarch-right'];
  const positions = adapted
    ? [
      { x: 0, y: 0.42, z: -0.34 },
      { x: 0.42, y: 0.34, z: 0 },
      { x: 0, y: 0.42, z: 0.34 },
      { x: -0.42, y: 0.34, z: 0 },
    ]
    : [
      { x: -0.34, y: 0.32, z: 0 },
      { x: 0.34, y: 0.32, z: 0 },
    ];
  const wings = names.map((name, index) => new FakeNode(
    name,
    [],
    positions[index]!,
    { x: 0, y: 0, z: 0 },
    { x: adapted ? 0.18 : 0.16, y: adapted ? 0.12 : 0.1, z: adapted ? 0.28 : 0.24 },
  ));
  const glow = new FakeNode(
    'monarch-glow',
    [],
    { x: 0, y: adapted ? 0.38 : 0.36, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: adapted ? 0.1 : 0.08, y: adapted ? 0.1 : 0.08, z: adapted ? 0.1 : 0.08 },
  );
  return {
    root: new FakeNode('monarch-brood', [...wings, glow], { x: 0, y: 0.2, z: 0 }, { x: 0, y: 10, z: 0 }),
    wings,
    glow,
  };
}

describe('Monarch Brood presentation motion', () => {
  it('projects deterministic, stage-specific companion orbit motion from render ticks', () => {
    expect(isMonarchBroodVisualKey('monarch-brood:bud')).toBe(true);
    expect(isMonarchBroodVisualKey('monarch-brood:adapted')).toBe(true);
    expect(isMonarchBroodVisualKey('royal-stinkcloud:mythic')).toBe(false);

    expect(projectMonarchBroodMotion('monarch-brood:bud', 45).orbitYawDegrees).toBe(90);
    expect(projectMonarchBroodMotion('monarch-brood:adapted', 45).orbitYawDegrees).toBe(108);
    expect(projectMonarchBroodMotion('monarch-brood:bud', 45))
      .toEqual(projectMonarchBroodMotion('monarch-brood:bud', 45));
    expect(projectMonarchBroodMotion('monarch-brood:bud', Number.NaN))
      .toEqual({ orbitYawDegrees: 0, rootHover: 0 });
  });

  it('orbits, flaps, and pulses the mounted Bud attachment without retaining a gameplay clock', () => {
    const { root, wings, glow } = monarchRoot();
    const [left, right] = wings;
    const motion = createMonarchBroodAttachmentMotion({
      orbitRadiusMultiplier: 2,
      wingScaleMultiplier: 3,
    });

    expect(motion.track(root, 'bat-ears:adapted')).toBe(false);
    expect(motion.track(root, 'monarch-brood:bud')).toBe(true);
    expect(motion.trackedCount).toBe(1);
    motion.update(45);

    expect(root.getLocalEulerAngles().y).toBeCloseTo(100);
    expect(left!.getLocalPosition().x).toBeCloseTo(-0.68);
    expect(right!.getLocalPosition().x).toBeCloseTo(0.68);
    expect(left!.getLocalEulerAngles().x).not.toBe(0);
    expect(left!.getLocalScale().x).not.toBeCloseTo(0.16);
    expect(glow.getLocalScale().x).not.toBeCloseTo(0.08);

    const stoppedPosition = left!.getLocalPosition();
    motion.untrack(root);
    motion.update(46);
    expect(motion.trackedCount).toBe(0);
    expect(left!.getLocalPosition()).toEqual(stoppedPosition);
  });

  it('animates all four Adapted companions with the wider authored ring', () => {
    const { root, wings } = monarchRoot(true);
    const motion = createMonarchBroodAttachmentMotion({ orbitRadiusMultiplier: 1.5 });

    motion.track(root, 'monarch-brood:adapted');
    motion.update(20);

    expect(root.getLocalEulerAngles().y).toBeCloseTo(58);
    expect(wings).toHaveLength(4);
    expect(wings[0]!.getLocalPosition().z).toBeCloseTo(-0.51);
    expect(wings[1]!.getLocalPosition().x).toBeCloseTo(0.63);
    expect(wings.every((wing) => wing.getLocalEulerAngles().x !== 0)).toBe(true);
  });
});
