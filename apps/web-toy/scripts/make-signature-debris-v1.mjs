/* global console */
/**
 * Bakes four small, alpha-safe physical debris silhouettes into a 4×1 atlas.
 *
 * Family-owned materials choose one cell once at startup: ivory shard for
 * physical, chunky rock for earth, and a rounder spit droplet for venom.
 * Seeded rotation/trajectory still supplies per-fragment variety without
 * allocating a material or changing simulation state during combat.
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
const debrisSourcePath = join(sourceRoot, 'signature-debris-alpha.png');
const spitSourcePath = join(sourceRoot, 'gracie-spit-comet-source.png');
const outputPath = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-signature-debris-v1.png');
const CELL = 128;
const WIDTH = CELL * 4;
const HEIGHT = CELL;

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function bleedTransparentRgb(imageData) {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);
  const owners = new Int32Array(width * height);
  const coloredOwners = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const coloredQueue = new Int32Array(width * height);
  owners.fill(-1);
  coloredOwners.fill(-1);
  let head = 0;
  let tail = 0;
  let coloredHead = 0;
  let coloredTail = 0;
  for (let index = 0; index < owners.length; index++) {
    const pixel = index * 4;
    if (source[pixel + 3] === 0) continue;
    owners[index] = index;
    queue[tail++] = index;
    if (source[pixel] !== 0 || source[pixel + 1] !== 0 || source[pixel + 2] !== 0) {
      coloredOwners[index] = index;
      coloredQueue[coloredTail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const visit = (candidate) => {
      if (owners[candidate] !== -1) return;
      owners[candidate] = owners[index];
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
    const visit = (candidate) => {
      if (coloredOwners[candidate] !== -1) return;
      coloredOwners[candidate] = coloredOwners[index];
      coloredQueue[coloredTail++] = candidate;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  for (let index = 0; index < owners.length; index++) {
    const pixel = index * 4;
    if (source[pixel + 3] !== 0 || owners[index] < 0) continue;
    let owner = owners[index] * 4;
    if (source[owner] === 0 && source[owner + 1] === 0 && source[owner + 2] === 0 && coloredOwners[index] >= 0) {
      owner = coloredOwners[index] * 4;
    }
    data[pixel] = source[owner];
    data[pixel + 1] = source[owner + 1];
    data[pixel + 2] = source[owner + 2];
  }
}

function drawCell(context, cell, image, sourceX, sourceY, sourceWidth, sourceHeight, inset = 9) {
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    cell * CELL + inset,
    inset,
    CELL - inset * 2,
    CELL - inset * 2,
  );
}

async function main() {
  const [debris, spit] = await Promise.all([loadImage(debrisSourcePath), loadImage(spitSourcePath)]);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // 0: angular physical shard, 1: squat earth chunk, 2: venom droplet,
  // 3: a narrow neutral chip used by the remaining attack families.
  drawCell(context, 0, debris, 472, 285, 250, 300, 8);
  drawCell(context, 1, debris, 640, 750, 230, 230, 8);
  drawCell(context, 2, spit, 340, 1015, 170, 165, 14);
  drawCell(context, 3, debris, 312, 545, 195, 165, 12);
  const image = context.getImageData(0, 0, WIDTH, HEIGHT);
  bleedTransparentRgb(image);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, encodeRgbaPng(WIDTH, HEIGHT, image.data));
  console.log(JSON.stringify({
    output: outputPath,
    outputBytes: statSync(outputPath).size,
    outputSha256: sha256(outputPath),
    grid: { columns: 4, rows: 1, cellPixels: CELL },
    sources: {
      debris: sha256(debrisSourcePath),
      spit: sha256(spitSourcePath),
    },
  }, null, 2));
}

await main();
