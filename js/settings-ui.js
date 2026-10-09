// Settings: language, privacy explanation, backup export/import, storage info, install, wipe.
import { dbAll, dbPut, dbClear } from './db.js';
import { serializeBackup, parseBackup } from './backup.js';
import { confirmSheet } from './sheet.js';
import { blobToDataUrl, dataUrlToBlob, download, pickFile, toast } from './util.js';
import { t, getLang, setLang, LANGS } from './i18n.js';

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
    prefs = (localStorage.getItem('mz.frame') ?? '').length + (localStorage.getItem('mz.lang') ?? '').length;
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
    <h1 class="screen-title">${t('settings.title')}</h1>
    <section class="panel">
      <h2>${t('settings.language')}</h2>
      <div class="chips">${Object.entries(LANGS).map(([code, name]) =>
        `<button class="chip ${code === getLang() ? 'on' : ''}" data-lang="${code}">${name}</button>`).join('')}</div>
    </section>
    <section class="panel privacy">
      <h2>${t('settings.privacyTitle')}</h2>
      <p>${t('settings.privacyLead')}</p>
      <ul class="muted">
        <li>${t('settings.privacyPics')}</li>
        <li>${t('settings.privacyText')}</li>
        <li>${t('settings.privacyPrefs')}</li>
        <li>${t('settings.privacyNet')}</li>
      </ul>
      <p class="muted">${t('settings.privacyWarn')}</p>
    </section>
    <section class="panel">
      <h2>${t('settings.dataTitle')}</h2>
      <p class="muted">${t(qr.some((q) => q.kind === 'trainer') ? 'settings.hasTrainer' : 'settings.noTrainer')}
        · ${t('settings.counts', { tags: tags.length, support: qr.filter((q) => q.kind === 'support').length })}</p>
      <p class="muted">${t('settings.dataNote')}</p>
      <div class="row wrap">
        <button class="btn primary" data-act="export">${t('settings.export')}</button>
        <button class="btn" data-act="import">${t('settings.import')}</button>
      </div>
    </section>
    <section class="panel">
      <h2>${t('settings.storageTitle')}</h2>
      <table class="usage">
        <tr><td>${t('settings.rowPhotos', { n: tags.filter((x) => x.photo).length })}</td><td>${fmt(bytes.tagPhotos)}</td></tr>
        <tr><td>${t('settings.rowQr', { n: qr.length })}</td><td>${fmt(bytes.qrImages)}</td></tr>
        <tr><td>${t('settings.rowBg', { n: qr.filter((q) => q.frame?.background).length })}</td><td>${fmt(bytes.backgrounds)}</td></tr>
        <tr><td>${t('settings.rowText')}</td><td>${fmt(bytes.text)}</td></tr>
        <tr class="total"><td>${t('settings.rowData')}</td><td>${fmt(dataTotal)}</td></tr>
        ${est ? `
        <tr><td>${t('settings.rowUsage')}</td><td>${fmt(est.usage)}</td></tr>
        <tr class="quota"><td>${t('settings.rowQuota')}</td><td>${fmt(est.quota)}</td></tr>` : ''}
      </table>
      <p class="muted small">${t('settings.storageNote')}</p>
      <p class="muted">${t(persisted ? 'settings.persisted' : 'settings.notPersisted')}</p>
      ${persisted ? '' : `<button class="btn" data-act="persist">${t('settings.persist')}</button>`}
    </section>
    ${standalone ? '' : `
    <section class="panel">
      <h2>${t('settings.installTitle')}</h2>
      ${ios
        ? `<p class="muted">${t('settings.installIos')}</p>`
        : `<p class="muted">${t('settings.installText')}</p>
           <button class="btn" data-act="install" ${installEvent ? '' : 'disabled'}>${t('settings.install')}</button>
           ${installEvent ? '' : `<p class="muted small">${t('settings.installHint')}</p>`}`}
    </section>`}
    <section class="panel danger-zone">
      <h2>${t('settings.dangerTitle')}</h2>
      <button class="btn danger" data-act="wipe">${t('settings.wipe')}</button>
    </section>
    <p class="muted small center">${t('settings.footer')}</p>`;

  view.onclick = async (e) => {
    const code = e.target.closest('[data-lang]')?.dataset.lang;
    if (code) return setLang(code); // app re-renders on 'langchange'
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
        toast(t('settings.imported', { qr: parsed.qr.length, tags: parsed.tags.length }));
        renderSettings(view);
      } catch (err) {
        toast(t(err instanceof SyntaxError ? 'settings.badJson' : 'settings.badBackup'));
      }
    } else if (act === 'persist') {
      const ok = await navigator.storage?.persist?.();
      toast(t(ok ? 'settings.persistOk' : 'settings.persistNo'));
      renderSettings(view);
    } else if (act === 'install' && installEvent) {
      installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null;
      renderSettings(view);
    } else if (act === 'wipe') {
      if (await confirmSheet(t('settings.wipeConfirm'), { ok: t('settings.wipeOk') })) {
        await dbClear('qr');
        await dbClear('tags');
        toast(t('settings.wiped'));
        renderSettings(view);
      }
    }
  };
}
