// E-TrainerID + Support QR screens: import → crop → decode, framed card, frame editor, scan mode.
import { dbAll, dbPut, dbDelete } from './db.js';
import { decodeWithVariants, encodeQr, verifyReencode } from './qr.js';
import { renderFrame, FRAME_STYLES, DEFAULT_FRAME, QUIET_ZONE } from './frame.js';
import { openCropper } from './cropper.js';
import { openSheet, confirmSheet } from './sheet.js';
import { attachPokemonAutocomplete } from './autocomplete.js';
import { uid, loadImage, imageToImageData, pickFile, toast, canvasToBlob, download, esc } from './util.js';
import { t } from './i18n.js';

const CARD_PX = 1080;
export const REGIONS = ['SG', 'MY', 'PH', 'ID', 'TW', 'HK', 'TH', 'JP'];
const FLAGS = { SG: '🇸🇬', MY: '🇲🇾', PH: '🇵🇭', ID: '🇮🇩', TW: '🇹🇼', HK: '🇭🇰', TH: '🇹🇭', JP: '🇯🇵' };
const SIZES = [100, 75, 50];

// ---------- shared helpers ----------

// small per-device preferences (localStorage may be unavailable → defaults)
function pref(key, fallback = null) {
  try {
    return localStorage.getItem(`mz.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function setPref(key, value) {
  try {
    localStorage.setItem(`mz.${key}`, value);
  } catch { /* storage unavailable */ }
}

function defaultRegion() {
  const saved = pref('region');
  if (REGIONS.includes(saved)) return saved;
  const fromLocale = (navigator.language.split('-')[1] || '').toUpperCase();
  return REGIONS.includes(fromLocale) ? fromLocale : REGIONS[0];
}
const regionBadge = (r) => (r ? `${FLAGS[r] ?? ''} ${r}` : '');

const qrSize = () => (SIZES.includes(+pref('qrSize')) ? +pref('qrSize') : 100);
function applyQrSize(pct = qrSize()) {
  document.documentElement.style.setProperty('--qr-scale', pct / 100);
}
applyQrSize();
function cycleQrSize() {
  const next = SIZES[(SIZES.indexOf(qrSize()) + 1) % SIZES.length];
  setPref('qrSize', next);
  applyQrSize(next);
  return next;
}

/** Decode an image, retrying at several sizes and contrast variants. rect is in image pixels. */
function decodeImage(img) {
  for (const max of [1200, 800, 1600, 500]) {
    const data = imageToImageData(img, max);
    const hit = decodeWithVariants(data);
    if (hit) {
      const k = img.naturalWidth / data.width;
      return { ...hit, rect: { x: hit.rect.x * k, y: hit.rect.y * k, w: hit.rect.w * k, h: hit.rect.h * k } };
    }
  }
  return null;
}

const imgCache = new WeakMap();
const imageOf = (blob) => {
  if (!imgCache.has(blob)) imgCache.set(blob, loadImage(blob));
  return imgCache.get(blob);
};

function lastFrame() {
  try {
    return { ...DEFAULT_FRAME, ...JSON.parse(localStorage.getItem('mz.frame') || '{}') };
  } catch {
    return { ...DEFAULT_FRAME };
  }
}
function rememberFrame({ style, color, accent }) {
  try {
    localStorage.setItem('mz.frame', JSON.stringify({ style, color, accent }));
  } catch { /* storage unavailable — fine */ }
}

const titleOf = (item) => (item.kind === 'trainer' ? t('card.trainer') : (item.label || t('card.support')).toUpperCase());
const subtitleOf = (item) => (item.kind === 'trainer' ? item.label || '' : t('card.support'));
const usesRedraw = (item) => !!item.bytes && !item.showOriginal;

export async function drawCard(canvas, item, size = CARD_PX) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const [image, background] = await Promise.all([
    usesRedraw(item) ? null : imageOf(item.image),
    item.frame?.background ? imageOf(item.frame.background) : null,
  ]);
  renderFrame(ctx, size, {
    matrix: usesRedraw(item) ? encodeQr(item.bytes) : null,
    image,
    frame: item.frame,
    background,
    title: titleOf(item),
    subtitle: subtitleOf(item),
  });
}

/** Plain, high-contrast QR for the arcade scanner. */
async function drawPlain(canvas, item, size) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  if (usesRedraw(item)) {
    const m = encodeQr(item.bytes);
    const mod = Math.floor(size / (m.size + QUIET_ZONE * 2));
    const off = Math.floor((size - mod * m.size) / 2);
    ctx.fillStyle = '#000';
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) if (m.isDark(r, c)) ctx.fillRect(off + c * mod, off + r * mod, mod, mod);
    }
  } else {
    const img = await imageOf(item.image);
    const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    ctx.drawImage(img, (size - img.naturalWidth * s) / 2, (size - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  }
}

// ---------- import flow ----------

async function importQr(kind, existing = null) {
  const file = await pickFile();
  if (!file) return null;
  let full;
  try {
    full = decodeImage(await loadImage(file));
  } catch {
    toast(t('qr.openFail'));
    return null;
  }

  const cropped = await openCropper(file, {
    aspect: 1,
    title: t('crop.qr'),
    type: 'image/png',
    focusRect: full?.rect ?? null,
  });
  if (!cropped) return null;

  const fromCrop = decodeImage(await loadImage(cropped));
  const decoded = fromCrop ?? full;
  const redrawOk = decoded ? verifyReencode(decoded.bytes) : false;

  const item = {
    id: existing?.id ?? uid(),
    kind,
    label: existing?.label ?? '',
    region: existing?.region ?? defaultRegion(),
    pokemonId: existing?.pokemonId ?? null,
    image: cropped,
    bytes: decoded?.bytes ?? null,
    text: decoded?.text ?? null,
    showOriginal: !redrawOk,
    frame: existing?.frame ?? lastFrame(),
    createdAt: existing?.createdAt ?? Date.now(),
  };

  if (!existing && !(await askDetails(item))) return null;
  await dbPut('qr', item);
  navigator.storage?.persist?.();
  toast(t(!decoded ? 'qr.readFail' : redrawOk ? 'qr.readOk' : 'qr.readNotExact'));
  return item;
}

/** Name + region sheet. Resolves true when saved (item is updated in place). */
function askDetails(item) {
  return new Promise((resolve) => {
    const s = openSheet(`
      <h3>${t(item.kind === 'trainer' ? 'label.trainer' : 'label.support')}</h3>
      <form class="form">
        <label>${t('label.name')}<input name="label" maxlength="40" placeholder="${t(item.kind === 'trainer' ? 'label.phTrainer' : 'label.phSupport')}"></label>
        <label>${t('label.region')}<select name="region">${REGIONS.map((r) =>
          `<option value="${r}">${regionBadge(r)}</option>`).join('')}</select></label>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-close>${t('common.cancel')}</button>
          <button class="btn primary">${t('common.save')}</button>
        </div>
      </form>`);
    const input = s.el.querySelector('input');
    const region = s.el.querySelector('select');
    input.value = item.label || '';
    region.value = item.region || defaultRegion();
    if (item.kind === 'support') attachPokemonAutocomplete(input, (p) => (item.pokemonId = p.id));
    setTimeout(() => input.focus(), 50);
    let saved = false;
    s.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      item.label = input.value.trim();
      item.region = region.value;
      setPref('region', region.value);
      saved = true;
      s.close();
    });
    s.closed.then(() => resolve(saved));
  });
}

// ---------- detail panel (actions) ----------

function qrPanel(item, onChange) {
  const el = document.createElement('section');
  el.className = 'qr-panel';
  el.innerHTML = `
    <canvas class="card-canvas" aria-label="${esc(titleOf(item))} card"></canvas>
    <div class="status-line">${item.bytes
      ? (usesRedraw(item) ? `<span class="ok">${t('qr.redrawn')}</span>` : `<span class="warn">${t('qr.original')}</span>`)
      : `<span class="warn">${t('qr.imageOnly')}</span>`}</div>
    <div class="actions">
      <button class="btn primary big" data-act="scan">${t('qr.scan')}</button>
      <button class="btn" data-act="frame">${t('qr.frame')}</button>
      <button class="btn" data-act="toggle" ${item.bytes ? '' : 'disabled'}>${t(usesRedraw(item) ? 'qr.showOriginal' : 'qr.showRedraw')}</button>
      <button class="btn" data-act="size">⤢ ${qrSize()}%</button>
      <button class="btn" data-act="png">${t('qr.png')}</button>
      <button class="btn" data-act="label">${t('qr.rename')}</button>
      <button class="btn" data-act="replace">${t('qr.replace')}</button>
      <button class="btn danger" data-act="delete">${t('qr.delete')}</button>
    </div>
    ${item.text != null ? `<details class="decoded"><summary>${t('qr.decoded')}</summary><code></code></details>` : ''}`;
  if (item.text != null) el.querySelector('code').textContent = item.text;
  drawCard(el.querySelector('canvas'), item);

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'scan') openScan(item);
    else if (act === 'size') e.target.closest('[data-act]').textContent = `⤢ ${cycleQrSize()}%`;
    else if (act === 'frame') {
      if (await openFrameEditor(item)) onChange();
    } else if (act === 'toggle') {
      item.showOriginal = !item.showOriginal;
      if (!item.showOriginal && !verifyReencode(item.bytes)) toast(t('qr.redrawWarn'));
      await dbPut('qr', item);
      onChange();
    } else if (act === 'png') {
      const c = document.createElement('canvas');
      await drawCard(c, item);
      download(await canvasToBlob(c), `${(item.label || item.kind).replace(/[^\w-]+/g, '_')}.png`);
    } else if (act === 'label') {
      if (await askDetails(item)) {
        await dbPut('qr', item);
        onChange();
      }
    } else if (act === 'replace') {
      if (await importQr(item.kind, item)) onChange();
    } else if (act === 'delete') {
      if (await confirmSheet(t(item.kind === 'trainer' ? 'qr.deleteTrainer' : 'qr.deleteSupport'), { ok: t('common.delete') })) {
        await dbDelete('qr', item.id);
        onChange(true);
      }
    }
  });
  return el;
}

// ---------- frame editor ----------

function openFrameEditor(item) {
  return new Promise((resolve) => {
    const draft = { ...lastFrame(), ...item.frame };
    const s = openSheet(`
      <h3>${t('frame.title')}</h3>
      <canvas class="card-canvas preview"></canvas>
      <div class="chips styles">${FRAME_STYLES.map((st) =>
        `<button class="chip" data-style="${st}">${t(`style.${st}`)}</button>`).join('')}</div>
      <div class="color-row">
        <label>${t('frame.main')} <input type="color" name="color"></label>
        <label>${t('frame.accent')} <input type="color" name="accent"></label>
      </div>
      <div class="row wrap">
        <button class="btn" data-act="bg">${t('frame.bg')}</button>
        <button class="btn ghost" data-act="nobg">${t('frame.noBg')}</button>
      </div>
      <div class="sheet-actions">
        <button class="btn ghost" data-close>${t('common.cancel')}</button>
        <button class="btn primary" data-act="save">${t('common.save')}</button>
      </div>`, { wide: true });
    const canvas = s.el.querySelector('canvas');
    const color = s.el.querySelector('[name=color]');
    const accent = s.el.querySelector('[name=accent]');
    color.value = draft.color;
    accent.value = draft.accent;

    const refresh = () => {
      s.el.querySelectorAll('[data-style]').forEach((b) => b.classList.toggle('on', b.dataset.style === draft.style));
      s.el.querySelector('[data-act=nobg]').hidden = !draft.background;
      drawCard(canvas, { ...item, frame: draft }, 720);
    };
    refresh();

    color.addEventListener('input', () => {
      draft.color = color.value;
      refresh();
    });
    accent.addEventListener('input', () => {
      draft.accent = accent.value;
      refresh();
    });
    let saved = false;
    s.el.addEventListener('click', async (e) => {
      const st = e.target.closest('[data-style]')?.dataset.style;
      if (st) {
        draft.style = st;
        refresh();
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'bg') {
        const file = await pickFile();
        if (!file) return;
        const bg = await openCropper(file, { aspect: 1, title: t('crop.bg'), type: 'image/jpeg' });
        if (bg) {
          draft.background = bg;
          refresh();
        }
      } else if (act === 'nobg') {
        draft.background = null;
        refresh();
      } else if (act === 'save') {
        item.frame = draft;
        rememberFrame(draft);
        await dbPut('qr', item);
        saved = true;
        s.close();
      }
    });
    s.closed.then(() => resolve(saved));
  });
}

// ---------- scan mode ----------

async function openScan(item) {
  const el = document.createElement('div');
  el.className = 'scan';
  el.innerHTML = `
    <canvas></canvas>
    <p class="scan-label"></p>
    <div class="scan-bar">
      <button class="btn" data-act="size">⤢ ${qrSize()}%</button>
      <button class="btn" data-act="mode">${t('scan.framed')}</button>
      <button class="btn primary" data-act="close">${t('common.done')}</button>
    </div>
    <p class="scan-hint">${t('scan.hint')}</p>`;
  el.querySelector('.scan-label').textContent = item.label || titleOf(item);
  document.body.append(el);
  const canvas = el.querySelector('canvas');
  let framed = false;
  const paint = () => (framed ? drawCard(canvas, item) : drawPlain(canvas, item, CARD_PX));

  // Wake lock / fullscreen are best-effort and may never settle in some webviews — don't await them.
  let lock = null;
  navigator.wakeLock?.request('screen').then((l) => (lock = l), () => {});
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});

  const close = () => {
    lock?.release?.().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    window.removeEventListener('hashchange', close);
    el.remove();
  };
  window.addEventListener('hashchange', close);
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'mode') {
      framed = !framed;
      e.target.textContent = t(framed ? 'scan.plain' : 'scan.framed');
      paint();
    } else if (act === 'size') e.target.textContent = `⤢ ${cycleQrSize()}%`;
    else if (act === 'close') close();
  });
  await paint();
}

// ---------- screens ----------

export async function renderTrainer(view) {
  const items = (await dbAll('qr')).filter((q) => q.kind === 'trainer').sort((a, b) => a.createdAt - b.createdAt);
  const item = items.find((q) => q.id === pref('trainer')) ?? items[0];
  view.innerHTML = `<h1 class="screen-title">${t('trainer.title')}</h1>`;
  if (!item) {
    view.insertAdjacentHTML('beforeend', `
      <div class="empty">
        <div class="empty-art">🪪</div>
        <p>${t('trainer.empty')}</p>
        <button class="btn primary big" data-act="import">${t('trainer.import')}</button>
        <p class="small">${t('trainer.privacy')} <a href="#settings">${t('trainer.how')}</a></p>
      </div>`);
    view.querySelector('[data-act=import]').addEventListener('click', async () => {
      const added = await importQr('trainer');
      if (added) {
        setPref('trainer', added.id);
        renderTrainer(view);
      }
    });
    return;
  }
  view.append(qrPanel(item, () => renderTrainer(view)));

  // all saved trainers: tap to switch, or add another
  const strip = document.createElement('section');
  strip.className = 'trainer-strip';
  strip.innerHTML = `<h2>${t('trainer.mine')} <small>${items.length}</small></h2><div class="qr-grid small"></div>`;
  const grid = strip.querySelector('.qr-grid');
  for (const it of items) {
    const b = document.createElement('button');
    b.className = `qr-tile${it.id === item.id ? ' on' : ''}`;
    b.setAttribute('aria-pressed', it.id === item.id);
    b.innerHTML = `<canvas></canvas><span>${esc(it.label || t('trainer.unnamed'))}</span><small>${regionBadge(it.region)}</small>`;
    drawCard(b.querySelector('canvas'), it, 360);
    b.addEventListener('click', () => {
      setPref('trainer', it.id);
      renderTrainer(view);
      view.scrollIntoView({ behavior: 'smooth' });
    });
    grid.append(b);
  }
  const add = document.createElement('button');
  add.className = 'qr-tile add-tile';
  add.innerHTML = `<span class="plus">＋</span><span>${t('trainer.add')}</span>`;
  add.addEventListener('click', async () => {
    const added = await importQr('trainer');
    if (added) {
      setPref('trainer', added.id);
      renderTrainer(view);
    }
  });
  grid.append(add);
  view.append(strip);
}

export async function renderSupport(view) {
  const all = (await dbAll('qr')).filter((q) => q.kind === 'support').sort((a, b) => b.createdAt - a.createdAt);
  const present = REGIONS.filter((r) => all.some((q) => q.region === r));
  const filter = present.includes(pref('supportRegion')) ? pref('supportRegion') : '';
  const items = filter ? all.filter((q) => q.region === filter) : all;
  view.innerHTML = `
    <div class="screen-head">
      <h1 class="screen-title">${t('support.title')} <small>${all.length || ''}</small></h1>
      <button class="btn primary" data-act="add">${t('support.add')}</button>
    </div>
    ${present.length > 1 ? `<div class="chips region-chips">
      <button class="chip ${filter ? '' : 'on'}" data-region="">${t('support.all')}</button>
      ${present.map((r) => `<button class="chip ${filter === r ? 'on' : ''}" data-region="${r}">${regionBadge(r)}</button>`).join('')}
    </div>` : ''}
    ${all.length ? '<div class="qr-grid"></div>' : `
      <div class="empty">
        <div class="empty-art">⭐</div>
        <p>${t('support.empty')}</p>
      </div>`}`;
  view.querySelector('[data-act=add]').addEventListener('click', async () => {
    if (await importQr('support')) renderSupport(view);
  });
  view.querySelectorAll('[data-region]').forEach((c) => c.addEventListener('click', () => {
    setPref('supportRegion', c.dataset.region);
    renderSupport(view);
  }));
  const grid = view.querySelector('.qr-grid');
  for (const item of items) {
    const b = document.createElement('button');
    b.className = 'qr-tile';
    b.innerHTML = `<canvas></canvas><span>${esc(item.label || t('support.title'))}</span><small>${regionBadge(item.region)}</small>`;
    drawCard(b.querySelector('canvas'), item, 480);
    b.addEventListener('click', () => openDetail(item, () => renderSupport(view)));
    grid.append(b);
  }
}

function openDetail(item, refresh) {
  const s = openSheet(`<button class="sheet-x" data-close aria-label="${t('common.close')}">✕</button><div class="detail"></div>`, { wide: true });
  const host = s.el.querySelector('.detail');
  const mount = () => {
    host.replaceChildren(qrPanel(item, (deleted) => {
      refresh();
      if (deleted) s.close();
      else mount();
    }));
  };
  mount();
}
