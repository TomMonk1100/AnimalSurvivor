#!/usr/bin/env node
/**
 * LEAD-OWNED minimal lint: enforces determinism and renderer-free rules with
 * zero dev dependencies.
 *
 * Rules for src/:
 *  1. No Math.random (any hidden RNG construction). rng.ts uses only Math.imul
 *     and integer ops, never Math.random.
 *  2. No wall-clock/time APIs: Date.now, performance.now, process.hrtime, new Date.
 *  3. No timers: setTimeout, setInterval, setImmediate, queueMicrotask.
 *  4. No async scheduling primitives that leak into gameplay: Promise, await.
 *  5. No DOM / render globals: document, window, canvas, WebGL, PlayCanvas.
 *  6. No network: fetch, XMLHttpRequest, WebSocket.
 *  7. No filesystem in runtime source: node:fs, require('fs').
 *
 * bench/ is exempt from timer/time rules (it measures wall time by design).
 * test/ may reference banned patterns as string data when asserting the rules,
 * but must never actually call Math.random().
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const srcFiles = walk(join(root, 'src'));
const testFiles = walk(join(root, 'test'));

const errors = [];

const srcBanned = [
  /Math\.random\s*\(/,
  /Date\.now/,
  /\bnew\s+Date\b/,
  /performance\.now/,
  /process\.hrtime/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bsetImmediate\b/,
  /\bqueueMicrotask\b/,
  /\bPromise\b/,
  /\bawait\b/,
  /\bdocument\b/,
  /\bwindow\b/,
  /\bcanvas\b/i,
  /webgl/i,
  /playcanvas/i,
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /node:fs/,
  /require\(\s*['"]fs['"]\s*\)/,
];

for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  for (const re of srcBanned) {
    if (re.test(text)) errors.push(`${f}: banned pattern ${re}`);
  }
}

for (const f of testFiles) {
  // The source-hygiene test intentionally embeds the banned patterns as data
  // (it scans src/ for them); skip it to avoid a self-referential false match.
  if (f.endsWith('source-hygiene.test.ts')) continue;
  const text = readFileSync(f, 'utf8');
  if (/Math\.random\s*\(/.test(text)) errors.push(`${f}: Math.random() call`);
}

if (errors.length > 0) {
  console.error('LINT FAILED');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`lint ok (${srcFiles.length} src files, ${testFiles.length} test files)`);
