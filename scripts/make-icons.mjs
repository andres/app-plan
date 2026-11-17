// Rasterises the app icon (same design as public/icon.svg) to PNG without extra deps.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#111318'), LINE = hex('#5b6b9a'), A = hex('#7c9cff'), B = hex('#4fd1a5');
const inRRect = (x, y, rx, ry, w, h, r) => {
  const cx = Math.min(Math.max(x, rx + r), rx + w - r), cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return x >= rx && x <= rx + w && y >= ry && y <= ry + h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const nearSeg = (x, y, x1, y1, x2, y2, w) => {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) <= w / 2;
};
// Colour at a point in 64x64 icon space; null = transparent. Maskable: full-bleed background.
function colour(x, y, maskable) {
  let c = maskable || inRRect(x, y, 0, 0, 64, 64, 14) ? BG : null;
  if (!c) return null;
  const s = maskable ? 0.8 : 1, o = 32 * (1 - s); // shrink content into the maskable safe zone
  const X = (x - o) / s, Y = (y - o) / s;
  if (nearSeg(X, Y, 20, 22, 44, 22, 3) || nearSeg(X, Y, 20, 22, 32, 44, 3) || nearSeg(X, Y, 44, 22, 32, 44, 3)) c = LINE;
  if (inRRect(X, Y, 11, 15, 18, 14, 4) || inRRect(X, Y, 35, 15, 18, 14, 4)) c = A;
  if (inRRect(X, Y, 23, 37, 18, 14, 4)) c = B;
  return c;
}
function png(size, maskable) {
  const SS = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = colour(((px + (sx + 0.5) / SS) / size) * 64, ((py + (sy + 0.5) / SS) / size) * 64, maskable);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const i = py * (size * 4 + 1) + 1 + px * 4, n = SS * SS;
      raw[i] = a ? r / a : 0; raw[i + 1] = a ? g / a : 0; raw[i + 2] = a ? b / a : 0; raw[i + 3] = (a / n) * 255;
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('public/icon-192.png', png(192, false));
writeFileSync('public/icon-512.png', png(512, true));
console.log('icons written');
