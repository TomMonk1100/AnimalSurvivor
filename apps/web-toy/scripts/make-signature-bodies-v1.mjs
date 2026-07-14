/* global console */
/**
 * Bakes the two P2 hero-signature bodies from their reviewed chroma-keyed
 * source art into one small, cell-safe 4×4 runtime atlas.
 *
 * The input files are deliberately local working sources generated during the
 * art review. Runtime only ships this compact derivative; source ids, prompts,
 * and source hashes are recorded in the asset ledger rather than adding large
 * unused originals to the browser payload.
 */
import { createCanvas, loadImage } from 'canvas';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRgbaPng } from './png-rgba.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../../..');
const sourceRoot = join(workspaceRoot, 'tmp', 'vfx-remediation');
const assetRoot = join(workspaceRoot, 'assets', 'ui', 'vfx');
const outputPath = join(assetRoot, 'wildguard-signature-bodies-v1.png');

// 128px cells are the plan's minimum and remain crisp at the game's camera
// scale. Keeping this dedicated two-body sheet at 512px preserves the strict
// 19 MB complete-runtime cap without weakening the shared 4×4 UV contract.
const SIZE = 512;
const GRID = 4;
const CELL = SIZE / GRID;
const GUTTER = 4;
const INNER = CELL - GUTTER * 2;

const SOURCES = Object.freeze({
  // One authoritative Trample event becomes one broad ridge. The simulation
  // supplies Benny's three advancing events, so packing a whole triptych into
  // each runtime cell would multiply that sequence into unreadable clutter.
  earth: 'benny-earth-ridges-v2-source.png',
  spit: 'gracie-spit-comet-v2-source.png',
});

// The reviewed Benny source contains three generation variants. Keep only
// the clear central low ridge for the runtime body; the actual simulation
// positions the three real Trample waves in front of Benny.
const SOURCE_WINDOWS = Object.freeze({
  earth: Object.freeze({ x: 530, y: 220, width: 540, height: 440 }),
  // Preserve Gracie's bright head and the attached taper, but deliberately
  // trim the remote droplets/long tail so a real projectile reads as one
  // compact moving glob instead of a thin screen-space ribbon.
  spit: Object.freeze({ x: 480, y: 240, width: 1050, height: 430 }),
});

function fail(message) {
  throw new Error(`[make-signature-bodies-v1] ${message}`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function visibleBounds(image, window = null) {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const scanX = window === null ? 0 : Math.max(0, Math.floor(window.x));
  const scanY = window === null ? 0 : Math.max(0, Math.floor(window.y));
  const scanWidth = window === null ? image.width : Math.min(image.width - scanX, Math.floor(window.width));
  const scanHeight = window === null ? image.height : Math.min(image.height - scanY, Math.floor(window.height));
  let minX = scanX + scanWidth;
  let minY = scanY + scanHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = scanY; y < scanY + scanHeight; y++) {
    for (let x = scanX; x < scanX + scanWidth; x++) {
      if (data[(y * image.width + x) * 4 + 3] < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) fail('input has no visible alpha');
  const padding = 8;
  return {
    x: Math.max(scanX, minX - padding),
    y: Math.max(scanY, minY - padding),
    width: Math.min(scanX + scanWidth, maxX + padding + 1) - Math.max(scanX, minX - padding),
    height: Math.min(scanY + scanHeight, maxY + padding + 1) - Math.max(scanY, minY - padding),
  };
}

function drawContained(
  context,
  image,
  bounds,
  cellColumn,
  cellRow,
  { horizontalScale = 1, rotateCounterClockwise = false } = {},
) {
  const cellX = cellColumn * CELL + GUTTER;
  const cellY = cellRow * CELL + GUTTER;
  const sourceWidth = bounds.width * horizontalScale;
  const sourceHeight = bounds.height;
  const scale = Math.min(
    INNER / (rotateCounterClockwise ? sourceHeight : sourceWidth),
    INNER / (rotateCounterClockwise ? sourceWidth : sourceHeight),
  );
  const drawWidth = bounds.width * scale * horizontalScale;
  const drawHeight = bounds.height * scale;
  if (!rotateCounterClockwise) {
    const targetX = cellX + (INNER - drawWidth) * 0.5;
    const targetY = cellY + (INNER - drawHeight) * 0.5;
    context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, targetX, targetY, drawWidth, drawHeight);
    return;
  }
  context.save();
  context.translate(cellX + INNER * 0.5, cellY + INNER * 0.5);
  // Plane local +Z is forward. The source comet points right, so turn that
  // head toward the atlas's top/+Z axis before yaw aligns it to velocity.
  context.rotate(-Math.PI * 0.5);
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
    -drawWidth * 0.5, -drawHeight * 0.5, drawWidth, drawHeight);
  context.restore();
}

/**
 * The original ridge crop is rich in rock detail but its light values are
 * evenly distributed, so it can read as an inert terrain patch over the
 * forest. These compact, normal-blend marks turn its local +Z/top edge into
 * a broken high-value crest and leave three low-value fissures trailing
 * behind it. They are clipped to the same padded cell contract as the source
 * art and are intentionally not a glow or an additive pass.
 */
function drawEarthFissures(context, cellColumn, cellRow) {
  const cellX = cellColumn * CELL + GUTTER;
  const cellY = cellRow * CELL + GUTTER;
  const point = (x, y) => [cellX + INNER * x, cellY + INNER * y];
  const paths = [
    [point(0.5, 0.62), point(0.47, 0.73), point(0.53, 0.83), point(0.48, 0.94)],
    [point(0.39, 0.69), point(0.29, 0.79), point(0.2, 0.89)],
    [point(0.61, 0.72), point(0.72, 0.83), point(0.83, 0.91)],
  ];
  context.save();
  context.beginPath();
  context.rect(cellX, cellY, INNER, INNER);
  context.clip();
  context.strokeStyle = 'rgba(48, 25, 13, 0.72)';
  context.lineWidth = 2.7;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const path of paths) {
    context.beginPath();
    context.moveTo(path[0][0], path[0][1]);
    for (let index = 1; index < path.length; index++) context.lineTo(path[index][0], path[index][1]);
    context.stroke();
  }
  context.restore();
}

function drawEarthLeadingCrest(context, cellColumn, cellRow) {
  const cellX = cellColumn * CELL + GUTTER;
  const cellY = cellRow * CELL + GUTTER;
  const point = (x, y) => [cellX + INNER * x, cellY + INNER * y];
  const crestSegments = [
    [point(0.18, 0.43), point(0.31, 0.32), point(0.45, 0.39)],
    [point(0.49, 0.39), point(0.63, 0.29), point(0.82, 0.36)],
  ];
  context.save();
  context.beginPath();
  context.rect(cellX, cellY, INNER, INNER);
  context.clip();
  // `source-atop` makes the crest an interior facet of the source ridge;
  // it cannot grow a bright halo into transparent texels around the body.
  context.globalCompositeOperation = 'source-atop';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(83, 42, 18, 0.62)';
  context.lineWidth = 5.2;
  for (const path of crestSegments) {
    context.beginPath();
    context.moveTo(path[0][0], path[0][1] + 2.1);
    for (let index = 1; index < path.length; index++) context.lineTo(path[index][0], path[index][1] + 2.1);
    context.stroke();
  }
  context.strokeStyle = 'rgba(255, 240, 190, 0.82)';
  context.lineWidth = 2.35;
  for (const path of crestSegments) {
    context.beginPath();
    context.moveTo(path[0][0], path[0][1]);
    for (let index = 1; index < path.length; index++) context.lineTo(path[index][0], path[index][1]);
    context.stroke();
  }
  context.restore();
}

function bleedTransparentRgb(imageData) {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);
  const pixelCount = width * height;
  const owner = new Int32Array(pixelCount);
  const coloredOwner = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const coloredQueue = new Int32Array(pixelCount);
  owner.fill(-1);
  coloredOwner.fill(-1);
  let head = 0;
  let tail = 0;
  let coloredHead = 0;
  let coloredTail = 0;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const sourcePixel = pixel * 4;
    if (source[sourcePixel + 3] === 0) continue;
    owner[pixel] = pixel;
    queue[tail++] = pixel;
    if (source[sourcePixel] !== 0 || source[sourcePixel + 1] !== 0 || source[sourcePixel + 2] !== 0) {
      coloredOwner[pixel] = pixel;
      coloredQueue[coloredTail++] = pixel;
    }
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const visit = (candidate) => {
      if (owner[candidate] !== -1) return;
      owner[candidate] = owner[pixel];
      queue[tail++] = candidate;
    };
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (y > 0) visit(pixel - width);
    if (y + 1 < height) visit(pixel + width);
  }
  while (coloredHead < coloredTail) {
    const pixel = coloredQueue[coloredHead++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const visit = (candidate) => {
      if (coloredOwner[candidate] !== -1) return;
      coloredOwner[candidate] = coloredOwner[pixel];
      coloredQueue[coloredTail++] = candidate;
    };
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (y > 0) visit(pixel - width);
    if (y + 1 < height) visit(pixel + width);
  }
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const destination = pixel * 4;
    if (source[destination + 3] !== 0 || owner[pixel] < 0) continue;
    let origin = owner[pixel] * 4;
    if (source[origin] === 0 && source[origin + 1] === 0 && source[origin + 2] === 0 && coloredOwner[pixel] >= 0) {
      origin = coloredOwner[pixel] * 4;
    }
    data[destination] = source[origin];
    data[destination + 1] = source[origin + 1];
    data[destination + 2] = source[origin + 2];
  }
}

async function main() {
  const earthPath = join(sourceRoot, SOURCES.earth);
  const spitPath = join(sourceRoot, SOURCES.spit);
  const [earth, spit] = await Promise.all([loadImage(earthPath), loadImage(spitPath)]);
  const earthBounds = visibleBounds(earth, SOURCE_WINDOWS.earth);
  const spitBounds = visibleBounds(spit, SOURCE_WINDOWS.spit);
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  // Each 4×4 cell remains valid and padded. Runtime only samples (0,0) for
  // Benny and (1,0) for Gracie; the other cells are intentional terminal
  // copies so future UV validation cannot silently hide an empty cell.
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const isSpit = column % 2 === 1;
      if (!isSpit) drawEarthFissures(context, column, row);
      drawContained(context, isSpit ? spit : earth, isSpit ? spitBounds : earthBounds, column, row,
        isSpit ? { horizontalScale: 0.55, rotateCounterClockwise: true } : undefined);
      if (!isSpit) drawEarthLeadingCrest(context, column, row);
    }
  }
  const image = context.getImageData(0, 0, SIZE, SIZE);
  bleedTransparentRgb(image);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, encodeRgbaPng(SIZE, SIZE, image.data));
  console.log(JSON.stringify({
    output: outputPath,
    outputBytes: statSync(outputPath).size,
    outputSha256: sha256(outputPath),
    sources: {
      earth: { file: SOURCES.earth, sha256: sha256(earthPath), bounds: earthBounds },
      spit: { file: SOURCES.spit, sha256: sha256(spitPath), bounds: spitBounds },
    },
    grid: GRID,
    gutterPixels: GUTTER,
  }, null, 2));
}

await main();
