# Mezastar Wallet PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offline PWA storing an E-TrainerID QR, owned Pokémon tags, and support-Pokémon QR codes on-device, with in-app cropping and framed QR re-drawing.

**Architecture:** Static vanilla-JS ES modules, no build step. Pure logic modules (`qr`, `frame`, `pokemon`, `backup`) are unit tested with `node --test`; DOM modules (`cropper`, `app`) verified in the browser. IndexedDB for storage, service worker for offline.

**Tech Stack:** Vanilla JS (ES2020 modules), IndexedDB, Service Worker, jsQR 1.4 (UMD, `window.jsQR`), qrcode-generator 2.x (`vendor/qrcode.mjs`), Node 22 test runner.

## Global Constraints
- No login, no server; all user data stays in IndexedDB on the device.
- Every feature works offline; network only for optional Pokémon sprites.
- QR re-encode uses byte mode with the exact decoded `binaryData`, error correction `M`.
- Quiet zone ≥ 4 modules; frame decoration never overlaps the QR panel.
- Tag fields: `name`, `photo`, `note`, `favorite` only.
- No build step: files under the repo root are served as-is.

## File Structure
```
index.html, manifest.webmanifest, sw.js
css/app.css
js/app.js        UI, router, screens
js/db.js         IndexedDB wrapper
js/cropper.js    modal crop UI → Blob
js/qr.js         decode/encode
js/frame.js      frame layout + canvas render
js/pokemon.js    name search + sprite URL
js/backup.js     export/import JSON
js/util.js       blob/dataURL/image helpers, toast
vendor/jsQR.js, vendor/qrcode.mjs
data/pokemon.json
icons/icon.svg, icon-192.png, icon-512.png
scripts/build-pokemon.mjs, scripts/make-icons.mjs
tests/*.test.mjs
```

---

### Task 1: Scaffold, vendor libs, Pokémon data

**Files:** Create `vendor/jsQR.js`, `vendor/qrcode.mjs` (copied from node_modules), `scripts/build-pokemon.mjs`, `data/pokemon.json`, modify `package.json` (`"type":"module"`, `"test":"node --test tests/"`).

**Produces:** `data/pokemon.json` = `[{ "id": number, "en": string, "ja": string, "zh": string }]` (zh = traditional Chinese, id 4; fall back to simplified id 12).

- [ ] Step 1: copy vendor files.
- [ ] Step 2: `build-pokemon.mjs` fetches `https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv`, picks language ids 9 (en), 1 (ja-Hrkt), 4/12 (zh), writes sorted JSON.
- [ ] Step 3: `node scripts/build-pokemon.mjs` → expect ~1025 entries; entry 25 has `en: "Pikachu"`.
- [ ] Step 4: commit.

### Task 2: `js/qr.js`

**Interfaces — Produces:**
- `decodeQr(imageData: {data: Uint8ClampedArray, width, height}) → {bytes: number[], text: string} | null` (uses `globalThis.jsQR`, `inversionAttempts: 'attemptBoth'`)
- `encodeQr(bytes: number[]) → {size: number, isDark(r, c): boolean}`
- `matrixToImageData(matrix, scale, margin) → {data, width, height}` (pure, for tests and decode-verify)

- [ ] Step 1: test `tests/qr.test.mjs`:
```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.jsQR = createRequire(import.meta.url)('../vendor/jsQR.js');
const { decodeQr, encodeQr, matrixToImageData } = await import('../js/qr.js');
test('round trip ascii', () => {
  const bytes = [...Buffer.from('MEZASTAR-1234567890')];
  const r = decodeQr(matrixToImageData(encodeQr(bytes), 6, 4));
  assert.deepEqual(r.bytes, bytes); assert.equal(r.text, 'MEZASTAR-1234567890');
});
test('round trip non-utf8 bytes', () => {
  const bytes = [0, 255, 128, 7, 200, 13, 10];
  assert.deepEqual(decodeQr(matrixToImageData(encodeQr(bytes), 6, 4)).bytes, bytes);
});
test('decode garbage → null', () => {
  const w = 50, d = new Uint8ClampedArray(w*w*4).fill(255);
  assert.equal(decodeQr({ data: d, width: w, height: w }), null);
});
```
- [ ] Step 2: run `npm test` → FAIL (module missing).
- [ ] Step 3: implement (`qrcode(0,'M')`, `addData(String.fromCharCode(...bytes),'Byte')`, `make()`).
- [ ] Step 4: `npm test` → PASS. Commit.

### Task 3: `js/frame.js`

**Interfaces — Produces:**
- `FRAME_STYLES: string[]` = `['clean','pokeball','star','neon','holo']`
- `frameLayout(width, moduleCount) → {panel:{x,y,size}, qr:{x,y,size,module}}` — panel centered, square, QR area = panel minus 4-module quiet zone each side, module size integer px.
- `renderFrame(ctx, width, {matrix|null, image|null, frame:{style,color,accent}, background: ImageBitmap|HTMLImageElement|null})` — draws (canvas is square `width`×`width`).

- [ ] Step 1: test `tests/frame.test.mjs`: layout for width 1000 and moduleCount 25 → `qr.module` is an integer ≥ 1, `qr.x - panel.x >= 4*qr.module`, `panel.x + panel.size <= width`, panel centered (±1px).
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: PASS. Commit.

### Task 4: `js/pokemon.js`

**Produces:** `searchPokemon(list, query, limit=8) → entry[]` (case/diacritic-insensitive prefix match first, then substring, across en/ja/zh, also `#25` id match); `spriteUrl(id) → string` (PokéAPI official artwork).

- [ ] Step 1: tests — `'pika'` → first is id 25; `'ピカ'` → contains 25; `'#6'` → id 6; empty → `[]`.
- [ ] Steps 2–4: fail, implement, pass. Commit.

### Task 5: `js/db.js`, `js/util.js`, `js/backup.js`

**Produces:**
- db: `dbPut(store, obj)`, `dbGet(store, id)`, `dbAll(store)`, `dbDelete(store, id)`, `dbClear(store)`; stores `'qr'`, `'tags'`, keyPath `id`.
- util: `uid()`, `blobToDataUrl(blob)`, `dataUrlToBlob(url)`, `loadImage(blob|url) → HTMLImageElement`, `toast(msg)`.
- backup: `serializeBackup({qr, tags}, blobToDataUrl) → Promise<object>` (`{app:'mezastar-wallet', version:1, exportedAt, qr, tags}`, Blob fields → data URL strings); `parseBackup(obj, dataUrlToBlob) → {qr, tags}` throws `Error('Not a Mezastar Wallet backup')` on bad shape.
- [ ] Step 1: `tests/backup.test.mjs` — round trip with Node `Blob` + simple converters preserves fields and blob bytes; invalid object throws.
- [ ] Steps 2–4: fail, implement, pass. Commit.

### Task 6: `js/cropper.js`

**Produces:** `openCropper(source: Blob, {aspect: number|null = 1, title}) → Promise<Blob|null>` — full-screen modal; canvas preview; drag to pan, wheel/pinch + slider zoom, rotate 90° button, aspect chips (1:1, 4:3, Free(=image aspect)), Cancel/Use. Output PNG at crop resolution capped at 1600px.
- [ ] Browser check: crop a screenshot; output Blob dimensions match aspect. Commit.

### Task 7: App shell and screens (`index.html`, `css/app.css`, `js/app.js`)

- Tabs (hash routes): `#trainer`, `#tags`, `#support`, `#settings`.
- Trainer: framed card canvas, buttons Import / Edit frame / Scan mode / Save PNG / toggle original. Empty state with import CTA.
- QR import flow: file input (`accept="image/*"`, camera capture allowed) → `openCropper` → decode cropped, fallback decode full image → save item → toast "Decoded ✓" or "Couldn't read QR — saved image only".
- Frame editor sheet: style chips, color + accent inputs, background import (cropper 1:1) / remove; live preview.
- Scan mode: full-screen white overlay, `navigator.wakeLock.request('screen')`, tap to close.
- Tags: search box, favorites-first grid, add/edit sheet (photo via cropper 1:1, name with autocomplete from `searchPokemon`, note, favorite), delete with confirm.
- Support: list of framed QR cards with label, same import/frame/scan actions, delete.
- Settings: export backup (download JSON), import backup (file), storage estimate, persist status, wipe data (confirm).
- [ ] Browser check every screen. Commit.

### Task 8: PWA — `manifest.webmanifest`, `sw.js`, icons

- Manifest: name "Mezastar Wallet", `display: standalone`, theme `#e3350d`, icons 192/512 + maskable.
- SW: versioned precache of all shell files; cache-first for shell; stale-while-revalidate runtime cache for sprite hosts; delete old caches on activate.
- `scripts/make-icons.mjs` rasterizes nothing (no deps) — icons drawn in browser once and saved, or SVG icon plus PNGs generated via headless canvas in the browser pane.
- [ ] Browser check: SW installed, reload offline works. Commit.

### Task 9: Final verification
- [ ] `npm test` all pass; browser walk-through of every flow; README with run/host instructions. Commit.
