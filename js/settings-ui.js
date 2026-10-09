// Settings: backup export/import, storage info, install, wipe.
import { dbAll, dbPut, dbClear } from './db.js';
import { serializeBackup, parseBackup } from './backup.js';
import { confirmSheet } from './sheet.js';
import { blobToDataUrl, dataUrlToBlob, download, pickFile, toast } from './util.js';

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
});

const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

/** Exact bytes of what the app stores, by category. */
function measure(qr, tags) {
  const size = (b) => (b instanceof Blob ? b.size : 0);
  const textBytes = (obj) => new Blob([JSON.stringify(obj, (k, v) => (v instanceof Blob ? undefined : v))]).size;
  let prefs = 0;
  try {
    prefs = (localStorage.getItem('mz.frame') ?? '').length;
  } catch { /* storage unavailable */ }
  return {
    tagPhotos: tags.reduce((n, t) => n + size(t.photo), 0),
    qrImages: qr.reduce((n, q) => n + size(q.image), 0),
    backgrounds: qr.reduce((n, q) => n + size(q.frame?.background), 0),
    text: textBytes(qr) + textBytes(tags) + prefs,
  };
}

export async function renderSettings(view) {
  const [qr, tags] = await Promise.all([dbAll('qr'), dbAll('tags')]);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const bytes = measure(qr, tags);
  const dataTotal = bytes.tagPhotos + bytes.qrImages + bytes.backgrounds + bytes.text;

  view.innerHTML = `
    <h1 class="screen-title">Settings</h1>
    <section class="panel privacy">
      <h2>🔒 Privacy &amp; how your data is stored</h2>
      <p><b>Nothing is uploaded. There is no server and no account.</b> Your E-TrainerID, tags, photos and
        support QR codes are saved only inside this browser on this device. The app works fully offline.</p>
      <ul class="muted">
        <li><b>Pictures</b> you crop are saved as image files in the browser's on-device database (IndexedDB):
          QR codes as lossless PNG, tag photos and backgrounds as JPEG (90% quality, max 1600 px).</li>
        <li><b>Text</b> such as names, notes, favorites, decoded QR data and frame designs is saved in the same database.</li>
        <li><b>Your last-used frame style</b> is remembered in browser storage (localStorage), so new cards start with it.</li>
        <li>The only network use is <b>optional Pokémon artwork</b> for tags without a photo, which is downloaded
          from PokéAPI's public image library. Nothing about you is sent.</li>
      </ul>
      <p class="muted"><b>Important:</b> because nothing is on a server, clearing this site's browser data,
        uninstalling the app, or losing your phone deletes your data. Use <b>Export backup</b> to keep a copy
        or move to a new phone.</p>
    </section>
    <section class="panel">
      <h2>Your data</h2>
      <p class="muted">${qr.filter((q) => q.kind === 'trainer').length ? 'E-TrainerID saved' : 'No E-TrainerID'}
        · ${tags.length} tag${tags.length === 1 ? '' : 's'}
        · ${qr.filter((q) => q.kind === 'support').length} support QR</p>
      <p class="muted">Everything is stored only on this device. Export a backup to move it to another phone.</p>
      <div class="row wrap">
        <button class="btn primary" data-act="export">⬇ Export backup</button>
        <button class="btn" data-act="import">⬆ Import backup</button>
      </div>
    </section>
    <section class="panel">
      <h2>Storage</h2>
      <table class="usage">
        <tr><td>Tag photos (${tags.filter((t) => t.photo).length})</td><td>${fmt(bytes.tagPhotos)}</td></tr>
        <tr><td>QR images (${qr.length})</td><td>${fmt(bytes.qrImages)}</td></tr>
        <tr><td>Frame backgrounds (${qr.filter((q) => q.frame?.background).length})</td><td>${fmt(bytes.backgrounds)}</td></tr>
        <tr><td>Text &amp; settings</td><td>${fmt(bytes.text)}</td></tr>
        <tr class="total"><td>Your data</td><td>${fmt(dataTotal)}</td></tr>
        ${est ? `
        <tr><td>Total used on this device*</td><td>${fmt(est.usage)}</td></tr>
        <tr><td>Space the browser allows*</td><td>${fmt(est.quota)}</td></tr>` : ''}
      </table>
      <p class="muted small">“Your data” is the exact size of the pictures and text saved by the app.
        *Totals come from your browser (<code>navigator.storage.estimate()</code>). They also include the offline copy
        of the app itself, and some browsers round or pad them for privacy, so they won't add up exactly.</p>
      <p class="muted">${persisted ? '✅ Protected from automatic browser cleanup.' : '⚠️ Not yet protected from browser cleanup. When the phone is low on space, the browser may clear data of sites you rarely use.'}</p>
      ${persisted ? '' : '<button class="btn" data-act="persist">Protect my data</button>'}
    </section>
    ${standalone ? '' : `
    <section class="panel">
      <h2>Install</h2>
      ${ios
        ? '<p class="muted">In Safari tap <b>Share</b> → <b>Add to Home Screen</b> to use the app offline like a native app.</p>'
        : `<p class="muted">Install to your home screen for quick offline access.</p>
           <button class="btn" data-act="install" ${installEvent ? '' : 'disabled'}>📲 Install app</button>
           ${installEvent ? '' : '<p class="muted small">If the button is disabled, use your browser menu → “Install app” / “Add to Home screen”.</p>'}`}
    </section>`}
    <section class="panel danger-zone">
      <h2>Danger zone</h2>
      <button class="btn danger" data-act="wipe">Delete all data</button>
    </section>
    <p class="muted small center">Mezastar Wallet · fan-made, not affiliated with The Pokémon Company or T-ARTS.</p>`;

  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'export') {
      const data = await serializeBackup({ qr, tags }, blobToDataUrl);
      const stamp = new Date().toISOString().slice(0, 10);
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `mezastar-wallet-${stamp}.json`);
    } else if (act === 'import') {
      const file = await pickFile('application/json,.json');
      if (!file) return;
      try {
        const parsed = parseBackup(JSON.parse(await file.text()), dataUrlToBlob);
        for (const r of parsed.qr) await dbPut('qr', r);
        for (const r of parsed.tags) await dbPut('tags', r);
        toast(`Imported ${parsed.qr.length} QR + ${parsed.tags.length} tags`);
        renderSettings(view);
      } catch (err) {
        toast(err instanceof SyntaxError ? 'That file is not valid JSON' : err.message);
      }
    } else if (act === 'persist') {
      const ok = await navigator.storage?.persist?.();
      toast(ok ? 'Data protected ✓' : 'Browser declined — install the app and try again');
      renderSettings(view);
    } else if (act === 'install' && installEvent) {
      installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null;
      renderSettings(view);
    } else if (act === 'wipe') {
      if (await confirmSheet('Delete your E-TrainerID, all tags and support QR codes from this device? This cannot be undone.', { ok: 'Delete everything' })) {
        await dbClear('qr');
        await dbClear('tags');
        toast('All data deleted');
        renderSettings(view);
      }
    }
  };
}
