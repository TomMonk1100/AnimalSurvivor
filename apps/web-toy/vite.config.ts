/// <reference types="vitest" />
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

interface BuildInfo {
  readonly schemaVersion: 1;
  readonly product: 'AnimalSurvivor';
  readonly version: string;
  readonly buildId: string;
  readonly commitSha: string;
  readonly sourceState: 'clean' | 'dirty' | 'unknown';
  readonly buildTimestamp: string;
  readonly contentFingerprint: string;
  readonly assetManifestHash: string;
  readonly deploymentBaseUrl: string;
}

interface SourceFileRecord {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/**
 * The accepted simulation is imported through the `@sim` alias only. Its source
 * uses NodeNext-style `.js` import specifiers; Vite/esbuild resolves those to
 * the sibling `.ts` files automatically, so no simulation source is copied.
 */
const simEntry = fileURLToPath(new URL('../../spikes/headless-sim/src/index.ts', import.meta.url));
const traitsEntry = fileURLToPath(new URL('../../packages/trait-runtime/src/index.ts', import.meta.url));
const directorEntry = fileURLToPath(new URL('../../packages/run-director/src/index.ts', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function filesUnder(root: string): SourceFileRecord[] {
  const records: SourceFileRecord[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const contents = readFileSync(absolutePath);
      records.push({
        path: relative(workspaceRoot, absolutePath).split('\\').join('/'),
        bytes: contents.byteLength,
        sha256: sha256(contents),
      });
    }
  }
  visit(root);
  return records;
}

function hashManifest(records: readonly SourceFileRecord[]): string {
  return sha256(JSON.stringify(records));
}

function gitValue(args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

function createBuildIdentity(): { readonly info: BuildInfo; readonly assetManifest: object } {
  const packageJson = JSON.parse(readFileSync(join(workspaceRoot, 'apps/web-toy/package.json'), 'utf8')) as { version?: string };
  const commitSha = gitValue(['rev-parse', 'HEAD']) ?? process.env.GITHUB_SHA ?? 'unknown';
  const gitStatus = commitSha === 'unknown' ? null : gitValue(['status', '--porcelain']);
  const sourceState: BuildInfo['sourceState'] = commitSha === 'unknown'
    ? 'unknown'
    : gitStatus === null ? 'unknown' : gitStatus === '' ? 'clean' : 'dirty';
  const buildTimestamp = process.env.ANIMAL_SURVIVOR_BUILD_TIMESTAMP
    ?? (process.env.SOURCE_DATE_EPOCH
      ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
      : new Date().toISOString());
  const contentFiles = [
    ...filesUnder(join(workspaceRoot, 'spikes/headless-sim/src')),
    ...filesUnder(join(workspaceRoot, 'packages/trait-runtime/src')),
    ...filesUnder(join(workspaceRoot, 'packages/run-director/src')),
  ];
  const assetFiles = filesUnder(join(workspaceRoot, 'assets'));
  const contentFingerprint = hashManifest(contentFiles);
  const assetManifest = {
    schemaVersion: 1,
    kind: 'source-asset-manifest',
    files: assetFiles,
  } as const;
  const assetManifestHash = sha256(JSON.stringify(assetManifest));
  const version = packageJson.version ?? '0.0.0';
  const shortCommit = commitSha === 'unknown' ? 'nogit' : commitSha.slice(0, 12);
  const buildId = `${version}+${shortCommit}.${contentFingerprint.slice(0, 8)}.${assetManifestHash.slice(0, 8)}`;
  return {
    info: {
      schemaVersion: 1,
      product: 'AnimalSurvivor',
      version,
      buildId,
      commitSha,
      sourceState,
      buildTimestamp,
      contentFingerprint,
      assetManifestHash,
      deploymentBaseUrl: process.env.ANIMAL_SURVIVOR_DEPLOYMENT_BASE_URL ?? './',
    },
    assetManifest,
  };
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function buildIdentityPlugin(buildInfo: BuildInfo, assetManifest: object) {
  return {
    name: 'animal-survivor-build-identity',
    transformIndexHtml(html: string): string {
      const buildId = escapeHtmlAttribute(buildInfo.buildId);
      return html
        // Keep the static artifact traceable before JavaScript runs, while the
        // app shell immediately restores the concise player-facing tab title.
        .replace('<title>Animal Survivor — Wildguard</title>', `<title>Animal Survivor — Wildguard · ${buildId}</title>`)
        .replace('<meta name="animal-survivor-build-id" content="dev" />', `<meta name="animal-survivor-build-id" content="${buildId}" />`);
    },
    generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: string }): void }): void {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: `${JSON.stringify(buildInfo, null, 2)}\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: `${JSON.stringify(assetManifest, null, 2)}\n`,
      });
    },
  };
}

const buildIdentity = createBuildIdentity();

export default defineConfig({
  base: process.env.ANIMAL_SURVIVOR_VITE_BASE ?? './',
  define: {
    __ANIMAL_SURVIVOR_BUILD_INFO__: JSON.stringify(buildIdentity.info),
  },
  plugins: [buildIdentityPlugin(buildIdentity.info, buildIdentity.assetManifest)],
  // Greg's audited source model lives in the repository-level asset library.
  // Production builds fingerprint and copy it; this allow-list gives Vite's
  // development server equivalent read access instead of returning 403.
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
  resolve: {
    alias: {
      '@sim': simEntry,
      '@traits': traitsEntry,
      '@director': directorEntry,
    },
  },
  build: {
    target: 'es2022',
    // Production source maps were 4.79 MB (over twice the minified engine
    // payload) and this static hobby build has no error-ingestion service to
    // consume them. Keep them out of deploy artifacts; Vite dev retains full
    // source mapping while local debugging.
    sourcemap: false,
  },
  test: {
    // happy-dom gives input/HUD tests a DOM with no native dependencies (unlike
    // jsdom's optional `canvas`); pure sim/driver tests ignore it.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
