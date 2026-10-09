import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

globalThis.jsQR = createRequire(import.meta.url)('jsqr');
const { verifyReencode } = await import('../js/qr.js');
const data = JSON.parse(await readFile(new URL('../data/support.json', import.meta.url)));
const REGIONS = ['SG', 'MY', 'PH', 'ID', 'TW', 'HK', 'TH', 'JP'];

test('support entries are well formed', () => {
  const ids = new Set();
  for (const e of data.entries) {
    assert.ok(e.id && !ids.has(e.id), `unique id ${e.id}`);
    ids.add(e.id);
    assert.ok((e.regions ?? []).every((r) => REGIONS.includes(r)), `${e.id} regions`);
    if (e.hex != null) assert.match(e.hex, /^([0-9a-f]{2})+$/, `${e.id} hex`);
  }
});

test('every official QR redraws byte-for-byte', () => {
  for (const e of data.entries.filter((x) => x.hex)) {
    const bytes = e.hex.match(/../g).map((h) => parseInt(h, 16));
    assert.ok(verifyReencode(bytes), e.id);
  }
});
