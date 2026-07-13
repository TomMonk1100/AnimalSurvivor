import { describe, expect, it } from 'vitest';
import {
  classifyProceduralAnimalAction,
  deriveProceduralAnimalHeadingDegrees,
  projectProceduralAnimalActionReaction,
  projectProceduralAnimalGait,
  projectProceduralAnimalLocomotion,
} from '../src/hero/procedural-animal-presentation';

function snapshot(playerX: number, playerY: number): { playerX: number; playerY: number } {
  return { playerX, playerY };
}

describe('procedural animal scene headings', () => {
  it('maps simulation up/down into the correct XZ-facing directions', () => {
    const origin = snapshot(100, 100);
    expect(deriveProceduralAnimalHeadingDegrees(origin, snapshot(100, 101))).toBe(180);
    expect(deriveProceduralAnimalHeadingDegrees(origin, snapshot(100, 99))).toBe(0);
  });

  it('maps horizontal movement and preserves the prior heading while stationary', () => {
    const origin = snapshot(100, 100);
    expect(deriveProceduralAnimalHeadingDegrees(origin, snapshot(101, 100))).toBe(90);
    expect(deriveProceduralAnimalHeadingDegrees(origin, snapshot(99, 100))).toBe(-90);
    expect(deriveProceduralAnimalHeadingDegrees(origin, origin)).toBeNull();
  });

  it('projects a deterministic stride for Benny and Gracie cutouts without changing simulation coordinates', () => {
    const previous = { tick: 80, playerX: 40, playerY: 60, playerAlive: true };
    const current = { tick: 81, playerX: 42, playerY: 61, playerAlive: true };
    const first = projectProceduralAnimalLocomotion(previous, current, 0.5);
    const second = projectProceduralAnimalLocomotion(previous, current, 0.5);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ moving: true, movementMagnitude: Math.sqrt(5) });
    expect(first.bodyLift).toBeGreaterThan(0.08);
    expect(first.widthScale).not.toBe(1);
    expect(first.lengthScale).not.toBe(1);
    expect(previous).toEqual({ tick: 80, playerX: 40, playerY: 60, playerAlive: true });
    expect(current).toEqual({ tick: 81, playerX: 42, playerY: 61, playerAlive: true });
  });

  it('keeps an idle breathing pose when the companion is stationary or dead', () => {
    const idle = projectProceduralAnimalLocomotion(
      { playerX: 40, playerY: 60 },
      { tick: 81, playerX: 40, playerY: 60, playerAlive: true },
      0.25,
    );
    const dead = projectProceduralAnimalLocomotion(
      { playerX: 40, playerY: 60 },
      { tick: 82, playerX: 42, playerY: 60, playerAlive: false },
      0.25,
    );

    expect(idle.moving).toBe(false);
    expect(idle.bodyLift).toBeGreaterThan(0);
    expect(dead.moving).toBe(false);
    expect(dead.widthScale).toBe(1);
    expect(dead.lengthScale).toBe(1);
  });

  it('keeps a deterministic diagonal hoof/paw cadence while the cutout moves', () => {
    const previous = { playerX: 40, playerY: 60 };
    const current = { tick: 83, playerX: 42, playerY: 61, playerAlive: true };
    const first = projectProceduralAnimalGait(previous, current, 0.5);
    const second = projectProceduralAnimalGait(previous, current, 0.5);

    expect(first).toEqual(second);
    expect(first.moving).toBe(true);
    expect(first.frontLeftLift).toBe(first.rearRightLift);
    expect(first.frontRightLift).toBe(first.rearLeftLift);
    expect(Math.max(first.frontLeftLift, first.frontRightLift)).toBeGreaterThan(0);
    expect(projectProceduralAnimalGait(previous, { ...current, playerAlive: false }, 0.5))
      .toMatchObject({ moving: false, frontLeftLift: 0, frontRightLift: 0, rearLeftLift: 0, rearRightLift: 0 });
  });

  it('reacts only to the active companion signature sources and decays by fixed tick', () => {
    expect(classifyProceduralAnimalAction('benny', {
      sourceId: 'benny-trample', tag: 'benny-trample-wave',
    })).toBe('trample');
    expect(classifyProceduralAnimalAction('gracie', {
      sourceId: 'gracie-spit', tag: 'gracie-spit',
    })).toBe('spit');
    expect(classifyProceduralAnimalAction('benny', {
      sourceId: 'gracie-spit', tag: 'gracie-spit',
    })).toBe('none');

    const trample = projectProceduralAnimalActionReaction('trample', 100, 100, 0.5);
    expect(trample.forwardKick).toBeGreaterThan(0);
    expect(trample.footfallKick).toBeGreaterThan(0);
    expect(projectProceduralAnimalActionReaction('trample', 100, 100, 0.5)).toEqual(trample);
    expect(projectProceduralAnimalActionReaction('trample', 100, 113, 0)).toMatchObject({
      kind: 'none', strength: 0, forwardKick: 0,
    });
  });
});
