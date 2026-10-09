import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// vendor/jsQR.js is the same file as the npm dist; require the CJS copy in Node
globalThis.jsQR = createRequire(import.meta.url)('jsqr');
const { decodeQr, encodeQr, matrixToImageData, verifyReencode, stretchContrast, binarize, decodeWithVariants } = await import('../js/qr.js');

const roundTrip = (bytes) => decodeQr(matrixToImageData(encodeQr(bytes), 6, 4));

test('round trip ascii text', () => {
  const bytes = [...Buffer.from('MEZASTAR-1234567890')];
  const r = roundTrip(bytes);
  assert.deepEqual(r.bytes, bytes);
  assert.equal(r.text, 'MEZASTAR-1234567890');
});

test('round trip preserves non-UTF-8 bytes exactly', () => {
  const bytes = [0, 255, 128, 7, 200, 13, 10, 0x81, 0x40];
  assert.deepEqual(roundTrip(bytes).bytes, bytes);
});

test('round trip long payload', () => {
  const bytes = Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff);
  assert.deepEqual(roundTrip(bytes).bytes, bytes);
});

test('decode reports QR bounds', () => {
  const m = encodeQr([65, 66]);
  const { rect } = decodeQr(matrixToImageData(m, 6, 4));
  // quiet zone of 4 modules × 6px = 24px; QR spans size*6 px
  assert.ok(Math.abs(rect.x - 24) <= 6 && Math.abs(rect.y - 24) <= 6);
  assert.ok(Math.abs(rect.w - m.size * 6) <= 12);
});

test('verifyReencode', () => {
  assert.equal(verifyReencode([1, 2, 3, 250]), true);
  assert.equal(verifyReencode(new Array(4000).fill(7)), false); // too large for a QR
});

// A washed-out "photo": dark modules at gray 150, light at 175, with noise.
function washedOut(bytes) {
  const img = matrixToImageData(encodeQr(bytes), 6, 4);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let p = 0; p < img.data.length; p += 4) {
    const v = (img.data[p] ? 175 : 150) + Math.round((rnd() - 0.5) * 16);
    img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
  }
  return img;
}

test('stretchContrast spans full range', () => {
  const out = stretchContrast(washedOut([1, 2, 3]));
  let lo = 255;
  let hi = 0;
  for (let p = 0; p < out.data.length; p += 4) {
    lo = Math.min(lo, out.data[p]);
    hi = Math.max(hi, out.data[p]);
  }
  assert.equal(lo, 0);
  assert.equal(hi, 255);
});

test('binarize yields only black and white', () => {
  const out = binarize(washedOut([1, 2, 3]));
  for (let p = 0; p < out.data.length; p += 4) assert.ok(out.data[p] === 0 || out.data[p] === 255);
});

test('decodeWithVariants reads a washed-out photo', () => {
  const bytes = [...Buffer.from('MZ-TRAINER-42'), 0xfe];
  assert.deepEqual(decodeWithVariants(washedOut(bytes)).bytes, bytes);
});

test('blank image decodes to null', () => {
  const w = 60;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  assert.equal(decodeQr({ data, width: w, height: w }), null);
});

test('matrix exposes size and isDark', () => {
  const m = encodeQr([65]);
  assert.equal(m.size, 21);
  assert.equal(m.isDark(0, 0), true); // finder pattern corner
});
