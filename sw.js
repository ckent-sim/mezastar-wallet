// Offline service worker: precached app shell (cache-first) + runtime cache for sprites.
const VERSION = 'v1';
const SHELL = `mz-shell-${VERSION}`;
const RUNTIME = 'mz-sprites';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/autocomplete.js',
  'js/backup.js',
  'js/cropper.js',
  'js/db.js',
  'js/frame.js',
  'js/pokemon.js',
  'js/qr.js',
  'js/qr-ui.js',
  'js/settings-ui.js',
  'js/sheet.js',
  'js/tags-ui.js',
  'js/util.js',
  'vendor/jsQR.js',
  'vendor/qrcode.mjs',
  'data/pokemon.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('mz-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // navigations → cached index.html; other shell files cache-first
    e.respondWith((async () => {
      const cached = await caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
      return cached ?? fetch(req);
    })());
    return;
  }

  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/PokeAPI/sprites/')) {
    // sprites: cache on first view, then serve offline
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
  }
});
