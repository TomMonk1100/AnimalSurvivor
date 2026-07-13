import { describe, expect, it } from 'vitest';
import { COMBAT_DAMAGE_SOURCE, DEFAULT_CONFIG } from '@sim';
import { createRenderStressHarness } from '../src/stress/render-stress-snapshots';

describe('renderer-only stress snapshots', () => {
  it('fills the requested deterministic saturation counts within configured capacity', () => {
    const harness = createRenderStressHarness(DEFAULT_CONFIG);
    expect(harness.enemies).toBe(1000);
    expect(harness.projectiles).toBe(500);
    expect(harness.pickups).toBe(200);
    expect(harness.powerPickups).toBe(3);
    expect(harness.curr.enemies.count).toBe(1000);
    expect(harness.curr.projectiles.count).toBe(500);
    expect(harness.curr.pickups.count).toBe(200);
    expect(harness.curr.powerPickups.count).toBe(3);
    expect(Array.from(harness.curr.enemies.hp.slice(0, harness.enemies))).toEqual(
      Array(harness.enemies).fill(100),
    );
    expect(Array.from(harness.curr.enemies.maxHp.slice(0, harness.enemies))).toEqual(
      Array(harness.enemies).fill(100),
    );
    expect(Array.from(harness.curr.projectiles.hp.slice(0, harness.projectiles))).toEqual(
      Array(harness.projectiles).fill(0),
    );
    expect(Array.from(harness.curr.pickups.maxHp.slice(0, harness.pickups))).toEqual(
      Array(harness.pickups).fill(0),
    );
    expect(Array.from(harness.curr.projectiles.archetype.slice(0, harness.projectiles))).toEqual(
      Array(harness.projectiles).fill(0),
    );
    expect(Array.from(harness.curr.powerPickups.role.slice(0, harness.powerPickups))).toEqual([1, 2, 3]);
  });

  it('is deterministic and keeps adjacent snapshot ticks', () => {
    const a = createRenderStressHarness(DEFAULT_CONFIG);
    const b = createRenderStressHarness(DEFAULT_CONFIG);
    a.update(1234);
    b.update(1234);
    expect(a.prev.tick).toBe(1233);
    expect(a.curr.tick).toBe(1234);
    expect(Array.from(a.curr.enemies.x)).toEqual(Array.from(b.curr.enemies.x));
    expect(Array.from(a.curr.enemies.hp)).toEqual(Array.from(b.curr.enemies.hp));
    expect(Array.from(a.curr.projectiles.y)).toEqual(Array.from(b.curr.projectiles.y));
    expect(Array.from(a.curr.projectiles.velocityX)).toEqual(Array.from(b.curr.projectiles.velocityX));
    expect(Array.from(a.curr.projectiles.source)).toEqual(Array.from(b.curr.projectiles.source));
  });

  it('seeds all visual-overhaul paths with tiered XP and mixed projectile families', () => {
    const harness = createRenderStressHarness(DEFAULT_CONFIG);
    harness.update(1234);
    const { pickups, projectiles } = harness.curr;

    expect(Array.from(pickups.value.slice(0, 6))).toEqual([1, 3, 9, 1, 3, 9]);
    expect(Array.from(projectiles.role.slice(0, 4))).toEqual([0, 0, 0, 1]);
    expect(Array.from(projectiles.source.slice(0, 4))).toEqual([
      COMBAT_DAMAGE_SOURCE.playerProjectile,
      COMBAT_DAMAGE_SOURCE.traitProjectile,
      COMBAT_DAMAGE_SOURCE.heroSpit,
      COMBAT_DAMAGE_SOURCE.enemyProjectile,
    ]);
    expect(Array.from(projectiles.critical.slice(0, 4))).toEqual([1, 0, 0, 1]);
    expect(Array.from(projectiles.value.slice(0, 4))).toEqual([12, 24, 36, 18]);
    expect(Array.from(projectiles.velocityX.slice(0, projectiles.count)).some((value) => Math.abs(value) > 0.1)).toBe(true);
    expect(Array.from(projectiles.velocityY.slice(0, projectiles.count)).some((value) => Math.abs(value) > 0.1)).toBe(true);
  });

  it('does not alias previous and current buffers', () => {
    const harness = createRenderStressHarness(DEFAULT_CONFIG);
    expect(harness.prev.enemies.x).not.toBe(harness.curr.enemies.x);
    const previous = harness.prev.enemies.x[0];
    harness.curr.enemies.x[0] = 999;
    expect(harness.prev.enemies.x[0]).toBe(previous);
  });
});
