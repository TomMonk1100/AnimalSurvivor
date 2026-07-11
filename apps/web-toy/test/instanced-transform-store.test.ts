import { describe, expect, it } from 'vitest';
import { makeId, RUN_ENEMY_ROLE } from '@sim';
import type { CategorySnapshot, ViewCategory } from '../src/contracts';
import {
  DEFAULT_INSTANCE_CAPACITY,
  InstancedTransformStore,
} from '../src/render/instanced-transform-store';

interface Entry {
  id: number;
  x: number;
  y: number;
  radius?: number;
  hp?: number;
  maxHp?: number;
  archetype?: number;
  role?: number;
}

function snapshot(entries: readonly Entry[], category: ViewCategory = 'enemy'): CategorySnapshot {
  const capacity = entries.length;
  const id = new Int32Array(capacity);
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const radius = new Float32Array(capacity);
  const hp = new Float32Array(capacity);
  const maxHp = new Float32Array(capacity);
  const archetype = new Uint8Array(capacity);
  const role = new Uint8Array(capacity);

  entries.forEach((entry, index) => {
    id[index] = entry.id;
    x[index] = entry.x;
    y[index] = entry.y;
    radius[index] = entry.radius ?? 1;
    hp[index] = entry.hp ?? 0;
    maxHp[index] = entry.maxHp ?? 0;
    archetype[index] = entry.archetype ?? 0;
    role[index] = entry.role ?? RUN_ENEMY_ROLE.regular;
  });

  return { category, count: capacity, id, x, y, radius, hp, maxHp, archetype, role };
}

function matrix(store: InstancedTransformStore, index: number): number[] {
  return Array.from(store.matrices.slice(index * 16, index * 16 + 16));
}

describe('InstancedTransformStore', () => {
  it('defaults to the milestone capacity and validates capacities', () => {
    expect(new InstancedTransformStore().capacity).toBe(DEFAULT_INSTANCE_CAPACITY);
    expect(new InstancedTransformStore().matrices).toHaveLength(1200 * 16);
    expect(() => new InstancedTransformStore(-1)).toThrow(RangeError);
    expect(() => new InstancedTransformStore(1.5)).toThrow(RangeError);
  });

  it('interpolates matching ids into packed column-major matrices', () => {
    const id = makeId(7, 3);
    const previous = snapshot([{ id, x: 10, y: 20, radius: 2 }]);
    const current = snapshot([{ id, x: 30, y: 60, radius: 3, archetype: 4 }]);
    const store = new InstancedTransformStore(1);

    store.update(previous, current, 0.25, -5, -10);

    expect(store.count).toBe(1);
    expect(store.ids[0]).toBe(id);
    expect(store.archetypes[0]).toBe(4);
    expect(store.roles[0]).toBe(RUN_ENEMY_ROLE.regular);
    expect(matrix(store, 0)).toEqual([
      6, 0, 0, 0,
      0, 6, 0, 0,
      0, 0, 6, 0,
      10, 0, 20, 1,
    ]);
  });

  it('snaps a fresh spawn to its current transform', () => {
    const current = snapshot([{ id: makeId(9, 1), x: 80, y: 90, radius: 0.5 }]);
    const store = new InstancedTransformStore(1);

    store.update(snapshot([]), current, 0);

    expect(matrix(store, 0)[12]).toBe(80);
    expect(matrix(store, 0)[14]).toBe(90);
  });

  it('can invert simulation Y so positive movement appears upward through a top-down camera', () => {
    const id = makeId(3, 1);
    const previous = snapshot([{ id, x: 10, y: 20 }]);
    const current = snapshot([{ id, x: 10, y: 40 }]);
    const store = new InstancedTransformStore(1);

    store.update(previous, current, 0.5, -50, 50, -1);

    expect(matrix(store, 0)[12]).toBe(-40);
    expect(matrix(store, 0)[14]).toBe(20);
  });

  it('does not interpolate from a stale generation when a slot is reused', () => {
    const previous = snapshot([{ id: makeId(12, 4), x: 1, y: 2 }]);
    const current = snapshot([{ id: makeId(12, 5), x: 100, y: 200 }]);
    const store = new InstancedTransformStore(1);

    store.update(previous, current, 0.5);

    expect(matrix(store, 0)[12]).toBe(100);
    expect(matrix(store, 0)[14]).toBe(200);
  });

  it('copies role data and builds fixed role batches without stale-generation interpolation', () => {
    const reusedSlot = 12;
    const previous = snapshot([
      { id: makeId(reusedSlot, 4), x: 1, y: 2, role: RUN_ENEMY_ROLE.elite },
      { id: makeId(13, 1), x: 20, y: 30, role: RUN_ENEMY_ROLE.boss },
    ]);
    const current = snapshot([
      { id: makeId(reusedSlot, 5), x: 100, y: 200, role: RUN_ENEMY_ROLE.regular },
      { id: makeId(13, 1), x: 40, y: 70, role: RUN_ENEMY_ROLE.boss },
      { id: makeId(14, 1), x: 50, y: 80, role: RUN_ENEMY_ROLE.elite },
      { id: makeId(15, 1), x: 60, y: 90, role: RUN_ENEMY_ROLE.ranged },
    ]);
    const store = new InstancedTransformStore(4);

    store.update(previous, current, 0.5, 0, 0, 1, RUN_ENEMY_ROLE.boss, 2);

    expect(store.count).toBe(1);
    expect(store.ids[0]).toBe(makeId(13, 1));
    expect(store.roles[0]).toBe(RUN_ENEMY_ROLE.boss);
    expect(matrix(store, 0)[12]).toBe(30);
    expect(matrix(store, 0)[14]).toBe(50);
    expect(matrix(store, 0)[0]).toBe(4);

    store.update(previous, current, 0.5, 0, 0, 1, RUN_ENEMY_ROLE.regular);
    expect(store.count).toBe(1);
    expect(store.ids[0]).toBe(makeId(reusedSlot, 5));
    expect(store.roles[0]).toBe(RUN_ENEMY_ROLE.regular);
    expect(matrix(store, 0)[12]).toBe(100);
    expect(matrix(store, 0)[14]).toBe(200);

    store.update(previous, current, 0.5, 0, 0, 1, RUN_ENEMY_ROLE.ranged);
    expect(store.count).toBe(1);
    expect(store.ids[0]).toBe(makeId(15, 1));
    expect(store.roles[0]).toBe(RUN_ENEMY_ROLE.ranged);
    expect(matrix(store, 0)[12]).toBe(60);
    expect(matrix(store, 0)[14]).toBe(90);
  });

  it('drops removed entries and preserves current snapshot order', () => {
    const removed = makeId(1, 1);
    const kept = makeId(2, 1);
    const previous = snapshot([
      { id: removed, x: 10, y: 10 },
      { id: kept, x: 20, y: 20 },
    ]);
    const current = snapshot([{ id: kept, x: 40, y: 60 }]);
    const store = new InstancedTransformStore(2);

    store.update(previous, current, 0.5);

    expect(store.count).toBe(1);
    expect(store.ids[0]).toBe(kept);
    expect(matrix(store, 0)[12]).toBe(30);
    expect(matrix(store, 0)[14]).toBe(40);
  });

  it('supports the full capacity and rejects overflow without changing count', () => {
    const entries = Array.from({ length: 1200 }, (_, slot) => ({
      id: makeId(slot, 1),
      x: slot,
      y: slot + 1,
    }));
    const store = new InstancedTransformStore();
    const full = snapshot(entries);

    store.update(snapshot([]), full, 1);
    expect(store.count).toBe(1200);
    expect(store.ids[1199]).toBe(makeId(1199, 1));

    const overflow = snapshot([...entries, { id: makeId(1200, 1), x: 0, y: 0 }]);
    expect(() => store.update(full, overflow, 1)).toThrow(RangeError);
    expect(store.count).toBe(1200);
  });

  it('does not mutate either snapshot', () => {
    const id = makeId(20, 2);
    const previous = snapshot([{ id, x: 2, y: 3, radius: 4, archetype: 5 }]);
    const current = snapshot([{ id, x: 6, y: 7, radius: 8, archetype: 9 }]);
    const before = [previous, current].map((value) => ({
      count: value.count,
      id: Array.from(value.id),
      x: Array.from(value.x),
      y: Array.from(value.y),
      radius: Array.from(value.radius),
      hp: Array.from(value.hp),
      maxHp: Array.from(value.maxHp),
      archetype: Array.from(value.archetype),
      role: Array.from(value.role),
    }));

    new InstancedTransformStore(1).update(previous, current, 0.75, -10, -20);

    expect([previous, current].map((value) => ({
      count: value.count,
      id: Array.from(value.id),
      x: Array.from(value.x),
      y: Array.from(value.y),
      radius: Array.from(value.radius),
      hp: Array.from(value.hp),
      maxHp: Array.from(value.maxHp),
      archetype: Array.from(value.archetype),
      role: Array.from(value.role),
    }))).toEqual(before);
  });

  it('produces byte-identical output across repeated updates', () => {
    const previous = snapshot([
      { id: makeId(4, 8), x: -3.25, y: 9.5, radius: 1.25, archetype: 2 },
      { id: makeId(50_000, 65_535), x: 20, y: 30, radius: 2, archetype: 7 },
    ]);
    const current = snapshot([
      { id: makeId(50_000, 65_535), x: 24, y: 38, radius: 2.5, archetype: 7 },
      { id: makeId(4, 8), x: 7.75, y: -2.5, radius: 1.5, archetype: 2 },
    ]);
    const first = new InstancedTransformStore(2);
    const second = new InstancedTransformStore(2);

    first.update(previous, current, 0.375, -512, -384);
    second.update(previous, current, 0.375, -512, -384);

    expect(new Uint8Array(first.matrices.buffer)).toEqual(new Uint8Array(second.matrices.buffer));
    expect(new Uint8Array(first.ids.buffer)).toEqual(new Uint8Array(second.ids.buffer));
    expect(first.archetypes).toEqual(second.archetypes);
    expect(first.roles).toEqual(second.roles);

    // A second pass also proves that the transient slot lookup was reset.
    first.update(snapshot([]), current, 0);
    expect(matrix(first, 0)[12]).toBe(24);
    expect(matrix(first, 0)[14]).toBe(38);
  });
});
