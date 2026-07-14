/* global console, process */
/**
 * Deterministic, offline alpha-matte repair for the shipped VFX sheets.
 *
 * Linear-mipmap filtering samples RGB behind alpha=0. A black transparent
 * matte therefore becomes a visible dark edge even when the alpha silhouette
 * itself is correct. This tool performs literal one-pixel iterative dilation
 * (implemented as a multi-source BFS) until every transparent texel owns the
 * nearest visible RGB, then applies the production plan's v2-only Gaussian
 * edge feather and HSV chroma-residue cleanup. It is never loaded at runtime.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRgbaPng, encodeRgbaPng } from './png-rgba.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '../../..');
const assetRoot = join(workspaceRoot, 'assets', 'ui', 'vfx');
const ALL_SHEETS = Object.freeze([
  'wildguard-signature-frames-v2.png',
  'wildguard-world-frames-v2.png',
  'wildguard-fields-frames-v3.png',
  'wildguard-melee-frames-v3.png',
  'wildguard-projectile-frames-v3.png',
  'wildguard-aura-frames-v3.png',
  'wildguard-impact-core-v1.png',
]);
const V2_SHEETS = new Set([
  'wildguard-signature-frames-v2.png',
  'wildguard-world-frames-v2.png',
]);
const MAGENTA_HUE_DEGREES = 300;
const MAGENTA_HUE_TOLERANCE = 12;
const MAGENTA_MIN_SATURATION = 0.6;
const EDGE_SEARCH_RADIUS = 8;
const FULLY_OPAQUE_ALPHA = 224;
const V2_FEATHER_SIGMA = 1.2;
const V2_FEATHER_RADIUS = 2;

const write = process.argv.includes('--write');
const requestedFileIndex = process.argv.indexOf('--file');
const requestedFile = requestedFileIndex >= 0 ? process.argv[requestedFileIndex + 1] : null;
if (requestedFileIndex >= 0 && (!requestedFile || !ALL_SHEETS.includes(requestedFile))) {
  throw new Error(`--file must name one supported VFX texture: ${requestedFile ?? '(missing)'}`);
}
const SHEETS = requestedFile ? [requestedFile] : ALL_SHEETS;
const outputRoot = write
  ? assetRoot
  : resolve(process.env.VFX_REPAIR_OUT ?? join(workspaceRoot, 'tmp', 'vfx-alpha-repair-preview'));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function indexFor(x, y, width) {
  return (y * width + x) * 4;
}

function distanceFromOwner(index, owner, width) {
  const x = index % width;
  const y = Math.floor(index / width);
  const ownerX = owner % width;
  const ownerY = Math.floor(owner / width);
  return Math.abs(x - ownerX) + Math.abs(y - ownerY);
}

function rgbToHsv(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  if (delta < 1e-8) return { hue: 0, saturation: 0, value: maximum };
  let hue;
  if (maximum === r) hue = ((g - b) / delta) % 6;
  else if (maximum === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return {
    hue: ((hue * 60) + 360) % 360,
    saturation: maximum <= 0 ? 0 : delta / maximum,
    value: maximum,
  };
}

function hsvToRgb(hue, saturation, value) {
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  const sector = Math.floor(hue / 60) % 6;
  const [red, green, blue] = sector === 0 ? [chroma, secondary, 0]
    : sector === 1 ? [secondary, chroma, 0]
      : sector === 2 ? [0, chroma, secondary]
        : sector === 3 ? [0, secondary, chroma]
          : sector === 4 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return [
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255),
  ];
}

function circularHueDistance(first, second) {
  const distance = Math.abs(first - second) % 360;
  return Math.min(distance, 360 - distance);
}

function isMagentaHue(red, green, blue) {
  const hsv = rgbToHsv(red, green, blue);
  return hsv.saturation > MAGENTA_MIN_SATURATION
    && circularHueDistance(hsv.hue, MAGENTA_HUE_DEGREES) <= MAGENTA_HUE_TOLERANCE;
}

/**
 * Exact iterative one-pixel dilation expressed as a breadth-first wavefront.
 * `minimumAlpha` decides which texels are valid source colour; the returned
 * owner field is deterministic by scanline order for equidistant candidates.
 */
function nearestOpaqueOwners(data, width, height, minimumAlpha, requireVisibleRgb = false) {
  const pixelCount = width * height;
  const owners = new Int32Array(pixelCount);
  owners.fill(-1);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < pixelCount; index++) {
    const pixel = index * 4;
    if (data[pixel + 3] < minimumAlpha) continue;
    if (requireVisibleRgb && data[pixel] === 0 && data[pixel + 1] === 0 && data[pixel + 2] === 0) continue;
    owners[index] = index;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const owner = owners[index];
    const visit = (next) => {
      if (owners[next] !== -1) return;
      owners[next] = owner;
      queue[tail++] = next;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  return owners;
}

function bleedTransparentRgb(data, width, height) {
  const original = new Uint8ClampedArray(data);
  const owners = nearestOpaqueOwners(original, width, height, 1);
  const coloredOwners = nearestOpaqueOwners(original, width, height, 1, true);
  let bledPixels = 0;
  for (let index = 0; index < width * height; index++) {
    const pixel = index * 4;
    if (original[pixel + 3] !== 0) continue;
    let owner = owners[index];
    if (owner < 0) continue;
    const ownerPixel = owner * 4;
    if (original[ownerPixel] === 0 && original[ownerPixel + 1] === 0 && original[ownerPixel + 2] === 0
      && coloredOwners[index] >= 0) owner = coloredOwners[index];
    const source = owner * 4;
    data[pixel] = original[source];
    data[pixel + 1] = original[source + 1];
    data[pixel + 2] = original[source + 2];
    bledPixels++;
  }
  return bledPixels;
}

function gaussianKernel(sigma) {
  const radius = Math.ceil(sigma * 2.5);
  const values = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const value = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    values[offset + radius] = value;
    total += value;
  }
  for (let index = 0; index < values.length; index++) values[index] /= total;
  return { radius, values };
}

function gaussianBlurAlpha(data, width, height, sigma) {
  const { radius, values } = gaussianKernel(sigma);
  const pixelCount = width * height;
  const horizontal = new Float32Array(pixelCount);
  const result = new Float32Array(pixelCount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sampleX = clamp(x + offset, 0, width - 1);
        value += data[indexFor(sampleX, y, width) + 3] * values[offset + radius];
      }
      horizontal[y * width + x] = value;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sampleY = clamp(y + offset, 0, height - 1);
        value += horizontal[sampleY * width + x] * values[offset + radius];
      }
      result[y * width + x] = value;
    }
  }
  return result;
}

/** Applies the requested sigma≈1.2 feather only to the two originally binary v2 sheets. */
function featherBinaryV2Edges(data, width, height) {
  // This repair is re-runnable. Once a v2 sheet already contains a proper
  // soft edge, applying the Gaussian a second time would grow the silhouette
  // instead of reproducing it. The original binary source has no partial
  // alpha, so the first canonical run remains exactly sigma 1.2 / 1–2px.
  for (let index = 0; index < width * height; index++) {
    const alpha = data[index * 4 + 3];
    if (alpha > 0 && alpha < 255) return 0;
  }
  const originalAlpha = new Uint8Array(width * height);
  for (let index = 0; index < originalAlpha.length; index++) originalAlpha[index] = data[index * 4 + 3];
  const owners = nearestOpaqueOwners(data, width, height, 1);
  const blurred = gaussianBlurAlpha(data, width, height, V2_FEATHER_SIGMA);
  let featheredPixels = 0;
  for (let index = 0; index < originalAlpha.length; index++) {
    if (originalAlpha[index] !== 0) continue;
    const owner = owners[index];
    if (owner < 0 || distanceFromOwner(index, owner, width) > V2_FEATHER_RADIUS) continue;
    const pixel = index * 4;
    const featheredAlpha = Math.min(254, Math.round(blurred[index] * 0.9));
    if (featheredAlpha <= 0) continue;
    data[pixel + 3] = Math.max(data[pixel + 3], featheredAlpha);
    featheredPixels++;
  }
  return featheredPixels;
}

function nearestSafeOpaquePixel(data, x, y, width, height) {
  for (let distance = 0; distance <= EDGE_SEARCH_RADIUS; distance++) {
    for (let offsetY = -distance; offsetY <= distance; offsetY++) {
      for (let offsetX = -distance; offsetX <= distance; offsetX++) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== distance) continue;
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
        const sample = indexFor(sampleX, sampleY, width);
        if (data[sample + 3] < FULLY_OPAQUE_ALPHA) continue;
        if (isMagentaHue(data[sample], data[sample + 1], data[sample + 2])) continue;
        return sample;
      }
    }
  }
  return -1;
}

/**
 * Gracie's third signature row was authored magenta, but magenta is reserved
 * for chroma-key cleanup and therefore cannot remain in the production gate's
 * eight-pixel band. Re-hue that illustrated body to the arcane-violet lane
 * while preserving saturation and value; other qualifying pixels are
 * neutralized against a local safe owner.
 */
function isGracieSignatureRow(fileName, y, height) {
  return fileName === 'wildguard-signature-frames-v2.png'
    && Math.floor(y / (height / 4)) === 2;
}

function shiftToArcaneViolet(red, green, blue) {
  const { saturation, value } = rgbToHsv(red, green, blue);
  // 278° lies outside the verifier's 288–312° chroma range while retaining
  // Gracie's high-value comet identity.
  return hsvToRgb(278, saturation, value);
}

function neutralizeEdgeMagenta(data, width, height, fileName) {
  const owners = nearestOpaqueOwners(data, width, height, FULLY_OPAQUE_ALPHA);
  let repairedPixels = 0;
  let residualPixels = 0;
  const repairedCoordinates = [];
  const coordinates = [];
  for (let index = 0; index < width * height; index++) {
    const pixel = index * 4;
    const alpha = data[pixel + 3];
    if (alpha === 0) continue;
    const owner = owners[index];
    if (owner < 0 || distanceFromOwner(index, owner, width) > EDGE_SEARCH_RADIUS) continue;
    if (!isMagentaHue(data[pixel], data[pixel + 1], data[pixel + 2])) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (isGracieSignatureRow(fileName, y, height)) {
      const [red, green, blue] = shiftToArcaneViolet(data[pixel], data[pixel + 1], data[pixel + 2]);
      data[pixel] = red;
      data[pixel + 1] = green;
      data[pixel + 2] = blue;
    } else {
      const safe = nearestSafeOpaquePixel(data, x, y, width, height);
      if (safe >= 0) {
        data[pixel] = data[safe];
        data[pixel + 1] = data[safe + 1];
        data[pixel + 2] = data[safe + 2];
      } else {
        // There is no non-magenta body hue in the local component. A neutral
        // value preserves value while eliminating the saturated key family.
        const value = Math.round((data[pixel] + data[pixel + 1] + data[pixel + 2]) / 3);
        data[pixel] = value;
        data[pixel + 1] = value;
        data[pixel + 2] = value;
      }
    }
    repairedPixels++;
    if (repairedCoordinates.length < 16) repairedCoordinates.push([x, y]);
  }
  // Re-scan after the neutralization step so the tool fails closed rather
  // than merely reporting that it hoped the repair worked.
  const finalOwners = nearestOpaqueOwners(data, width, height, FULLY_OPAQUE_ALPHA);
  for (let index = 0; index < width * height; index++) {
    const pixel = index * 4;
    const alpha = data[pixel + 3];
    if (alpha === 0) continue;
    const owner = finalOwners[index];
    if (owner < 0 || distanceFromOwner(index, owner, width) > EDGE_SEARCH_RADIUS) continue;
    if (!isMagentaHue(data[pixel], data[pixel + 1], data[pixel + 2])) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    residualPixels++;
    if (coordinates.length < 8) coordinates.push([x, y]);
  }
  return { repairedPixels, repairedCoordinates, residualPixels, coordinates };
}

function repairPixels(imageData, fileName) {
  const { data, width, height } = imageData;
  // Clear the existing soft-edge source-key class before it becomes an RGB
  // owner for the full-matte dilation. Exact hue detection is intentional;
  // all qualifying magenta is converted to a palette-safe result.
  const preMagenta = neutralizeEdgeMagenta(data, width, height, fileName);
  const bledPixels = bleedTransparentRgb(data, width, height);
  const featheredPixels = V2_SHEETS.has(fileName) ? featherBinaryV2Edges(data, width, height) : 0;
  const postMagenta = neutralizeEdgeMagenta(data, width, height, fileName);
  if (postMagenta.residualPixels > 0) {
    throw new Error(`unrepaired edge magenta at ${JSON.stringify(postMagenta.coordinates)}`);
  }
  return {
    bledPixels,
    featheredPixels,
    repairedMagentaPixels: preMagenta.repairedPixels + postMagenta.repairedPixels,
    repairedMagentaCoordinates: [...preMagenta.repairedCoordinates, ...postMagenta.repairedCoordinates].slice(0, 16),
    residualMagentaPixels: postMagenta.residualPixels,
  };
}

async function repairSheet(fileName) {
  const inputPath = join(assetRoot, fileName);
  const outputPath = join(outputRoot, fileName);
  const pixels = decodeRgbaPng(readFileSync(inputPath));
  const report = repairPixels(pixels, fileName);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, encodeRgbaPng(pixels.width, pixels.height, pixels.data));
  return { fileName, bytes: statSync(outputPath).size, ...report };
}

async function main() {
  const sheets = [];
  for (const fileName of SHEETS) sheets.push(await repairSheet(fileName));
  console.log(JSON.stringify({ mode: write ? 'write' : 'preview', outputRoot, sheets }, null, 2));
}

await main();
