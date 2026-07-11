/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The accepted simulation is imported through the `@sim` alias only. Its source
 * uses NodeNext-style `.js` import specifiers; Vite/esbuild resolves those to
 * the sibling `.ts` files automatically, so no simulation source is copied.
 */
const simEntry = fileURLToPath(new URL('../../spikes/headless-sim/src/index.ts', import.meta.url));
const traitsEntry = fileURLToPath(new URL('../../packages/trait-runtime/src/index.ts', import.meta.url));
const directorEntry = fileURLToPath(new URL('../../packages/run-director/src/index.ts', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  base: './',
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
