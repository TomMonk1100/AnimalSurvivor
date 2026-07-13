/* global console */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const distRoot = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const manifestName = 'dist-manifest.json';

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function filesUnder(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesUnder(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function fail(message) {
  throw new Error(`[verify-dist] ${message}`);
}

const buildInfoPath = join(distRoot, 'build-info.json');
const indexPath = join(distRoot, 'index.html');
const assetManifestPath = join(distRoot, 'asset-manifest.json');
for (const path of [buildInfoPath, indexPath, assetManifestPath]) {
  try {
    statSync(path);
  } catch {
    fail(`missing required artifact file: ${relative(distRoot, path)}`);
  }
}

const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
for (const field of [
  'product',
  'version',
  'buildId',
  'commitSha',
  'buildTimestamp',
  'contentFingerprint',
  'assetManifestHash',
  'deploymentBaseUrl',
]) {
  if (typeof buildInfo[field] !== 'string' || buildInfo[field].length === 0) {
    fail(`build-info.json has no usable ${field}`);
  }
}
if (buildInfo.product !== 'AnimalSurvivor') fail(`unexpected product ${buildInfo.product}`);
const assetManifest = JSON.parse(readFileSync(assetManifestPath, 'utf8'));
if (!Array.isArray(assetManifest.files) || assetManifest.files.length === 0) {
  fail('asset-manifest.json contains no source asset records');
}
if (sha256(JSON.stringify(assetManifest)) !== buildInfo.assetManifestHash) {
  fail('asset-manifest.json does not match build-info.json assetManifestHash');
}

const indexHtml = readFileSync(indexPath, 'utf8');
if (!indexHtml.includes(`Animal Survivor — Wildguard · ${buildInfo.buildId}`)) {
  fail('index.html title does not identify the same buildId as build-info.json');
}
if (!indexHtml.includes(`name="animal-survivor-build-id" content="${buildInfo.buildId}"`)) {
  fail('index.html build meta does not identify the same buildId as build-info.json');
}

const files = filesUnder(distRoot)
  .filter((path) => relative(distRoot, path) !== manifestName)
  .map((path) => {
    const contents = readFileSync(path);
    return {
      path: relative(distRoot, path).split('\\').join('/'),
      bytes: contents.byteLength,
      sha256: sha256(contents),
    };
  });

const distManifest = {
  schemaVersion: 1,
  product: 'AnimalSurvivor',
  buildId: buildInfo.buildId,
  generatedAt: new Date().toISOString(),
  // The manifest intentionally excludes itself because a file cannot contain
  // its own hash without a recursive hash definition.
  files,
};
writeFileSync(join(distRoot, manifestName), `${JSON.stringify(distManifest, null, 2)}\n`);
console.log(`[verify-dist] ${files.length} files hashed for ${buildInfo.buildId}`);
