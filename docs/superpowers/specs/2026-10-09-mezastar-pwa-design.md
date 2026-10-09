# Mezastar Wallet PWA — Design

## Goal
A small offline-first PWA for Pokémon Mezastar players. No login, no server; all data lives on the device.

## Features
1. **E-TrainerID** — import a photo/screenshot of the trainer ID QR, crop in-app, decode it, and display a re-drawn QR inside a customizable frame. Full-screen "scan mode" for the arcade reader.
2. **My Tags** — save owned Pokémon tags: cropped photo, Pokémon name (offline autocomplete), note, favorite flag. Searchable grid.
3. **Support QR** — save official support-Pokémon QR codes, same import/crop/decode/frame flow as the trainer ID. Multiple items, each with a label.
4. **Settings** — export / import a full JSON backup (images embedded as data URLs), storage usage, wipe data.

## Non-goals
Accounts, sync, scraping official Mezastar services, tag stats/moves/rarity.

## Architecture
Static vanilla JS (ES modules), no build step. Hostable on any static host; served over HTTPS (or localhost) for the service worker.

| Module | Responsibility |
|---|---|
| `js/db.js` | IndexedDB wrapper: `put/get/getAll/delete/clear` per store (`qr`, `tags`). |
| `js/cropper.js` | Modal crop UI: pan (drag), zoom (wheel/pinch/slider), rotate 90°, aspect presets. Returns a Blob. |
| `js/qr.js` | `decodeQr(imageData)` via jsQR (returns bytes + text); `encodeQr(bytes)` via qrcode-generator in byte mode → module matrix. |
| `js/frame.js` | `renderFrame(canvas, {matrix | image, frame})` draws background, border style, quiet zone, QR. Pure function of inputs. |
| `js/pokemon.js` | Bundled name list (`data/pokemon.json`) for autocomplete; optional online sprite lookup (PokéAPI), cached by SW. |
| `js/backup.js` | Serialize/deserialize all records with blobs ↔ data URLs. |
| `js/app.js` | Router (hash tabs), screens, event wiring. |
| `sw.js` | Precache app shell (cache-first); runtime cache for sprites. |

Vendored libs in `vendor/`: `jsQR.js`, `qrcode.js` (qrcode-generator).

## Data
- QR item: `{id, kind: 'trainer'|'support', label, image: Blob, bytes: number[]|null, text: string|null, showOriginal: bool, frame: {style, color, accent, background: Blob|null}, createdAt}`
- Tag: `{id, name, photo: Blob, note, favorite, createdAt}`
- Only one `trainer` item is shown as the E-TrainerID (latest); replacing asks for confirmation.

## QR fidelity
Decode keeps the raw `binaryData` bytes; re-encode uses byte mode with those exact bytes, so payload is preserved even if non-UTF-8. Error correction M. If decode fails, the item is "image only" and displays the cropped original. Each item can toggle original vs re-drawn.

## Frames
Styles: `clean`, `pokeball`, `star`, `neon`, `holo`. Each has a color + accent picker and optional cropped background image. QR always on a white panel with ≥4-module quiet zone; decoration never overlaps the code. "Save PNG" exports the rendered frame.

## Scan mode
Full-screen white view, QR as large as possible, Wake Lock API to keep screen on (where supported). Hint to raise brightness (browsers can't set it).

## Errors
- Decode failure → toast + image-only fallback.
- Storage: request `navigator.storage.persist()`; quota errors surfaced as toast.
- Backup import validates version/shape before writing; merges by id.

## Testing
- `node --test` unit tests for pure logic: QR encode/decode round trip (jsQR on rendered matrix), backup serialization, frame layout geometry, pokemon search.
- Manual browser check: install, offline reload, crop, decode, scan mode.
