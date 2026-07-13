import { describe, expect, it } from 'vitest';
import { formatFieldGuideIssueReport } from '../src/release/issue-report';

describe('Field Guide issue report', () => {
  it('formats stable build, run, and replay identifiers', () => {
    expect(formatFieldGuideIssueReport({
      buildId: '0.1.0+demo',
      runId: 'run:42',
      heroId: 'greg',
      biomeId: 'saltwind',
      seed: 42,
      outcome: 'victory',
      durationLabel: '7:12',
      kills: 88,
      buildName: 'Moonlit Greg Mythic Hunt',
    })).toBe([
      'AnimalSurvivor issue report',
      'Build ID: 0.1.0+demo',
      'Run ID: run:42',
      'Hero: greg',
      'Biome: saltwind',
      'Seed: 0x0000002a',
      'Outcome: victory',
      'Duration: 7:12',
      'Kills: 88',
      'Build: Moonlit Greg Mythic Hunt',
    ].join('\n'));
  });

  it('keeps uint32 seed formatting deterministic at the upper boundary', () => {
    expect(formatFieldGuideIssueReport({
      buildId: 'demo',
      runId: 'run:max',
      heroId: 'gracie',
      biomeId: 'forest',
      seed: 0xffff_ffff,
      outcome: 'defeat',
      durationLabel: '0:03',
      kills: 0,
      buildName: 'First Forage',
    })).toContain('Seed: 0xffffffff');
  });

  it('includes optional clipboard-only environment diagnostics when supplied', () => {
    const report = formatFieldGuideIssueReport({
      buildId: 'demo',
      runId: 'run:environment',
      heroId: 'greg',
      biomeId: 'forest',
      seed: 1,
      outcome: 'defeat',
      durationLabel: '1:00',
      kills: 2,
      buildName: 'First Forage',
      browser: 'Example Browser / Device',
      viewport: '390x844',
      qualityTier: 'reduced',
      accessibility: 'reducedMotion, highContrast',
      inputMode: 'keyboard',
      keyboardBindings: 'up=I, down=K, left=J, right=L',
    });
    expect(report).toContain('Browser/device: Example Browser / Device');
    expect(report).toContain('Viewport: 390x844');
    expect(report).toContain('Render quality: reduced');
    expect(report).toContain('Accessibility: reducedMotion, highContrast');
    expect(report).toContain('Input mode: keyboard');
    expect(report).toContain('Keyboard bindings: up=I, down=K, left=J, right=L');
  });
});
