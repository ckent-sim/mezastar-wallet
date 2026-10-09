# Mezastar Wallet

An offline PWA for Pokémon Mezastar players. No login, no server: everything is saved on your device (IndexedDB).

- **E-TrainerID**: import a photo or screenshot of your Trainer ID QR, crop it in-app, and the app decodes it and redraws a crisp QR inside a custom frame (5 styles, colours, your own cropped background). **Scan mode** shows a plain, high-contrast QR full-screen and keeps the screen awake.
- **E-TrainerIDs**: save several trainer IDs (each with a region) and switch between them. QR size can be set to 100, 75 or 50%. Hard photos are read by retrying at several sizes and contrast levels.
- **Tags → Collection**: the official tag list for every version (from world.pokemonmezastar.com). Tap to mark owned, filter by rarity or owned/missing, bulk-mark, and track progress per version. Pictures load from the official site when online.
- **Tags → My photos**: save photos of your own tags: cropped photo, Pokémon name (offline autocomplete in English, Japanese and Chinese), note, and favorite.
- **Support QR**: save official support-Pokémon QR codes with the same import, crop, frame and scan flow, grouped by region.
- **Languages**: English and Simplified Chinese.
- **Settings**: export or import a JSON backup (images included) to move to another phone, protect storage from browser cleanup, install the app.

## QR fidelity

The decoded raw bytes are re-encoded in byte mode, so the redrawn QR carries exactly the same payload, including non-UTF-8 data. After import the app checks that the redraw decodes back to identical bytes. If it doesn't, or the QR couldn't be read, the card shows your original cropped image instead. You can toggle **Original / Redraw** on any card.

## Run locally

```bash
npm install      # dev-only: QR libs for tests (vendor/ already has browser copies)
npm run serve    # http://localhost:5173
npm test         # unit tests (node --test)
```

## Deploy

It's static files with no build step. Upload the repo root (excluding `node_modules/`, `docs/`, `tests/`, `scripts/`) to any HTTPS static host such as GitHub Pages, Netlify or Cloudflare Pages. On your phone, open it once online, then **Add to Home Screen**. After that it works fully offline.

The service worker is network-first for app files, so new deploys show up on the next online launch. When you add a new file to the app, add it to `ASSETS` in `sw.js`; `tests/sw.test.mjs` fails if you forget.

## Regenerating data

- `node scripts/build-tags.mjs`: refreshes `data/tags.json` from the official SG tag pages (run when a new version releases). Only text is stored; images stay on the official server.
- `node scripts/build-pokemon.mjs`: refreshes `data/pokemon.json` from PokéAPI's CSV.
- `node scripts/make-icons.mjs`: regenerates the app icons.

Fan-made; not affiliated with The Pokémon Company, Nintendo or T-ARTS.
