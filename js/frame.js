// Framed QR rendering. The QR always sits on a white panel with a ≥4-module quiet
// zone; decorations are only drawn outside that panel.

export const FRAME_STYLES = ['clean', 'pokeball', 'star', 'neon', 'holo'];
export const QUIET_ZONE = 4;
export const DEFAULT_FRAME = { style: 'pokeball', color: '#e3350d', accent: '#ffcb05' };
const PANEL_RATIO = 0.64;
const IMAGE_ONLY_MODULES = 29; // nominal grid used to size the panel when showing a photo

export function frameLayout(width, moduleCount) {
  const span = moduleCount + QUIET_ZONE * 2;
  const module = Math.max(1, Math.floor((width * PANEL_RATIO) / span));
  const panelSize = module * span;
  const x = Math.floor((width - panelSize) / 2);
  const y = Math.floor((width - panelSize) / 2);
  return {
    panel: { x, y, size: panelSize },
    qr: { x: x + QUIET_ZONE * module, y: y + QUIET_ZONE * module, size: module * moduleCount, module },
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx square canvas context
 * @param {number} W canvas width (= height)
 * @param {{matrix?, image?, frame?, background?, title?, subtitle?}} opts
 */
export function renderFrame(ctx, W, { matrix = null, image = null, frame = DEFAULT_FRAME, background = null, title = '', subtitle = '' }) {
  const f = { ...DEFAULT_FRAME, ...frame };
  const { panel, qr } = frameLayout(W, matrix ? matrix.size : IMAGE_ONLY_MODULES);
  ctx.save();
  ctx.clearRect(0, 0, W, W);

  if (background) drawCover(ctx, background, W);
  else baseFill[f.style]?.(ctx, W, f);
  decorate[f.style]?.(ctx, W, f, panel, !!background);

  // white panel
  const r = Math.round(qr.module * 2);
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = W * 0.02;
  ctx.fillStyle = '#fff';
  roundRect(ctx, panel.x, panel.y, panel.size, panel.size, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  if (matrix) {
    ctx.fillStyle = '#000';
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        if (matrix.isDark(row, col)) ctx.fillRect(qr.x + col * qr.module, qr.y + row * qr.module, qr.module, qr.module);
      }
    }
  } else if (image) {
    // original photo: fit inside panel with a small inset
    const inset = qr.module * 1.5;
    drawContain(ctx, image, panel.x + inset, panel.y + inset, panel.size - inset * 2);
  }

  const bandH = panel.y; // space above/below the panel
  if (title) label(ctx, title, W / 2, bandH * 0.55, Math.min(bandH * 0.38, W * 0.07), f);
  if (subtitle) label(ctx, subtitle, W / 2, W - bandH * 0.5, Math.min(bandH * 0.24, W * 0.04), f);
  ctx.restore();
}

// ---------- styles ----------

const baseFill = {
  clean(ctx, W, f) {
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, W, W);
  },
  pokeball(ctx, W) {
    ctx.fillStyle = '#1b1b1f';
    ctx.fillRect(0, 0, W, W);
  },
  star(ctx, W, f) {
    const g = ctx.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W * 0.75);
    g.addColorStop(0, shade(f.color, 0.25));
    g.addColorStop(1, shade(f.color, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
  },
  neon(ctx, W) {
    ctx.fillStyle = '#0b0b1a';
    ctx.fillRect(0, 0, W, W);
  },
  holo(ctx, W, f) {
    const g = ctx.createLinearGradient(0, 0, W, W);
    ['#ff9a9e', '#fad0c4', '#a1c4fd', '#c2e9fb', '#d4fc79', '#96e6a1', f.accent].forEach((c, i, a) =>
      g.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
  },
};

const decorate = {
  clean(ctx, W, f) {
    ctx.strokeStyle = f.accent;
    ctx.lineWidth = W * 0.012;
    roundRect(ctx, W * 0.03, W * 0.03, W * 0.94, W * 0.94, W * 0.05);
    ctx.stroke();
  },
  pokeball(ctx, W, f, panel, hasBg) {
    const c = W / 2;
    const R = W * 0.47;
    ctx.save();
    if (hasBg) ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(c, c, R, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = f.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#f4f4f4';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1b1b1f';
    ctx.fillRect(c - R, c - W * 0.025, R * 2, W * 0.05);
    ctx.lineWidth = W * 0.02;
    ctx.strokeStyle = '#1b1b1f';
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.stroke();
    // "button" ring around the panel
    ctx.strokeStyle = f.accent;
    ctx.lineWidth = W * 0.012;
    const pad = W * 0.018;
    roundRect(ctx, panel.x - pad, panel.y - pad, panel.size + pad * 2, panel.size + pad * 2, W * 0.04);
    ctx.stroke();
    ctx.restore();
  },
  star(ctx, W, f, panel) {
    const rnd = seeded(7);
    ctx.fillStyle = f.accent;
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W;
      const y = rnd() * W;
      const s = W * (0.012 + rnd() * 0.03);
      if (x + s > panel.x - W * 0.02 && x - s < panel.x + panel.size + W * 0.02 &&
          y + s > panel.y - W * 0.02 && y - s < panel.y + panel.size + W * 0.02) continue;
      ctx.globalAlpha = 0.5 + rnd() * 0.5;
      starPath(ctx, x, y, s, s * 0.45);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = f.accent;
    ctx.lineWidth = W * 0.008;
    roundRect(ctx, W * 0.035, W * 0.035, W * 0.93, W * 0.93, W * 0.05);
    ctx.stroke();
  },
  neon(ctx, W, f, panel) {
    const pad = W * 0.035;
    ctx.save();
    for (const [color, off, lw] of [[f.color, pad, 0.012], [f.accent, pad * 2, 0.007]]) {
      ctx.shadowColor = color;
      ctx.shadowBlur = W * 0.04;
      ctx.strokeStyle = color;
      ctx.lineWidth = W * lw;
      roundRect(ctx, panel.x - off, panel.y - off, panel.size + off * 2, panel.size + off * 2, W * 0.04);
      ctx.stroke();
      ctx.stroke();
    }
    ctx.shadowColor = f.color;
    ctx.shadowBlur = W * 0.03;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = W * 0.006;
    roundRect(ctx, W * 0.03, W * 0.03, W * 0.94, W * 0.94, W * 0.06);
    ctx.stroke();
    ctx.restore();
  },
  holo(ctx, W) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    for (let i = -W; i < W * 2; i += W * 0.12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + W * 0.04, 0);
      ctx.lineTo(i + W * 0.04 - W, W);
      ctx.lineTo(i - W, W);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = W * 0.015;
    roundRect(ctx, W * 0.03, W * 0.03, W * 0.94, W * 0.94, W * 0.06);
    ctx.stroke();
    ctx.restore();
  },
};

// ---------- helpers ----------

function label(ctx, text, x, y, size, f) {
  ctx.save();
  ctx.font = `800 ${Math.round(size)}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(text, x, y, ctx.canvas.width * 0.86);
  ctx.fillStyle = f.style === 'neon' ? f.accent : '#fff';
  ctx.fillText(text, x, y, ctx.canvas.width * 0.86);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function drawCover(ctx, img, W) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(W / iw, W / ih);
  ctx.drawImage(img, (W - iw * s) / 2, (W - ih * s) / 2, iw * s, ih * s);
}

function drawContain(ctx, img, x, y, size) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.min(size / iw, size / ih);
  ctx.drawImage(img, x + (size - iw * s) / 2, y + (size - ih * s) / 2, iw * s, ih * s);
}

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
