#!/usr/bin/env node
/**
 * LEAD-OWNED minimal lint: enforces determinism and renderer-free rules
 * without adding a runtime/dev dependency.
 *
 * Rules (src/ only; bench/ may use timers for measurement):
 *  1. No Math.random anywhere in src/ or test/.
 *  2. No Date.now / performance.now / setTimeout / setInterval in src/.
 *  3. No DOM/render globals (document, window, canvas, WebGL) in src/.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
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
  /Math\.random/,
  /Date\.now/,
  /performance\.now/,
  /setTimeout/,
  /setInterval/,
  /\bdocument\b/,
  /\bwindow\b/,
  /\bcanvas\b/i,
  /webgl/i,
];

for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  for (const re of srcBanned) {
    if (re.test(text)) errors.push(`${f}: banned pattern ${re}`);
  }
}

for (const f of testFiles) {
  const text = readFileSync(f, 'utf8');
  // Tests may reference the string when asserting the rule, but not call it.
  if (/Math\.random\s*\(/.test(text)) errors.push(`${f}: Math.random() call`);
}

if (errors.length > 0) {
  console.error('LINT FAILED');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`lint ok (${srcFiles.length} src files, ${testFiles.length} test files)`);
