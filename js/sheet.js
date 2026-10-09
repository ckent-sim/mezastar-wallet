// Bottom-sheet modal. openSheet(html) → { el, close, closed: Promise<void> }
import { t } from './i18n.js';

export function openSheet(html, { wide = false } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(backdrop);
  const el = backdrop.firstElementChild;
  let done;
  const closed = new Promise((r) => (done = r));
  const close = () => {
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 160);
    document.removeEventListener('keydown', onKey);
    done();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  requestAnimationFrame(() => backdrop.classList.add('open'));
  return { el, close, closed };
}

export function confirmSheet(message, { ok = t('common.delete'), danger = true } = {}) {
  return new Promise((resolve) => {
    const s = openSheet(`
      <p class="confirm-msg"></p>
      <div class="sheet-actions">
        <button class="btn ghost" data-close>${t('common.cancel')}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button>
      </div>`);
    s.el.querySelector('.confirm-msg').textContent = message;
    let result = false;
    s.el.querySelector('[data-ok]').addEventListener('click', () => {
      result = true;
      s.close();
    });
    s.closed.then(() => resolve(result));
  });
}
