/* Generates the PWA icons as real PNG files — a gold ingot mark on a dark ground. */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [8, 9, 12];
const GOLD = [212, 175, 55];
const GOLD_DARK = [150, 118, 30];

/** A trapezoid ingot with a highlight band, drawn analytically so it scales cleanly. */
function ingot(maskable) {
  return (x, y, size) => {
    const s = size;
    const inset = maskable ? 0.22 : 0.14;
    const cx = s / 2;
    const top = s * (0.5 - (0.5 - inset) * 0.55);
    const bottom = s * (0.5 + (0.5 - inset) * 0.55);
    const halfTop = s * (0.5 - inset) * 0.62;
    const halfBottom = s * (0.5 - inset) * 0.92;

    const rounded = (() => {
      // rounded background square
      const r = maskable ? s : s * 0.22;
      const dx = Math.max(Math.abs(x - cx) - (s / 2 - r), 0);
      const dy = Math.max(Math.abs(y - cx) - (s / 2 - r), 0);
      return Math.hypot(dx, dy) <= r;
    })();
    if (!rounded) return [0, 0, 0, 0];

    if (y >= top && y <= bottom) {
      const k = (y - top) / (bottom - top);
      const half = halfTop + (halfBottom - halfTop) * k;
      if (Math.abs(x - cx) <= half) {
        const shade = 0.82 + 0.35 * (1 - k);
        const band = y > top + (bottom - top) * 0.42 && y < top + (bottom - top) * 0.58;
        const c = band ? GOLD_DARK : GOLD;
        return [
          Math.min(255, Math.round(c[0] * shade)),
          Math.min(255, Math.round(c[1] * shade)),
          Math.min(255, Math.round(c[2] * shade)),
          255,
        ];
      }
    }
    return [...BG, 255];
  };
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, ingot(false)));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, ingot(false)));
fs.writeFileSync(path.join(OUT, 'maskable-512.png'), png(512, ingot(true)));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), png(180, ingot(false)));
console.log('icons written to', OUT);
