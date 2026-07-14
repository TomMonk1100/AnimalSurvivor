/* global console, process */
/**
 * Photosensitivity audit for a captured VFX clip.
 *
 * It deliberately reads rendered PNG frames rather than simulation state: the
 * question is whether the player can see unsafe flashing on screen, not
 * whether an event was emitted. Frames are reduced to an 8×8 mean-luminance
 * grid with ffmpeg, then every cell is checked for >0.10 luminance reversals
 * in a rolling one-second window.
 */
import { accessSync, readdirSync, writeFileSync } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';

const GRID_SIZE = 8;
const DEFAULT_FPS = 20;
const DEFAULT_THRESHOLD = 0.10;
const MAX_SWINGS_PER_SECOND = 3;

function fail(message) {
  throw new Error(`[flash-audit] ${message}`);
}

function executable(path) {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a local ffmpeg binary, including Playwright's bundled download. */
export function findFfmpeg() {
  if (process.env.FFMPEG_PATH && executable(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';

  const cacheRoots = process.platform === 'darwin'
    ? [join(homedir(), 'Library', 'Caches', 'ms-playwright')]
    : [join(homedir(), '.cache', 'ms-playwright')];
  const binaryNames = process.platform === 'darwin'
    ? ['ffmpeg-mac']
    : process.platform === 'win32'
      ? ['ffmpeg-win64.exe', 'ffmpeg.exe']
      : ['ffmpeg-linux'];
  for (const cacheRoot of cacheRoots) {
    let entries = [];
    try {
      entries = readdirSync(cacheRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('ffmpeg-')) continue;
      for (const name of binaryNames) {
        const candidate = join(cacheRoot, entry.name, name);
        if (executable(candidate)) return candidate;
      }
    }
  }
  fail('ffmpeg was not found. Run `npx playwright install chromium`, install ffmpeg, or set FFMPEG_PATH.');
}

function srgbToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(red, green, blue) {
  return 0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue);
}

function frameFiles(framesDir) {
  let entries;
  try {
    entries = readdirSync(framesDir, { withFileTypes: true });
  } catch {
    fail(`cannot read frame directory: ${framesDir}`);
  }
  return entries
    .filter((entry) => entry.isFile() && /^f\d{4,}\.png$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function renderLuminanceGrid(framesDir) {
  const files = frameFiles(framesDir);
  if (files.length === 0) fail(`no f0001.png-style frames in ${framesDir}`);
  const canvas = createCanvas(GRID_SIZE, GRID_SIZE);
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  const luminance = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => []);
  for (const file of files) {
    const image = await loadImage(join(framesDir, file));
    context.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    context.drawImage(image, 0, 0, GRID_SIZE, GRID_SIZE);
    const pixels = context.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;
    for (let cell = 0; cell < GRID_SIZE * GRID_SIZE; cell++) {
      const pixel = cell * 4;
      luminance[cell].push(relativeLuminance(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2]));
    }
  }
  return { frameCount: files.length, luminance };
}

/**
 * Return the frames where a sustained reversal crossed the luminance budget.
 * A reversal is a direction change after moving more than `threshold`, not
 * merely per-frame noise. This makes the gate stable across video codecs.
 */
export function luminanceReversalFrames(samples, threshold) {
  if (samples.length < 2) return [];
  const reversals = [];
  let trend = 0;
  let extreme = samples[0];
  for (let index = 1; index < samples.length; index++) {
    const value = samples[index];
    if (trend >= 0) {
      if (value >= extreme) {
        extreme = value;
      } else if (extreme - value > threshold) {
        reversals.push(index);
        trend = -1;
        extreme = value;
      }
    } else if (value <= extreme) {
      extreme = value;
    } else if (value - extreme > threshold) {
      reversals.push(index);
      trend = 1;
      extreme = value;
    }
  }
  return reversals;
}

function worstRollingWindow(reversalFrames, fps) {
  let left = 0;
  let worstCount = 0;
  let worstFrames = [];
  for (let right = 0; right < reversalFrames.length; right++) {
    while (reversalFrames[right] - reversalFrames[left] > fps) left++;
    const count = right - left + 1;
    if (count > worstCount) {
      worstCount = count;
      worstFrames = reversalFrames.slice(left, right + 1);
    }
  }
  return { count: worstCount, frames: worstFrames };
}

/** Analyze a frame directory and return serializable report data. */
export async function auditFrames({ framesDir, fps = DEFAULT_FPS, threshold = DEFAULT_THRESHOLD }) {
  if (!Number.isFinite(fps) || fps <= 0) fail(`fps must be positive; received ${fps}`);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) fail(`threshold must be between 0 and 1; received ${threshold}`);

  const { frameCount, luminance } = await renderLuminanceGrid(framesDir);
  let worst = { cell: 0, count: 0, frames: [] };
  const failingCells = [];
  for (let cell = 0; cell < luminance.length; cell++) {
    const frames = luminanceReversalFrames(luminance[cell], threshold);
    const window = worstRollingWindow(frames, fps);
    if (window.count > worst.count) worst = { cell, count: window.count, frames: window.frames };
    if (window.count > MAX_SWINGS_PER_SECOND) {
      failingCells.push({
        row: Math.floor(cell / GRID_SIZE),
        column: cell % GRID_SIZE,
        swingsPerSecond: window.count,
        timestamps: window.frames.map((frame) => Number((frame / fps).toFixed(3))),
      });
    }
  }

  return {
    source: resolve(framesDir),
    frames: frameCount,
    fps,
    grid: { rows: GRID_SIZE, columns: GRID_SIZE },
    amplitudeThreshold: threshold,
    maxSwingsPerSecond: MAX_SWINGS_PER_SECOND,
    worstCell: {
      row: Math.floor(worst.cell / GRID_SIZE),
      column: worst.cell % GRID_SIZE,
    },
    swingsPerSecond: worst.count,
    offendingTimestamps: worst.frames.map((frame) => Number((frame / fps).toFixed(3))),
    failingCells,
    pass: failingCells.length === 0,
  };
}

function parseArgs(argv) {
  const args = { framesDir: null, fps: DEFAULT_FPS, threshold: DEFAULT_THRESHOLD, out: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--frames' && value) {
      args.framesDir = value;
      index++;
    } else if (argument === '--fps' && value) {
      args.fps = Number(value);
      index++;
    } else if (argument === '--threshold' && value) {
      args.threshold = Number(value);
      index++;
    } else if (argument === '--out' && value) {
      args.out = value;
      index++;
    } else if (argument === '--help') {
      console.log('Usage: node scripts/flash-audit.mjs --frames <dir> [--fps 20] [--threshold 0.10] [--out report.json]');
      process.exit(0);
    } else {
      fail(`unknown or incomplete argument: ${argument}`);
    }
  }
  if (args.framesDir === null) fail('missing --frames <directory>');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await auditFrames(args);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out !== null) writeFileSync(resolve(args.out), text);
  console.log(text.trimEnd());
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
