/* global console, fetch, process */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const distRoot = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function fail(message) {
  throw new Error(`[verify-served] ${message}`);
}

function fileForPath(requestPath) {
  const pathname = new URL(requestPath, 'http://127.0.0.1').pathname;
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const absolutePath = resolve(distRoot, relativePath);
  if (absolutePath !== distRoot && !absolutePath.startsWith(`${distRoot}/`)) {
    return null;
  }
  try {
    if (!statSync(absolutePath).isFile()) return null;
  } catch {
    return null;
  }
  return absolutePath;
}

function startServer() {
  const server = createServer((request, response) => {
    const absolutePath = fileForPath(request.url ?? '/');
    if (!absolutePath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    const extension = extname(absolutePath);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes[extension] ?? 'application/octet-stream',
    });
    response.end(readFileSync(absolutePath));
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server did not expose a TCP address'));
        return;
      }
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function fetchText(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) fail(`${path} returned HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const { server, baseUrl } = await startServer();
  try {
    const indexHtml = await fetchText(baseUrl, '/');
    const buildInfo = JSON.parse(await fetchText(baseUrl, '/build-info.json'));
    const assetManifest = JSON.parse(await fetchText(baseUrl, '/asset-manifest.json'));
    const distManifest = JSON.parse(await fetchText(baseUrl, '/dist-manifest.json'));
    const scriptMatch = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/);
    if (!scriptMatch) fail('index.html has no JavaScript entrypoint');
    const bundlePath = new URL(scriptMatch[1], `${baseUrl}/`).pathname;
    const bundle = await fetchText(baseUrl, bundlePath);

    if (!indexHtml.includes(`Animal Survivor — Wildguard · ${buildInfo.buildId}`)) {
      fail('served index title does not identify the served buildId');
    }
    if (!indexHtml.includes(`name="animal-survivor-build-id" content="${buildInfo.buildId}"`)) {
      fail('served index meta does not identify the served buildId');
    }
    if (!Array.isArray(assetManifest.files) || assetManifest.files.length === 0) {
      fail('served asset manifest contains no source asset records');
    }
    if (!Array.isArray(distManifest.files) || distManifest.files.length === 0) {
      fail('served dist manifest contains no generated asset records');
    }
    for (const portrait of ['greg-final-form-v1', 'benny-final-form-v1', 'gracie-final-form-v1']) {
      const generatedPath = distManifest.files.find((file) => file.path.includes(`${portrait}-`) && file.path.endsWith('.png'))?.path;
      if (generatedPath === undefined) fail(`served dist is missing authored portrait: ${portrait}`);
      const portraitResponse = await fetch(`${baseUrl}/${generatedPath}`);
      if (!portraitResponse.ok) fail(`served portrait ${portrait} returned HTTP ${portraitResponse.status}`);
      if ((await portraitResponse.arrayBuffer()).byteLength === 0) fail(`served portrait ${portrait} is empty`);
    }
    for (const portrait of ['final-threat-v1', 'sandglass-sovereign-v1']) {
      const generatedPath = distManifest.files.find((file) => file.path.includes(`${portrait}-`) && file.path.endsWith('.png'))?.path;
      if (generatedPath === undefined) fail(`served dist is missing boss portrait: ${portrait}`);
      const portraitResponse = await fetch(`${baseUrl}/${generatedPath}`);
      if (!portraitResponse.ok) fail(`served boss portrait ${portrait} returned HTTP ${portraitResponse.status}`);
      if ((await portraitResponse.arrayBuffer()).byteLength === 0) fail(`served boss portrait ${portrait} is empty`);
    }
    for (const marker of [
      'Accessibility',
      'Field Guide palettes',
      'Field Guide challenges',
      'Credits & notices',
      'Habitat atlas',
      'viewport-fit=cover',
      'Copy issue report',
      'gamepad left stick/D-pad',
      'hold-drag on the arena with a mouse',
      'Input: Keyboard',
      'Keyboard controls',
      'Audio mix',
      'Master volume',
      'Music bed volume',
      'Saltwind Ruins',
    ]) {
      if (!bundle.includes(marker) && !indexHtml.includes(marker)) {
        fail(`served artifact is missing UI marker: ${marker}`);
      }
    }
    const saltwindHtml = await fetchText(baseUrl, '/?biome=saltwind');
    if (!saltwindHtml.includes(buildInfo.buildId)) {
      fail('served Saltwind route did not return the identified build');
    }
    const missing = await fetch(`${baseUrl}/does-not-exist.txt`);
    if (missing.status !== 404) fail(`missing asset returned HTTP ${missing.status}`);

    console.log(`[verify-served] served ${buildInfo.buildId} with ${assetManifest.files.length} source asset records`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
