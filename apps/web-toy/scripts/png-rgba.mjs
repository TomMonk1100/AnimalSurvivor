/* global Buffer */
/**
 * Tiny deterministic RGBA PNG encoder for offline asset tooling.
 *
 * node-canvas correctly displays alpha but serializes transparent RGB through
 * a premultiplied path, which destroys the alpha-bleed matte needed by linear
 * mipmaps. This encoder writes the caller's literal unpremultiplied RGBA bytes
 * as an 8-bit non-interlaced PNG instead.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.allocUnsafe(payload.length + 12);
  output.writeUInt32BE(payload.length, 0);
  typeBuffer.copy(output, 4);
  payload.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, payload])), payload.length + 8);
  return output;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

/** Decodes only the 8-bit, non-interlaced RGBA PNGs this toolchain ships. */
export function decodeRgbaPng(contents) {
  if (!Buffer.isBuffer(contents) || !contents.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('expected a PNG buffer');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset + 12 <= contents.length) {
    const length = contents.readUInt32BE(offset);
    const type = contents.toString('ascii', offset + 4, offset + 8);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    if (payloadEnd + 4 > contents.length) throw new Error('truncated PNG chunk');
    if (type === 'IHDR') {
      width = contents.readUInt32BE(payloadStart);
      height = contents.readUInt32BE(payloadStart + 4);
      if (contents[payloadStart + 8] !== 8 || contents[payloadStart + 9] !== 6 || contents[payloadStart + 12] !== 0) {
        throw new Error('expected non-interlaced 8-bit RGBA PNG');
      }
    } else if (type === 'IDAT') {
      idat.push(contents.subarray(payloadStart, payloadEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = payloadEnd + 4;
  }
  if (width < 1 || height < 1) throw new Error('missing PNG dimensions');
  const rowBytes = width * 4;
  const scanlines = inflateSync(Buffer.concat(idat));
  if (scanlines.length !== height * (rowBytes + 1)) throw new Error('unexpected PNG scanline length');
  const data = new Uint8ClampedArray(width * height * 4);
  let sourceOffset = 0;
  for (let row = 0; row < height; row++) {
    const filter = scanlines[sourceOffset++];
    const destination = row * rowBytes;
    for (let column = 0; column < rowBytes; column++) {
      const filtered = scanlines[sourceOffset++];
      const left = column >= 4 ? data[destination + column - 4] : 0;
      const above = row > 0 ? data[destination - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= 4 ? data[destination - rowBytes + column - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft)
                : (() => { throw new Error(`unsupported PNG filter ${filter}`); })();
      data[destination + column] = (filtered + predictor) & 0xff;
    }
  }
  return { width, height, data };
}

function encodePng(width, height, pixels, channels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`invalid PNG dimensions ${width}×${height}`);
  }
  if (channels !== 3 && channels !== 4) throw new RangeError(`unsupported channel count: ${channels}`);
  if (pixels.length !== width * height * channels) {
    throw new RangeError(`PNG source has ${pixels.length} bytes; expected ${width * height * channels}`);
  }
  const rowBytes = width * channels;
  const scanlines = Buffer.allocUnsafe(height * (rowBytes + 1));
  const source = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  for (let row = 0; row < height; row++) {
    const destination = row * (rowBytes + 1);
    const sourceOffset = row * rowBytes;
    const previousOffset = sourceOffset - rowBytes;
    let bestFilter = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    const candidate = Buffer.allocUnsafe(rowBytes);
    const best = Buffer.allocUnsafe(rowBytes);

    // PNG filters transform only the encoded bytes, never the literal RGBA
    // values. Choosing the least-noisy standard filter preserves the
    // unpremultiplied alpha-bleed matte while restoring practical payload
    // sizes for the asset cap.
    for (let filter = 0; filter <= 4; filter++) {
      let score = 0;
      for (let column = 0; column < rowBytes; column++) {
        const value = source[sourceOffset + column];
        const left = column >= channels ? source[sourceOffset + column - channels] : 0;
        const above = row > 0 ? source[previousOffset + column] : 0;
        const upperLeft = row > 0 && column >= channels ? source[previousOffset + column - channels] : 0;
        let predictor = 0;
        if (filter === 1) predictor = left;
        else if (filter === 2) predictor = above;
        else if (filter === 3) predictor = Math.floor((left + above) / 2);
        else if (filter === 4) {
          const estimate = left + above - upperLeft;
          const leftDistance = Math.abs(estimate - left);
          const aboveDistance = Math.abs(estimate - above);
          const upperLeftDistance = Math.abs(estimate - upperLeft);
          predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
            ? left
            : aboveDistance <= upperLeftDistance
              ? above
              : upperLeft;
        }
        const filtered = (value - predictor + 256) & 0xff;
        candidate[column] = filtered;
        score += filtered < 128 ? filtered : 256 - filtered;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        candidate.copy(best);
      }
    }
    scanlines[destination] = bestFilter;
    best.copy(scanlines, destination + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // RGBA or RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Writes literal RGB under alpha=0; caller is responsible for valid dimensions. */
export function encodeRgbaPng(width, height, pixels) {
  return encodePng(width, height, pixels, 4);
}

/** Lossless 8-bit RGB counterpart for opaque authored portrait art. */
export function encodeRgbPng(width, height, pixels) {
  return encodePng(width, height, pixels, 3);
}
