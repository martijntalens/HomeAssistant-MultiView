'use strict';
// Generates assets/icon.png (256x256) without extra dependencies:
// a rounded blue tile with a tiled "multi-pane" glyph.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const SS = 4; // supersampling per axis
const px = Buffer.alloc(S * S * 4);

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Pane rectangles inside the tile: one tall pane left, two stacked right.
const panes = [
  [52, 60, 122, 196],
  [134, 60, 204, 122],
  [134, 134, 204, 196],
];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS;
        const fy = y + (sy + 0.5) / SS;
        if (!inRoundRect(fx, fy, 8, 8, 248, 248, 52)) continue;
        // vertical gradient #26c6f9 -> #0288d1
        const t = (fy - 8) / 240;
        let cr = 38 + (2 - 38) * t, cg = 198 + (136 - 198) * t, cb = 249 + (209 - 249) * t;
        for (const [x0, y0, x1, y1] of panes) {
          if (inRoundRect(fx, fy, x0, y0, x1, y1, 10)) {
            cr = 255; cg = 255; cb = 255;
            if (fy < y0 + 14) { cr = 220; cg = 244; cb = 253; } // pane header strip
          }
        }
        r += cr; g += cg; b += cb; a += 255;
      }
    }
    const n = SS * SS;
    const i = (y * S + x) * 4;
    const cov = a / n / 255;
    px[i] = cov ? Math.round(r / (cov * n)) : 0;
    px[i + 1] = cov ? Math.round(g / (cov * n)) : 0;
    px[i + 2] = cov ? Math.round(b / (cov * n)) : 0;
    px[i + 3] = Math.round(a / n);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(out, png);
console.log('Wrote', out, png.length, 'bytes');
