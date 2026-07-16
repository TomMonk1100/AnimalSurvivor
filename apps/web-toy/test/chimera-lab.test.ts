import { describe, expect, it } from 'vitest';
import {
  CHIMERA_LAB_LEAN,
  CHIMERA_LAB_TEMPERAMENT,
  assertChimeraLabWithinBudget,
  formatChimeraLabReport,
  runChimeraLabReport,
} from '../src/diagnostics/chimera-lab';

describe('Chimera Lab', () => {
  it('measures every canonical Wild Splice at the planned Steady/Balanced variant', () => {
    const report = runChimeraLabReport();

    expect(report.results).toHaveLength(66);
    expect(report.summary.totalPairs).toBe(66);
    expect(report.temperamentId).toBe(CHIMERA_LAB_TEMPERAMENT);
    expect(report.leanId).toBe(CHIMERA_LAB_LEAN);
    for (const result of report.results) {
      expect(result.temperamentId).toBe(CHIMERA_LAB_TEMPERAMENT);
      expect(result.leanId).toBe(CHIMERA_LAB_LEAN);
      expect(result.targetDps).toBeGreaterThan(0);
      if (result.pairKind === 'support') {
        expect(result.utilityEffectsObserved).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  it('keeps every measured pair inside the plan’s ±25% budget envelope', () => {
    const report = runChimeraLabReport();
    expect(() => assertChimeraLabWithinBudget(report), formatChimeraLabReport(report)).not.toThrow();
  }, 30_000);
});
