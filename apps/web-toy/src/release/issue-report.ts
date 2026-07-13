import type { BiomeId, HeroId } from '@sim';

export interface FieldGuideIssueReportInput {
  readonly buildId: string;
  readonly runId: string;
  readonly heroId: HeroId;
  readonly biomeId: BiomeId;
  readonly seed: number;
  readonly outcome: 'victory' | 'defeat';
  readonly durationLabel: string;
  readonly kills: number;
  readonly buildName: string;
  /** Optional live environment details; never persisted in the profile. */
  readonly browser?: string;
  readonly viewport?: string;
  readonly qualityTier?: string;
  readonly accessibility?: string;
  readonly inputMode?: string;
  readonly keyboardBindings?: string;
}

/** Stable, clipboard-friendly report text for a local archived run. */
export function formatFieldGuideIssueReport(input: FieldGuideIssueReportInput): string {
  const report = [
    'AnimalSurvivor issue report',
    `Build ID: ${input.buildId}`,
    `Run ID: ${input.runId}`,
    `Hero: ${input.heroId}`,
    `Biome: ${input.biomeId}`,
    `Seed: 0x${input.seed.toString(16).padStart(8, '0')}`,
    `Outcome: ${input.outcome}`,
    `Duration: ${input.durationLabel}`,
    `Kills: ${input.kills}`,
    `Build: ${input.buildName}`,
  ];
  if (input.browser !== undefined) report.push(`Browser/device: ${input.browser}`);
  if (input.viewport !== undefined) report.push(`Viewport: ${input.viewport}`);
  if (input.qualityTier !== undefined) report.push(`Render quality: ${input.qualityTier}`);
  if (input.accessibility !== undefined) report.push(`Accessibility: ${input.accessibility}`);
  if (input.inputMode !== undefined) report.push(`Input mode: ${input.inputMode}`);
  if (input.keyboardBindings !== undefined) report.push(`Keyboard bindings: ${input.keyboardBindings}`);
  return report.join('\n');
}
