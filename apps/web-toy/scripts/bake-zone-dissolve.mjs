/* global console, process */
/**
 * Bake coherent, source-preserving dissolve atlases for long-lived VFX.
 *
 * Each output cell is derived from one already-approved illustrated body
 * frame. A fixed seeded FBM field changes only its alpha threshold across the
 * sixteen cells, so the eye sees one picture erode instead of sixteen
 * unrelated AI illustrations popping in sequence. This is an offline asset
 * tool; the renderer consumes ordinary RGBA atlas cells and stays allocation
 * free during combat.
 */
import { createCanvas, loadImage } from 'canvas';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRgbaPng } from './png-rgba.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../../..');
const assetRoot = join(workspaceRoot, 'assets', 'ui', 'vfx');
const previewRoot = join(workspaceRoot, 'tmp', 'zone-dissolve-preview');

const GRID_SIZE = 4;
// P3(c)'s shader fallback is an eight-frame coherent dissolve. The atlas
// keeps the renderer's shared 4×4 UV contract; unused lower cells repeat the
// terminal frame so they never introduce black transparent matte data.
const FRAME_COUNT = 8;
const ATLAS_CELL_COUNT = GRID_SIZE * GRID_SIZE;
// Four 128px cells are the production-plan minimum. Keeping the source at
// 768px while baking a compact 512px derivative saves nearly a megabyte of
// runtime payload without reducing temporal coherence or atlas layout.
const SOURCE_ATLAS_SIZE = 768;
const SOURCE_CELL_SIZE = SOURCE_ATLAS_SIZE / GRID_SIZE;
const OUTPUT_ATLAS_SIZE = 512;
const CELL_SIZE = OUTPUT_ATLAS_SIZE / GRID_SIZE;
const GROUND_CONTACT_WIDTH = 256;
const GROUND_CONTACT_HEIGHT = 128;

const OUTPUTS = Object.freeze([
  Object.freeze({
    id: 'gecko',
    source: 'wildguard-fields-frames-v3.png',
    column: 1,
    row: 1,
    output: 'wildguard-gecko-dissolve-frames-v1.png',
    seed: 0x13579bdf,
  }),
  Object.freeze({
    id: 'skunk',
    source: 'wildguard-fields-frames-v3.png',
    column: 2,
    row: 2,
    output: 'wildguard-skunk-dissolve-frames-v1.png',
    seed: 0x2468ace1,
  }),
  Object.freeze({
    id: 'royal-stink',
    source: 'wildguard-fields-frames-v3.png',
    column: 2,
    row: 3,
    output: 'wildguard-royal-stink-dissolve-frames-v1.png',
    seed: 0x6a09e667,
  }),
  Object.freeze({
    id: 'fluffy-shield',
    source: 'wildguard-world-frames-v2.png',
    column: 1,
    row: 2,
    output: 'wildguard-fluffy-shield-dissolve-frames-v1.png',
    seed: 0xbb67ae85,
  }),
]);

const write = process.argv.includes('--write');
const outputRoot = write ? assetRoot : resolve(process.env.VFX_DISSOLVE_OUT ?? previewRoot);

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(first, second, amount) {
  return first + (second - first) * amount;
}

/**
 * The approved source sheets have already had their exterior matte repaired,
 * but keep this literal-key guard in the derivative pipeline too. It removes
 * only a chroma-key remnant, never the broader magenta family used by the
 * Royal Stink and Gracie illustrations.
 */
function residualChroma(red, green, blue) {
  return red >= 245 && green <= 15 && blue >= 245;
}

function hueAndSaturation(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  if (delta < 1e-8 || maximum <= 0) return { hue: 0, saturation: 0 };
  let hue;
  if (maximum === r) hue = ((g - b) / delta) % 6;
  else if (maximum === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return { hue: ((hue * 60) + 360) % 360, saturation: delta / maximum };
}

function isEdgeMagenta(red, green, blue) {
  const { hue, saturation } = hueAndSaturation(red, green, blue);
  const distance = Math.abs(hue - 300) % 360;
  return saturation > 0.6 && Math.min(distance, 360 - distance) <= 12;
}

function nearestSafeOpaque(data, x, y, width, height) {
  for (let distance = 0; distance <= 8; distance++) {
    for (let offsetY = -distance; offsetY <= distance; offsetY++) {
      for (let offsetX = -distance; offsetX <= distance; offsetX++) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== distance) continue;
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
        const sample = (sampleY * width + sampleX) * 4;
        if (data[sample + 3] < 224 || isEdgeMagenta(data[sample], data[sample + 1], data[sample + 2])) continue;
        return sample;
      }
    }
  }
  return -1;
}

/** New derivative sheets obey the same hue-based residual-key contract as P3a. */
function neutralizeEdgeMagenta(imageData) {
  const { data, width, height } = imageData;
  let repairedPixels = 0;
  for (let index = 0; index < width * height; index++) {
    const pixel = index * 4;
    if (data[pixel + 3] === 0 || !isEdgeMagenta(data[pixel], data[pixel + 1], data[pixel + 2])) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const safe = nearestSafeOpaque(data, x, y, width, height);
    if (safe >= 0) {
      data[pixel] = data[safe];
      data[pixel + 1] = data[safe + 1];
      data[pixel + 2] = data[safe + 2];
    } else {
      const value = Math.round((data[pixel] + data[pixel + 1] + data[pixel + 2]) / 3);
      data[pixel] = value;
      data[pixel + 1] = value;
      data[pixel + 2] = value;
    }
    repairedPixels++;
  }
  return repairedPixels;
}

function hash01(x, y, seed) {
  let hash = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ (seed | 0);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const lower = mix(hash01(x0, y0, seed), hash01(x0 + 1, y0, seed), sx);
  const upper = mix(hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed), sx);
  return mix(lower, upper, sy);
}

/** One fixed noise field per sheet is the temporal-coherence guarantee. */
function fbm(x, y, seed) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let totalAmplitude = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 0x9e3779b9) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return totalAmplitude > 0 ? value / totalAmplitude : 0;
}

async function sourceCell(definition) {
  const source = await loadImage(join(assetRoot, definition.source));
  if (source.width !== SOURCE_ATLAS_SIZE || source.height !== SOURCE_ATLAS_SIZE) {
    throw new Error(`${definition.source} must remain a ${SOURCE_ATLAS_SIZE}px atlas`);
  }
  const canvas = createCanvas(CELL_SIZE, CELL_SIZE);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  context.drawImage(
    source,
    definition.column * SOURCE_CELL_SIZE,
    definition.row * SOURCE_CELL_SIZE,
    SOURCE_CELL_SIZE,
    SOURCE_CELL_SIZE,
    0,
    0,
    CELL_SIZE,
    CELL_SIZE,
  );
  return context.getImageData(0, 0, CELL_SIZE, CELL_SIZE).data;
}

function writeDissolveFrame(target, source, frame, seed) {
  // Bias the threshold a little toward the early cells: the first frame is
  // effectively whole, then every subsequent frame visibly sheds a little
  // mass instead of holding eight identical pictures before one late pop.
  const progress = frame / (FRAME_COUNT - 1);
  // The fixed field's visible loss begins close to 0.20 and reaches sparse
  // terminal fragments around 0.65. The shared release envelope then carries
  // those fragments to exact zero without leaving blank no-op atlas cells.
  // Map all sixteen cells through that interval so the animation reads as a
  // steady erosion rather than eight static cards followed by a late pop.
  const threshold = 0.20 + Math.pow(progress, 0.72) * 0.45;
  const softness = 0.105;
  for (let y = 0; y < CELL_SIZE; y++) {
    const normalizedY = (y + 0.5) / CELL_SIZE * 2 - 1;
    for (let x = 0; x < CELL_SIZE; x++) {
      const normalizedX = (x + 0.5) / CELL_SIZE * 2 - 1;
      const radial = Math.min(1, Math.hypot(normalizedX, normalizedY) / Math.SQRT2);
      const field = clamp01(
        fbm((x + 0.5) / CELL_SIZE * 3.1, (y + 0.5) / CELL_SIZE * 3.1, seed)
        * 0.72 + (1 - radial) * 0.28,
      );
      const sourceIndex = (y * CELL_SIZE + x) * 4;
      const targetIndex = sourceIndex;
      const red = source[sourceIndex];
      const green = source[sourceIndex + 1];
      const blue = source[sourceIndex + 2];
      const isResidualChroma = residualChroma(red, green, blue);
      // Avoid leaving a vivid key pixel in a transparent mip neighborhood.
      // This does not create or recolor visible artwork: the only affected
      // source pixel is made fully transparent and RGB-zero.
      target[targetIndex] = isResidualChroma ? 0 : red;
      target[targetIndex + 1] = isResidualChroma ? 0 : green;
      target[targetIndex + 2] = isResidualChroma ? 0 : blue;
      const sourceAlpha = source[sourceIndex + 3] / 255;
      const dissolveAlpha = smoothstep(threshold - softness, threshold + softness, field);
      target[targetIndex + 3] = isResidualChroma ? 0 : Math.round(sourceAlpha * dissolveAlpha * 255);
    }
  }
}

/**
 * Mirrors P3a for derivative atlases: a deterministic one-pixel BFS dilation
 * gives every alpha-zero texel its nearest visible RGB before mip generation.
 * This keeps the compact dissolve sheets from reintroducing a black matte.
 */
function bleedTransparentRgb(imageData) {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);
  const pixelCount = width * height;
  const owner = new Int32Array(pixelCount);
  const coloredOwner = new Int32Array(pixelCount);
  owner.fill(-1);
  coloredOwner.fill(-1);
  const queue = new Int32Array(pixelCount);
  const coloredQueue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  let coloredHead = 0;
  let coloredTail = 0;
  for (let index = 0; index < pixelCount; index++) {
    const pixel = index * 4;
    if (source[pixel + 3] !== 0) {
      owner[index] = index;
      queue[tail++] = index;
      if (source[pixel] !== 0 || source[pixel + 1] !== 0 || source[pixel + 2] !== 0) {
        coloredOwner[index] = index;
        coloredQueue[coloredTail++] = index;
      }
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const nearest = owner[index];
    const visit = (candidate) => {
      if (owner[candidate] !== -1) return;
      owner[candidate] = nearest;
      queue[tail++] = candidate;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  while (coloredHead < coloredTail) {
    const index = coloredQueue[coloredHead++];
    const x = index % width;
    const y = Math.floor(index / width);
    const nearest = coloredOwner[index];
    const visit = (candidate) => {
      if (coloredOwner[candidate] !== -1) return;
      coloredOwner[candidate] = nearest;
      coloredQueue[coloredTail++] = candidate;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  let bledPixels = 0;
  for (let index = 0; index < pixelCount; index++) {
    const pixel = index * 4;
    if (source[pixel + 3] !== 0 || owner[index] < 0) continue;
    let nearestIndex = owner[index];
    const candidate = nearestIndex * 4;
    if (source[candidate] === 0 && source[candidate + 1] === 0 && source[candidate + 2] === 0
      && coloredOwner[index] >= 0) nearestIndex = coloredOwner[index];
    const nearest = nearestIndex * 4;
    data[pixel] = source[nearest];
    data[pixel + 1] = source[nearest + 1];
    data[pixel + 2] = source[nearest + 2];
    bledPixels++;
  }
  return bledPixels;
}

async function bakeAtlas(definition) {
  const source = await sourceCell(definition);
  const canvas = createCanvas(OUTPUT_ATLAS_SIZE, OUTPUT_ATLAS_SIZE);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  for (let atlasCell = 0; atlasCell < ATLAS_CELL_COUNT; atlasCell++) {
    const frame = Math.min(atlasCell, FRAME_COUNT - 1);
    const frameCanvas = createCanvas(CELL_SIZE, CELL_SIZE);
    const frameContext = frameCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
    const pixels = frameContext.createImageData(CELL_SIZE, CELL_SIZE);
    writeDissolveFrame(pixels.data, source, frame, definition.seed);
    frameContext.putImageData(pixels, 0, 0);
    const column = atlasCell % GRID_SIZE;
    const row = Math.floor(atlasCell / GRID_SIZE);
    context.drawImage(frameCanvas, column * CELL_SIZE, row * CELL_SIZE);
  }
  const composed = context.getImageData(0, 0, OUTPUT_ATLAS_SIZE, OUTPUT_ATLAS_SIZE);
  const repairedMagentaPixels = neutralizeEdgeMagenta(composed);
  const bledPixels = bleedTransparentRgb(composed);
  context.putImageData(composed, 0, 0);
  const output = join(outputRoot, definition.output);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, encodeRgbaPng(OUTPUT_ATLAS_SIZE, OUTPUT_ATLAS_SIZE, composed.data));
  return {
    id: definition.id,
    file: definition.output,
    bytes: statSync(output).size,
    bledPixels,
    repairedMagentaPixels,
  };
}

function bakeGroundContact() {
  const canvas = createCanvas(GROUND_CONTACT_WIDTH, GROUND_CONTACT_HEIGHT);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const pixels = context.createImageData(GROUND_CONTACT_WIDTH, GROUND_CONTACT_HEIGHT);
  let highAlphaPixels = 0;
  for (let y = 0; y < GROUND_CONTACT_HEIGHT; y++) {
    const normalizedY = (y + 0.5) / GROUND_CONTACT_HEIGHT * 2 - 1;
    for (let x = 0; x < GROUND_CONTACT_WIDTH; x++) {
      const normalizedX = (x + 0.5) / GROUND_CONTACT_WIDTH * 2 - 1;
      const distance = Math.hypot(normalizedX, normalizedY);
      // At the scene's legal <=0.25 normal-blend opacity budget, the old
      // low-alpha filled disk disappeared into the forest. This wide broken
      // ellipse keeps an opaque source-alpha footprint around the body while
      // remaining a quiet non-additive terrain anchor, not a bloom ring.
      const outer = 1 - smoothstep(0.76, 0.98, distance);
      const inner = smoothstep(0.34, 0.56, distance);
      const rim = inner * outer;
      // A few deterministic gaps stop the contact reading as a UI circle;
      // the fine central vein supplies a small earth/crack footprint at the
      // leading contact without adding a second luminous sprite.
      const angle = Math.atan2(normalizedY, normalizedX);
      const brokenRim = rim * (0.74 + 0.26 * Math.max(0, Math.cos(angle * 3 + 0.4)));
      const centerVein = distance < 0.56 && Math.abs(normalizedX * 0.76 + normalizedY * 0.18) < 0.032
        ? 0.38 * (1 - smoothstep(0.2, 0.56, distance))
        : 0;
      const alpha = Math.round(Math.min(1, brokenRim + centerVein) * 255);
      const index = (y * GROUND_CONTACT_WIDTH + x) * 4;
      // The material's own opacity remains capped at 0.25. A warm light value
      // makes the thin footprint legible over the forest without global
      // brightness, bloom, or an additive blend escalation.
      pixels.data[index] = 242;
      pixels.data[index + 1] = 206;
      pixels.data[index + 2] = 132;
      pixels.data[index + 3] = alpha;
      if (alpha >= 224) highAlphaPixels++;
    }
  }
  if (highAlphaPixels < 1_000) {
    throw new Error(`[bake-zone-dissolve] contact source alpha coverage too low: ${highAlphaPixels}`);
  }
  context.putImageData(pixels, 0, 0);
  const output = join(outputRoot, 'wildguard-ground-contact-v1.png');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, encodeRgbaPng(GROUND_CONTACT_WIDTH, GROUND_CONTACT_HEIGHT, pixels.data));
  return {
    id: 'ground-contact',
    file: 'wildguard-ground-contact-v1.png',
    bytes: statSync(output).size,
    highAlphaPixels,
  };
}

async function main() {
  const generated = [];
  for (const definition of OUTPUTS) generated.push(await bakeAtlas(definition));
  generated.push(bakeGroundContact());
  console.log(JSON.stringify({ mode: write ? 'write' : 'preview', outputRoot, generated }, null, 2));
}

await main();
