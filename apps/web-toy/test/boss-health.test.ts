import { describe, expect, it } from 'vitest';
import { RUN_ENEMY_ROLE } from '@sim';
import type { CategorySnapshot } from '../src/contracts';
import { presentBossHealth } from '../src/presentation/boss-health';

function enemies(entries: Array<{ id: number; role: number; hp: number; maxHp: number }>): CategorySnapshot {
  const capacity = entries.length;
  const id = new Int32Array(capacity);
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const radius = new Float32Array(capacity);
  const archetype = new Uint8Array(capacity);
  const role = new Uint8Array(capacity);
  const hp = new Float32Array(capacity);
  const maxHp = new Float32Array(capacity);
  const marked = new Uint8Array(capacity);
  entries.forEach((entry, index) => {
    id[index] = entry.id;
    role[index] = entry.role;
    hp[index] = entry.hp;
    maxHp[index] = entry.maxHp;
  });
  return { category: 'enemy', count: capacity, id, x, y, radius, archetype, role, hp, maxHp, marked };
}

describe('boss health presentation', () => {
  it('finds the copied boss health independently of regular and elite enemies', () => {
    const result = presentBossHealth(enemies([
      { id: 1, role: RUN_ENEMY_ROLE.regular, hp: 3, maxHp: 3 },
      { id: 2, role: RUN_ENEMY_ROLE.elite, hp: 8, maxHp: 8 },
      { id: 3, role: RUN_ENEMY_ROLE.boss, hp: 75, maxHp: 100 },
    ]));

    expect(result).toEqual({
      id: 3, label: 'The Final Threat', current: 75, max: 100, fraction: 0.75, percent: 75,
    });
  });

  it('hides when no valid live boss snapshot is present', () => {
    expect(presentBossHealth(enemies([{ id: 1, role: RUN_ENEMY_ROLE.regular, hp: 1, maxHp: 1 }]))).toBeNull();
    expect(presentBossHealth(enemies([{ id: 2, role: RUN_ENEMY_ROLE.boss, hp: 1, maxHp: 0 }]))).toBeNull();
  });

  it('uses the named Saltwind apex identity without changing copied health', () => {
    expect(presentBossHealth(enemies([{ id: 4, role: RUN_ENEMY_ROLE.boss, hp: 40, maxHp: 80 }]), 'saltwind'))
      .toMatchObject({ label: 'The Sandglass Sovereign', current: 40, max: 80, percent: 50 });
  });

  it('clamps malformed copied health to a safe progress fraction', () => {
    expect(presentBossHealth(enemies([{ id: 2, role: RUN_ENEMY_ROLE.boss, hp: 999, maxHp: 100 }])))
      .toMatchObject({ current: 100, fraction: 1, percent: 100 });
    expect(presentBossHealth(enemies([{ id: 2, role: RUN_ENEMY_ROLE.boss, hp: -2, maxHp: 100 }])))
      .toMatchObject({ current: 0, fraction: 0, percent: 0 });
  });
});
