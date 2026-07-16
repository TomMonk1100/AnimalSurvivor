#!/usr/bin/env node
/* global console, process */
/**
 * Small, dependency-free architecture guard for the Agent Harness.
 *
 * Package linters remain responsible for determinism rules. This script checks
 * the stable repository-level contract: the canonical handbook exists, and
 * deterministic package source/tests do not cross into presentation code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
export const WORKSPACE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const REQUIRED_HARNESS_FILES = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'REVIEW.md',
  'docs/automation/agent-harness-contract.md',
]);

export const DETERMINISTIC_PACKAGES = Object.freeze([
  'packages/sim',
  'packages/trait-runtime',
  'packages/run-director',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.cts']);

// These are intentionally exact module-name prefixes, not broad text rules.
// Existing package linters remain the authority for DOM/global/API restrictions.
const PRESENTATION_IMPORT_PREFIXES = Object.freeze([
  'apps/web-toy',
  '@animalsurvivor/web-toy',
  '@animal-survivor/web-toy',
  '@animalsurvivor/presentation',
  '@animal-survivor/presentation',
  'web-toy',
  'playcanvas',
  '@playcanvas',
  'three',
  'pixi.js',
  '@pixi',
  'babylonjs',
  'phaser',
  'react',
  'react-dom',
  'preact',
  'vue',
  'svelte',
  'vite',
]);

export const USAGE = `Usage: npm run verify:agent-contracts -- [options]

Options:
  --root <path>  Check a repository root or temporary fixture (default: this repository).
  --json         Emit exactly one JSON report on stdout.
  --help         Show this help.

The command reads files only. --root exists so fixture tests can demonstrate
failures without modifying repository source.`;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function displayPath(root, path) {
  const displayed = relative(root, path).replaceAll('\\', '/');
  return displayed.length > 0 ? displayed : '.';
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ''
    || (!pathFromRoot.startsWith('../')
      && !pathFromRoot.startsWith('..\\')
      && pathFromRoot !== '..'
      && !isAbsolute(pathFromRoot));
}

function listCodeFiles(root) {
  if (!isDirectory(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === '.git') continue;
        pending.push(path);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        files.push(path);
      }
    }
  }
  return files.sort(compareStrings);
}

/**
 * Tokenize enough JavaScript/TypeScript to find module declarations while
 * intentionally skipping comments and ordinary strings. This avoids treating
 * a prose mention such as "import 'playcanvas'" as an architecture violation.
 */
function tokenizeModuleSyntax(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index = Math.min(source.length, index + 2);
      continue;
    }
    if (character === '\'' || character === '"') {
      const quote = character;
      let value = '';
      index += 1;
      while (index < source.length) {
        const next = source[index];
        if (next === '\\') {
          if (index + 1 < source.length) value += source[index + 1];
          index += 2;
          continue;
        }
        if (next === quote) {
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }
    if (character === '`') {
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === '`') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let value = character;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ type: 'identifier', value });
      continue;
    }
    tokens.push({ type: 'punctuation', value: character });
    index += 1;
  }
  return tokens;
}

function findFromSpecifier(tokens, startIndex) {
  let nesting = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'punctuation') {
      if (token.value === ';' && nesting === 0) return undefined;
      if (token.value === '(' || token.value === '{' || token.value === '[') nesting += 1;
      if (token.value === ')' || token.value === '}' || token.value === ']') nesting = Math.max(0, nesting - 1);
      continue;
    }
    if (nesting === 0 && token.type === 'identifier' && (token.value === 'import' || token.value === 'export')) {
      return undefined;
    }
    if (token.type === 'identifier' && token.value === 'from' && tokens[index + 1]?.type === 'string') {
      return tokens[index + 1].value;
    }
  }
  return undefined;
}

/** Exported for fixture coverage; it is not a general-purpose TypeScript parser. */
export function extractModuleSpecifiers(source) {
  const tokens = tokenizeModuleSyntax(source);
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier') continue;
    if (token.value === 'import') {
      const next = tokens[index + 1];
      if (next?.type === 'string') {
        specifiers.push(next.value);
        continue;
      }
      if (next?.type === 'punctuation' && next.value === '(' && tokens[index + 2]?.type === 'string') {
        specifiers.push(tokens[index + 2].value);
        continue;
      }
      const specifier = findFromSpecifier(tokens, index + 1);
      if (specifier !== undefined) specifiers.push(specifier);
    } else if (token.value === 'export') {
      const specifier = findFromSpecifier(tokens, index + 1);
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function matchesPresentationModule(specifier) {
  return PRESENTATION_IMPORT_PREFIXES.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`));
}

function isRelativeModuleSpecifier(specifier) {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

function isUnsafeAbsoluteSpecifier(specifier) {
  return isAbsolute(specifier) || /^[A-Za-z]:[\\/]/.test(specifier) || specifier.startsWith('file:');
}

function checkModuleSpecifier({ allowedRoots, errors, file, packageName, root, scope, specifier }) {
  const location = `${displayPath(root, file)} (${packageName}/${scope})`;
  if (matchesPresentationModule(specifier)) {
    errors.push(`${location} imports forbidden presentation module ${JSON.stringify(specifier)}`);
    return;
  }
  if (isUnsafeAbsoluteSpecifier(specifier)) {
    errors.push(`${location} imports unsafe absolute module path ${JSON.stringify(specifier)}`);
    return;
  }
  if (!isRelativeModuleSpecifier(specifier)) return;

  const target = resolve(dirname(file), specifier);
  if (!allowedRoots.some((allowedRoot) => isWithin(allowedRoot, target))) {
    errors.push(`${location} imports ${JSON.stringify(specifier)} outside its allowed source/test roots`);
  }
}

function checkDeterministicPackage(root, packageRelativePath, errors, checkedFiles) {
  const packageRoot = resolve(root, packageRelativePath);
  const packageName = packageRelativePath.split('/').at(-1);
  const sourceRoot = resolve(packageRoot, 'src');
  const testRoot = resolve(packageRoot, 'test');
  if (!isDirectory(sourceRoot)) {
    errors.push(`${packageRelativePath} is missing its required src directory`);
    return;
  }

  const scopes = [
    { name: 'src', directory: sourceRoot, allowedRoots: [sourceRoot] },
    { name: 'test', directory: testRoot, allowedRoots: [sourceRoot, testRoot] },
  ];
  for (const scope of scopes) {
    const files = listCodeFiles(scope.directory);
    if (scope.name === 'src' && files.length === 0) {
      errors.push(`${packageRelativePath}/src contains no source files`);
    }
    for (const file of files) {
      checkedFiles.push(displayPath(root, file));
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractModuleSpecifiers(source)) {
        checkModuleSpecifier({
          allowedRoots: scope.allowedRoots,
          errors,
          file,
          packageName,
          root,
          scope: scope.name,
          specifier,
        });
      }
    }
  }
}

/**
 * Return errors instead of exiting so the self-test can inspect temporary
 * fixtures. The verifier itself never writes to `root`.
 */
export function verifyAgentContracts({ root = WORKSPACE_ROOT } = {}) {
  const resolvedRoot = resolve(root);
  const errors = [];
  const checkedFiles = [];
  for (const requiredFile of REQUIRED_HARNESS_FILES) {
    if (!isFile(resolve(resolvedRoot, requiredFile))) {
      errors.push(`missing required harness file: ${requiredFile}`);
    }
  }
  for (const packageRelativePath of DETERMINISTIC_PACKAGES) {
    checkDeterministicPackage(resolvedRoot, packageRelativePath, errors, checkedFiles);
  }
  return {
    schemaVersion: 1,
    root: resolvedRoot,
    checkedFiles: checkedFiles.sort(compareStrings),
    errors: errors.sort(compareStrings),
  };
}

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a path`);
  return value;
}

export function parseCliArgs(argv) {
  const options = { help: false, json: false, root: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--root') {
      options.root = readOptionValue(argv, index, '--root');
      index += 1;
    } else if (argument.startsWith('--root=')) {
      options.root = argument.slice('--root='.length);
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  return Object.freeze(options);
}

export function runVerifyAgentContracts({ argv = process.argv.slice(2), cwd = process.cwd() } = {}) {
  const options = parseCliArgs(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const root = options.root === undefined ? WORKSPACE_ROOT : resolve(cwd, options.root);
  const report = verifyAgentContracts({ root });
  const passed = report.errors.length === 0;
  if (options.json) {
    console.log(JSON.stringify({ ...report, status: passed ? 'passed' : 'failed' }));
  } else if (passed) {
    console.log(`[verify-agent-contracts] passed (${report.checkedFiles.length} deterministic source/test files checked)`);
  } else {
    console.error(`[verify-agent-contracts] failed (${report.errors.length} violation${report.errors.length === 1 ? '' : 's'})`);
    for (const error of report.errors) console.error(`  - ${error}`);
  }
  return passed ? 0 : 1;
}

function isEntrypoint() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath;
}

if (isEntrypoint()) {
  try {
    process.exitCode = runVerifyAgentContracts();
  } catch (error) {
    console.error(`[verify-agent-contracts] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
