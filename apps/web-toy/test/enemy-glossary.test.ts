import { describe, expect, test } from 'vitest';
import { RUN_ENEMY_CONTENT } from '@sim';
import { presentEnemyGlossary, validateEnemyGlossary } from '../src/presentation/enemy-glossary';

describe('enemy glossary', () => {
  test('covers the data-defined authored enemy manifest in stable order', () => {
    validateEnemyGlossary();
    const entries = presentEnemyGlossary();
    expect(entries).toHaveLength(RUN_ENEMY_CONTENT.length);
    expect(entries.map((entry) => entry.id)).toEqual(RUN_ENEMY_CONTENT.map((entry) => entry.archetypeId));
    expect(entries.every((entry) => entry.title.length > 0 && entry.tell.length > 0 && entry.answer.length > 0)).toBe(true);
    expect(entries[4]).toMatchObject({ id: 'enemy:charger', title: 'Charger', behavior: 'charger', spawnLabel: 'lane × 1' });
  });
});
