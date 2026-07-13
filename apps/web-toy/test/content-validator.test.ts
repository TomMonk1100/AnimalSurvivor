import { describe, expect, it } from 'vitest';
import { GREG_FOREST_ARSENAL_CATALOG } from '@traits';
import { validatePlayerContent, validatePlayerContentOffer } from '../src/release/content-validator';

describe('player content release validator', () => {
  it('covers every launch trait stage and Mythic with presentation copy and audio', () => {
    expect(validatePlayerContent()).toEqual({ ok: true, issues: [] });
  });

  it('accepts a real deterministic offer and rejects an offer for unknown content', () => {
    expect(validatePlayerContentOffer({ traitId: 'porcupine-quills', resultStage: 'bud' })).toEqual({ ok: true, issues: [] });
    expect(validatePlayerContentOffer({ traitId: 'missing-trait' as never, resultStage: 'bud' })).toMatchObject({ ok: false });
  });

  it('reports missing presentation and orphan content in a fixture catalog', () => {
    const fixture = {
      ...GREG_FOREST_ARSENAL_CATALOG,
      traits: GREG_FOREST_ARSENAL_CATALOG.traits.map((trait, index) => index === 0 ? {
        ...trait,
        stages: {
          ...trait.stages,
          bud: { ...trait.stages.bud, visualKey: 'missing:bud' },
        },
      } : trait),
    };
    const result = validatePlayerContent(fixture);
    expect(result.ok).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain('missingPresentation');
    expect(result.issues.map((entry) => entry.code)).toContain('orphanPresentation');
  });
});
