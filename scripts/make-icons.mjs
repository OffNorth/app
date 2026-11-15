// Génère les icônes PWA (192/512, maskable, apple-touch-icon, favicon) sans dépendance.
// Motif : mini-heatmap (tuiles vertes/rouges) sur fond sombre — aucun logo tiers.
// Lancé automatiquement par Vercel au build (npm run build), et à la main via npm run icons.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '..', 'public', 'icons');
const BG = [11, 15, 20];
// [x0, y0, x1, y1] en fraction de la zone utile, couleur
const TILES = [
  [[0.0, 0.0, 0.58, 0.62], [22, 163, 74]],
  [[0.62, 0.0, 1.0, 0.36], [220, 38, 38]],
  [[0.62, 0.4, 1.0, 0.62], [21, 128, 61]],
  [[0.0, 0.66, 0.36, 1.0], [185, 28, 28]],
  [[0.4, 0.66, 0.7, 1.0], [34, 197, 94]],
  [[0.74, 0.66, 1.0, 1.0], [127, 29, 29]],
];

function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px >= x1 || py < y0 || py >= y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** Rendu avec suréchantillonnage 4×4 pour un anticrénelage propre. */
function render(size, safe, radiusFrac) {
  const SS = 4;
  const pad = (size * (1 - safe)) / 2;
  const span = size - 2 * pad;
  const r = span * radiusFrac;
  const rects = TILES.map(([[a, b, c, d], col]) => [pad + a * span, pad + b * span, pad + c * span, pad + d * span, col]);
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          let col = BG;
          for (const [x0, y0, x1, y1, c] of rects) if (inRoundedRect(fx, fy, x0, y0, x1, y1, r)) { col = c; break; }
          acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
        }
      }
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(acc[k] / (SS * SS));
    }
  }
  return encodePNG(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtre "None"
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const ICONS = [
  ['icon-512.png', 512, 0.74, 0.05],
  ['icon-192.png', 192, 0.74, 0.05],
  ['maskable-512.png', 512, 0.58, 0.05],
  ['maskable-192.png', 192, 0.58, 0.05],
  ['apple-touch-icon.png', 180, 0.7, 0.05],
  ['favicon-32.png', 32, 0.84, 0.04],
];
for (const [name, size, safe, radius] of ICONS) writeFileSync(join(OUT, name), render(size, safe, radius));
console.log(`icônes générées dans ${OUT}`);
