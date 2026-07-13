import { describe, expect, it } from 'vitest';
import {
  createAttackDamageLabPanel,
  formatAttackDamageProof,
  type AttackDamageProofRow,
} from '../src/diagnostics/attack-damage-lab';

function row(overrides: Partial<AttackDamageProofRow> = {}): AttackDamageProofRow {
  return {
    id: 'firefly-colony:bud',
    title: 'Firefly Colony — Bud',
    category: 'Orbit contact',
    durationTicks: 1_200,
    hz: 60,
    totalDamage: 96,
    kills: 12,
    hitCount: 24,
    status: 'confirmed',
    ...overrides,
  };
}

describe('attack damage lab panel', () => {
  it('formats an authoritative 20-second damage proof for issue reports', () => {
    expect(formatAttackDamageProof(row())).toBe(
      'Firefly Colony — Bud: Damage confirmed · 96 damage · 12 kills · 24 hits · 20s',
    );
  });

  it('shows every case and distinguishes intentional utility from failures', () => {
    const root = document.createElement('div');
    const panel = createAttackDamageLabPanel(root, [
      row(),
      row({
        id: 'bat-ears:bud',
        title: 'Bat Ears — Bud',
        category: 'Target marking',
        totalDamage: 0,
        kills: 0,
        hitCount: 0,
        status: 'utility-only',
        note: 'Marks targets; it does not directly damage them.',
      }),
      row({
        id: 'broken-case',
        title: 'Broken Case',
        totalDamage: 0,
        kills: 0,
        hitCount: 0,
        status: 'not-confirmed',
      }),
    ]);

    expect(panel.dataset.caseCount).toBe('3');
    expect(panel.dataset.confirmedCount).toBe('1');
    expect(panel.dataset.utilityCount).toBe('1');
    expect(panel.dataset.attentionCount).toBe('1');
    expect(panel.textContent).toContain('Attack proof lab · 1 damaging + 1 utility cases confirmed');
    expect(panel.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(panel.querySelector('[data-attack-id="firefly-colony:bud"]')?.textContent).toContain('96');
    expect(panel.querySelector('[data-attack-id="bat-ears:bud"]')?.textContent).toContain('Utility only');
    expect(panel.querySelector('[data-attack-id="broken-case"]')?.textContent).toContain('Needs attention');
  });
});
