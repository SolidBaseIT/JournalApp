// Generates the PWA icons (solid background, ring + checkmark) with no dependencies.
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function drawIcon(size) {
  const bg = [30, 27, 75]; // indigo-950
  const bg2 = [67, 56, 202]; // indigo-700, radial highlight
  const white = [255, 255, 255];
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ringInner = size * 0.3;
  const ringOuter = size * 0.36;
  const thick = size * 0.032;
  // Checkmark points inside the ring
  const ax = size * 0.38, ay = size * 0.52;
  const bx = size * 0.47, by = size * 0.61;
  const ex = size * 0.63, ey = size * 0.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const glow = Math.max(0, 1 - d / (size * 0.7));
      let px = [
        bg[0] + (bg2[0] - bg[0]) * glow,
        bg[1] + (bg2[1] - bg[1]) * glow,
        bg[2] + (bg2[2] - bg[2]) * glow,
      ];
      const onRing = d >= ringInner && d <= ringOuter && !(y < cy && Math.abs(x - cx) < size * 0.05);
      const onCheck =
        distToSegment(x, y, ax, ay, bx, by) < thick || distToSegment(x, y, bx, by, ex, ey) < thick;
      if (onRing || onCheck) px = white;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(px[0]);
      buf[i + 1] = Math.round(px[1]);
      buf[i + 2] = Math.round(px[2]);
      buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  writeFileSync(join(OUT, name), drawIcon(size));
  console.log(`wrote public/${name}`);
}
