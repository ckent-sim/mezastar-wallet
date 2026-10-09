// Official tag catalog (data/tags.json, built from the official site) with owned tracking.
// Owned state lives in the 'owned' store as { id: tagNo, at }. Images are loaded from the
// official server when online; cards stay readable offline without them.
import { dbAll, dbPut, dbDelete } from './db.js';
import { loadPokemon } from './pokemon.js';
import { confirmSheet } from './sheet.js';
import { esc, toast } from './util.js';
import { t, getLang } from './i18n.js';

const GROUPS = ['superstar', 'star', 'regular', 'special'];
let catalog;
const loadCatalog = () => (catalog ??= fetch(new URL('../data/tags.json', import.meta.url)).then((r) => r.json()));

function pref(key, fallback) {
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

const fold = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function renderCatalog(host) {
  const [data, ownedRows, dex] = await Promise.all([loadCatalog(), dbAll('owned'), loadPokemon()]);
  const owned = new Set(ownedRows.map((r) => r.id));
  const zhByDex = new Map(dex.map((p) => [p.id, p.zh]));
  // Chinese name when in Chinese mode; keep form text like "(Complete Forme)"
  const nameOf = (tag) => {
    if (getLang() !== 'zh' || !zhByDex.get(tag.dex)) return tag.name;
    const form = tag.name.match(/\(.*\)/)?.[0];
    return form ? `${zhByDex.get(tag.dex)} ${form}` : zhByDex.get(tag.dex);
  };

  let set = data.sets.includes(pref('catalogSet')) ? pref('catalogSet') : data.sets[0];
  let group = pref('catalogGroup', '');
  let show = pref('catalogShow', ''); // '' | 'owned' | 'missing'
  let query = '';

  host.innerHTML = `
    <div class="chips scroll-x set-chips">${data.sets.map((s) =>
      `<button class="chip" data-set="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="progress"><div class="progress-bar"><span></span></div><p class="progress-text"></p></div>
    <div class="search-row">
      <input type="search" placeholder="${t('catalog.search')}" aria-label="${t('catalog.search')}">
    </div>
    <div class="chips filter-chips">
      <button class="chip" data-group="">${t('catalog.allGroups')}</button>
      ${GROUPS.map((g) => `<button class="chip" data-group="${g}">${t(`group.${g}`)}</button>`).join('')}
    </div>
    <div class="chips filter-chips">
      <button class="chip" data-show="">${t('catalog.showAll')}</button>
      <button class="chip" data-show="owned">✓ ${t('catalog.owned')}</button>
      <button class="chip" data-show="missing">${t('catalog.missing')}</button>
    </div>
    <div class="catalog-grid"></div>
    <div class="row wrap bulk">
      <button class="btn small" data-act="markAll">${t('catalog.markShown')}</button>
      <button class="btn small ghost" data-act="clearAll">${t('catalog.clearShown')}</button>
    </div>
    <p class="muted small center source"></p>`;

  const grid = host.querySelector('.catalog-grid');
  const visible = () => {
    const q = fold(query.trim());
    return data.tags.filter((tag) => tag.set === set
      && (!group || tag.group === group)
      && (!show || (show === 'owned') === owned.has(tag.no))
      && (!q || fold(tag.no).includes(q) || fold(tag.name).includes(q) || fold(nameOf(tag)).includes(q)));
  };

  const paintProgress = () => {
    const inSet = data.tags.filter((tag) => tag.set === set);
    const have = inSet.filter((tag) => owned.has(tag.no)).length;
    host.querySelector('.progress-bar span').style.width = `${(have / inSet.length) * 100}%`;
    host.querySelector('.progress-text').textContent = t('catalog.progress', { have, total: inSet.length, set });
  };

  const paint = () => {
    host.querySelectorAll('[data-set]').forEach((b) => b.classList.toggle('on', b.dataset.set === set));
    host.querySelectorAll('[data-group]').forEach((b) => b.classList.toggle('on', b.dataset.group === group));
    host.querySelectorAll('[data-show]').forEach((b) => b.classList.toggle('on', b.dataset.show === show));
    const list = visible();
    grid.innerHTML = list.length ? list.map((tag) => `
      <button class="cat-card g-${tag.group} ${owned.has(tag.no) ? 'owned' : ''}" data-no="${esc(tag.no)}"
        aria-pressed="${owned.has(tag.no)}" aria-label="${esc(`${tag.no} ${nameOf(tag)}`)}">
        <span class="cat-img"><img src="${esc(tag.img)}" alt="" loading="lazy" decoding="async"
          referrerpolicy="no-referrer" onerror="this.remove()"></span>
        <span class="cat-no">${esc(tag.no)}</span>
        <span class="cat-name">${esc(nameOf(tag))}</span>
        <span class="cat-check" aria-hidden="true">✓</span>
      </button>`).join('') : `<p class="muted">${t('catalog.none')}</p>`;
    paintProgress();
    host.querySelector('.source').innerHTML = t('catalog.source', {
      link: `<a href="${esc(data.source)}" target="_blank" rel="noopener">world.pokemonmezastar.com</a>`,
      date: esc(data.updated),
    });
  };
  paint();

  host.querySelector('input').addEventListener('input', (e) => {
    query = e.target.value;
    paint();
  });

  async function setOwned(no, value) {
    if (value) {
      owned.add(no);
      await dbPut('owned', { id: no, at: Date.now() });
    } else {
      owned.delete(no);
      await dbDelete('owned', no);
    }
  }

  host.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.set != null) {
      set = b.dataset.set;
      setPref('catalogSet', set);
      paint();
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    } else if (b.dataset.group != null) {
      group = b.dataset.group;
      setPref('catalogGroup', group);
      paint();
    } else if (b.dataset.show != null) {
      show = b.dataset.show;
      setPref('catalogShow', show);
      paint();
    } else if (b.dataset.no) {
      const now = !owned.has(b.dataset.no);
      await setOwned(b.dataset.no, now);
      b.classList.toggle('owned', now);
      b.setAttribute('aria-pressed', now);
      paintProgress();
      if (show) paint(); // item may leave the filtered view
    } else if (b.dataset.act === 'markAll' || b.dataset.act === 'clearAll') {
      const value = b.dataset.act === 'markAll';
      const list = visible().filter((tag) => owned.has(tag.no) !== value);
      if (!list.length) return;
      const msg = t(value ? 'catalog.confirmMark' : 'catalog.confirmClear', { n: list.length });
      if (!(await confirmSheet(msg, { ok: t('common.save'), danger: !value }))) return;
      for (const tag of list) await setOwned(tag.no, value);
      toast(t('catalog.updated', { n: list.length }));
      paint();
    }
  };
}
