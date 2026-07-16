import { describe, expect, it } from 'vitest';
import {
  FUSION_QA_SCENARIOS,
  createFusionQaRuntime,
  parseFusionQaScenario,
} from '../src/diagnostics/fusion-qa';

describe('Wild Splice browser QA fixtures', () => {
  it('accepts only the three explicit debug scenario names', () => {
    expect(parseFusionQaScenario('wild')).toBe('wild');
    expect(parseFusionQaScenario('perfect')).toBe('perfect');
    expect(parseFusionQaScenario('support')).toBe('support');
    expect(parseFusionQaScenario('unsupported')).toBeNull();
    expect(parseFusionQaScenario(null)).toBeNull();
  });

  it('builds each scenario through real Master upgrades and leaves its offer unresolved', () => {
    for (const [scenario, fixture] of Object.entries(FUSION_QA_SCENARIOS)) {
      const runtime = createFusionQaRuntime(scenario as keyof typeof FUSION_QA_SCENARIOS, 7331, -1);
      const offer = runtime.availableFusions().find((candidate) => candidate.evolutionId === fixture.evolutionId);
      expect(offer?.ingredients).toEqual(fixture.ingredients);
      expect(runtime.getState().evolutions).toEqual([]);
    }
  });
});
