import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ATTACK_DAMAGE_LAB_CASE_COUNT,
  ATTACK_DAMAGE_LAB_DURATION_SECONDS,
  formatAttackDamageLabReport,
  runAttackDamageLab,
  runAttackDamageLabReport,
} from '../src/index.js';

function result(report: ReturnType<typeof runAttackDamageLabReport>, id: string) {
  const found = report.results.find((candidate) => candidate.id === id);
  if (found === undefined) assert.fail(`missing attack damage lab result ${id}`);
  return found;
}

test('attack damage lab runs every launch attack in deterministic isolated twenty-second proofs', () => {
  const first = runAttackDamageLabReport();
  const second = runAttackDamageLabReport();

  assert.deepEqual(second, first, 'fixed seed and fixed training formation make the report reproducible');
  assert.equal(first.durationSeconds, ATTACK_DAMAGE_LAB_DURATION_SECONDS);
  assert.equal(first.durationTicks, ATTACK_DAMAGE_LAB_DURATION_SECONDS * 60);
  assert.equal(first.results.length, ATTACK_DAMAGE_LAB_CASE_COUNT);
  assert.deepEqual(runAttackDamageLab(), first.results, 'simple developer-panel API exposes the same result rows');
  assert.deepEqual(first.summary, {
    totalCases: ATTACK_DAMAGE_LAB_CASE_COUNT,
    damageCases: 27,
    damageConfirmed: 27,
    utilityCases: 7,
    utilityConfirmed: 7,
    failures: 0,
  });
});

test('damage lab proves the reported player concerns through authoritative health changes', () => {
  const report = runAttackDamageLabReport();

  const fireflyBud = result(report, 'trait:firefly-colony:bud');
  const fireflyAdapted = result(report, 'trait:firefly-colony:adapted');
  const monarchBud = result(report, 'trait:monarch-brood:bud');
  const monarchAdapted = result(report, 'trait:monarch-brood:adapted');
  const batBud = result(report, 'trait:bat-ears:bud');
  const rushRake = result(report, 'starter:greg-rush-rake');

  for (const attack of [fireflyBud, fireflyAdapted, monarchBud, monarchAdapted, rushRake]) {
    assert.equal(attack.status, 'damage-confirmed', `${attack.name} must mutate authoritative enemy health`);
    assert.ok(attack.totalDamage > 0, `${attack.name} must deal real damage`);
    assert.ok(attack.hitCount > 0, `${attack.name} must hit at least one target`);
    assert.notEqual(attack.firstDamageTick, null, `${attack.name} must identify its first authoritative hit`);
  }

  assert.equal(batBud.totalDamage, 0, 'Bat Ears is intentionally mark-only, not secretly a damage trait');
  assert.equal(batBud.status, 'utility-confirmed');
  assert.ok(batBud.utilityEffectsObserved > 0, 'mark command mutates the real target status byte');
});

test('formatted damage proof report is concise enough for developer diagnostics', () => {
  const text = formatAttackDamageLabReport();
  assert.match(text, /Firefly Colony — Bud/);
  assert.match(text, /Monarch Brood — Adapted/);
  assert.match(text, /Greg’s Rush Rake/);
  assert.match(text, /0 failures/);
});
