#!/usr/bin/env node
/* global console, process */
/** Deterministic self-tests for the dependency-free Agent Harness scripts. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildVerificationPlan,
  parseCliArgs as parseChangedArgs,
  parseExplicitFiles,
} from './verify-changed.mjs';
import {
  DETERMINISTIC_PACKAGES,
  extractModuleSpecifiers,
  verifyAgentContracts,
} from './verify-agent-contracts.mjs';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const verifyChangedPath = resolve(workspaceRoot, 'scripts/verify-changed.mjs');
const verifyContractsPath = resolve(workspaceRoot, 'scripts/verify-agent-contracts.mjs');

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function commandIds(plan) {
  return plan.commands.map((command) => command.id);
}

function assertReleaseRecommendation(plan) {
  assert.equal(plan.releaseRecommended, true);
  assert.deepEqual(plan.recommendations.map((recommendation) => recommendation.command), ['npm run verify:release']);
}

function assertNoReleaseRecommendation(plan) {
  assert.equal(plan.releaseRecommended, false);
  assert.deepEqual(plan.recommendations, []);
}

test('routes each deterministic package to its exact local gates', () => {
  assert.deepEqual(commandIds(buildVerificationPlan(['packages/sim/src/simulation.ts'])), [
    'sim:typecheck', 'sim:lint', 'sim:test',
  ]);
  assert.deepEqual(commandIds(buildVerificationPlan(['packages/trait-runtime/src/index.ts'])), [
    'trait-runtime:typecheck', 'trait-runtime:lint', 'trait-runtime:test',
  ]);
  assert.deepEqual(commandIds(buildVerificationPlan(['packages/run-director/test/director.test.ts'])), [
    'run-director:typecheck', 'run-director:lint', 'run-director:test',
  ]);
});

test('routes web source and tests to the bounded web gate', () => {
  const plan = buildVerificationPlan(['apps/web-toy/src/app.ts', 'apps/web-toy/test/driver.test.ts']);
  assert.deepEqual(commandIds(plan), [
    'web-toy:typecheck', 'web-toy:lint', 'web-toy:test', 'web-toy:build',
  ]);
  assertNoReleaseRecommendation(plan);
});

test('routes assets and VFX scripts to asset, texture, build, and artifact gates', () => {
  const assetPlan = buildVerificationPlan(['assets/ui/vfx/wildguard-melee-frames-v3.png']);
  const vfxPlan = buildVerificationPlan(['apps/web-toy/scripts/vfx-capture.mjs']);
  const expected = [
    'web-toy:typecheck', 'web-toy:lint', 'web-toy:test',
    'web-toy:assets', 'web-toy:vfx-textures', 'web-toy:build', 'web-toy:artifact',
  ];
  assert.deepEqual(commandIds(assetPlan), expected);
  assert.deepEqual(commandIds(vfxPlan), expected);
  assertNoReleaseRecommendation(assetPlan);
  assertNoReleaseRecommendation(vfxPlan);
});

test('routes release, asset, and content verification scripts through content evidence too', () => {
  const plan = buildVerificationPlan(['apps/web-toy/scripts/verify-assets.mjs']);
  assert.deepEqual(commandIds(plan), [
    'web-toy:typecheck', 'web-toy:lint', 'web-toy:test',
    'web-toy:assets', 'web-toy:vfx-textures', 'web-toy:content',
    'web-toy:build', 'web-toy:artifact',
  ]);
  assertNoReleaseRecommendation(plan);
});

test('routes repository manifests, root tooling, and lockfiles through contracts plus a release recommendation', () => {
  for (const path of [
    'scripts/verify-release.mjs',
    'packages/sim/package-lock.json',
    'apps/web-toy/package.json',
    '.github/workflows/verify.yml',
  ]) {
    const plan = buildVerificationPlan([path]);
    assert.deepEqual(commandIds(plan), ['root:agent-contracts']);
    assertReleaseRecommendation(plan);
  }
});

test('leaves documentation-only changes command-free but calls out review', () => {
  const plan = buildVerificationPlan(['docs/automation/change-gates.md', 'AGENTS.md']);
  assert.deepEqual(commandIds(plan), []);
  assert.equal(plan.documentationReview, true);
  assertNoReleaseRecommendation(plan);
});

test('never under-tests mixed or unknown paths', () => {
  const mixed = buildVerificationPlan(['packages/sim/src/simulation.ts', 'packages/trait-runtime/src/index.ts']);
  assert.deepEqual(commandIds(mixed), [
    'sim:typecheck', 'sim:lint', 'sim:test',
    'trait-runtime:typecheck', 'trait-runtime:lint', 'trait-runtime:test',
  ]);
  assertReleaseRecommendation(mixed);

  const unknown = buildVerificationPlan(['experimental/unmapped-file.ts']);
  assert.deepEqual(commandIds(unknown), []);
  assertReleaseRecommendation(unknown);
});

test('parses explicit files deterministically and rejects ambiguous source selection', () => {
  assert.deepEqual(
    parseExplicitFiles('./packages/sim/src/simulation.ts,apps\\web-toy\\src\\app.ts,packages/sim/src/simulation.ts'),
    ['apps/web-toy/src/app.ts', 'packages/sim/src/simulation.ts'],
  );
  assert.throws(() => parseChangedArgs(['--files', 'docs/a.md', '--base', 'main']), /mutually exclusive/);
  assert.throws(() => parseExplicitFiles('docs/a.md,,docs/b.md'), /empty path/);
});

test('emits one machine-readable dry-run report without reading the worktree', () => {
  const result = spawnSync(process.execPath, [
    verifyChangedPath,
    '--files', 'packages/sim/src/simulation.ts',
    '--dry-run',
    '--json',
  ], { cwd: workspaceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'dry-run');
  assert.equal(report.source.kind, 'explicit-files');
  assert.deepEqual(report.commands.map((command) => command.id), ['sim:typecheck', 'sim:lint', 'sim:test']);
});

function writeFixtureFile(root, relativePath, content) {
  const file = resolve(root, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

function createContractFixture() {
  const root = mkdtempSync(join(tmpdir(), 'animal-survivor-agent-harness-'));
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md', 'docs/automation/agent-harness-contract.md']) {
    writeFixtureFile(root, file, '# fixture\n');
  }
  for (const packagePath of DETERMINISTIC_PACKAGES) {
    writeFixtureFile(root, `${packagePath}/src/index.ts`, 'export const deterministic = true;\n');
    writeFixtureFile(root, `${packagePath}/test/basic.test.ts`, "import '../src/index.js';\n");
  }
  return root;
}

test('checks fixtures through --root without changing repository source', () => {
  const fixtureRoot = createContractFixture();
  try {
    const passing = verifyAgentContracts({ root: fixtureRoot });
    assert.deepEqual(passing.errors, []);

    writeFixtureFile(fixtureRoot, 'packages/sim/src/comment.ts', "// import 'playcanvas' is prose, not a module declaration.\nexport const comment = true;\n");
    assert.deepEqual(verifyAgentContracts({ root: fixtureRoot }).errors, []);

    writeFixtureFile(fixtureRoot, 'packages/sim/src/presentation-leak.ts', "import 'playcanvas';\n");
    const forbidden = verifyAgentContracts({ root: fixtureRoot });
    assert.ok(forbidden.errors.some((error) => error.includes('forbidden presentation module "playcanvas"')));

    writeFixtureFile(fixtureRoot, 'packages/sim/src/presentation-leak.ts', "import '../test/only-test.js';\n");
    const escapedSource = verifyAgentContracts({ root: fixtureRoot });
    assert.ok(escapedSource.errors.some((error) => error.includes('outside its allowed source/test roots')));

    writeFixtureFile(fixtureRoot, 'packages/trait-runtime/test/escaped.test.ts', "import '../../../apps/web-toy/src/app.js';\n");
    const escapedTest = verifyAgentContracts({ root: fixtureRoot });
    assert.ok(escapedTest.errors.some((error) => error.includes('outside its allowed source/test roots')));

    const cli = spawnSync(process.execPath, [verifyContractsPath, '--root', fixtureRoot, '--json'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    assert.equal(cli.status, 1);
    const report = JSON.parse(cli.stdout);
    assert.equal(report.status, 'failed');
    assert.ok(report.errors.length > 0);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test('extracts real module specifiers without matching prose or quoted examples', () => {
  const source = [
    "// import 'playcanvas' should remain prose.",
    'const example = "export * from \'three\'";',
    "import type { Value } from './value.js';",
    "export { Value } from './value.js';",
    "const lazy = import('node:fs');",
  ].join('\n');
  assert.deepEqual(extractModuleSpecifiers(source), ['./value.js', './value.js', 'node:fs']);
});

test('current repository satisfies the stable harness contract', () => {
  const report = verifyAgentContracts({ root: workspaceRoot });
  assert.deepEqual(report.errors, []);
});

let passed = 0;
for (const { name, callback } of tests) {
  try {
    callback();
    passed += 1;
    console.log(`[test-agent-harness] ok - ${name}`);
  } catch (error) {
    console.error(`[test-agent-harness] not ok - ${name}`);
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode !== 1) {
  console.log(`[test-agent-harness] ${passed}/${tests.length} checks passed`);
}
