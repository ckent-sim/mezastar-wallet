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

const fmt = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

export async function renderSettings(view) {
  const [qr, tags] = await Promise.all([dbAll('qr'), dbAll('tags')]);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  view.innerHTML = `
    <h1 class="screen-title">Settings</h1>
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
      <p class="muted">${est ? `Using ${fmt(est.usage)} of ${fmt(est.quota)} available.` : 'Storage estimate unavailable.'}</p>
      <p class="muted">${persisted ? '✅ Protected from automatic browser cleanup.' : '⚠️ Not yet protected from browser cleanup.'}</p>
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
