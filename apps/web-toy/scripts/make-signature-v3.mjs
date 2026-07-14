/* global console */
/**
 * Rebuild the signature atlas from its clean committed source without touching
 * the corrupted v2 working-tree file.
 *
 * Each 192px source cell is uniformly inset by a four-pixel transparent
 * gutter. This prevents linear mip sampling from pulling RGB/alpha from the
 * neighbouring effect. RGB is then bled only through alpha-zero texels inside
 * that same cell; no alpha value is changed after the resample step.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';
import { encodeRgbaPng } from './png-rgba.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../../..');
const assetsRoot = join(workspaceRoot, 'assets', 'ui', 'vfx');
const outputPath = join(assetsRoot, 'wildguard-signature-frames-v3.png');
const evidenceRoot = join(workspaceRoot, 'docs', 'vfx', 'captures', 'p3-signature-v3');
const sourceObject = 'HEAD:assets/ui/vfx/wildguard-signature-frames-v2.png';
const sourceHash = execFileSync('git', ['rev-parse', 'HEAD:assets/ui/vfx/wildguard-signature-frames-v2.png'], {
  cwd: workspaceRoot,
  encoding: 'utf8',
}).trim();
const GRID = 4;
const SIZE = 768;
const CELL = SIZE / GRID;
const GUTTER = 4;
const INNER = CELL - GUTTER * 2;

function fail(message) {
  throw new Error(`[make-signature-v3] ${message}`);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pixelIndex(x, y, width) {
  return (y * width + x) * 4;
}

function isUsableRgb(pixels, pixel) {
  return pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2] >= 36;
}

/**
 * A deterministic four-neighbour BFS constrained to one atlas cell. It fills
 * literal RGB only below alpha zero, leaving the resampled alpha silhouette
 * bit-for-bit unchanged.
 */
function bleedCellTransparentRgb(pixels, cellX, cellY) {
  const owners = new Int32Array(CELL * CELL);
  owners.fill(-1);
  const queue = new Int32Array(CELL * CELL);
  let head = 0;
  let tail = 0;
  for (let localY = 0; localY < CELL; localY++) {
    for (let localX = 0; localX < CELL; localX++) {
      const local = localY * CELL + localX;
      const pixel = pixelIndex(cellX + localX, cellY + localY, SIZE);
      if (pixels[pixel + 3] === 0 || !isUsableRgb(pixels, pixel)) continue;
      owners[local] = local;
      queue[tail++] = local;
    }
  }
  if (tail === 0) fail(`cell (${cellX / CELL}, ${cellY / CELL}) has no usable visible RGB owner`);
  while (head < tail) {
    const local = queue[head++];
    const localX = local % CELL;
    const localY = Math.floor(local / CELL);
    const owner = owners[local];
    const visit = (candidate) => {
      if (owners[candidate] !== -1) return;
      owners[candidate] = owner;
      queue[tail++] = candidate;
    };
    if (localX > 0) visit(local - 1);
    if (localX + 1 < CELL) visit(local + 1);
    if (localY > 0) visit(local - CELL);
    if (localY + 1 < CELL) visit(local + CELL);
  }
  let bledPixels = 0;
  for (let localY = 0; localY < CELL; localY++) {
    for (let localX = 0; localX < CELL; localX++) {
      const local = localY * CELL + localX;
      const pixel = pixelIndex(cellX + localX, cellY + localY, SIZE);
      if (pixels[pixel + 3] !== 0) continue;
      const owner = owners[local];
      if (owner < 0) fail(`cell (${cellX / CELL}, ${cellY / CELL}) has an unowned transparent texel`);
      const ownerX = cellX + owner % CELL;
      const ownerY = cellY + Math.floor(owner / CELL);
      const source = pixelIndex(ownerX, ownerY, SIZE);
      pixels[pixel] = pixels[source];
      pixels[pixel + 1] = pixels[source + 1];
      pixels[pixel + 2] = pixels[source + 2];
      bledPixels++;
    }
  }
  return bledPixels;
}

function assertPaddedCells(pixels, alphaBeforeBleed) {
  const cells = [];
  let totalGutterViolations = 0;
  let totalBlackMattePixels = 0;
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const cellX = column * CELL;
      const cellY = row * CELL;
      let gutterViolations = 0;
      let visiblePixels = 0;
      let minX = CELL;
      let minY = CELL;
      let maxX = -1;
      let maxY = -1;
      for (let localY = 0; localY < CELL; localY++) {
        for (let localX = 0; localX < CELL; localX++) {
          const pixel = pixelIndex(cellX + localX, cellY + localY, SIZE);
          const originalAlpha = alphaBeforeBleed[pixel + 3];
          if (pixels[pixel + 3] !== originalAlpha) {
            fail(`alpha changed after RGB-only bleed in cell (${column}, ${row}) at (${localX}, ${localY})`);
          }
          const withinGutter = localX < GUTTER || localX >= CELL - GUTTER
            || localY < GUTTER || localY >= CELL - GUTTER;
          if (withinGutter && pixels[pixel + 3] !== 0) gutterViolations++;
          if (pixels[pixel + 3] > 0) {
            visiblePixels++;
            minX = Math.min(minX, localX);
            minY = Math.min(minY, localY);
            maxX = Math.max(maxX, localX);
            maxY = Math.max(maxY, localY);
          } else if (pixels[pixel] === 0 && pixels[pixel + 1] === 0 && pixels[pixel + 2] === 0) {
            totalBlackMattePixels++;
          }
        }
      }
      if (visiblePixels === 0) fail(`cell (${column}, ${row}) lost all visible art`);
      if (gutterViolations > 0) {
        fail(`cell (${column}, ${row}) has ${gutterViolations} nontransparent gutter texels`);
      }
      totalGutterViolations += gutterViolations;
      cells.push({ column, row, visiblePixels, visibleBounds: { minX, minY, maxX, maxY }, gutterViolations });
    }
  }
  if (totalBlackMattePixels > 0) fail(`${totalBlackMattePixels} transparent-black matte texels remain after cell-local bleed`);
  return { cells, totalGutterViolations, totalBlackMattePixels };
}

async function writeForestInspection(texturePath) {
  const forestPath = join(workspaceRoot, 'assets', 'ui', 'terrain', 'storybook-glade-ground-v1.jpg');
  const [texture, forest] = await Promise.all([loadImage(texturePath), loadImage(forestPath)]);
  const panelWidth = 384;
  const panelHeight = 320;
  const canvas = createCanvas(panelWidth * 3, panelHeight);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const samples = [
    { label: 'Fox Swipe · cell 1,0', column: 1, row: 0 },
    { label: 'Earth Ridge · cell 0,1', column: 0, row: 1 },
    { label: 'Spit Comet · cell 1,2', column: 1, row: 2 },
  ];
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const panelX = index * panelWidth;
    context.drawImage(forest, 0, 0, forest.width, forest.height, panelX, 0, panelWidth, panelHeight);
    // Downsample first, then enlarge the proof panel. This makes neighbour
    // contamination visible if a future atlas loses its transparent gutter.
    const mini = createCanvas(112, 112);
    const miniContext = mini.getContext('2d');
    miniContext.imageSmoothingEnabled = true;
    miniContext.imageSmoothingQuality = 'high';
    miniContext.drawImage(texture, sample.column * CELL, sample.row * CELL, CELL, CELL, 0, 0, 112, 112);
    context.drawImage(mini, panelX + 80, 70, 224, 224);
    context.fillStyle = '#f4efd4';
    context.font = 'bold 16px sans-serif';
    context.fillText(sample.label, panelX + 16, 28);
  }
  const path = join(evidenceRoot, 'signature-v3-forest-inspection.png');
  writeFileSync(path, canvas.toBuffer('image/png'));
  return path;
}

async function main() {
  const source = execFileSync('git', ['show', sourceObject], { cwd: workspaceRoot });
  const sourceImage = await loadImage(source);
  if (sourceImage.width !== SIZE || sourceImage.height !== SIZE) {
    fail(`clean source must be ${SIZE}×${SIZE}, got ${sourceImage.width}×${sourceImage.height}`);
  }
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, SIZE, SIZE);
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const sourceX = column * CELL;
      const sourceY = row * CELL;
      const destinationX = sourceX + GUTTER;
      const destinationY = sourceY + GUTTER;
      context.drawImage(sourceImage, sourceX, sourceY, CELL, CELL, destinationX, destinationY, INNER, INNER);
    }
  }
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
  const alphaBeforeBleed = new Uint8ClampedArray(pixels);
  let bledPixels = 0;
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      bledPixels += bleedCellTransparentRgb(pixels, column * CELL, row * CELL);
    }
  }
  const validation = assertPaddedCells(pixels, alphaBeforeBleed);
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(outputPath, encodeRgbaPng(SIZE, SIZE, pixels));
  const forestInspection = await writeForestInspection(outputPath);
  const report = {
    sourceObject,
    sourceHash,
    output: outputPath,
    outputBytes: statSync(outputPath).size,
    outputSha256: sha256File(outputPath),
    grid: GRID,
    cellPixels: CELL,
    gutterPixels: GUTTER,
    insetPixels: INNER,
    bledPixels,
    alphaPolicy: 'resample once into the inset cell; then preserve every alpha byte while bleeding RGB only below alpha zero',
    validation,
    forestInspection,
  };
  writeFileSync(join(evidenceRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[make-signature-v3] ${JSON.stringify(report)}`);
}

await main();
