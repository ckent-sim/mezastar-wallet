// Entry: hash router + service worker registration.
import { renderTrainer, renderSupport } from './qr-ui.js';
import { renderTagsTab } from './tags-ui.js';
import { renderSettings } from './settings-ui.js';
import { t, getLang } from './i18n.js';

const routes = { trainer: renderTrainer, tags: renderTagsTab, support: renderSupport, settings: renderSettings };
const view = document.getElementById('view');

async function route() {
  const name = location.hash.slice(1) in routes ? location.hash.slice(1) : 'trainer';
  document.querySelectorAll('.tabbar a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === name));
  view.onclick = null; // screens that delegate on the container re-assign this
  view.replaceChildren();
  try {
    await routes[name](view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<p class="muted">${t('common.loadError')}</p>`;
  }
  view.focus({ preventScroll: true });
}

function applyStaticText() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-Hans' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
}

window.addEventListener('hashchange', route);
window.addEventListener('langchange', () => {
  applyStaticText();
  route();
});
applyStaticText();

const pill = document.querySelector('.offline-pill');
const net = () => (pill.hidden = navigator.onLine);
window.addEventListener('online', net);
window.addEventListener('offline', net);
net();

// jsQR is a classic deferred script; module scripts run after it, but guard anyway.
if (!window.jsQR) await new Promise((r) => window.addEventListener('DOMContentLoaded', r, { once: true }));
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // A page that was already open keeps running old code after a new SW takes over,
  // so offer a reload (the very first install has no previous controller → no banner).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.querySelector('.update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<span>${t('app.updated')}</span><button class="btn small primary">${t('app.reload')}</button>`;
    bar.querySelector('button').addEventListener('click', () => location.reload());
    document.body.append(bar);
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // installed PWAs can stay open for days: check for a new version whenever they come back
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('SW registration failed', e));
}
