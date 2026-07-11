import { describe, expect, it } from 'vitest';
import { createSimulation, DEFAULT_CONFIG } from '@sim';
import { lerp } from '../src/render/interpolation';
import { captureSnapshot, createSnapshot } from '../src/sim/snapshot-producer';

describe('lerp', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-5, 5, 0)).toBe(-5);
    expect(lerp(-5, 5, 1)).toBe(5);
  });

  it('returns the midpoint at t=0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it('clamps t outside [0, 1]', () => {
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
    expect(lerp(0, 10, -0.0001)).toBe(0);
    expect(lerp(0, 10, 1.0001)).toBe(10);
  });
});

describe('interpolation reads do not mutate snapshots or sim state', () => {
  it('leaves snapshot buffers and sim pool counts unchanged after an interpolation read pass', () => {
    const sim = createSimulation(DEFAULT_CONFIG, 7);
    // Advance a few ticks with movement so enemies/projectiles/pickups exist.
    for (let tick = 0; tick < 40; tick++) {
      sim.step({ moveX: 1, moveY: 0.3, paused: false });
    }

    const prev = createSnapshot(DEFAULT_CONFIG);
    const curr = createSnapshot(DEFAULT_CONFIG);
    captureSnapshot(prev, sim);
    sim.step({ moveX: 1, moveY: 0.3, paused: false });
    captureSnapshot(curr, sim);

    // Snapshot fully; every typed array as a plain array for later comparison.
    const snapshotOf = (buf: typeof prev) => ({
      tick: buf.tick,
      playerX: buf.playerX,
      playerY: buf.playerY,
      enemies: {
        count: buf.enemies.count,
        id: Array.from(buf.enemies.id),
        x: Array.from(buf.enemies.x),
        y: Array.from(buf.enemies.y),
        radius: Array.from(buf.enemies.radius),
        hp: Array.from(buf.enemies.hp),
        maxHp: Array.from(buf.enemies.maxHp),
        archetype: Array.from(buf.enemies.archetype),
      },
      projectiles: {
        count: buf.projectiles.count,
        id: Array.from(buf.projectiles.id),
        x: Array.from(buf.projectiles.x),
        y: Array.from(buf.projectiles.y),
        hp: Array.from(buf.projectiles.hp),
        maxHp: Array.from(buf.projectiles.maxHp),
      },
      pickups: {
        count: buf.pickups.count,
        id: Array.from(buf.pickups.id),
        x: Array.from(buf.pickups.x),
        y: Array.from(buf.pickups.y),
        hp: Array.from(buf.pickups.hp),
        maxHp: Array.from(buf.pickups.maxHp),
      },
    });

    const prevBefore = snapshotOf(prev);
    const currBefore = snapshotOf(curr);
    const enemiesCountBefore = sim.enemies.data.count;
    const projCountBefore = sim.projectiles.data.count;
    const pickupsCountBefore = sim.pickups.data.count;

    // Simulate what a renderer's interpolation pass does: read-only walk
    // over both snapshots, computing interpolated positions with lerp.
    let checksum = 0;
    const n = Math.max(curr.enemies.count, prev.enemies.count);
    for (let i = 0; i < n; i++) {
      const px = prev.enemies.x[i] ?? 0;
      const cx = curr.enemies.x[i] ?? 0;
      const py = prev.enemies.y[i] ?? 0;
      const cy = curr.enemies.y[i] ?? 0;
      checksum += lerp(px, cx, 0.5) + lerp(py, cy, 0.5);
    }

    expect(snapshotOf(prev)).toEqual(prevBefore);
    expect(snapshotOf(curr)).toEqual(currBefore);
    expect(sim.enemies.data.count).toBe(enemiesCountBefore);
    expect(sim.projectiles.data.count).toBe(projCountBefore);
    expect(sim.pickups.data.count).toBe(pickupsCountBefore);
    // checksum is finite (sanity: the read pass actually did something).
    expect(Number.isFinite(checksum)).toBe(true);
  });
});
