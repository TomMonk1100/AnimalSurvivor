/* global console */
/**
 * Bake a compact faceted contact core for the sole additive sublayer.
 *
 * It deliberately has a rounded crystal/impact silhouette with no star rays;
 * hero bodies own the action language and this texture only supplies a short
 * white-hot contact read during the allowed <=4 simulation ticks.
 */
import { createCanvas } from 'canvas';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRgbaPng } from './png-rgba.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../../..');
const outputPath = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-impact-core-v1.png');
const SIZE = 384;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function main() {
  const canvas = createCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const image = context.createImageData(SIZE, SIZE);
  const center = (SIZE - 1) * 0.5;
  for (let y = 0; y < SIZE; y++) {
    const localY = (y - center) / center;
    for (let x = 0; x < SIZE; x++) {
      const localX = (x - center) / center;
      const angle = Math.atan2(localY, localX);
      const radius = Math.hypot(localX, localY);
      // A shallow eight-sided facet, not a pointed star or UI sparkle.
      const boundary = 0.62 + 0.025 * Math.cos(angle * 8 + 0.34);
      const edge = 1 - smoothstep(boundary - 0.055, boundary, radius);
      const normalized = clamp01(radius / boundary);
      const core = 1 - smoothstep(0.12, 0.88, normalized);
      const index = (y * SIZE + x) * 4;
      // Smooth radial value gives a compact hit point instead of an internal
      // star/pinwheel. Family tint is applied by the material at runtime.
      image.data[index] = Math.round(220 + 35 * core);
      image.data[index + 1] = Math.round(186 + 64 * core);
      image.data[index + 2] = Math.round(112 + 112 * core);
      image.data[index + 3] = Math.round(edge * (0.72 + 0.28 * core) * 255);
    }
  }
  context.putImageData(image, 0, 0);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, encodeRgbaPng(SIZE, SIZE, image.data));
  console.log(JSON.stringify({ output: outputPath, bytes: statSync(outputPath).size, size: SIZE }, null, 2));
}

main();
