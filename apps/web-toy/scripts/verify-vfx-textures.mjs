/* global console, Buffer, URL */
/**
 * Pixel-level gate for the production VFX texture pipeline.
 *
 * Canvas can premultiply or discard RGB below alpha while displaying an
 * image, so this gate reads and unfilters the PNG bytes directly. It proves
 * the shipped files—not a browser-decoded approximation—have alpha-bled
 * mattes, usable feather pixels, and no unprotected hue-based chroma residue.
 * The active signature sheet also gets a per-cell boundary gate because a
 * whole-sheet color scan cannot detect art leaked from a neighboring atlas
 * cell.
 */
import { inflateSync } from 'node:zlib';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = resolve(scriptDir, '../../..');
const assetRoot = join(workspaceRoot, 'assets', 'ui', 'vfx');
const p3SignatureEvidenceRoot = join(workspaceRoot, 'docs', 'vfx', 'captures', 'p3-signature-v3');
const SHEETS = Object.freeze([
  // v3 intentionally retains Gracie's authored magenta comet. Its proof is
  // transparent per-cell gutters plus the recorded forest composite, not the
  // legacy hue heuristic used by the other sheets.
  {
    file: 'wildguard-signature-frames-v3.png',
    minPartialAlphaPixels: 20_000,
    paddedGrid: 4,
    gutterPixels: 4,
    evidenceReport: join(p3SignatureEvidenceRoot, 'report.json'),
    forestInspection: join(p3SignatureEvidenceRoot, 'signature-v3-forest-inspection.png'),
  },
  // P2 routes Benny and Gracie through dedicated one-frame bodies rather than
  // the general signature board. Keep the same per-cell gutter contract so
  // linear mips cannot leak a neighboring hero into gameplay.
  {
    file: 'wildguard-signature-bodies-v1.png',
    minPartialAlphaPixels: 10_000,
    paddedGrid: 4,
    gutterPixels: 4,
  },
  { file: 'wildguard-world-frames-v2.png', minPartialAlphaPixels: 10_000 },
  { file: 'wildguard-fields-frames-v3.png', minPartialAlphaPixels: 10_000 },
  { file: 'wildguard-melee-frames-v3.png', minPartialAlphaPixels: 10_000 },
  { file: 'wildguard-projectile-frames-v3.png', minPartialAlphaPixels: 10_000 },
  { file: 'wildguard-aura-frames-v3.png', minPartialAlphaPixels: 8_000 },
  { file: 'wildguard-impact-core-v1.png', minPartialAlphaPixels: 100 },
  // The venom droplet's authored magenta is intentional and is isolated in
  // a dedicated alpha-safe atlas cell; it is not a residual chroma key.
  { file: 'wildguard-signature-debris-v1.png', minPartialAlphaPixels: 100, allowEdgeMagenta: true },
  { file: 'wildguard-gecko-dissolve-frames-v1.png', minPartialAlphaPixels: 4_000 },
  { file: 'wildguard-skunk-dissolve-frames-v1.png', minPartialAlphaPixels: 4_000 },
  { file: 'wildguard-royal-stink-dissolve-frames-v1.png', minPartialAlphaPixels: 4_000 },
  { file: 'wildguard-fluffy-shield-dissolve-frames-v1.png', minPartialAlphaPixels: 4_000 },
  {
    file: 'wildguard-ground-contact-v1.png',
    minPartialAlphaPixels: 10_000,
    // With the material opacity legally capped at 0.25, a contact needs an
    // appreciable source-alpha rim. This prevents a future low-alpha blur
    // from technically validating while disappearing at gameplay distance.
    minHighAlphaPixels: 1_000,
  },
]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FULLY_OPAQUE_ALPHA = 224;
const MAGENTA_HUE = 300;
const MAGENTA_TOLERANCE = 12;
const MAGENTA_MIN_SATURATION = 0.6;
const EDGE_RADIUS = 8;

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

/** Decodes the 8-bit non-interlaced RGBA PNGs produced by the offline bakers. */
function decodeRgbaPng(path) {
  const file = readFileSync(path);
  if (file.length < 33 || !file.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path} is not a PNG`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    if (payloadEnd + 4 > file.length) throw new Error(`${path} has a truncated ${type} chunk`);
    if (type === 'IHDR') {
      width = file.readUInt32BE(payloadStart);
      height = file.readUInt32BE(payloadStart + 4);
      bitDepth = file[payloadStart + 8];
      colorType = file[payloadStart + 9];
      if (file[payloadStart + 12] !== 0) throw new Error(`${path} uses interlaced PNG data`);
    } else if (type === 'IDAT') {
      idat.push(file.subarray(payloadStart, payloadEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = payloadEnd + 4;
  }
  if (width < 1 || height < 1 || bitDepth !== 8 || colorType !== 6) {
    throw new Error(`${path} must be 8-bit RGBA; got ${width}×${height}, depth ${bitDepth}, type ${colorType}`);
  }
  const compressed = Buffer.concat(idat);
  const scanlines = inflateSync(compressed);
  const rowBytes = width * 4;
  if (scanlines.length !== height * (rowBytes + 1)) {
    throw new Error(`${path} has unexpected decompressed scanline length`);
  }
  const pixels = Buffer.allocUnsafe(width * height * 4);
  let source = 0;
  for (let y = 0; y < height; y++) {
    const filter = scanlines[source++];
    const destination = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = scanlines[source++];
      const left = x >= 4 ? pixels[destination + x - 4] : 0;
      const up = y > 0 ? pixels[destination - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[destination - rowBytes + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`${path} has unsupported PNG filter ${filter}`);
      pixels[destination + x] = (raw + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
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

function isMagentaHue(red, green, blue) {
  const { hue, saturation } = hueAndSaturation(red, green, blue);
  const rawDistance = Math.abs(hue - MAGENTA_HUE) % 360;
  return saturation > MAGENTA_MIN_SATURATION
    && Math.min(rawDistance, 360 - rawDistance) <= MAGENTA_TOLERANCE;
}

function nearestOpaqueOwners(pixels, width, height) {
  const pixelCount = width * height;
  const owners = new Int32Array(pixelCount);
  owners.fill(-1);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < pixelCount; index++) {
    if (pixels[index * 4 + 3] < FULLY_OPAQUE_ALPHA) continue;
    owners[index] = index;
    queue[tail++] = index;
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const owner = owners[index];
    const visit = (candidate) => {
      if (owners[candidate] !== -1) return;
      owners[candidate] = owner;
      queue[tail++] = candidate;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  return owners;
}

function ownerDistance(index, owner, width) {
  const x = index % width;
  const y = Math.floor(index / width);
  const ownerX = owner % width;
  const ownerY = Math.floor(owner / width);
  return Math.abs(x - ownerX) + Math.abs(y - ownerY);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * The signature atlas is sampled as sixteen independent cards. Verify each
 * one has a fully transparent border and a non-empty alpha footprint wholly
 * inside that border. This catches cross-cell contamination even if the
 * aggregate 768px texture still looks healthy.
 */
function inspectPaddedAtlas(pixels, width, height, grid, gutterPixels, file) {
  if (!Number.isInteger(grid) || grid < 1 || width % grid !== 0 || height % grid !== 0) {
    throw new Error(`${file} needs an integer ${String(grid)}×${String(grid)} cell grid`);
  }
  const cellWidth = width / grid;
  const cellHeight = height / grid;
  if (cellWidth !== cellHeight || gutterPixels * 2 >= cellWidth) {
    throw new Error(`${file} has invalid ${cellWidth}×${cellHeight} cells or gutter ${gutterPixels}`);
  }
  const cells = [];
  let gutterAlphaViolations = 0;
  for (let row = 0; row < grid; row++) {
    for (let column = 0; column < grid; column++) {
      let visiblePixels = 0;
      let minX = cellWidth;
      let minY = cellHeight;
      let maxX = -1;
      let maxY = -1;
      let cellGutterViolations = 0;
      for (let localY = 0; localY < cellHeight; localY++) {
        for (let localX = 0; localX < cellWidth; localX++) {
          const globalX = column * cellWidth + localX;
          const globalY = row * cellHeight + localY;
          const alpha = pixels[(globalY * width + globalX) * 4 + 3];
          const inGutter = localX < gutterPixels || localX >= cellWidth - gutterPixels
            || localY < gutterPixels || localY >= cellHeight - gutterPixels;
          if (inGutter && alpha !== 0) cellGutterViolations++;
          if (alpha === 0) continue;
          visiblePixels++;
          minX = Math.min(minX, localX);
          minY = Math.min(minY, localY);
          maxX = Math.max(maxX, localX);
          maxY = Math.max(maxY, localY);
        }
      }
      if (visiblePixels === 0) {
        throw new Error(`${file} cell (${column}, ${row}) has no visible authored art`);
      }
      if (cellGutterViolations > 0) {
        throw new Error(`${file} cell (${column}, ${row}) has ${cellGutterViolations} nontransparent gutter texels`);
      }
      gutterAlphaViolations += cellGutterViolations;
      cells.push({
        column,
        row,
        visiblePixels,
        visibleBounds: { minX, minY, maxX, maxY },
        gutterAlphaViolations: cellGutterViolations,
      });
    }
  }
  return { grid, cellPixels: cellWidth, gutterPixels, gutterAlphaViolations, cells };
}

/**
 * P3's static forest composite is evidence, not a substitute for live P2
 * capture. Tie it to the exact active PNG hash and per-cell report so a
 * future global repair cannot silently reuse a stale "looks fine" image.
 */
function verifyPaddedAtlasEvidence(definition, atlasPath, paddedAtlas) {
  if (definition.evidenceReport === undefined || definition.forestInspection === undefined) return null;
  if (!existsSync(definition.evidenceReport)) {
    throw new Error(`${definition.file} is missing P3 evidence report ${definition.evidenceReport}`);
  }
  if (!existsSync(definition.forestInspection)) {
    throw new Error(`${definition.file} is missing P3 forest composite ${definition.forestInspection}`);
  }
  const report = JSON.parse(readFileSync(definition.evidenceReport, 'utf8'));
  const inspectionBytes = statSync(definition.forestInspection).size;
  const atlasHash = sha256File(atlasPath);
  if (report.output !== atlasPath) {
    throw new Error(`${definition.file} P3 report points to a different output: ${String(report.output)}`);
  }
  if (report.outputSha256 !== atlasHash) {
    throw new Error(`${definition.file} P3 report hash does not match active atlas`);
  }
  if (report.grid !== paddedAtlas.grid || report.cellPixels !== paddedAtlas.cellPixels
    || report.gutterPixels !== paddedAtlas.gutterPixels) {
    throw new Error(`${definition.file} P3 report grid/gutter does not match active atlas`);
  }
  if (report.validation?.totalGutterViolations !== 0 || report.validation?.totalBlackMattePixels !== 0
    || !Array.isArray(report.validation?.cells) || report.validation.cells.length !== paddedAtlas.cells.length) {
    throw new Error(`${definition.file} P3 report is missing its clean per-cell validation`);
  }
  if (report.forestInspection !== definition.forestInspection || inspectionBytes < 4_096) {
    throw new Error(`${definition.file} P3 forest composite is missing, stale, or implausibly small`);
  }
  return {
    report: definition.evidenceReport,
    forestInspection: definition.forestInspection,
    inspectionBytes,
    atlasHash,
  };
}

function inspectSheet(definition) {
  const path = join(assetRoot, definition.file);
  const { width, height, pixels } = decodeRgbaPng(path);
  const owners = nearestOpaqueOwners(pixels, width, height);
  let transparentBlackPixels = 0;
  let partialAlphaPixels = 0;
  let highAlphaPixels = 0;
  let edgeMagentaPixels = 0;
  const magentaCoordinates = [];
  for (let index = 0; index < width * height; index++) {
    const pixel = index * 4;
    const alpha = pixels[pixel + 3];
    if (alpha === 0 && pixels[pixel] === 0 && pixels[pixel + 1] === 0 && pixels[pixel + 2] === 0) {
      transparentBlackPixels++;
    }
    if (alpha > 0 && alpha < 255) partialAlphaPixels++;
    if (alpha >= 224) highAlphaPixels++;
    if (definition.paddedGrid !== undefined || alpha === 0
      || !isMagentaHue(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2])) continue;
    const owner = owners[index];
    if (owner < 0 || ownerDistance(index, owner, width) > EDGE_RADIUS) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    edgeMagentaPixels++;
    if (magentaCoordinates.length < 8) magentaCoordinates.push([x, y]);
  }
  if (transparentBlackPixels > 0) {
    throw new Error(`${definition.file} has ${transparentBlackPixels} alpha-zero black-matte texels`);
  }
  if (definition.paddedGrid === undefined && definition.allowEdgeMagenta !== true && edgeMagentaPixels > 0) {
    throw new Error(`${definition.file} has ${edgeMagentaPixels} unprotected edge-magenta texels at ${JSON.stringify(magentaCoordinates)}`);
  }
  if (partialAlphaPixels < definition.minPartialAlphaPixels) {
    throw new Error(`${definition.file} has only ${partialAlphaPixels} partial-alpha texels; expected ${definition.minPartialAlphaPixels}`);
  }
  if (definition.minHighAlphaPixels !== undefined && highAlphaPixels < definition.minHighAlphaPixels) {
    throw new Error(`${definition.file} has only ${highAlphaPixels} high-alpha texels; expected ${definition.minHighAlphaPixels}`);
  }
  const paddedAtlas = definition.paddedGrid === undefined
    ? null
    : inspectPaddedAtlas(pixels, width, height, definition.paddedGrid, definition.gutterPixels, definition.file);
  const evidence = paddedAtlas === null ? null : verifyPaddedAtlasEvidence(definition, path, paddedAtlas);
  return {
    file: definition.file,
    width,
    height,
    partialAlphaPixels,
    highAlphaPixels,
    transparentBlackPixels,
    edgeMagentaPixels,
    paddedAtlas,
    evidence,
  };
}

const results = [];
for (const definition of SHEETS) results.push(inspectSheet(definition));
console.log(`[verify-vfx-textures] ${JSON.stringify(results)}`);
