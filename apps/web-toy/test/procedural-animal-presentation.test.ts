import { describe, expect, it } from 'vitest';
import {
  classifyProceduralAnimalAction,
  deriveProceduralAnimalHeadingDegrees,
  FixedFootfallDustAllocator,
  PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY,
  PROCEDURAL_ANIMAL_FOOTFALL_DUST_LIFETIME_TICKS,
  PROCEDURAL_ANIMAL_GAIT_TUNING,
  PROCEDURAL_ANIMAL_IDLE_BREATH_SCALE,
  PROCEDURAL_ANIMAL_LANDING_KICK_SCALE,
  projectProceduralAnimalActionReaction,
  projectProceduralAnimalFootfallDustSpawnMask,
  projectProceduralAnimalGait,
  projectProceduralAnimalLocomotion,
  projectProceduralAnimalTurnBankDegrees,
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

  it('projects a deterministic camera-plane stride without changing simulation coordinates', () => {
    const previous = { tick: 80, playerX: 40, playerY: 60, playerAlive: true };
    const current = { tick: 81, playerX: 42, playerY: 61, playerAlive: true };
    const first = projectProceduralAnimalLocomotion(previous, current, 0.5);
    const second = projectProceduralAnimalLocomotion(previous, current, 0.5);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ moving: true, movementMagnitude: Math.sqrt(5) });
    expect(first.bodyLift).toBeGreaterThan(0.035);
    expect(first.widthScale).not.toBe(1);
    expect(first.lengthScale).not.toBe(1);
    expect(Math.abs(first.yawWagDegrees)).toBeGreaterThan(0);
    expect(first.landingKick).toBeGreaterThanOrEqual(0);
    expect(first.landingKick).toBeLessThanOrEqual(PROCEDURAL_ANIMAL_LANDING_KICK_SCALE);
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
    expect(Math.abs(idle.widthScale - 1)).toBeLessThanOrEqual(PROCEDURAL_ANIMAL_IDLE_BREATH_SCALE);
    expect(idle.yawWagDegrees).toBe(0);
    expect(dead.moving).toBe(false);
    expect(dead.widthScale).toBe(1);
    expect(dead.lengthScale).toBe(1);
    expect(dead.bodyLift).toBe(0);
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

  it('keeps all gait outputs finite through degenerate snapshots and bounds the per-hero amplitudes', () => {
    const degenerate = projectProceduralAnimalLocomotion(
      { playerX: Number.NaN, playerY: Number.POSITIVE_INFINITY },
      { tick: Number.NaN, playerX: Number.NEGATIVE_INFINITY, playerY: Number.NaN, playerAlive: true },
      Number.POSITIVE_INFINITY,
      'greg',
    );
    expect(Object.values(degenerate).filter((value) => typeof value === 'number').every(Number.isFinite)).toBe(true);
    expect(deriveProceduralAnimalHeadingDegrees(
      { playerX: Number.NaN, playerY: Number.NaN },
      { playerX: Number.POSITIVE_INFINITY, playerY: Number.NEGATIVE_INFINITY },
    )).toBeNull();

    const teleportPrevious = { playerX: -1_000_000, playerY: 1_000_000 };
    const teleportCurrent = { tick: 400, playerX: 1_000_000, playerY: -1_000_000, playerAlive: true };
    for (const heroId of ['greg', 'benny', 'gracie'] as const) {
      const pose = projectProceduralAnimalLocomotion(teleportPrevious, teleportCurrent, 0.5, heroId);
      const tuning = PROCEDURAL_ANIMAL_GAIT_TUNING[heroId];
      expect(Number.isFinite(pose.widthScale)).toBe(true);
      expect(Number.isFinite(pose.lengthScale)).toBe(true);
      expect(Math.abs(pose.yawWagDegrees)).toBeLessThanOrEqual(tuning.yawWagDegrees);
      expect(Math.abs(pose.leanDegrees)).toBeLessThanOrEqual(tuning.leanDegrees);
    }
  });

  it('emits at most two deterministic ground puffs per gait beat and caps its local pool at eight slots', () => {
    const previous = { playerX: 40, playerY: 60 };
    let emitted = 0;
    for (let tick = 1; tick <= 100; tick++) {
      const mask = projectProceduralAnimalFootfallDustSpawnMask(
        previous,
        { tick, playerX: 42, playerY: 61, playerAlive: true },
        'greg',
      );
      const puffCount = [0, 1, 2, 3].filter((index) => (mask & (1 << index)) !== 0).length;
      expect(puffCount).toBeLessThanOrEqual(2);
      emitted += puffCount;
    }
    expect(emitted).toBeGreaterThan(0);

    const allocator = new FixedFootfallDustAllocator();
    for (let index = 0; index < PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY * 3; index++) {
      const slot = allocator.claim(100);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY);
    }
    expect(allocator.activeCount(100)).toBe(PROCEDURAL_ANIMAL_FOOTFALL_DUST_CAPACITY);
    expect(allocator.activeCount(100 + PROCEDURAL_ANIMAL_FOOTFALL_DUST_LIFETIME_TICKS)).toBe(0);
  });

  it('banks only the art rig within the signed eight-degree turn limit', () => {
    expect(projectProceduralAnimalTurnBankDegrees(0, 90, 'greg')).toBe(8);
    expect(projectProceduralAnimalTurnBankDegrees(0, -90, 'benny')).toBe(-7);
    expect(projectProceduralAnimalTurnBankDegrees(Number.NaN, 90, 'gracie')).toBe(0);
  });

  it('reacts only to active-companion authoritative signature sources and decays by fixed tick', () => {
    expect(classifyProceduralAnimalAction('greg', {
      sourceId: 'greg-fox-swipe', tag: 'greg-fox-swipe',
    })).toBe('scout-swipe');
    expect(classifyProceduralAnimalAction('greg', {
      sourceId: 'greg-rush-rake', tag: 'greg-rush-rake',
    })).toBe('scout-swipe');
    expect(classifyProceduralAnimalAction('greg', {
      sourceId: 'scout-swipe', tag: 'scout-swipe',
    })).toBe('none');
    expect(classifyProceduralAnimalAction('benny', {
      sourceId: 'benny-trample', tag: 'benny-trample-wave',
    })).toBe('trample');
    expect(classifyProceduralAnimalAction('gracie', {
      sourceId: 'gracie-spit', tag: 'gracie-spit',
    })).toBe('spit');
    expect(classifyProceduralAnimalAction('benny', {
      sourceId: 'gracie-spit', tag: 'gracie-spit',
    })).toBe('none');

    const scoutSwipe = projectProceduralAnimalActionReaction('scout-swipe', 100, 100, 0.5);
    expect(scoutSwipe.forwardKick).toBeGreaterThan(0);
    expect(scoutSwipe.footfallKick).toBeGreaterThan(0);
    expect(projectProceduralAnimalActionReaction('scout-swipe', 100, 111, 0)).toMatchObject({
      kind: 'none', strength: 0, forwardKick: 0,
    });

    const trample = projectProceduralAnimalActionReaction('trample', 100, 100, 0.5);
    expect(trample.forwardKick).toBeGreaterThan(0);
    expect(trample.footfallKick).toBeGreaterThan(0);
    expect(projectProceduralAnimalActionReaction('trample', 100, 100, 0.5)).toEqual(trample);
    expect(projectProceduralAnimalActionReaction('trample', 100, 113, 0)).toMatchObject({
      kind: 'none', strength: 0, forwardKick: 0,
    });
  });
});
