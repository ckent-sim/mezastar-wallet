// Crops the original QR square out of each support ticket in support-src/ and saves it as
// data/support-qr/<id>.png, and fills in each entry's decoded bytes (hex) + img path.
// Only the QR area is kept (with a white quiet zone), not the ticket artwork.
// Run: node scripts/build-support.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const root = new URL('../', import.meta.url);
const sources = JSON.parse(await readFile(new URL('scripts/support-sources.json', root)));
const dataUrl = new URL('data/support.json', root);
const data = JSON.parse(await readFile(dataUrl));
await mkdir(new URL('data/support-qr/', root), { recursive: true });

function decodeFile(buf, name) {
  if (/\.png$/i.test(name)) {
    const png = PNG.sync.read(buf);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  }
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

for (const [file, id] of Object.entries(sources)) {
  if (file.startsWith('_')) continue;
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`${file}: no entry ${id} in data/support.json`);
  const img = decodeFile(await readFile(new URL(`support-src/${file}`, root)), file);
  const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  if (!hit) throw new Error(`${file}: QR not found`);

  const hex = Buffer.from(hit.binaryData).toString('hex');
  if (entry.hex && entry.hex !== hex) throw new Error(`${file}: decoded bytes differ from data/support.json`);
  entry.hex = hex;

  // QR bounds → square crop with a 4-module quiet zone painted white (removes ticket background)
  const l = hit.location;
  const xs = [l.topLeftCorner.x, l.topRightCorner.x, l.bottomLeftCorner.x, l.bottomRightCorner.x];
  const ys = [l.topLeftCorner.y, l.topRightCorner.y, l.bottomLeftCorner.y, l.bottomRightCorner.y];
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const qrSize = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  const modules = hit.version * 4 + 17;
  const pad = Math.round((qrSize / modules) * 4);
  const side = Math.round(qrSize) + pad * 2;
  const out = new PNG({ width: side, height: side });
  out.data.fill(255);
  for (let y = 0; y < qrSize; y++) {
    for (let x = 0; x < qrSize; x++) {
      const sx = Math.round(x0 + x);
      const sy = Math.round(y0 + y);
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const s = (sy * img.width + sx) * 4;
      const d = ((y + pad) * side + (x + pad)) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
    }
  }
  const pngBuf = PNG.sync.write(out, { colorType: 2 });

  // the crop must still scan to the same bytes
  const check = jsQR(new Uint8ClampedArray(out.data), side, side);
  if (!check || Buffer.from(check.binaryData).toString('hex') !== hex) throw new Error(`${file}: cropped QR does not re-scan`);

  entry.img = `data/support-qr/${id}.png`;
  await writeFile(new URL(entry.img, root), pngBuf);
  console.log(`${id}: ${side}px, ${(pngBuf.length / 1024).toFixed(1)} KB, version ${hit.version}`);
}

await writeFile(dataUrl, `${JSON.stringify(data, null, 1)}\n`);
console.log('updated data/support.json');
