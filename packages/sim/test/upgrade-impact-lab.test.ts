import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UPGRADE_IMPACT_LAB_DURATION_SECONDS,
  formatUpgradeImpactLabReport,
  runUpgradeImpactLabReport,
} from '../src/index.js';

function row(report: ReturnType<typeof runUpgradeImpactLabReport>, id: string, currentRank: number) {
  const result = report.results.find((candidate) => candidate.id === id && candidate.currentRank === currentRank);
  if (result === undefined) assert.fail(`missing upgrade impact row ${id} Rank ${currentRank}`);
  return result;
}

test('upgrade impact lab compares every universal rank transition deterministically', () => {
  const first = runUpgradeImpactLabReport();
  const second = runUpgradeImpactLabReport();

  assert.deepEqual(second, first, 'fixed seed, setup ticks, and training fixtures must reproduce byte-for-byte');
  assert.equal(first.durationSeconds, UPGRADE_IMPACT_LAB_DURATION_SECONDS);
  assert.equal(first.results.length, 65);
  assert.equal(first.summary.totalComparisons, 65);
  assert.equal(first.summary.directDamageComparisons + first.summary.nonDamageComparisons, 65);
  assert.equal(first.summary.failures, 0);
});

test('upgrade impact lab measures direct damage and labels utility lanes without pretending they are DPS', () => {
  const report = runUpgradeImpactLabReport();
  const damage = row(report, 'sharpened-instinct', 0);
  assert.equal(damage.category, 'Direct damage');
  assert.equal(damage.directDamageStatus, 'measured');
  assert.equal(damage.metric.label, `Authoritative damage over ${UPGRADE_IMPACT_LAB_DURATION_SECONDS}s`);
  assert.ok(damage.metric.after > damage.metric.before);
  assert.ok(damage.metric.delta > 0);

  const moteDraw = row(report, 'xp-magnet', 0);
  assert.equal(moteDraw.category, 'Economy / utility');
  assert.equal(moteDraw.directDamageStatus, 'no-direct-damage');
  assert.equal(moteDraw.metric.label, 'Authoritative pickup radius');
  assert.equal(moteDraw.metric.delta, 10);
  assert.match(moteDraw.authoredOutcome, /XP pull range/);

  const shield = row(report, 'hero-trait:gracie-fluffy-shield', 0);
  assert.equal(shield.category, 'Defense');
  assert.equal(shield.directDamageStatus, 'no-direct-damage');
  assert.equal(shield.metric.delta, 10);
});

test('formatted upgrade impact lab report keeps direct and no-direct-damage evidence distinct', () => {
  const text = formatUpgradeImpactLabReport();
  assert.match(text, /Sharpened Instinct/);
  assert.match(text, /Mote Draw/);
  assert.match(text, /NO DIRECT DAMAGE/);
  assert.match(text, /0 regressions/);
});
