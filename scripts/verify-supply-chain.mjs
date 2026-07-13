/* global console, process */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const lockfiles = [
  'spikes/headless-sim/package-lock.json',
  'packages/trait-runtime/package-lock.json',
  'packages/run-director/package-lock.json',
  'apps/web-toy/package-lock.json',
];

function fail(message) {
  throw new Error(`[verify-supply-chain] ${message}`);
}

function main() {
  let totalPackages = 0;
  const licenses = new Set();
  for (const relativePath of lockfiles) {
    let lock;
    try {
      lock = JSON.parse(readFileSync(resolve(workspaceRoot, relativePath), 'utf8'));
    } catch (error) {
      fail(`could not read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (lock.lockfileVersion !== 3) fail(`${relativePath} must use npm lockfileVersion 3`);
    const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path !== '');
    for (const [path, entry] of entries) {
      if (typeof entry !== 'object' || entry === null) fail(`${relativePath}:${path} is not a package record`);
      for (const field of ['version', 'resolved', 'integrity', 'license']) {
        if (typeof entry[field] !== 'string' || entry[field].length === 0) {
          fail(`${relativePath}:${path} is missing ${field} metadata`);
        }
      }
      licenses.add(entry.license);
    }
    totalPackages += entries.length;
    console.log(`[verify-supply-chain] ${relativePath}: ${entries.length} locked packages with integrity and license metadata`);
  }
  console.log(`[verify-supply-chain] ${totalPackages} package records checked; licenses=${[...licenses].sort().join(', ')}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
