import { describe, expect, it } from 'vitest';
import { POWER_PICKUP_KIND, makeId } from '@sim';
import type { CategorySnapshot, RenderSnapshot, ViewCategory } from '../src/contracts';
import {
  createLootVisualPresentation,
  LOOT_VISUAL_STYLE,
  lootVisualRecipeForStyle,
  powerPickupVisualStyleForRole,
  xpVisualStyleForValue,
} from '../src/render/loot-visual-presentation';

interface Entry {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly role?: number;
  readonly value?: number;
}

function category(categoryName: ViewCategory, entries: readonly Entry[]): CategorySnapshot {
  const capacity = entries.length;
  const snapshot: CategorySnapshot = {
    category: categoryName,
    count: capacity,
    id: new Int32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    radius: new Float32Array(capacity),
    value: new Float32Array(capacity),
    velocityX: new Float32Array(capacity),
    velocityY: new Float32Array(capacity),
    hp: new Float32Array(capacity),
    maxHp: new Float32Array(capacity),
    archetype: new Uint8Array(capacity),
    role: new Uint8Array(capacity),
    source: new Uint8Array(capacity),
    critical: new Uint8Array(capacity),
    marked: new Uint8Array(capacity),
  };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    snapshot.id[index] = entry.id;
    snapshot.x[index] = entry.x;
    snapshot.y[index] = entry.y;
    snapshot.radius[index] = entry.radius ?? 4;
    snapshot.role[index] = entry.role ?? 0;
    snapshot.value[index] = entry.value ?? 0;
  }
  return snapshot;
}

function renderSnapshot(
  tick: number,
  pickups: readonly Entry[] = [],
  powerPickups: readonly Entry[] = [],
  playerX = 50,
  playerY = 60,
): RenderSnapshot {
  return {
    tick,
    playerX,
    playerY,
    playerRadius: 8,
    playerPickupRadius: 18,
    playerHp: 100,
    playerMaxHp: 100,
    playerXp: 0,
    playerLevel: 1,
    playerAlive: true,
    enemies: category('enemy', []),
    projectiles: category('projectile', []),
    pickups: category('pickup', pickups),
    powerPickups: category('powerPickup', powerPickups),
    zones: category('zone', []),
  };
}

describe('loot visual presentation', () => {
  it('projects mint-and-gold tiered XP plus distinct special-pickup recipes from snapshots only', () => {
    const mote = makeId(1, 1);
    const gem = makeId(2, 1);
    const prism = makeId(3, 1);
    const bomb = makeId(4, 1);
    const magnet = makeId(5, 1);
    const food = makeId(6, 1);
    const previous = renderSnapshot(
      40,
      [
        { id: mote, x: 10, y: 20, radius: 4, value: 1 },
        { id: gem, x: 30, y: 40, radius: 4, value: 3 },
        { id: prism, x: 50, y: 60, radius: 4, value: 12 },
      ],
      [
        { id: bomb, x: 70, y: 80, radius: 12, role: POWER_PICKUP_KIND.bomb },
        { id: magnet, x: 90, y: 100, radius: 12, role: POWER_PICKUP_KIND.magnet },
        { id: food, x: 110, y: 120, radius: 12, role: POWER_PICKUP_KIND.food },
      ],
    );
    const current = renderSnapshot(
      41,
      [
        { id: mote, x: 20, y: 30, radius: 4, value: 1 },
        { id: gem, x: 40, y: 50, radius: 4, value: 3 },
        { id: prism, x: 60, y: 70, radius: 4, value: 12 },
      ],
      [
        { id: bomb, x: 80, y: 90, radius: 12, role: POWER_PICKUP_KIND.bomb },
        { id: magnet, x: 100, y: 110, radius: 12, role: POWER_PICKUP_KIND.magnet },
        { id: food, x: 120, y: 130, radius: 12, role: POWER_PICKUP_KIND.food },
      ],
    );
    const presentation = createLootVisualPresentation({ xpCapacity: 3, powerCapacity: 3, collectionCapacity: 4 });
    const beforeX = Array.from(previous.pickups.x);
    const beforeRole = Array.from(previous.powerPickups.role);

    const frame = presentation.update(previous, current, 0.5);

    expect(frame.xp.count).toBe(3);
    expect(Array.from(frame.xp.style.slice(0, frame.xp.count))).toEqual([
      LOOT_VISUAL_STYLE.xpMote,
      LOOT_VISUAL_STYLE.xpGem,
      LOOT_VISUAL_STYLE.xpPrism,
    ]);
    expect(frame.xp.x[0]).toBe(15);
    expect(frame.xp.y[0]).toBe(25);
    expect(frame.xp.scale[2]).toBeGreaterThan(frame.xp.scale[0]!);
    expect(frame.xp.haloScale[1]).toBeGreaterThan(frame.xp.scale[1]!);
    expect(frame.xp.lift[0]).toBeGreaterThan(0);

    expect(frame.power.count).toBe(3);
    expect(Array.from(frame.power.style.slice(0, frame.power.count))).toEqual([
      LOOT_VISUAL_STYLE.bomb,
      LOOT_VISUAL_STYLE.magnet,
      LOOT_VISUAL_STYLE.food,
    ]);
    expect(lootVisualRecipeForStyle(LOOT_VISUAL_STYLE.xpMote)?.coreColor).toEqual([0.18, 1, 0.64]);
    expect(lootVisualRecipeForStyle(LOOT_VISUAL_STYLE.xpPrism)?.glintColor).toEqual([1, 0.72, 0.12]);
    expect(lootVisualRecipeForStyle(LOOT_VISUAL_STYLE.bomb)?.mesh).toBe('charge');
    expect(lootVisualRecipeForStyle(LOOT_VISUAL_STYLE.magnet)?.mesh).toBe('field-ring');
    expect(lootVisualRecipeForStyle(LOOT_VISUAL_STYLE.food)?.mesh).toBe('bloom-orb');
    expect(Array.from(previous.pickups.x)).toEqual(beforeX);
    expect(Array.from(previous.powerPickups.role)).toEqual(beforeRole);

    // The reusable frame/buffers confirm the steady-state render path does not
    // allocate a fresh descriptor hierarchy every frame.
    expect(presentation.update(previous, current, 0.5)).toBe(frame);
  });

  it('uses copied XP value before radius, with a radius fallback for older snapshots', () => {
    expect(xpVisualStyleForValue(1, 9)).toBe(LOOT_VISUAL_STYLE.xpMote);
    expect(xpVisualStyleForValue(3, 4)).toBe(LOOT_VISUAL_STYLE.xpGem);
    expect(xpVisualStyleForValue(9, 4)).toBe(LOOT_VISUAL_STYLE.xpPrism);
    expect(xpVisualStyleForValue(undefined, 6)).toBe(LOOT_VISUAL_STYLE.xpGem);
    expect(powerPickupVisualStyleForRole(99)).toBeNull();
  });

  it('emits one bounded, deterministic collection choreography per departed token and preserves rare-token priority', () => {
    const xp = makeId(10, 2);
    const bomb = makeId(11, 2);
    const previous = renderSnapshot(
      80,
      [{ id: xp, x: 12, y: 18, radius: 4, value: 1 }],
      [{ id: bomb, x: 32, y: 38, radius: 12, role: POWER_PICKUP_KIND.bomb }],
    );
    const current = renderSnapshot(81, [], [], 70, 90);
    const presentation = createLootVisualPresentation({ xpCapacity: 1, powerCapacity: 1, collectionCapacity: 1 });

    const first = presentation.update(previous, current, 0);
    expect(first.collections.count).toBe(1);
    // XP is processed first, then the rare Bomb deliberately replaces it in a
    // one-slot pool so the high-value read remains visible under a mass pickup.
    expect(first.collections.style[0]).toBe(LOOT_VISUAL_STYLE.bomb);
    expect(first.collections.originX[0]).toBe(32);
    expect(first.collections.originY[0]).toBe(38);
    expect(first.collections.targetX[0]).toBe(70);
    expect(first.collections.targetY[0]).toBe(90);
    expect(first.collections.sourceBurstRadius[0]).toBeGreaterThan(9);
    expect(first.collections.progress[0]).toBe(0);

    const second = presentation.update(previous, current, 0.5);
    expect(second.collections.count).toBe(1);
    expect(second.collections.style[0]).toBe(LOOT_VISUAL_STYLE.bomb);
    expect(second.collections.progress[0]).toBeGreaterThan(0);
    expect(second.collections.headX[0]).toBeGreaterThan(second.collections.originX[0]!);
  });
});
