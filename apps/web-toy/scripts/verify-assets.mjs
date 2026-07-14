/* global console, process, URL, Buffer */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const assetsRoot = join(workspaceRoot, 'assets');
const ledgerPath = join(assetsRoot, 'ASSET_LEDGER.md');
const gladeRoot = join(workspaceRoot, 'apps', 'web-toy', 'public', 'art', 'quaternius', 'glade');
const portraitFiles = [
  'ui/field-guide/greg-final-form-v1.png',
  'ui/field-guide/benny-final-form-v1.png',
  'ui/field-guide/gracie-final-form-v1.png',
];
const bossPortraitFiles = [
  'ui/bosses/final-threat-v1.png',
  'ui/bosses/sandglass-sovereign-v1.png',
];
const keyArtFile = 'ui/keyart/storybook-wildguard-forest-v1.jpg';
const terrainFile = 'ui/terrain/storybook-glade-ground-v1.jpg';
const playableHeroSprites = [
  { relativePath: 'ui/heroes/benny-bastion-v1.png', width: 1254, height: 1254, maxBytes: 1_000_000 },
  { relativePath: 'ui/heroes/gracie-surveyor-v1.png', width: 1254, height: 1254, maxBytes: 1_000_000 },
];
const enemySprites = [
  { relativePath: 'ui/enemies/bramblehog-v1.png', width: 1254, height: 1254, maxBytes: 1_000_000 },
  { relativePath: 'ui/enemies/thornwing-v1.png', width: 1254, height: 1254, maxBytes: 750_000 },
  { relativePath: 'ui/enemies/rootback-v1.png', width: 1536, height: 1024, maxBytes: 1_500_000 },
  { relativePath: 'ui/enemies/hollowhart-warden-v1.png', width: 1254, height: 1254, maxBytes: 1_500_000 },
];
const vfxAtlases = [
  // Literal unpremultiplied RGB is intentionally retained below alpha=0 to
  // prevent black mip fringes. These conservative per-sheet caps reflect that
  // required matte data while the authoritative complete-runtime cap below
  // remains the production plan's strict 19 MB.
  { relativePath: 'ui/vfx/wildguard-signature-frames-v3.png', width: 768, height: 768, maxBytes: 850_000 },
  { relativePath: 'ui/vfx/wildguard-signature-bodies-v1.png', width: 512, height: 512, maxBytes: 300_000 },
  { relativePath: 'ui/vfx/wildguard-world-frames-v2.png', width: 768, height: 768, maxBytes: 750_000 },
  { relativePath: 'ui/vfx/wildguard-fields-frames-v3.png', width: 768, height: 768, maxBytes: 500_000 },
  { relativePath: 'ui/vfx/wildguard-melee-frames-v3.png', width: 768, height: 768, maxBytes: 500_000 },
  { relativePath: 'ui/vfx/wildguard-projectile-frames-v3.png', width: 768, height: 768, maxBytes: 500_000 },
  { relativePath: 'ui/vfx/wildguard-aura-frames-v3.png', width: 768, height: 768, maxBytes: 300_000 },
  { relativePath: 'ui/vfx/wildguard-gecko-dissolve-frames-v1.png', width: 512, height: 512, maxBytes: 250_000 },
  { relativePath: 'ui/vfx/wildguard-skunk-dissolve-frames-v1.png', width: 512, height: 512, maxBytes: 250_000 },
  { relativePath: 'ui/vfx/wildguard-royal-stink-dissolve-frames-v1.png', width: 512, height: 512, maxBytes: 250_000 },
  { relativePath: 'ui/vfx/wildguard-fluffy-shield-dissolve-frames-v1.png', width: 512, height: 512, maxBytes: 250_000 },
  { relativePath: 'ui/vfx/wildguard-impact-core-v1.png', width: 384, height: 384, maxBytes: 100_000 },
  { relativePath: 'ui/vfx/wildguard-signature-debris-v1.png', width: 512, height: 128, maxBytes: 50_000 },
  { relativePath: 'ui/vfx/wildguard-ground-contact-v1.png', width: 256, height: 128, maxBytes: 25_000 },
];
const foxPath = 'vendor/quaternius/ultimate_animated_animals/Fox.gltf';
const gladeFiles = [
  'Bark_NormalTree.jpg',
  'Bush_Common_Flowers.bin',
  'Bush_Common_Flowers.gltf',
  'CommonTree_3.bin',
  'CommonTree_3.gltf',
  'CommonTree_5.bin',
  'CommonTree_5.gltf',
  'Flowers-512.png',
  'Leaves_NormalTree_C-512.png',
  'Rock_Medium_2.bin',
  'Rock_Medium_2.gltf',
  'Rock_Medium_3.bin',
  'Rock_Medium_3.gltf',
  'Rocks_Diffuse.jpg',
];
const gladeModels = [
  {
    gltfFile: 'CommonTree_3.gltf',
    bufferFile: 'CommonTree_3.bin',
    imageFiles: ['Bark_NormalTree.jpg', 'Leaves_NormalTree_C-512.png'],
  },
  {
    gltfFile: 'CommonTree_5.gltf',
    bufferFile: 'CommonTree_5.bin',
    imageFiles: ['Bark_NormalTree.jpg', 'Leaves_NormalTree_C-512.png'],
  },
  {
    gltfFile: 'Rock_Medium_2.gltf',
    bufferFile: 'Rock_Medium_2.bin',
    imageFiles: ['Rocks_Diffuse.jpg'],
  },
  {
    gltfFile: 'Rock_Medium_3.gltf',
    bufferFile: 'Rock_Medium_3.bin',
    imageFiles: ['Rocks_Diffuse.jpg'],
  },
  {
    gltfFile: 'Bush_Common_Flowers.gltf',
    bufferFile: 'Bush_Common_Flowers.bin',
    imageFiles: ['Leaves_NormalTree_C-512.png', 'Flowers-512.png'],
  },
];
const MAX_PORTRAIT_BYTES = 1_000_000;
const MAX_KEY_ART_BYTES = 600_000;
const MAX_TERRAIN_BYTES = 800_000;
const MAX_FOX_BYTES = 4_000_000;
const MAX_GLADE_BYTES = 1_250_000;
// The completed VFX pass adds compact alpha atlases for player effects,
// source-preserving eight-frame dissolves, and one small contact mask. The
// full authored runtime payload remains bounded below the plan's 19 MB cap.
const MAX_RUNTIME_ASSET_BYTES = 19_000_000;

function fail(message) {
  throw new Error(`[verify-assets] ${message}`);
}

function requiredFile(relativePath) {
  const absolutePath = join(assetsRoot, relativePath);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    fail(`missing asset: ${relativePath}`);
  }
  if (!stats.isFile()) fail(`asset path is not a file: ${relativePath}`);
  return { absolutePath, bytes: stats.size };
}

function gladeLedgerPath(fileName) {
  return `apps/web-toy/public/art/quaternius/glade/${fileName}`;
}

function requiredGladeFile(fileName) {
  const ledgerRelativePath = gladeLedgerPath(fileName);
  const absolutePath = join(gladeRoot, fileName);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    fail(`missing curated glade asset: ${ledgerRelativePath}`);
  }
  if (!stats.isFile()) fail(`curated glade asset path is not a file: ${ledgerRelativePath}`);
  return { absolutePath, bytes: stats.size, ledgerRelativePath };
}

function pngInfo(buffer, relativePath) {
  if (buffer.length < 26 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    fail(`${relativePath} is not a PNG file`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}

function jpegInfo(buffer, relativePath) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    fail(`${relativePath} is not a JPEG file`);
  }
  let offset = 2;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    // Standalone markers have no following segment length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda || offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (length < 8) break;
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        precision: buffer[offset + 2],
        components: buffer[offset + 7],
      };
    }
    offset += length;
  }
  fail(`${relativePath} does not contain a valid JPEG frame`);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertLedgerHash(ledger, relativePath, hash) {
  const ledgerLine = ledger.split('\n').find((line) => line.includes(`\`${relativePath}\``));
  if (ledgerLine === undefined || !ledgerLine.includes(hash)) {
    fail(`${relativePath} hash ${hash} is not recorded on its ledger row`);
  }
}

function validateFoxGltf(contents) {
  let gltf;
  try {
    gltf = JSON.parse(contents.toString('utf8'));
  } catch (error) {
    fail(`${foxPath} is not valid JSON glTF: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof gltf !== 'object' || gltf === null || Array.isArray(gltf)) {
    fail(`${foxPath} must contain a glTF object`);
  }
  if (gltf.asset?.version !== '2.0') fail(`${foxPath} must declare glTF asset version 2.0`);
  if (!Number.isInteger(gltf.scene) || gltf.scene < 0 || gltf.scene >= (gltf.scenes?.length ?? 0)) {
    fail(`${foxPath} must point at a valid default scene`);
  }
  if (!Array.isArray(gltf.nodes) || gltf.nodes.length < 1) fail(`${foxPath} must contain scene nodes`);
  if (!Array.isArray(gltf.meshes) || gltf.meshes.length < 1) fail(`${foxPath} must contain a mesh`);
  if (!Array.isArray(gltf.skins) || gltf.skins.length < 1) fail(`${foxPath} must contain a skin for the audited animated hero`);
  if (!Array.isArray(gltf.animations) || gltf.animations.length < 1) fail(`${foxPath} must contain animations`);

  const animationNames = new Set(gltf.animations.map((animation) => animation?.name).filter((name) => typeof name === 'string'));
  for (const requiredName of ['Idle', 'Walk', 'Gallop', 'Attack', 'Death']) {
    if (!animationNames.has(requiredName)) fail(`${foxPath} is missing required animation "${requiredName}"`);
  }

  if (!Array.isArray(gltf.buffers) || gltf.buffers.length < 1) fail(`${foxPath} must contain at least one buffer`);
  for (const [index, buffer] of gltf.buffers.entries()) {
    if (typeof buffer?.uri !== 'string' || !buffer.uri.startsWith('data:')) {
      fail(`${foxPath} buffer ${index} must be embedded as a data URI`);
    }
    const comma = buffer.uri.indexOf(',');
    if (comma < 0) fail(`${foxPath} buffer ${index} has a malformed data URI`);
    const encoded = buffer.uri.slice(comma + 1);
    let decoded;
    try {
      decoded = Buffer.from(encoded, 'base64');
    } catch (error) {
      fail(`${foxPath} buffer ${index} is not valid base64: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (decoded.length !== buffer.byteLength) {
      fail(`${foxPath} buffer ${index} byteLength ${buffer.byteLength} does not match embedded payload ${decoded.length}`);
    }
  }
}

function validateGladeGltf(contents, model, gladeAssets) {
  const gltfPath = gladeLedgerPath(model.gltfFile);
  let gltf;
  try {
    gltf = JSON.parse(contents.toString('utf8'));
  } catch (error) {
    fail(`${gltfPath} is not valid JSON glTF: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof gltf !== 'object' || gltf === null || Array.isArray(gltf)) {
    fail(`${gltfPath} must contain a glTF object`);
  }
  if (gltf.asset?.version !== '2.0') fail(`${gltfPath} must declare glTF asset version 2.0`);
  if (!Number.isInteger(gltf.scene) || gltf.scene < 0 || gltf.scene >= (gltf.scenes?.length ?? 0)) {
    fail(`${gltfPath} must point at a valid default scene`);
  }
  if (!Array.isArray(gltf.nodes) || gltf.nodes.length < 1) fail(`${gltfPath} must contain scene nodes`);
  if (!Array.isArray(gltf.meshes) || gltf.meshes.length < 1) fail(`${gltfPath} must contain a mesh`);

  if (!Array.isArray(gltf.buffers) || gltf.buffers.length !== 1) {
    fail(`${gltfPath} must contain exactly one curated binary buffer`);
  }
  const buffer = gltf.buffers[0];
  const expectedBuffer = gladeAssets.get(model.bufferFile);
  if (buffer?.uri !== model.bufferFile || buffer.byteLength !== expectedBuffer?.bytes) {
    fail(`${gltfPath} must reference ${model.bufferFile} with its exact byte length`);
  }

  if (!Array.isArray(gltf.images) || gltf.images.length !== model.imageFiles.length) {
    fail(`${gltfPath} must declare its expected local texture set`);
  }
  const imageUris = gltf.images.map((image) => image?.uri);
  if (imageUris.some((uri) => typeof uri !== 'string')
    || imageUris.join('\n') !== model.imageFiles.join('\n')) {
    fail(`${gltfPath} must reference only its curated local texture files`);
  }
  for (const imageFile of imageUris) {
    if (!gladeAssets.has(imageFile)) fail(`${gltfPath} references a missing curated texture ${imageFile}`);
  }
}

function main() {
  const ledger = readFileSync(ledgerPath, 'utf8');
  let totalBytes = 0;
  for (const relativePath of [...portraitFiles, ...bossPortraitFiles]) {
    const asset = requiredFile(relativePath);
    if (asset.bytes > MAX_PORTRAIT_BYTES) {
      fail(`${relativePath} exceeds ${MAX_PORTRAIT_BYTES} bytes (${asset.bytes})`);
    }
    const contents = readFileSync(asset.absolutePath);
    const info = pngInfo(contents, relativePath);
    if (info.width !== 768 || info.height !== 768 || info.bitDepth !== 8 || info.colorType !== 2) {
      fail(`${relativePath} must be an 8-bit RGB 768x768 PNG; got ${JSON.stringify(info)}`);
    }
    if (!ledger.includes(`\`${relativePath}\``)) fail(`${relativePath} is absent from ASSET_LEDGER.md`);
    assertLedgerHash(ledger, relativePath, sha256(contents));
    totalBytes += asset.bytes;
  }

  const keyArt = requiredFile(keyArtFile);
  if (keyArt.bytes > MAX_KEY_ART_BYTES) {
    fail(`${keyArtFile} exceeds ${MAX_KEY_ART_BYTES} bytes (${keyArt.bytes})`);
  }
  const keyArtContents = readFileSync(keyArt.absolutePath);
  const keyArtInfo = jpegInfo(keyArtContents, keyArtFile);
  if (keyArtInfo.width !== 1672 || keyArtInfo.height !== 941 || keyArtInfo.precision !== 8 || keyArtInfo.components !== 3) {
    fail(`${keyArtFile} must be an 8-bit RGB 1672x941 JPEG; got ${JSON.stringify(keyArtInfo)}`);
  }
  if (!ledger.includes(`\`${keyArtFile}\``)) fail(`${keyArtFile} is absent from ASSET_LEDGER.md`);
  assertLedgerHash(ledger, keyArtFile, sha256(keyArtContents));
  totalBytes += keyArt.bytes;

  const terrain = requiredFile(terrainFile);
  if (terrain.bytes > MAX_TERRAIN_BYTES) {
    fail(`${terrainFile} exceeds ${MAX_TERRAIN_BYTES} bytes (${terrain.bytes})`);
  }
  const terrainContents = readFileSync(terrain.absolutePath);
  const terrainInfo = jpegInfo(terrainContents, terrainFile);
  if (terrainInfo.width !== 1254 || terrainInfo.height !== 1254
    || terrainInfo.precision !== 8 || terrainInfo.components !== 3) {
    fail(`${terrainFile} must be an 8-bit RGB 1254x1254 JPEG; got ${JSON.stringify(terrainInfo)}`);
  }
  if (!ledger.includes(`\`${terrainFile}\``)) fail(`${terrainFile} is absent from ASSET_LEDGER.md`);
  assertLedgerHash(ledger, terrainFile, sha256(terrainContents));
  totalBytes += terrain.bytes;

  for (const sprite of playableHeroSprites) {
    const asset = requiredFile(sprite.relativePath);
    if (asset.bytes > sprite.maxBytes) {
      fail(`${sprite.relativePath} exceeds ${sprite.maxBytes} bytes (${asset.bytes})`);
    }
    const contents = readFileSync(asset.absolutePath);
    const info = pngInfo(contents, sprite.relativePath);
    if (info.width !== sprite.width || info.height !== sprite.height
      || info.bitDepth !== 8 || info.colorType !== 6) {
      fail(`${sprite.relativePath} must be an 8-bit RGBA ${sprite.width}x${sprite.height} PNG; got ${JSON.stringify(info)}`);
    }
    if (!ledger.includes(`\`${sprite.relativePath}\``)) fail(`${sprite.relativePath} is absent from ASSET_LEDGER.md`);
    assertLedgerHash(ledger, sprite.relativePath, sha256(contents));
    totalBytes += asset.bytes;
  }

  for (const sprite of enemySprites) {
    const asset = requiredFile(sprite.relativePath);
    if (asset.bytes > sprite.maxBytes) {
      fail(`${sprite.relativePath} exceeds ${sprite.maxBytes} bytes (${asset.bytes})`);
    }
    const contents = readFileSync(asset.absolutePath);
    const info = pngInfo(contents, sprite.relativePath);
    if (info.width !== sprite.width || info.height !== sprite.height
      || info.bitDepth !== 8 || info.colorType !== 6) {
      fail(`${sprite.relativePath} must be an 8-bit RGBA ${sprite.width}x${sprite.height} PNG; got ${JSON.stringify(info)}`);
    }
    if (!ledger.includes(`\`${sprite.relativePath}\``)) fail(`${sprite.relativePath} is absent from ASSET_LEDGER.md`);
    assertLedgerHash(ledger, sprite.relativePath, sha256(contents));
    totalBytes += asset.bytes;
  }

  for (const atlasDefinition of vfxAtlases) {
    const atlas = requiredFile(atlasDefinition.relativePath);
    if (atlas.bytes > atlasDefinition.maxBytes) {
      fail(`${atlasDefinition.relativePath} exceeds ${atlasDefinition.maxBytes} bytes (${atlas.bytes})`);
    }
    const atlasContents = readFileSync(atlas.absolutePath);
    const atlasInfo = pngInfo(atlasContents, atlasDefinition.relativePath);
    if (atlasInfo.width !== atlasDefinition.width || atlasInfo.height !== atlasDefinition.height
      || atlasInfo.bitDepth !== 8 || atlasInfo.colorType !== 6) {
      fail(`${atlasDefinition.relativePath} must be an 8-bit RGBA ${atlasDefinition.width}x${atlasDefinition.height} PNG; got ${JSON.stringify(atlasInfo)}`);
    }
    if (!ledger.includes(`\`${atlasDefinition.relativePath}\``)) fail(`${atlasDefinition.relativePath} is absent from ASSET_LEDGER.md`);
    assertLedgerHash(ledger, atlasDefinition.relativePath, sha256(atlasContents));
    totalBytes += atlas.bytes;
  }

  const fox = requiredFile(foxPath);
  if (fox.bytes > MAX_FOX_BYTES) fail(`${foxPath} exceeds ${MAX_FOX_BYTES} bytes (${fox.bytes})`);
  if (!ledger.includes(`\`${foxPath}\``)) fail(`${foxPath} is absent from ASSET_LEDGER.md`);
  const foxContents = readFileSync(fox.absolutePath);
  validateFoxGltf(foxContents);
  assertLedgerHash(ledger, foxPath, sha256(foxContents));
  totalBytes += fox.bytes;

  const gladeAssets = new Map();
  let gladeBytes = 0;
  for (const fileName of gladeFiles) {
    const asset = requiredGladeFile(fileName);
    const contents = readFileSync(asset.absolutePath);
    if (!ledger.includes(`\`${asset.ledgerRelativePath}\``)) {
      fail(`${asset.ledgerRelativePath} is absent from ASSET_LEDGER.md`);
    }
    assertLedgerHash(ledger, asset.ledgerRelativePath, sha256(contents));
    gladeAssets.set(fileName, asset);
    gladeBytes += asset.bytes;
  }
  if (gladeBytes > MAX_GLADE_BYTES) {
    fail(`curated Quaternius glade assets exceed ${MAX_GLADE_BYTES} bytes (${gladeBytes})`);
  }

  const gladeTextureChecks = [
    { fileName: 'Bark_NormalTree.jpg', type: 'jpeg', width: 512, height: 512, components: 3 },
    { fileName: 'Rocks_Diffuse.jpg', type: 'jpeg', width: 512, height: 512, components: 3 },
    { fileName: 'Leaves_NormalTree_C-512.png', type: 'png', width: 512, height: 512, colorType: 6 },
    { fileName: 'Flowers-512.png', type: 'png', width: 512, height: 498, colorType: 6 },
  ];
  for (const texture of gladeTextureChecks) {
    const asset = gladeAssets.get(texture.fileName);
    const contents = readFileSync(asset.absolutePath);
    const info = texture.type === 'jpeg'
      ? jpegInfo(contents, asset.ledgerRelativePath)
      : pngInfo(contents, asset.ledgerRelativePath);
    const expectedFormat = texture.type === 'jpeg'
      ? info.precision === 8 && info.components === texture.components
      : info.bitDepth === 8 && info.colorType === texture.colorType;
    if (info.width !== texture.width || info.height !== texture.height || !expectedFormat) {
      fail(`${asset.ledgerRelativePath} has an unexpected texture format: ${JSON.stringify(info)}`);
    }
  }
  for (const model of gladeModels) {
    const asset = gladeAssets.get(model.gltfFile);
    validateGladeGltf(readFileSync(asset.absolutePath), model, gladeAssets);
  }
  totalBytes += gladeBytes;
  if (totalBytes > MAX_RUNTIME_ASSET_BYTES) {
    fail(`runtime asset payload exceeds ${MAX_RUNTIME_ASSET_BYTES} bytes (${totalBytes})`);
  }

  console.log(`[verify-assets] ${portraitFiles.length} hero portraits + ${bossPortraitFiles.length} boss portraits + key art + terrain + ${playableHeroSprites.length} playable hero sprites + ${enemySprites.length} enemy sprites + ${vfxAtlases.length} VFX textures + Fox glTF + ${gladeFiles.length} curated glade files validated; ${totalBytes} source bytes within budget`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
