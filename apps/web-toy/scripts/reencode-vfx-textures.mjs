/* global console, process, Buffer */
/**
 * Losslessly rewrites the shipped RGBA VFX PNGs with the deterministic
 * adaptive-filter encoder. Unlike repair-vfx-alpha this never changes a
 * pixel: it is only used to retain literal alpha-matte RGB within the
 * production payload budget.
 */
import { inflateSync } from 'node:zlib';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRgbPng, encodeRgbaPng } from './png-rgba.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const assetRoot = join(resolve(scriptDir, '../../..'), 'assets');
const VFX_FILES = Object.freeze([
  'ui/vfx/wildguard-signature-frames-v3.png',
  'ui/vfx/wildguard-signature-bodies-v1.png',
  'ui/vfx/wildguard-world-frames-v2.png',
  'ui/vfx/wildguard-fields-frames-v3.png',
  'ui/vfx/wildguard-melee-frames-v3.png',
  'ui/vfx/wildguard-projectile-frames-v3.png',
  'ui/vfx/wildguard-aura-frames-v3.png',
  'ui/vfx/wildguard-gecko-dissolve-frames-v1.png',
  'ui/vfx/wildguard-skunk-dissolve-frames-v1.png',
  'ui/vfx/wildguard-royal-stink-dissolve-frames-v1.png',
  'ui/vfx/wildguard-fluffy-shield-dissolve-frames-v1.png',
  'ui/vfx/wildguard-impact-core-v1.png',
  'ui/vfx/wildguard-signature-debris-v1.png',
  'ui/vfx/wildguard-ground-contact-v1.png',
]);
const UI_RUNTIME_PNG_FILES = Object.freeze([
  'ui/field-guide/greg-final-form-v1.png',
  'ui/field-guide/benny-final-form-v1.png',
  'ui/field-guide/gracie-final-form-v1.png',
  'ui/bosses/final-threat-v1.png',
  'ui/bosses/sandglass-sovereign-v1.png',
  'ui/heroes/benny-bastion-v1.png',
  'ui/heroes/gracie-surveyor-v1.png',
  'ui/enemies/bramblehog-v1.png',
  'ui/enemies/thornwing-v1.png',
  'ui/enemies/rootback-v1.png',
  'ui/enemies/hollowhart-warden-v1.png',
]);
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeRgbaPng(contents) {
  if (!contents.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const dataParts = [];
  while (offset + 12 <= contents.length) {
    const length = contents.readUInt32BE(offset);
    const type = contents.toString('ascii', offset + 4, offset + 8);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    if (payloadEnd + 4 > contents.length) throw new Error('truncated PNG');
    if (type === 'IHDR') {
      width = contents.readUInt32BE(payloadStart);
      height = contents.readUInt32BE(payloadStart + 4);
      const colorType = contents[payloadStart + 9];
      if (contents[payloadStart + 8] !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error('expected 8-bit RGB or RGBA PNG');
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') dataParts.push(contents.subarray(payloadStart, payloadEnd));
    else if (type === 'IEND') break;
    offset = payloadEnd + 4;
  }
  const rowBytes = width * channels;
  const compressed = inflateSync(Buffer.concat(dataParts));
  if (compressed.length !== height * (rowBytes + 1)) throw new Error('unexpected scanline length');
  const pixels = new Uint8Array(width * height * channels);
  let sourceOffset = 0;
  for (let row = 0; row < height; row++) {
    const filter = compressed[sourceOffset++];
    const destination = row * rowBytes;
    for (let column = 0; column < rowBytes; column++) {
      const filtered = compressed[sourceOffset++];
      const left = column >= channels ? pixels[destination + column - channels] : 0;
      const above = row > 0 ? pixels[destination - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= channels ? pixels[destination - rowBytes + column - channels] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft)
                : (() => { throw new Error(`unsupported filter ${filter}`); })();
      pixels[destination + column] = (filtered + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

const write = process.argv.includes('--write');
const includeUiRuntime = process.argv.includes('--include-ui-runtime');
const files = includeUiRuntime ? [...VFX_FILES, ...UI_RUNTIME_PNG_FILES] : VFX_FILES;
const results = files.map((file) => {
  const path = join(assetRoot, file);
  const beforeBytes = statSync(path).size;
  const decoded = decodeRgbaPng(readFileSync(path));
  const encoded = decoded.channels === 4
    ? encodeRgbaPng(decoded.width, decoded.height, decoded.pixels)
    : encodeRgbPng(decoded.width, decoded.height, decoded.pixels);
  const roundTrip = decodeRgbaPng(encoded);
  if (roundTrip.width !== decoded.width || roundTrip.height !== decoded.height || roundTrip.channels !== decoded.channels
    || !Buffer.from(roundTrip.pixels).equals(Buffer.from(decoded.pixels))) {
    throw new Error(`lossless re-encode failed for ${file}`);
  }
  if (write) writeFileSync(path, encoded);
  return { file, beforeBytes, afterBytes: encoded.length };
});
console.log(JSON.stringify({ mode: write ? 'write' : 'preview', results }, null, 2));
