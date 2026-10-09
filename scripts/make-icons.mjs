// Generates icons/icon-192.png, icon-512.png, icon-maskable-512.png and icon.svg
// with no dependencies (procedural shapes, 4×4 supersampling, zlib PNG encoder).
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const RED = [227, 53, 13];
const DARK = [27, 27, 31];
const WHITE = [255, 255, 255];
const YELLOW = [255, 203, 5];

// Shapes in unit space (0..1). Later entries paint over earlier ones.
function shapes(maskable) {
  const inset = maskable ? 0.14 : 0.06; // maskable keeps art inside the safe zone
  const s = (v) => inset + v * (1 - inset * 2);
  const list = [];
  list.push({ color: maskable ? RED : null, test: () => true }); // full bleed for maskable
  if (!maskable) list.push({ color: RED, test: roundRect(0.02, 0.02, 0.96, 0.96, 0.22) });
  // white card
  list.push({ color: WHITE, test: roundRect(s(0.12), s(0.12), s(0.88) - s(0.12), s(0.88) - s(0.12), 0.07) });
  // three QR finder patterns
  for (const [fx, fy] of [[0.2, 0.2], [0.58, 0.2], [0.2, 0.58]]) {
    const o = 0.22;
    list.push({ color: DARK, test: rect(s(fx), s(fy), s(fx + o) - s(fx), s(fy + o) - s(fy)) });
    list.push({ color: WHITE, test: rect(s(fx + 0.035), s(fy + 0.035), s(fx + o - 0.035) - s(fx + 0.035), s(fy + o - 0.035) - s(fy + 0.035)) });
    list.push({ color: DARK, test: rect(s(fx + 0.07), s(fy + 0.07), s(fx + o - 0.07) - s(fx + 0.07), s(fy + o - 0.07) - s(fy + 0.07)) });
  }
  // star in the 4th quadrant
  list.push({ color: YELLOW, test: star(s(0.69), s(0.69), (s(0.9) - s(0.48)) / 2, 0.42) });
  list.push({ color: DARK, test: starOutline(s(0.69), s(0.69), (s(0.9) - s(0.48)) / 2, 0.42, 0.022) });
  return list;
}

const rect = (x, y, w, h) => (px, py) => px >= x && px <= x + w && py >= y && py <= y + h;
function roundRect(x, y, w, h, r) {
  return (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
}
function starPts(cx, cy, R, ratio) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? R * ratio : R;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const star = (cx, cy, R, ratio) => (x, y) => inPoly(starPts(cx, cy, R, ratio), x, y);
function starOutline(cx, cy, R, ratio, w) {
  const pts = starPts(cx, cy, R, ratio);
  const segDist = (x, y, [ax, ay], [bx, by]) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  return (x, y) => pts.some((p, i) => segDist(x, y, p, pts[(i + 1) % pts.length]) <= w / 2);
}

function render(size, maskable) {
  const list = shapes(maskable);
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = (y + (sy + 0.5) / SS) / size;
          let c = null;
          for (const sh of list) if (sh.color && sh.test(ux, uy)) c = sh.color;
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / 255;
      px[i] = cov ? r / cov : 0;
      px[i + 1] = cov ? g / cov : 0;
      px[i + 2] = cov ? b / cov : 0;
      px[i + 3] = a / n;
    }
  }
  return png(size, size, px);
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
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

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="2" y="2" width="96" height="96" rx="22" fill="#e3350d"/>
<rect x="16.6" y="16.6" width="66.8" height="66.8" rx="7" fill="#fff"/>
<g fill="#1b1b1f"><rect x="24.4" y="24.4" width="19.4" height="19.4"/><rect x="57.8" y="24.4" width="19.4" height="19.4"/><rect x="24.4" y="57.8" width="19.4" height="19.4"/></g>
<g fill="#fff"><rect x="27.5" y="27.5" width="13.2" height="13.2"/><rect x="60.9" y="27.5" width="13.2" height="13.2"/><rect x="27.5" y="60.9" width="13.2" height="13.2"/></g>
<g fill="#1b1b1f"><rect x="30.6" y="30.6" width="7" height="7"/><rect x="64" y="30.6" width="7" height="7"/><rect x="30.6" y="64" width="7" height="7"/></g>
<polygon fill="#ffcb05" stroke="#1b1b1f" stroke-width="2" stroke-linejoin="round" points="${starPts(66.7, 66.7, 18.5, 0.42).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>
</svg>`;

const dir = new URL('../icons/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('icon-192.png', dir), render(192, false));
await writeFile(new URL('icon-512.png', dir), render(512, false));
await writeFile(new URL('icon-maskable-512.png', dir), render(512, true));
await writeFile(new URL('icon.svg', dir), SVG);
console.log('icons written');
