#!/usr/bin/env node
/**
 * LEAD-OWNED minimal lint: enforces determinism and renderer-free rules with
 * zero dev dependencies.
 *
 * Rules:
 *  1. No Math.random anywhere in src/ or test/ (Math.imul etc. are allowed;
 *     rng.ts legitimately divides by a constant but never calls Math.random).
 *  2. No Date.now / performance.now / setTimeout / setInterval / hrtime in src/.
 *  3. No DOM / render globals (document, window, canvas, WebGL, PlayCanvas) in src/.
 *  4. bench/ is exempt from timer rules (it measures wall time by design).
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
  /performance\.now/,
  /process\.hrtime/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bdocument\b/,
  /\bwindow\b/,
  /\bcanvas\b/i,
  /webgl/i,
  /playcanvas/i,
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
  // Tests may reference "Math.random" as a string when asserting the rule,
  // but must never actually call it.
  if (/Math\.random\s*\(/.test(text)) errors.push(`${f}: Math.random() call`);
}

if (errors.length > 0) {
  console.error('LINT FAILED');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`lint ok (${srcFiles.length} src files, ${testFiles.length} test files)`);
