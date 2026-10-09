import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, parseBackup } from '../js/backup.js';

const toUrl = async (b) => `data:${b.type};base64,${Buffer.from(await b.arrayBuffer()).toString('base64')}`;
const toBlob = (u) => {
  const [head, b64] = u.split(',');
  return new Blob([Buffer.from(b64, 'base64')], { type: head.slice(5, head.indexOf(';')) });
};

const sample = () => ({
  qr: [{
    id: 'q1', kind: 'trainer', label: 'Me', image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    bytes: [65, 66], text: 'AB', showOriginal: false,
    frame: { style: 'star', color: '#ff0000', accent: '#ffff00', background: new Blob([new Uint8Array([9])], { type: 'image/jpeg' }) },
    createdAt: 1,
  }],
  tags: [{ id: 't1', name: 'Pikachu', pokemonId: 25, photo: null, note: 'n', favorite: true, createdAt: 2 }],
  owned: [{ id: '2-3-001', at: 3 }],
});

test('round trip preserves records and blob bytes', async () => {
  const json = JSON.parse(JSON.stringify(await serializeBackup(sample(), toUrl)));
  assert.equal(json.app, 'mezastar-wallet');
  assert.equal(json.version, 1);
  const { qr, tags } = parseBackup(json, toBlob);
  assert.equal(qr[0].text, 'AB');
  assert.deepEqual([...new Uint8Array(await qr[0].image.arrayBuffer())], [1, 2, 3]);
  assert.equal(qr[0].frame.background.type, 'image/jpeg');
  assert.equal(qr[0].frame.style, 'star');
  assert.deepEqual(tags[0], sample().tags[0]);
  assert.deepEqual(parseBackup(json, toBlob).owned, [{ id: '2-3-001', at: 3 }]);
});

test('older backups without owned still import', async () => {
  const json = JSON.parse(JSON.stringify(await serializeBackup({ qr: [], tags: [] }, toUrl)));
  delete json.owned;
  assert.deepEqual(parseBackup(json, toBlob).owned, []);
});

test('serialize does not mutate input', async () => {
  const s = sample();
  await serializeBackup(s, toUrl);
  assert.ok(s.qr[0].image instanceof Blob);
});

test('rejects foreign JSON', () => {
  assert.throws(() => parseBackup({ hello: 1 }, toBlob), /Not a Mezastar Wallet backup/);
  assert.throws(() => parseBackup(null, toBlob), /Not a Mezastar Wallet backup/);
});
