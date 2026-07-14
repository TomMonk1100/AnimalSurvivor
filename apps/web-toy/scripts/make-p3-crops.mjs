/* global console */
/**
 * Generates the P3 texture-pipeline evidence panels without storing duplicate
 * pre-repair source PNGs in the repository. The left crop is read directly
 * from the committed pre-overhaul Git object; the right crop is the shipped
 * runtime texture. Both are rendered at 2x with labels for review.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../../..');
const assetsRoot = join(workspaceRoot, 'assets', 'ui', 'vfx');
const outputRoot = join(workspaceRoot, 'docs', 'vfx', 'captures', 'p3-crops');
const effects = Object.freeze([
  Object.freeze({
    id: 'fox-swipe',
    label: 'Fox Swipe body — v3 padded atlas cell',
    beforeFile: 'wildguard-signature-frames-v2.png', beforeColumn: 1, beforeRow: 0, beforeGrid: 4,
    afterFile: 'wildguard-signature-frames-v3.png', afterColumn: 1, afterRow: 0, afterGrid: 4,
  }),
  Object.freeze({
    id: 'gracie-spit',
    label: 'Gracie Spit body — v3 padded atlas cell',
    beforeFile: 'wildguard-signature-frames-v2.png', beforeColumn: 0, beforeRow: 2, beforeGrid: 4,
    afterFile: 'wildguard-signature-frames-v3.png', afterColumn: 0, afterRow: 2, afterGrid: 4,
  }),
  Object.freeze({
    id: 'skunk-dissolve',
    label: 'Skunk zone — raw card to coherent dissolve endpoint',
    beforeFile: 'wildguard-fields-frames-v3.png', beforeColumn: 2, beforeRow: 2, beforeGrid: 4,
    afterFile: 'wildguard-skunk-dissolve-frames-v1.png', afterColumn: 3, afterRow: 1, afterGrid: 4,
  }),
]);

function cropBox(image, column, row, grid) {
  const width = image.width / grid;
  const height = image.height / grid;
  return { x: Math.round(column * width), y: Math.round(row * height), width: Math.round(width), height: Math.round(height) };
}

async function sourceImage(file) {
  const contents = execFileSync('git', ['show', `HEAD:assets/ui/vfx/${file}`], { cwd: workspaceRoot });
  return loadImage(contents);
}

async function currentImage(file) {
  return loadImage(join(assetsRoot, file));
}

async function writePanel(effect) {
  const [before, after] = await Promise.all([sourceImage(effect.beforeFile), currentImage(effect.afterFile)]);
  const scale = 2;
  const panelSize = 256 * scale;
  const gutter = 36;
  const canvas = createCanvas(panelSize * 2 + gutter, panelSize + 72);
  const context = canvas.getContext('2d');
  context.fillStyle = '#101b1b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = 'bold 18px sans-serif';
  context.fillStyle = '#f4e7b4';
  context.fillText(effect.label, 18, 24);
  context.font = 'bold 15px sans-serif';
  context.fillStyle = '#9fb6aa';
  context.fillText('BEFORE (HEAD source)', 18, 52);
  context.fillText('AFTER (shipped)', panelSize + gutter + 18, 52);
  const beforeBox = cropBox(before, effect.beforeColumn, effect.beforeRow, effect.beforeGrid);
  const afterBox = cropBox(after, effect.afterColumn, effect.afterRow, effect.afterGrid);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(before, beforeBox.x, beforeBox.y, beforeBox.width, beforeBox.height, 0, 72, panelSize, panelSize);
  context.drawImage(after, afterBox.x, afterBox.y, afterBox.width, afterBox.height, panelSize + gutter, 72, panelSize, panelSize);
  const output = join(outputRoot, `${effect.id}-before-after.png`);
  writeFileSync(output, canvas.toBuffer('image/png'));
  return output;
}

mkdirSync(outputRoot, { recursive: true });
const outputs = [];
for (const effect of effects) outputs.push(await writePanel(effect));
console.log(JSON.stringify({ outputRoot, outputs }, null, 2));
