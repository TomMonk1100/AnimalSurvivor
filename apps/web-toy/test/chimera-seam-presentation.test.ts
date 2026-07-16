import { describe, expect, it } from 'vitest';
import {
  createChimeraSeamAttachmentMotion,
  paletteForChimeraSeam,
  projectChimeraSeamMotion,
  type ChimeraSeamAttachmentPresentation,
  type ChimeraSeamMotionNode,
} from '../src/hero/chimera-seam-presentation';
import { PROCEDURAL_UNDERPAINT_COLORS } from '../src/render/attack-vfx-palette';

interface Vector {
  x: number;
  y: number;
  z: number;
}

class FakeNode implements ChimeraSeamMotionNode {
  private position: Vector;
  private euler: Vector;
  private scale: Vector;

  constructor(
    readonly name: string,
    readonly children: readonly FakeNode[] = [],
    position: Vector = { x: 0, y: 0, z: 0 },
    euler: Vector = { x: 0, y: 0, z: 0 },
    scale: Vector = { x: 1, y: 1, z: 1 },
  ) {
    this.position = { ...position };
    this.euler = { ...euler };
    this.scale = { ...scale };
  }

  getLocalPosition(): Vector { return { ...this.position }; }
  getLocalEulerAngles(): Vector { return { ...this.euler }; }
  getLocalScale(): Vector { return { ...this.scale }; }
  setLocalPosition(x: number, y: number, z: number): void { this.position = { x, y, z }; }
  setLocalEulerAngles(x: number, y: number, z: number): void { this.euler = { x, y, z }; }
  setLocalScale(x: number, y: number, z: number): void { this.scale = { x, y, z }; }
}

function presentation(
  overrides: Partial<ChimeraSeamAttachmentPresentation> = {},
): ChimeraSeamAttachmentPresentation {
  return {
    sourceId: 'chimera:porcupine-quills+electric-eel-coil',
    parents: ['porcupine-quills', 'electric-eel-coil'],
    temperamentId: 'steady',
    ...overrides,
  };
}

function seamRoot(): {
  readonly root: FakeNode;
  readonly primary: FakeNode;
  readonly accent: FakeNode;
  readonly echo: FakeNode;
  readonly flecks: readonly FakeNode[];
} {
  const primary = new FakeNode('braid-primary', [], { x: -0.42, y: 0.18, z: 0 }, { x: 0, y: 0, z: 62 }, { x: 0.055, y: 0.56, z: 0.055 });
  const accent = new FakeNode('braid-accent', [], { x: 0.42, y: 0.18, z: 0 }, { x: 0, y: 0, z: -62 }, { x: 0.04, y: 0.5, z: 0.04 });
  const knot = new FakeNode('splice-knot', [], { x: 0, y: 0.26, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0.14, y: 0.14, z: 0.14 });
  const echo = new FakeNode('braid-echo', [], { x: 0, y: 0.25, z: -0.08 }, { x: 0, y: 0, z: 90 }, { x: 0.025, y: 0.42, z: 0.025 });
  const flecks = [
    new FakeNode('gilded-fleck-left', [], { x: -0.18, y: 0.38, z: 0.04 }, { x: 0, y: 0, z: 0 }, { x: 0.045, y: 0.045, z: 0.045 }),
    new FakeNode('gilded-fleck-right', [], { x: 0.18, y: 0.38, z: 0.04 }, { x: 0, y: 0, z: 0 }, { x: 0.045, y: 0.045, z: 0.045 }),
  ];
  return {
    root: new FakeNode('chimera-seam:mythic', [primary, accent, knot, echo, ...flecks], { x: 0, y: 0.1, z: 0 }),
    primary,
    accent,
    echo,
    flecks,
  };
}

describe('Chimera seam presentation', () => {
  it('uses the actual two parent palette lanes and separates same-family braids', () => {
    const mixed = paletteForChimeraSeam(presentation());
    expect(mixed.primaryLane).toBe('physical');
    expect(mixed.accentLane).toBe('storm');
    expect(mixed.primary).toEqual(PROCEDURAL_UNDERPAINT_COLORS.physical);
    expect(mixed.accent).toEqual(PROCEDURAL_UNDERPAINT_COLORS.storm);

    const sameFamily = paletteForChimeraSeam(presentation({
      sourceId: 'chimera:electric-eel-coil+owl-pinions',
      parents: ['electric-eel-coil', 'owl-pinions'],
    }));
    expect(sameFamily.primaryLane).toBe('storm');
    expect(sameFamily.accentLane).toBe('storm');
    expect(sameFamily.primary).not.toEqual(sameFamily.accent);
  });

  it('keeps Gilded flecks muted and leaves non-Gilded seams parent-duotone only', () => {
    const regular = paletteForChimeraSeam(presentation());
    const gilded = paletteForChimeraSeam(presentation({ temperamentId: 'gilded' }));
    expect(regular.fleck).toBeNull();
    expect(gilded.fleck).not.toBeNull();
    expect(gilded.fleck).not.toEqual({ r: 1, g: 0.78, b: 0.12 });
  });

  it('projects deterministic, temperament-specific motion instead of a generic pulse', () => {
    const steady = projectChimeraSeamMotion(presentation(), 48);
    const twitchy = projectChimeraSeamMotion(presentation({ temperamentId: 'twitchy' }), 48);
    const apex = projectChimeraSeamMotion(presentation({ temperamentId: 'apex-whisper' }), 48);
    const echo = projectChimeraSeamMotion(presentation({ temperamentId: 'echo' }), 48);

    expect(projectChimeraSeamMotion(presentation(), 48)).toEqual(steady);
    expect(twitchy.primaryTwistDegrees).not.toBe(steady.primaryTwistDegrees);
    expect(apex.primaryOffsetX).toBeCloseTo(-apex.accentOffsetX);
    expect(apex.primaryOffsetY).toBeCloseTo(-apex.accentOffsetY);
    expect(echo.echoScale).toBeGreaterThan(0.5);
    expect(projectChimeraSeamMotion(presentation(), Number.NaN).temperamentId).toBe('steady');
  });

  it('tracks only the reusable seam and exposes Echo, Gilded, and Apex shape tells', () => {
    const regular = seamRoot();
    const motion = createChimeraSeamAttachmentMotion();
    expect(motion.track(new FakeNode('not-a-seam'), presentation())).toBe(false);
    expect(motion.track(regular.root, presentation({ temperamentId: 'echo' }))).toBe(true);
    motion.update(24);
    expect(regular.echo.getLocalScale().x).toBeGreaterThan(0.01);
    expect(regular.flecks.every((fleck) => fleck.getLocalScale().x < 0.01)).toBe(true);

    const gilded = seamRoot();
    motion.track(gilded.root, presentation({ temperamentId: 'gilded' }));
    motion.update(24);
    expect(gilded.flecks.every((fleck) => fleck.getLocalScale().x > 0.01)).toBe(true);

    const apex = seamRoot();
    motion.track(apex.root, presentation({ temperamentId: 'apex-whisper' }));
    motion.update(24);
    expect(apex.primary.getLocalPosition().x).toBeCloseTo(-apex.accent.getLocalPosition().x);
    expect(apex.primary.getLocalEulerAngles().z).not.toBe(apex.accent.getLocalEulerAngles().z);
    expect(motion.trackedCount).toBe(3);

    motion.untrack(regular.root);
    expect(motion.trackedCount).toBe(2);
    motion.clear();
    expect(motion.trackedCount).toBe(0);
  });
});
