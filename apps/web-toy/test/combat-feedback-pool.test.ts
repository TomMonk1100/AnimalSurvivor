import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../src/contracts';
import { createCombatFeedbackPool } from '../src/presentation/combat-feedback-pool';
import { createSnapshot } from '../src/sim/snapshot-producer';

function snapshots(tick: number): { previous: RenderSnapshot; current: RenderSnapshot } {
  const previous = createSnapshot(DEFAULT_CONFIG);
  const current = createSnapshot(DEFAULT_CONFIG);
  previous.tick = tick - 1;
  current.tick = tick;
  previous.playerAlive = true;
  current.playerAlive = true;
  previous.playerHp = 100;
  current.playerHp = 100;
  previous.playerX = current.playerX = 10;
  previous.playerY = current.playerY = 10;
  return { previous, current };
}

function entity(
  snapshot: CategorySnapshot,
  index: number,
  id: number,
  x: number,
  y: number,
  radius = 1,
): void {
  snapshot.id[index] = id;
  snapshot.x[index] = x;
  snapshot.y[index] = y;
  snapshot.radius[index] = radius;
  snapshot.count = Math.max(snapshot.count, index + 1);
}

describe('combat feedback cue pool', () => {
  it('holds cues for deterministic tick lifetimes and never duplicates a rendered tick', () => {
    const pool = createCombatFeedbackPool({ capacity: 4 });
    const hit = snapshots(10);
    hit.current.playerHp = 90;

    expect(pool.advance(hit.previous, hit.current).cues.map((cue) => cue.kind)).toEqual(['player-hit']);
    expect(pool.advance(hit.previous, hit.current).cues.map((cue) => cue.kind)).toEqual(['player-hit']);

    const beforeExpiry = snapshots(23);
    beforeExpiry.previous.playerHp = beforeExpiry.current.playerHp = 90;
    expect(pool.advance(beforeExpiry.previous, beforeExpiry.current).cues).toHaveLength(1);

    const atExpiry = snapshots(24);
    atExpiry.previous.playerHp = atExpiry.current.playerHp = 90;
    const expired = pool.advance(atExpiry.previous, atExpiry.current);
    expect(expired.cues).toEqual([]);
    expect(Object.isFrozen(expired)).toBe(true);
    expect(Object.isFrozen(expired.cues)).toBe(true);
  });

  it('uses fixed deterministic priority when capacity is exceeded', () => {
    const pool = createCombatFeedbackPool({ capacity: 2 });
    const { previous, current } = snapshots(10);
    current.playerAlive = false;
    current.playerHp = 0;
    entity(current.projectiles, 0, 1, 10, 10);
    entity(previous.pickups, 0, 2, 10, 10, 1);
    entity(previous.enemies, 0, 3, 10, 10, 1);

    const active = pool.advance(previous, current);
    expect(active.cues.map((cue) => cue.kind)).toEqual(['player-death', 'player-hit']);
    expect(pool.overflowCount).toBe(3);
  });

  it('clears stale cues when a new run restarts at a lower tick', () => {
    const pool = createCombatFeedbackPool();
    const oldRun = snapshots(50);
    oldRun.current.playerHp = 90;
    expect(pool.advance(oldRun.previous, oldRun.current).cues).toHaveLength(1);

    const newRun = snapshots(0);
    expect(pool.advance(newRun.previous, newRun.current).cues).toEqual([]);
    expect(pool.overflowCount).toBe(0);
    expect(() => createCombatFeedbackPool({ capacity: 0 })).toThrow('capacity');
  });
});
