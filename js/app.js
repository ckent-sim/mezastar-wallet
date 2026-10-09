// Entry: hash router + service worker registration.
import { renderTrainer, renderSupport } from './qr-ui.js';
import { renderTags } from './tags-ui.js';
import { renderSettings } from './settings-ui.js';

const routes = { trainer: renderTrainer, tags: renderTags, support: renderSupport, settings: renderSettings };
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
    view.innerHTML = '<p class="muted">Something went wrong loading this screen.</p>';
  }
  view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);

const pill = document.querySelector('.offline-pill');
const net = () => (pill.hidden = navigator.onLine);
window.addEventListener('online', net);
window.addEventListener('offline', net);
net();

// jsQR is a classic deferred script; module scripts run after it, but guard anyway.
if (!window.jsQR) await new Promise((r) => window.addEventListener('DOMContentLoaded', r, { once: true }));
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
