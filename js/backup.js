// Backup (de)serialization. Blob fields ↔ data-URL strings so the result is plain JSON.
// Converters are injected so this module stays pure and testable in Node.

const APP = 'mezastar-wallet';
const VERSION = 1;

async function mapBlobs(value, fn) {
  if (value instanceof Blob) return fn(value);
  if (Array.isArray(value)) return Promise.all(value.map((v) => mapBlobs(v, fn)));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await mapBlobs(v, fn);
    return out;
  }
  return value;
}

function mapDataUrls(value, fn) {
  if (typeof value === 'string' && /^data:[\w.+-]+\/[\w.+-]+;base64,/.test(value)) return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapDataUrls(v, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapDataUrls(v, fn)]));
  }
  return value;
}

export async function serializeBackup({ qr, tags }, blobToDataUrl) {
  return {
    app: APP,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    qr: await mapBlobs(qr, blobToDataUrl),
    tags: await mapBlobs(tags, blobToDataUrl),
  };
}

export function parseBackup(obj, dataUrlToBlob) {
  if (!obj || obj.app !== APP || !Array.isArray(obj.qr) || !Array.isArray(obj.tags)) {
    throw new Error('Not a Mezastar Wallet backup');
  }
  if (obj.version > VERSION) throw new Error('Backup is from a newer app version');
  const valid = (r) => r && typeof r.id === 'string';
  return {
    qr: mapDataUrls(obj.qr.filter(valid), dataUrlToBlob),
    tags: mapDataUrls(obj.tags.filter(valid), dataUrlToBlob),
  };
}
