import { describe, expect, it } from 'vitest';
import { makeId, RUN_ENEMY_ROLE } from '@sim';
import type { CategorySnapshot } from '../src/contracts';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  DEFAULT_ENEMY_HIT_FLASH_MAX_CONCURRENT,
  DEFAULT_ENEMY_HIT_FLASH_MAX_NEW_PER_TICK,
  ENEMY_HIT_FLASH_AGE_OPACITY,
  ENEMY_HIT_FLASH_LIFETIME_TICKS,
  createEnemyHitFlashPresentation,
} from '../src/render/enemy-hit-flash-presentation';

interface EnemyEntry {
  readonly id: number;
  readonly x?: number;
  readonly y?: number;
  readonly radius?: number;
  readonly archetype?: number;
  readonly role?: number;
}

function enemies(entries: readonly EnemyEntry[]): CategorySnapshot {
  const capacity = entries.length;
  const id = new Int32Array(capacity);
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const radius = new Float32Array(capacity);
  const value = new Float32Array(capacity);
  const velocityX = new Float32Array(capacity);
  const velocityY = new Float32Array(capacity);
  const hp = new Float32Array(capacity);
  const maxHp = new Float32Array(capacity);
  const archetype = new Uint8Array(capacity);
  const role = new Uint8Array(capacity);
  const source = new Uint8Array(capacity);
  const critical = new Uint8Array(capacity);
  const marked = new Uint8Array(capacity);
  const attackCharge = new Float32Array(capacity);
  entries.forEach((entry, index) => {
    id[index] = entry.id;
    x[index] = entry.x ?? 100;
    y[index] = entry.y ?? 80;
    radius[index] = entry.radius ?? 4;
    archetype[index] = entry.archetype ?? 0;
    role[index] = entry.role ?? RUN_ENEMY_ROLE.regular;
  });
  return {
    category: 'enemy', count: capacity, id, x, y, radius, value, velocityX, velocityY,
    hp, maxHp, archetype, role, source, critical, marked, attackCharge,
  };
}

function hit(targetId: number, tick: number, overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView {
  return {
    kind: 'enemyHit', tick, x: 100, y: 80, amount: 12, critical: false,
    sourceId: 'greg-fox-swipe', targetId, pickupKind: null,
    ...overrides,
  };
}

describe('enemy hit flash presentation', () => {
  it('uses the forensic three-tick low-energy opacity profile', () => {
    expect(ENEMY_HIT_FLASH_AGE_OPACITY).toEqual([0.58, 0.32, 0.16]);
    expect(ENEMY_HIT_FLASH_AGE_OPACITY[0]).toBe(0.58);
    expect(ENEMY_HIT_FLASH_AGE_OPACITY[1]).toBe(0.32);
    expect(ENEMY_HIT_FLASH_AGE_OPACITY[2]).toBe(0.16);
    expect(ENEMY_HIT_FLASH_AGE_OPACITY.reduce((total, opacity) => total + opacity, 0))
      .toBeCloseTo(1.06);
  });

  it('renders one exact-target white flash for three fixed ticks and reuses the packed frame', () => {
    const id = makeId(12, 1);
    const presentation = createEnemyHitFlashPresentation({ capacity: 2 });
    const snapshot = enemies([{ id, x: 44, y: 61, radius: 3, archetype: 2 }]);
    const event = hit(id, 40);

    const started = presentation.update([event, event], snapshot, 40);
    const buffer = started.flashes;
    expect(started.flashes.count).toBe(1);
    expect(started.flashes.entityId[0]).toBe(id);
    expect(started.flashes.ageTicks[0]).toBe(0);
    expect(started.flashes.opacity[0]).toBeCloseTo(ENEMY_HIT_FLASH_AGE_OPACITY[0]);
    expect(started.flashes.x[0]).toBe(44);

    const aging = presentation.update([event], snapshot, 41);
    expect(aging).toBe(started);
    expect(aging.flashes).toBe(buffer);
    expect(aging.flashes.ageTicks[0]).toBe(1);
    expect(aging.flashes.opacity[0]).toBeCloseTo(ENEMY_HIT_FLASH_AGE_OPACITY[1]);

    expect(presentation.update([], snapshot, 42).flashes.count).toBe(1);
    expect(presentation.update([], snapshot, 40 + ENEMY_HIT_FLASH_LIFETIME_TICKS).flashes.count).toBe(0);
  });

  it('rate-limits repeated hits on the same live enemy but permits the next legal beat', () => {
    const id = makeId(18, 1);
    const presentation = createEnemyHitFlashPresentation();
    const snapshot = enemies([{ id }]);

    expect(presentation.update([hit(id, 20)], snapshot, 20).flashes.count).toBe(1);
    // The second hit is authoritative but falls inside the four-tick
    // presentation rate limit, so it does not turn rapid attacks into strobe.
    const limited = presentation.update([hit(id, 22, { amount: 16 })], snapshot, 22);
    expect(limited.flashes.count).toBe(1);
    expect(limited.flashes.ageTicks[0]).toBe(2);

    const allowed = presentation.update([hit(id, 24, { amount: 18 })], snapshot, 24);
    expect(allowed.flashes.count).toBe(1);
    expect(allowed.flashes.ageTicks[0]).toBe(0);
  });

  it('admits one deterministic critical-first winner from a same-tick swarm hit', () => {
    const ids = Array.from({ length: 8 }, (_, index) => makeId(50 + index, 1));
    const snapshot = enemies(ids.map((id, index) => ({ id, x: 40 + index * 8 })));
    const hits = ids.map((id, index) => hit(id, 80, {
      amount: 10 + index,
      critical: index === 7,
      sourceId: `swarm-${index}`,
    }));
    const first = createEnemyHitFlashPresentation({ capacity: 48 });
    const second = createEnemyHitFlashPresentation({ capacity: 48 });

    const started = first.update(hits, snapshot, 80);
    const reverseStarted = second.update([...hits].reverse(), snapshot, 80);
    const winners = Array.from(started.flashes.entityId.slice(0, started.flashes.count));
    const reverseWinners = Array.from(reverseStarted.flashes.entityId.slice(0, reverseStarted.flashes.count));

    expect(DEFAULT_ENEMY_HIT_FLASH_MAX_NEW_PER_TICK).toBe(1);
    expect(DEFAULT_ENEMY_HIT_FLASH_MAX_CONCURRENT).toBe(3);
    expect(first.maxNewPerTick).toBe(1);
    expect(first.maxConcurrent).toBe(3);
    expect(started.flashes.count).toBe(1);
    expect(winners).toEqual(reverseWinners);
    // The sole critical contact receives the one deterministic slot.
    expect(winners).toEqual([ids[7]]);

    const ageOne = first.update([], snapshot, 81);
    expect(ageOne.flashes.count).toBe(1);
    expect(Array.from(ageOne.flashes.ageTicks.slice(0, 1))).toEqual([1]);
    const ageTwo = first.update([], snapshot, 82);
    expect(ageTwo.flashes.count).toBe(1);
    expect(Array.from(ageTwo.flashes.ageTicks.slice(0, 1))).toEqual([2]);
    expect(first.update([], snapshot, 80 + ENEMY_HIT_FLASH_LIFETIME_TICKS).flashes.count).toBe(0);
  });

  it('never exceeds the three-overlay concurrent budget across successive hit ticks', () => {
    const ids = [
      makeId(81, 1),
      makeId(82, 1),
      makeId(83, 1),
      makeId(84, 1),
    ];
    const snapshot = enemies(ids.map((id) => ({ id })));
    const presentation = createEnemyHitFlashPresentation({ capacity: 48 });
    const counts = [
      presentation.update([hit(ids[0]!, 100)], snapshot, 100).flashes.count,
      presentation.update([hit(ids[1]!, 101)], snapshot, 101).flashes.count,
      presentation.update([hit(ids[2]!, 102)], snapshot, 102).flashes.count,
      presentation.update([hit(ids[3]!, 103)], snapshot, 103).flashes.count,
    ];

    expect(counts).toEqual([1, 2, 3, 3]);
    expect(Math.max(...counts)).toBeLessThanOrEqual(DEFAULT_ENEMY_HIT_FLASH_MAX_CONCURRENT);
  });

  it('never flashes a generation-reused slot from a stale combat target id', () => {
    const staleId = makeId(31, 1);
    const freshId = makeId(31, 2);
    const presentation = createEnemyHitFlashPresentation();
    const snapshot = enemies([{ id: freshId, x: 170, y: 90 }]);

    expect(presentation.update([hit(staleId, 30)], snapshot, 30).flashes.count).toBe(0);
    const fresh = presentation.update([hit(freshId, 31)], snapshot, 31);
    expect(fresh.flashes.count).toBe(1);
    expect(fresh.flashes.entityId[0]).toBe(freshId);
    expect(fresh.flashes.x[0]).toBe(170);
  });

  it('resets its renderer-owned history when presentation time rewinds', () => {
    const id = makeId(42, 1);
    const presentation = createEnemyHitFlashPresentation();
    const snapshot = enemies([{ id }]);
    const event = hit(id, 10);

    expect(presentation.update([event], snapshot, 10).flashes.count).toBe(1);
    // A new run can emit the same structural event again without stale
    // duplicate history suppressing the visible contact cue.
    presentation.update([], snapshot, 9);
    expect(presentation.update([event], snapshot, 10).flashes.count).toBe(1);
  });
});
