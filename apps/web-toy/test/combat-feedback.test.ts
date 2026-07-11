import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@sim';
import type { CategorySnapshot, RenderSnapshot } from '../src/contracts';
import {
  COMBAT_FEEDBACK_LIFETIME_TICKS,
  projectCombatFeedback,
} from '../src/presentation/combat-feedback';
import { createSnapshot } from '../src/sim/snapshot-producer';

function snapshots(tick = 10): { previous: RenderSnapshot; current: RenderSnapshot } {
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

describe('combat feedback projection', () => {
  it('projects compact immutable hit, attack, pickup, and enemy-death cues', () => {
    const { previous, current } = snapshots(40);
    current.playerHp = 90;

    // Nine new projectiles become one stronger player-anchored attack pulse.
    for (let index = 0; index < 9; index++) {
      entity(current.projectiles, index, 100 + index, 10 + index, 10, 1);
    }

    // The second vanished pickup is too far away to have been collected.
    entity(previous.pickups, 0, 201, 12, 10, 4);
    entity(previous.pickups, 1, 202, 100, 100, 4);
    entity(previous.enemies, 0, 301, 4, 8, 3);
    entity(previous.enemies, 1, 302, 8, 12, 3);

    const before = {
      projectiles: Array.from(current.projectiles.id),
      pickupIds: Array.from(previous.pickups.id),
      enemyIds: Array.from(previous.enemies.id),
    };
    const result = projectCombatFeedback(previous, current);

    expect(result.cues.map((cue) => cue.kind)).toEqual([
      'player-hit', 'attack', 'pickup', 'enemy-death',
    ]);
    expect(result.cues[0]).toMatchObject({ tick: 40, x: 10, y: 10, intensity: 1, lifetimeTicks: 14 });
    expect(result.cues[1]).toMatchObject({ x: 10, y: 10, intensity: 3, expiresAtTick: 48 });
    expect(result.cues[2]).toMatchObject({ x: 12, y: 10, intensity: 1 });
    expect(result.cues[3]).toMatchObject({ x: 6, y: 10, intensity: Math.SQRT2 });
    expect(result.cues.every((cue) => cue.expiresAtTick === cue.tick + cue.lifetimeTicks)).toBe(true);
    expect(result.cues[0]?.expiresAtTick).toBe(40 + COMBAT_FEEDBACK_LIFETIME_TICKS['player-hit']);

    expect(Array.from(current.projectiles.id)).toEqual(before.projectiles);
    expect(Array.from(previous.pickups.id)).toEqual(before.pickupIds);
    expect(Array.from(previous.enemies.id)).toEqual(before.enemyIds);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cues)).toBe(true);
    expect(Object.isFrozen(result.cues[0]!)).toBe(true);
    expect(() => {
      (result.cues as unknown as { intensity: number }[])[0]!.intensity = 99;
    }).toThrow();
  });

  it('uses generation-safe ids and supports a configurable pickup collection radius', () => {
    const { previous, current } = snapshots();
    entity(previous.projectiles, 0, 42, 10, 10);
    entity(current.projectiles, 0, 42, 11, 10);
    expect(projectCombatFeedback(previous, current).cues.some((cue) => cue.kind === 'attack')).toBe(false);

    current.projectiles.id[0] = 42 + 0x1_0000;
    expect(projectCombatFeedback(previous, current).cues.some((cue) => cue.kind === 'attack')).toBe(true);

    const pickupPair = snapshots();
    pickupPair.previous.playerX = pickupPair.current.playerX = 0;
    pickupPair.previous.playerY = pickupPair.current.playerY = 0;
    entity(pickupPair.previous.pickups, 0, 7, 8, 0, 1);
    expect(projectCombatFeedback(pickupPair.previous, pickupPair.current, {
      pickupCollectionRadius: 5,
    }).cues.some((cue) => cue.kind === 'pickup')).toBe(false);
    expect(projectCombatFeedback(pickupPair.previous, pickupPair.current, {
      pickupCollectionRadius: 8,
    }).cues.some((cue) => cue.kind === 'pickup')).toBe(true);
    expect(() => projectCombatFeedback(pickupPair.previous, pickupPair.current, {
      pickupCollectionRadius: -1,
    })).toThrow('pickupCollectionRadius');
  });

  it('uses the live snapshot pickup radius so Magnet collections retain feedback', () => {
    const { previous, current } = snapshots();
    previous.playerX = current.playerX = 0;
    previous.playerY = current.playerY = 0;
    previous.playerPickupRadius = current.playerPickupRadius = 90;
    // This is farther than the base 40-unit collection range but exactly
    // reachable after a fully-ranked XP Magnet expands collection radius.
    entity(previous.pickups, 0, 77, 91, 0, 1);

    const result = projectCombatFeedback(previous, current);
    expect(result.cues.map((cue) => cue.kind)).toEqual(['pickup']);
  });

  it('emits an explicit terminal player-death cue and remains deterministic', () => {
    const { previous, current } = snapshots(88);
    current.playerAlive = false;
    current.playerHp = 0;

    const first = projectCombatFeedback(previous, current);
    const second = projectCombatFeedback(previous, current);
    expect(second).toEqual(first);
    expect(first.cues.map((cue) => cue.kind)).toEqual(['player-death', 'player-hit']);
    expect(first.cues[0]).toMatchObject({ intensity: 4, lifetimeTicks: 90, expiresAtTick: 178 });
    expect(first.cues[1]).toMatchObject({ intensity: 4 });
  });
});
