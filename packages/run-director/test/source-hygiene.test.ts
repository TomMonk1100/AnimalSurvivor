/**
 * Source-hygiene test: scans src/ for forbidden non-deterministic / renderer /
 * network / timer usage. This file intentionally embeds the banned patterns as
 * DATA (regex sources); the lint script skips this file to avoid self-matching.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// dist/test -> package root
const pkgRoot = join(here, '..', '..');
const srcDir = join(pkgRoot, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const banned: Array<[string, RegExp]> = [
  ['Math.random', /Math\.random\s*\(/],
  ['Date.now', /Date\.now/],
  ['new Date', /\bnew\s+Date\b/],
  ['performance.now', /performance\.now/],
  ['process.hrtime', /process\.hrtime/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['canvas', /\bcanvas\b/i],
  ['webgl', /webgl/i],
  ['playcanvas', /playcanvas/i],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['node:fs', /node:fs/],
];

test('src/ contains no forbidden non-deterministic or renderer usage', () => {
  const files = walk(srcDir);
  assert.ok(files.length > 0, 'found source files to scan');
  const violations: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const [label, re] of banned) {
      if (re.test(text)) violations.push(`${f}: ${label}`);
    }
  }
  assert.deepEqual(violations, [], `no banned patterns:\n${violations.join('\n')}`);
});
