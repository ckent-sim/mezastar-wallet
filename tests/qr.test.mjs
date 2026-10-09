import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// vendor/jsQR.js is the same file as the npm dist; require the CJS copy in Node
globalThis.jsQR = createRequire(import.meta.url)('jsqr');
const { decodeQr, encodeQr, matrixToImageData, verifyReencode } = await import('../js/qr.js');

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
