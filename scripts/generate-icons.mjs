/**
 * Generates the PWA icon set from code, so the brand colour lives in one place
 * and the icons can be regenerated if it ever changes.
 *
 * Writes a minimal PNG by hand (deflate + CRC32) rather than pulling in a native
 * image dependency — the deploy payload has to stay portable to Windows Node.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BRAND = [0xf7, 0x94, 0x1d];
const WHITE = [0xff, 0xff, 0xff];
const DARK = [0x15, 0x14, 0x12];

// 5x7 bitmaps, enough for the "LC" monogram.
const GLYPHS = {
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** pixels: Uint8Array of RGBA, length = size * size * 4 */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  // Each scanline is prefixed with its filter type (0 = none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size, { maskable = false, background = BRAND } = {}) {
  const pixels = new Uint8Array(size * size * 4);

  // Maskable icons need the glyph inside the safe zone, because launchers crop
  // to a circle; a plain icon can use rounded corners instead.
  const radius = maskable ? 0 : Math.round(size * 0.22);

  const setPixel = (x, y, colour) => {
    const index = (y * size + x) * 4;
    pixels[index] = colour[0];
    pixels[index + 1] = colour[1];
    pixels[index + 2] = colour[2];
    pixels[index + 3] = 255;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inside = true;
      if (radius > 0) {
        const dx = Math.min(x, size - 1 - x);
        const dy = Math.min(y, size - 1 - y);
        if (dx < radius && dy < radius) {
          const ox = radius - dx;
          const oy = radius - dy;
          inside = ox * ox + oy * oy <= radius * radius;
        }
      }
      if (inside) setPixel(x, y, background);
    }
  }

  // "LC" centred, scaled to the safe area.
  const scale = Math.max(1, Math.floor((size * (maskable ? 0.45 : 0.6)) / 11));
  const glyphWidth = 5 * scale;
  const gap = scale;
  const totalWidth = glyphWidth * 2 + gap;
  const totalHeight = 7 * scale;
  const startX = Math.round((size - totalWidth) / 2);
  const startY = Math.round((size - totalHeight) / 2);

  let offsetX = startX;
  for (const letter of ["L", "C"]) {
    const rows = GLYPHS[letter];
    rows.forEach((row, rowIndex) => {
      [...row].forEach((cell, colIndex) => {
        if (cell !== "1") return;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const x = offsetX + colIndex * scale + dx;
            const y = startY + rowIndex * scale + dy;
            if (x >= 0 && x < size && y >= 0 && y < size) setPixel(x, y, WHITE);
          }
        }
      });
    });
    offsetX += glyphWidth + gap;
  }

  return encodePng(size, pixels);
}

const root = process.cwd();
const iconDir = path.join(root, "public", "icons");
mkdirSync(iconDir, { recursive: true });

const outputs = [
  [path.join(iconDir, "icon-192.png"), drawIcon(192)],
  [path.join(iconDir, "icon-512.png"), drawIcon(512)],
  [path.join(iconDir, "icon-maskable-512.png"), drawIcon(512, { maskable: true })],
  [path.join(iconDir, "apple-touch-icon.png"), drawIcon(180, { maskable: true })],
  [path.join(root, "src", "app", "icon.png"), drawIcon(96)],
  // Dark variant for the splash background.
  [path.join(iconDir, "icon-dark-512.png"), drawIcon(512, { background: DARK })],
];

for (const [file, buffer] of outputs) {
  writeFileSync(file, buffer);
  console.log(`wrote ${path.relative(root, file)} (${buffer.length} bytes)`);
}
