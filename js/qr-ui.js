// E-TrainerID + Support QR screens: import → crop → decode, framed card, frame editor, scan mode.
import { dbAll, dbPut, dbDelete } from './db.js';
import { decodeQr, encodeQr, verifyReencode } from './qr.js';
import { renderFrame, FRAME_STYLES, DEFAULT_FRAME, QUIET_ZONE } from './frame.js';
import { openCropper } from './cropper.js';
import { openSheet, confirmSheet } from './sheet.js';
import { attachPokemonAutocomplete } from './autocomplete.js';
import { uid, loadImage, imageToImageData, pickFile, toast, canvasToBlob, download, esc } from './util.js';

const CARD_PX = 1080;
const STYLE_NAMES = { clean: 'Clean', pokeball: 'Poké Ball', star: 'Starry', neon: 'Neon', holo: 'Holo' };

// ---------- shared helpers ----------

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

const titleOf = (item) => (item.kind === 'trainer' ? 'E-TRAINER ID' : (item.label || 'SUPPORT POKÉMON').toUpperCase());
const subtitleOf = (item) => (item.kind === 'trainer' ? item.label || '' : 'SUPPORT POKÉMON');
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
    const img = await loadImage(file);
    const data = imageToImageData(img);
    const hit = decodeQr(data);
    const k = img.naturalWidth / data.width;
    full = hit ? { ...hit, rect: { x: hit.rect.x * k, y: hit.rect.y * k, w: hit.rect.w * k, h: hit.rect.h * k } } : null;
  } catch {
    toast('Could not open that image');
    return null;
  }

  const cropped = await openCropper(file, {
    aspect: 1,
    title: 'Crop QR code',
    type: 'image/png',
    focusRect: full?.rect ?? null,
  });
  if (!cropped) return null;

  const fromCrop = decodeQr(imageToImageData(await loadImage(cropped)));
  const decoded = fromCrop ?? full;
  const redrawOk = decoded ? verifyReencode(decoded.bytes) : false;

  const item = {
    id: existing?.id ?? uid(),
    kind,
    label: existing?.label ?? '',
    pokemonId: existing?.pokemonId ?? null,
    image: cropped,
    bytes: decoded?.bytes ?? null,
    text: decoded?.text ?? null,
    showOriginal: !redrawOk,
    frame: existing?.frame ?? lastFrame(),
    createdAt: existing?.createdAt ?? Date.now(),
  };

  if (kind === 'support' && !existing) {
    const label = await askLabel(item);
    if (label === null) return null;
  }
  await dbPut('qr', item);
  navigator.storage?.persist?.();
  if (!decoded) toast("Couldn't read the QR — saved the image only");
  else if (!redrawOk) toast('QR read ✓ (showing original image — redraw not exact)');
  else toast('QR read ✓');
  return item;
}

function askLabel(item) {
  return new Promise((resolve) => {
    const s = openSheet(`
      <h3>${item.kind === 'trainer' ? 'Trainer name' : 'Support Pokémon'}</h3>
      <form class="form">
        <label>Name<input name="label" maxlength="40" placeholder="${item.kind === 'trainer' ? 'e.g. Ash' : 'e.g. Pikachu'}"></label>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>`);
    const input = s.el.querySelector('input');
    input.value = item.label || '';
    if (item.kind === 'support') attachPokemonAutocomplete(input, (p) => (item.pokemonId = p.id));
    setTimeout(() => input.focus(), 50);
    let saved = false;
    s.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      item.label = input.value.trim();
      saved = true;
      s.close();
    });
    s.closed.then(() => resolve(saved ? item.label : null));
  });
}

// ---------- detail panel (actions) ----------

function qrPanel(item, onChange) {
  const el = document.createElement('section');
  el.className = 'qr-panel';
  el.innerHTML = `
    <canvas class="card-canvas" aria-label="${esc(titleOf(item))} card"></canvas>
    <div class="status-line">${item.bytes
      ? (usesRedraw(item) ? '<span class="ok">● Redrawn from decoded QR</span>' : '<span class="warn">● Showing original image</span>')
      : '<span class="warn">● Image only (QR not decoded)</span>'}</div>
    <div class="actions">
      <button class="btn primary big" data-act="scan">📲 Scan mode</button>
      <button class="btn" data-act="frame">🎨 Frame</button>
      <button class="btn" data-act="toggle" ${item.bytes ? '' : 'disabled'}>${usesRedraw(item) ? '🖼 Original' : '▦ Redraw'}</button>
      <button class="btn" data-act="png">⬇ Save PNG</button>
      <button class="btn" data-act="label">✏️ Rename</button>
      <button class="btn" data-act="replace">♻ Replace</button>
      <button class="btn danger" data-act="delete">🗑 Delete</button>
    </div>
    ${item.text != null ? `<details class="decoded"><summary>Decoded data</summary><code></code></details>` : ''}`;
  if (item.text != null) el.querySelector('code').textContent = item.text;
  drawCard(el.querySelector('canvas'), item);

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'scan') openScan(item);
    else if (act === 'frame') {
      if (await openFrameEditor(item)) onChange();
    } else if (act === 'toggle') {
      item.showOriginal = !item.showOriginal;
      if (!item.showOriginal && !verifyReencode(item.bytes)) toast('Heads-up: redraw may not scan identically');
      await dbPut('qr', item);
      onChange();
    } else if (act === 'png') {
      const c = document.createElement('canvas');
      await drawCard(c, item);
      download(await canvasToBlob(c), `${(item.label || item.kind).replace(/[^\w-]+/g, '_')}.png`);
    } else if (act === 'label') {
      if ((await askLabel(item)) !== null) {
        await dbPut('qr', item);
        onChange();
      }
    } else if (act === 'replace') {
      if (await importQr(item.kind, item)) onChange();
    } else if (act === 'delete') {
      if (await confirmSheet(`Delete this ${item.kind === 'trainer' ? 'E-TrainerID' : 'support QR'}?`)) {
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
      <h3>Frame design</h3>
      <canvas class="card-canvas preview"></canvas>
      <div class="chips styles">${FRAME_STYLES.map((st) =>
        `<button class="chip" data-style="${st}">${STYLE_NAMES[st]}</button>`).join('')}</div>
      <div class="color-row">
        <label>Main <input type="color" name="color"></label>
        <label>Accent <input type="color" name="accent"></label>
      </div>
      <div class="row wrap">
        <button class="btn" data-act="bg">🖼 Background image…</button>
        <button class="btn ghost" data-act="nobg">Remove background</button>
      </div>
      <div class="sheet-actions">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" data-act="save">Save</button>
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
        const bg = await openCropper(file, { aspect: 1, title: 'Crop background', type: 'image/jpeg' });
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
      <button class="btn" data-act="mode">Show framed</button>
      <button class="btn primary" data-act="close">Done</button>
    </div>
    <p class="scan-hint">Turn screen brightness up for the arcade scanner.</p>`;
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
      e.target.textContent = framed ? 'Show plain' : 'Show framed';
      paint();
    } else if (act === 'close') close();
  });
  await paint();
}

// ---------- screens ----------

export async function renderTrainer(view) {
  const items = (await dbAll('qr')).filter((q) => q.kind === 'trainer').sort((a, b) => b.createdAt - a.createdAt);
  const item = items[0];
  view.innerHTML = '<h1 class="screen-title">E-TrainerID</h1>';
  if (!item) {
    view.insertAdjacentHTML('beforeend', `
      <div class="empty">
        <div class="empty-art">🪪</div>
        <p>Import a photo or screenshot of your Trainer ID QR code. You'll crop it, and the app redraws it as a crisp E-TrainerID card.</p>
        <button class="btn primary big" data-act="import">＋ Import Trainer ID QR</button>
        <p class="small">🔒 Saved only on this device. Never uploaded to any server. <a href="#settings">How it works</a></p>
      </div>`);
    view.querySelector('[data-act=import]').addEventListener('click', async () => {
      if (await importQr('trainer')) renderTrainer(view);
    });
    return;
  }
  view.append(qrPanel(item, () => renderTrainer(view)));
}

export async function renderSupport(view) {
  const items = (await dbAll('qr')).filter((q) => q.kind === 'support').sort((a, b) => b.createdAt - a.createdAt);
  view.innerHTML = `
    <div class="screen-head">
      <h1 class="screen-title">Support Pokémon <small>${items.length || ''}</small></h1>
      <button class="btn primary" data-act="add">＋ Add QR</button>
    </div>
    ${items.length ? '<div class="qr-grid"></div>' : `
      <div class="empty">
        <div class="empty-art">⭐</div>
        <p>Save official support Pokémon QR codes here so they're ready at the machine — even offline.</p>
      </div>`}`;
  view.querySelector('[data-act=add]').addEventListener('click', async () => {
    if (await importQr('support')) renderSupport(view);
  });
  const grid = view.querySelector('.qr-grid');
  for (const item of items) {
    const b = document.createElement('button');
    b.className = 'qr-tile';
    b.innerHTML = `<canvas></canvas><span>${esc(item.label || 'Support Pokémon')}</span>`;
    drawCard(b.querySelector('canvas'), item, 480);
    b.addEventListener('click', () => openDetail(item, () => renderSupport(view)));
    grid.append(b);
  }
}

function openDetail(item, refresh) {
  const s = openSheet('<button class="sheet-x" data-close aria-label="Close">✕</button><div class="detail"></div>', { wide: true });
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
