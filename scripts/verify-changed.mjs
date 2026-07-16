#!/usr/bin/env node
/* global console, process */
/**
 * Conservative changed-file verification planner for AnimalSurvivor.
 *
 * This is intentionally dependency-free. It only reads Git state to discover
 * files and invokes a fixed allow-list of existing npm scripts. A release gate
 * is always a recommendation here; this planner never quietly expands into a
 * full release run.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
export const WORKSPACE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function makeCommand(id, label, cwd, args) {
  return Object.freeze({
    id,
    label,
    cwd,
    executable: npmExecutable,
    args: Object.freeze(args),
    command: `npm ${args.join(' ')}`,
  });
}

export const COMMANDS = Object.freeze({
  simTypecheck: makeCommand('sim:typecheck', 'simulation typecheck', 'packages/sim', ['run', 'typecheck']),
  simLint: makeCommand('sim:lint', 'simulation lint', 'packages/sim', ['run', 'lint']),
  simTest: makeCommand('sim:test', 'simulation test', 'packages/sim', ['test']),
  traitTypecheck: makeCommand('trait-runtime:typecheck', 'trait runtime typecheck', 'packages/trait-runtime', ['run', 'typecheck']),
  traitLint: makeCommand('trait-runtime:lint', 'trait runtime lint', 'packages/trait-runtime', ['run', 'lint']),
  traitTest: makeCommand('trait-runtime:test', 'trait runtime test', 'packages/trait-runtime', ['test']),
  directorTypecheck: makeCommand('run-director:typecheck', 'run director typecheck', 'packages/run-director', ['run', 'typecheck']),
  directorLint: makeCommand('run-director:lint', 'run director lint', 'packages/run-director', ['run', 'lint']),
  directorTest: makeCommand('run-director:test', 'run director test', 'packages/run-director', ['test']),
  webTypecheck: makeCommand('web-toy:typecheck', 'web toy typecheck', 'apps/web-toy', ['run', 'typecheck']),
  webLint: makeCommand('web-toy:lint', 'web toy lint', 'apps/web-toy', ['run', 'lint']),
  webTest: makeCommand('web-toy:test', 'web toy test', 'apps/web-toy', ['test']),
  webAssets: makeCommand('web-toy:assets', 'web toy asset verification', 'apps/web-toy', ['run', 'verify:assets']),
  webVfxTextures: makeCommand('web-toy:vfx-textures', 'web toy VFX texture verification', 'apps/web-toy', ['run', 'verify:vfx-textures']),
  webContent: makeCommand('web-toy:content', 'web toy content verification', 'apps/web-toy', ['run', 'verify:content']),
  webBuild: makeCommand('web-toy:build', 'web toy build', 'apps/web-toy', ['run', 'build']),
  webArtifact: makeCommand('web-toy:artifact', 'web toy artifact verification', 'apps/web-toy', ['run', 'verify:artifact']),
  agentContracts: makeCommand('root:agent-contracts', 'agent harness contract verification', '.', ['run', 'verify:agent-contracts']),
});

const WEB_PREBUILD = Object.freeze([
  COMMANDS.webTypecheck,
  COMMANDS.webLint,
  COMMANDS.webTest,
]);

export const ROUTES = Object.freeze({
  sim: Object.freeze({
    label: 'deterministic simulation',
    commands: Object.freeze([COMMANDS.simTypecheck, COMMANDS.simLint, COMMANDS.simTest]),
  }),
  'trait-runtime': Object.freeze({
    label: 'deterministic trait runtime',
    commands: Object.freeze([COMMANDS.traitTypecheck, COMMANDS.traitLint, COMMANDS.traitTest]),
  }),
  'run-director': Object.freeze({
    label: 'deterministic run director',
    commands: Object.freeze([COMMANDS.directorTypecheck, COMMANDS.directorLint, COMMANDS.directorTest]),
  }),
  'web-toy': Object.freeze({
    label: 'web toy source or test',
    commands: Object.freeze([...WEB_PREBUILD, COMMANDS.webBuild]),
  }),
  'asset-vfx': Object.freeze({
    label: 'web toy asset or VFX',
    commands: Object.freeze([
      ...WEB_PREBUILD,
      COMMANDS.webAssets,
      COMMANDS.webVfxTextures,
      COMMANDS.webBuild,
      COMMANDS.webArtifact,
    ]),
  }),
  'release-content': Object.freeze({
    label: 'release, asset, or content verification',
    commands: Object.freeze([
      ...WEB_PREBUILD,
      COMMANDS.webAssets,
      COMMANDS.webVfxTextures,
      COMMANDS.webContent,
      COMMANDS.webBuild,
      COMMANDS.webArtifact,
    ]),
  }),
  tooling: Object.freeze({
    label: 'root tooling or CI',
    commands: Object.freeze([COMMANDS.agentContracts]),
  }),
  docs: Object.freeze({ label: 'documentation only', commands: Object.freeze([]) }),
  unknown: Object.freeze({ label: 'unknown or cross-package', commands: Object.freeze([]) }),
});

const ROUTE_ORDER = Object.freeze([
  'sim',
  'trait-runtime',
  'run-director',
  'web-toy',
  'asset-vfx',
  'release-content',
  'tooling',
  'docs',
  'unknown',
]);

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const VFX_SCRIPT_NAME = /(?:vfx|texture|flash|impact|signature|dissolve|bake-zone|repair)/i;

export const USAGE = `Usage: npm run verify:changed -- [options]

Options:
  --files <path,path>  Deterministic comma-separated repository-relative paths.
  --base <ref>         Diff the merge-base of <ref> and HEAD, plus untracked files.
  --dry-run            Print or report the plan without running any npm command.
  --json               Emit exactly one JSON report on stdout; command output goes to stderr.
  --help               Show this help.

Without --files or --base, Git staged, unstaged, and untracked paths are planned.
--files and --base are mutually exclusive. Mixed, unknown, root-tooling, and
lockfile changes recommend (but do not automatically run) npm run verify:release.`;

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(comparePaths);
}

export function normalizeChangedPath(value) {
  if (typeof value !== 'string') throw new TypeError('changed paths must be strings');
  let normalized = value.trim().replaceAll('\\', '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  normalized = normalized.replace(/\/{2,}/g, '/');
  return normalized;
}

function isSafeRepositoryRelativePath(path) {
  return path.length > 0
    && !path.startsWith('/')
    && !/^[A-Za-z]:\//.test(path)
    && !path.split('/').includes('..');
}

function isLockfile(path) {
  return LOCKFILE_NAMES.has(path.split('/').at(-1));
}

function isPackageManifest(path) {
  return path.split('/').at(-1) === 'package.json';
}

function isVfxScript(path) {
  if (!path.startsWith('apps/web-toy/scripts/')) return false;
  return VFX_SCRIPT_NAME.test(path.split('/').at(-1));
}

function isRootDocumentation(path) {
  return !path.includes('/') && /\.(?:md|mdx|txt)$/i.test(path);
}

export function classifyChangedPath(inputPath) {
  const path = normalizeChangedPath(inputPath);
  if (!isSafeRepositoryRelativePath(path)) return 'unknown';

  // Lockfiles have repository-wide dependency implications even when nested.
  if (isLockfile(path) || isPackageManifest(path)) return 'tooling';
  if (path.startsWith('scripts/') || path.startsWith('.github/')) return 'tooling';

  if (path === 'packages/sim' || path.startsWith('packages/sim/')) return 'sim';
  if (path === 'packages/trait-runtime' || path.startsWith('packages/trait-runtime/')) return 'trait-runtime';
  if (path === 'packages/run-director' || path.startsWith('packages/run-director/')) return 'run-director';

  // Release-facing source is stricter than ordinary web source.
  if (path.startsWith('apps/web-toy/src/release/')) return 'release-content';
  if (path.startsWith('apps/web-toy/src/') || path.startsWith('apps/web-toy/test/')) return 'web-toy';
  if (isVfxScript(path)) return 'asset-vfx';
  if (path.startsWith('apps/web-toy/scripts/')) return 'release-content';
  if (path.startsWith('apps/web-toy/assets/') || path.startsWith('apps/web-toy/public/')) return 'asset-vfx';
  if (path.startsWith('assets/')) return 'asset-vfx';

  if (path.startsWith('docs/') || isRootDocumentation(path)) return 'docs';
  return 'unknown';
}

export function parseExplicitFiles(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('--files requires one or more comma-separated paths');
  }
  const files = value.split(',').map((item) => normalizeChangedPath(item));
  if (files.some((path) => path.length === 0)) {
    throw new Error('--files cannot contain an empty path');
  }
  return uniqueSorted(files);
}

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseCliArgs(argv) {
  const options = { base: undefined, dryRun: false, files: undefined, help: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--files') {
      options.files = readOptionValue(argv, index, '--files');
      index += 1;
    } else if (argument.startsWith('--files=')) {
      options.files = argument.slice('--files='.length);
    } else if (argument === '--base') {
      options.base = readOptionValue(argv, index, '--base');
      index += 1;
    } else if (argument.startsWith('--base=')) {
      options.base = argument.slice('--base='.length);
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  if (options.files !== undefined && options.base !== undefined) {
    throw new Error('--files and --base are mutually exclusive');
  }
  if (options.base !== undefined && (options.base.length === 0 || options.base.startsWith('-'))) {
    throw new Error('--base must be a non-option Git ref');
  }
  return Object.freeze(options);
}

function readGitBytes(workspaceRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'buffer',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8').trim() : '';
    throw new Error(`could not read Git changes (${args.join(' ')}): ${detail || error.message}`);
  }
}

function pathsFromNullDelimited(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean).map(normalizeChangedPath);
}

function untrackedPaths(workspaceRoot) {
  return pathsFromNullDelimited(readGitBytes(workspaceRoot, ['ls-files', '--others', '--exclude-standard', '-z']));
}

/**
 * Reads only Git metadata and the worktree. It never updates refs, index, or
 * the worktree. The default includes staged, unstaged, and untracked paths.
 */
export function changedFilesFromGit(workspaceRoot, base) {
  const root = resolve(workspaceRoot);
  if (base === undefined) {
    // --no-renames retains both sides of a move, so relocating a deterministic
    // file into docs cannot accidentally look like a docs-only change.
    const unstaged = pathsFromNullDelimited(readGitBytes(root, ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z']));
    const staged = pathsFromNullDelimited(readGitBytes(root, ['diff', '--cached', '--no-ext-diff', '--no-renames', '--name-only', '-z']));
    return {
      files: uniqueSorted([...unstaged, ...staged, ...untrackedPaths(root)]),
      source: { kind: 'git-working-tree' },
    };
  }

  const mergeBase = readGitBytes(root, ['merge-base', base, 'HEAD']).toString('utf8').trim();
  if (mergeBase.length === 0) throw new Error(`could not resolve a merge base for ${base}`);
  const compared = pathsFromNullDelimited(readGitBytes(root, ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', mergeBase]));
  return {
    files: uniqueSorted([...compared, ...untrackedPaths(root)]),
    source: { kind: 'git-base', base, mergeBase },
  };
}

function publicCommand(command) {
  return {
    id: command.id,
    label: command.label,
    cwd: command.cwd,
    command: command.command,
  };
}

/**
 * Build a conservative plan from paths. It is exported so the harness test can
 * exercise every routing row without relying on a dirty worktree.
 */
export function buildVerificationPlan(inputFiles) {
  const files = uniqueSorted(inputFiles.map(normalizeChangedPath));
  const classifications = files.map((path) => ({ path, route: classifyChangedPath(path) }));
  const routesPresent = new Set(classifications.map((entry) => entry.route));
  const routes = ROUTE_ORDER.filter((route) => routesPresent.has(route));
  const commandIds = new Set();
  for (const route of routes) {
    for (const command of ROUTES[route].commands) {
      commandIds.add(command.id);
    }
  }
  // Catalog order keeps web evidence in its useful sequence even for a mixed
  // diff (typecheck/lint/test, asset/content evidence, build, artifact).
  const commands = Object.values(COMMANDS)
    .filter((command) => commandIds.has(command.id))
    .map(publicCommand);

  const releaseReasons = [];
  if (routes.includes('unknown')) releaseReasons.push('one or more paths are unknown to the frozen routing table');
  if (routes.includes('tooling')) releaseReasons.push('root tooling, CI, package metadata, or a lockfile changed');
  if (routes.length > 1) releaseReasons.push(`the change spans multiple routing classes: ${routes.join(', ')}`);

  return {
    files,
    classifications,
    routes,
    commands,
    recommendations: releaseReasons.length === 0
      ? []
      : [{ command: 'npm run verify:release', reason: releaseReasons.join('; ') }],
    documentationReview: routes.length === 1 && routes[0] === 'docs',
    releaseRecommended: releaseReasons.length > 0,
  };
}

export function makeVerificationReport(changeSet, { dryRun = false } = {}) {
  const plan = buildVerificationPlan(changeSet.files);
  return {
    schemaVersion: 1,
    status: dryRun ? 'dry-run' : 'planned',
    dryRun,
    executed: false,
    source: changeSet.source,
    ...plan,
    results: [],
  };
}

function renderHumanPlan(report) {
  const source = report.source.kind === 'git-base'
    ? `Git merge-base diff from ${report.source.base} (${report.source.mergeBase}) plus untracked files`
    : report.source.kind === 'explicit-files'
      ? 'explicit --files list'
      : 'Git staged, unstaged, and untracked files';
  console.log(`\n[verify-changed] source: ${source}`);
  console.log(`[verify-changed] changed files (${report.files.length}):`);
  if (report.files.length === 0) console.log('  (none)');
  for (const file of report.files) console.log(`  - ${file}`);
  console.log(`[verify-changed] routes: ${report.routes.length > 0 ? report.routes.join(', ') : '(none)'}`);
  if (report.commands.length > 0) {
    console.log('[verify-changed] selected commands:');
    for (const command of report.commands) console.log(`  - (${command.cwd}) ${command.command}`);
  } else {
    console.log('[verify-changed] selected commands: (none)');
  }
  if (report.documentationReview) {
    console.log('[verify-changed] documentation review is required; no package command is selected.');
  }
  for (const recommendation of report.recommendations) {
    console.log(`[verify-changed] recommended: ${recommendation.command} (${recommendation.reason})`);
  }
  if (report.dryRun) console.log('[verify-changed] dry run: no commands were executed.');
}

function writeChildOutputToStderr(result) {
  for (const output of [result.stdout, result.stderr]) {
    if (typeof output === 'string' && output.length > 0) process.stderr.write(output);
    else if (Buffer.isBuffer(output) && output.length > 0) process.stderr.write(output);
  }
}

function executeCommand(command, workspaceRoot, jsonMode) {
  const result = spawnSync(command.executable, command.args, {
    cwd: resolve(workspaceRoot, command.cwd),
    encoding: jsonMode ? 'utf8' : undefined,
    stdio: jsonMode ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (jsonMode) writeChildOutputToStderr(result);
  const status = typeof result.status === 'number' ? result.status : 1;
  return {
    id: command.id,
    cwd: command.cwd,
    command: command.command,
    status,
    ...(result.signal ? { signal: result.signal } : {}),
    ...(result.error ? { error: result.error.message } : {}),
  };
}

export function executeVerificationPlan(report, workspaceRoot, { json = false } = {}) {
  const results = [];
  for (const command of report.commands) {
    if (!json) console.log(`\n[verify-changed] running (${command.cwd}) ${command.command}`);
    const commandDefinition = Object.values(COMMANDS).find((candidate) => candidate.id === command.id);
    if (!commandDefinition) throw new Error(`selected command is not in the allow-list: ${command.id}`);
    const result = executeCommand(commandDefinition, workspaceRoot, json);
    results.push(result);
    if (result.status !== 0) {
      return { results, status: 'failed', exitCode: result.status };
    }
  }
  return { results, status: 'passed', exitCode: 0 };
}

export function runVerifyChanged({ argv = process.argv.slice(2), workspaceRoot = WORKSPACE_ROOT } = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const changeSet = options.files === undefined
    ? changedFilesFromGit(workspaceRoot, options.base)
    : { files: parseExplicitFiles(options.files), source: { kind: 'explicit-files' } };
  const report = makeVerificationReport(changeSet, { dryRun: options.dryRun });

  if (!options.json) renderHumanPlan(report);
  if (options.dryRun) {
    if (options.json) console.log(JSON.stringify(report));
    return 0;
  }

  const execution = executeVerificationPlan(report, workspaceRoot, { json: options.json });
  report.executed = true;
  report.status = execution.status;
  report.results = execution.results;
  if (options.json) {
    console.log(JSON.stringify(report));
  } else if (execution.status === 'passed') {
    console.log('\n[verify-changed] selected verification commands passed.');
  } else {
    console.error(`\n[verify-changed] command failed with exit ${execution.exitCode}.`);
  }
  return execution.exitCode;
}

function isEntrypoint() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath;
}

if (isEntrypoint()) {
  try {
    process.exitCode = runVerifyChanged();
  } catch (error) {
    console.error(`[verify-changed] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
