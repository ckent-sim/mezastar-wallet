// Full-screen crop modal. Fixed crop box; the image is panned / zoomed / rotated under it.
//   openCropper(blob, { aspect, title, type, focusRect }) → Promise<Blob|null>
// aspect: number (w/h) or null for the image's own aspect.
// focusRect: optional {x,y,w,h} in source-image pixels to zoom onto initially (e.g. a detected QR).

import { loadImage, canvasToBlob } from './util.js';

const ASPECTS = [['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['Original', null]];
const MAX_OUT = 1600;
const MAX_ZOOM = 10;

export async function openCropper(source, { aspect = 1, title = 'Crop', type = 'image/jpeg', focusRect = null } = {}) {
  const img = await loadImage(source);
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'cropper';
    root.innerHTML = `
      <header class="cropper-bar">
        <button class="btn ghost" data-act="cancel">Cancel</button>
        <h2>${title}</h2>
        <button class="btn primary" data-act="done">Use</button>
      </header>
      <div class="cropper-stage"><canvas></canvas></div>
      <footer class="cropper-tools">
        <div class="chips">${ASPECTS.map(([l, v]) =>
          `<button class="chip" data-aspect="${v ?? ''}">${l}</button>`).join('')}</div>
        <div class="row">
          <button class="icon-btn" data-act="rotate" title="Rotate 90°" aria-label="Rotate 90°">⟳</button>
          <input type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Zoom">
          ${focusRect ? '<button class="btn small" data-act="focus">Fit QR</button>' : ''}
          <button class="btn small" data-act="reset">Reset</button>
        </div>
      </footer>`;
    document.body.append(root);

    const stage = root.querySelector('.cropper-stage');
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const slider = root.querySelector('input[type=range]');

    let curAspect = aspect;
    let rot = 0; // quarter turns
    let zoom = 1; // relative to "cover" scale
    let tx = 0; // image centre offset from box centre, stage px
    let ty = 0;
    let box = { x: 0, y: 0, w: 0, h: 0 };
    let W = 0;
    let H = 0;

    const rotW = () => (rot % 2 ? img.naturalHeight : img.naturalWidth);
    const rotH = () => (rot % 2 ? img.naturalWidth : img.naturalHeight);
    const coverScale = () => Math.max(box.w / rotW(), box.h / rotH());
    const scale = () => coverScale() * zoom;

    function layout() {
      const r = stage.getBoundingClientRect();
      W = r.width;
      H = r.height;
      const dpr = devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const a = curAspect ?? rotW() / rotH();
      const maxW = W - 32;
      const maxH = H - 32;
      let bw = maxW;
      let bh = bw / a;
      if (bh > maxH) {
        bh = maxH;
        bw = bh * a;
      }
      box = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
      clamp();
      draw();
    }

    function clamp() {
      zoom = Math.min(MAX_ZOOM, Math.max(1, zoom));
      const s = scale();
      const mx = Math.max(0, (rotW() * s - box.w) / 2);
      const my = Math.max(0, (rotH() * s - box.h) / 2);
      tx = Math.min(mx, Math.max(-mx, tx));
      ty = Math.min(my, Math.max(-my, ty));
      slider.value = zoom;
    }

    function paintImage(c, s) {
      c.rotate((rot * Math.PI) / 2);
      c.scale(s, s);
      c.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(box.x + box.w / 2 + tx, box.y + box.h / 2 + ty);
      paintImage(ctx, scale());
      ctx.restore();
      // dim outside the box
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of [1 / 3, 2 / 3]) {
        ctx.moveTo(box.x + box.w * t, box.y);
        ctx.lineTo(box.x + box.w * t, box.y + box.h);
        ctx.moveTo(box.x, box.y + box.h * t);
        ctx.lineTo(box.x + box.w, box.y + box.h * t);
      }
      ctx.stroke();
      ctx.restore();
    }

    // zoom keeping the stage point (px,py) fixed
    function zoomAt(newZoom, px = box.x + box.w / 2, py = box.y + box.h / 2) {
      const old = scale();
      zoom = Math.min(MAX_ZOOM, Math.max(1, newZoom));
      const k = scale() / old;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      tx = (tx + cx - px) * k - (cx - px);
      ty = (ty + cy - py) * k - (cy - py);
      clamp();
      draw();
    }

    function focus(rect) {
      rot = 0;
      layout();
      const pad = 1.15;
      const s = Math.min(box.w / (rect.w * pad), box.h / (rect.h * pad));
      zoom = s / coverScale();
      const s2 = scale();
      tx = (img.naturalWidth / 2 - (rect.x + rect.w / 2)) * s2;
      ty = (img.naturalHeight / 2 - (rect.y + rect.h / 2)) * s2;
      clamp();
      draw();
    }

    // pointer pan + pinch
    const pts = new Map();
    let pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.offsetX, y: e.offsetY };
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        tx += cur.x - prev.x;
        ty += cur.y - prev.y;
        clamp();
        draw();
      } else if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        zoomAt(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
    }, { passive: false });
    slider.addEventListener('input', () => zoomAt(+slider.value));

    const chips = root.querySelectorAll('[data-aspect]');
    const markChip = () => chips.forEach((c) =>
      c.classList.toggle('on', (c.dataset.aspect === '' ? null : +c.dataset.aspect) === curAspect));
    chips.forEach((c) => c.addEventListener('click', () => {
      curAspect = c.dataset.aspect === '' ? null : +c.dataset.aspect;
      markChip();
      layout();
    }));
    markChip();

    async function finish(ok) {
      ro.disconnect();
      if (!ok) {
        root.remove();
        return resolve(null);
      }
      const s = scale();
      const f = Math.min(1 / s, MAX_OUT / Math.max(box.w, box.h)); // native res, capped
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(box.w * f));
      out.height = Math.max(1, Math.round(box.h * f));
      const o = out.getContext('2d');
      o.imageSmoothingQuality = 'high';
      if (type === 'image/jpeg') {
        o.fillStyle = '#fff';
        o.fillRect(0, 0, out.width, out.height);
      }
      o.scale(f, f);
      o.translate(box.w / 2 + tx, box.h / 2 + ty);
      paintImage(o, s);
      const blob = await canvasToBlob(out, type, 0.9);
      root.remove();
      resolve(blob);
    }

    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') finish(false);
      else if (act === 'done') finish(true);
      else if (act === 'rotate') {
        rot = (rot + 1) % 4;
        tx = ty = 0;
        layout();
      } else if (act === 'reset') {
        rot = 0;
        zoom = 1;
        tx = ty = 0;
        layout();
      } else if (act === 'focus') focus(focusRect);
    });

    const ro = new ResizeObserver(() => layout());
    ro.observe(stage);
    requestAnimationFrame(() => (focusRect ? focus(focusRect) : layout()));
  });
}
