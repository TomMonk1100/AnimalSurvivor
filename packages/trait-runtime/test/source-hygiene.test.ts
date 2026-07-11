import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const srcDir = fileURLToPath(new URL('../../src', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const banned: Array<[string, RegExp]> = [
  ['Math.random()', /Math\.random\s*\(/],
  ['Date.now', /Date\.now/],
  ['performance.now', /performance\.now/],
  ['process.hrtime', /process\.hrtime/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['canvas', /\bcanvas\b/i],
  ['WebGL', /webgl/i],
  ['PlayCanvas', /playcanvas/i],
];

test('src/ contains no forbidden randomness, wall-clock, DOM, or renderer usage', () => {
  const files = walk(srcDir);
  assert.ok(files.length > 0, 'expected source files');
  const violations: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const [label, re] of banned) {
      if (re.test(text)) violations.push(`${f}: ${label}`);
    }
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});
