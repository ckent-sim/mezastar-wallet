import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const sw = await readFile(new URL('sw.js', root), 'utf8');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('every js/vendor/css file is precached for offline use', async () => {
  for (const dir of ['js', 'vendor', 'css', 'icons', 'data/support-qr']) {
    for (const f of await readdir(new URL(`${dir}/`, root))) {
      assert.ok(assets.includes(`${dir}/${f}`), `${dir}/${f} missing from sw.js ASSETS`);
    }
  }
});

test('every precached file exists', async () => {
  for (const a of assets.filter((x) => x !== './')) await readFile(new URL(a, root));
});
