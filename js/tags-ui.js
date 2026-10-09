// My Tags: searchable grid of owned Pokémon tags (photo, name, note, favorite).
import { dbAll, dbPut, dbDelete } from './db.js';
import { openCropper } from './cropper.js';
import { openSheet, confirmSheet } from './sheet.js';
import { attachPokemonAutocomplete } from './autocomplete.js';
import { spriteUrl } from './pokemon.js';
import { uid, pickFile, toast, esc } from './util.js';
import { t } from './i18n.js';

let urls = [];
const objUrl = (blob) => {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
};
const thumb = (t) => (t.photo ? objUrl(t.photo) : t.pokemonId ? spriteUrl(t.pokemonId) : '');

const fold = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
let query = '';
let favOnly = false;

export async function renderTags(view) {
  const all = await dbAll('tags');
  view.innerHTML = `
    <div class="screen-head">
      <h1 class="screen-title">${t('tags.title')} <small>${all.length || ''}</small></h1>
      <button class="btn primary" data-act="add">${t('tags.add')}</button>
    </div>
    <div class="search-row">
      <input type="search" placeholder="${t('tags.search')}" aria-label="${t('tags.search')}">
      <button class="chip" data-act="fav" aria-pressed="${favOnly}">${t('tags.favs')}</button>
    </div>
    <div class="tag-grid"></div>`;
  const search = view.querySelector('input');
  search.value = query;
  const grid = view.querySelector('.tag-grid');

  const paint = () => {
    urls.forEach(URL.revokeObjectURL);
    urls = [];
    const q = fold(query.trim());
    const list = all
      .filter((x) => (!favOnly || x.favorite) && (!q || fold(x.name).includes(q) || fold(x.note).includes(q)))
      .sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name));
    view.querySelector('[data-act=fav]').classList.toggle('on', favOnly);
    if (!all.length) {
      grid.innerHTML = `<div class="empty wide"><div class="empty-art">🏷️</div>
        <p>${t('tags.empty')}</p></div>`;
      return;
    }
    grid.innerHTML = list.length ? list.map((tag) => `
      <article class="tag-card" data-id="${tag.id}">
        <button class="tag-open" data-act="open" aria-label="${t('tags.editAria', { name: esc(tag.name) })}">
          ${thumb(tag) ? `<img src="${thumb(tag)}" alt="" loading="lazy">` : '<div class="no-photo">?</div>'}
          <span class="tag-name">${esc(tag.name || t('tags.unnamed'))}</span>
          ${tag.note ? `<span class="tag-note">${esc(tag.note)}</span>` : ''}
        </button>
        <button class="fav ${tag.favorite ? 'on' : ''}" data-act="star" aria-label="${t('tags.favAria')}" aria-pressed="${!!tag.favorite}">★</button>
      </article>`).join('') : `<p class="muted">${t('tags.noMatch')}</p>`;
  };
  paint();

  search.addEventListener('input', () => {
    query = search.value;
    paint();
  });
  // property (not addEventListener): this view re-renders into the same container
  view.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;
    const tag = all.find((x) => x.id === id);
    if (act === 'add') {
      if (await editTag(null)) renderTags(view);
    } else if (act === 'fav') {
      favOnly = !favOnly;
      paint();
    } else if (act === 'star' && tag) {
      tag.favorite = !tag.favorite;
      await dbPut('tags', tag);
      paint();
    } else if (act === 'open' && tag) {
      if (await editTag(tag)) renderTags(view);
    }
  };
}

function editTag(existing) {
  const tag = existing
    ? { ...existing }
    : { id: uid(), name: '', pokemonId: null, photo: null, note: '', favorite: false, createdAt: Date.now() };
  return new Promise((resolve) => {
    const s = openSheet(`
      <h3>${t(existing ? 'tags.edit' : 'tags.new')}</h3>
      <form class="form">
        <button type="button" class="photo-pick" data-act="photo" aria-label="${t('tags.choosePhoto')}"></button>
        <label>${t('tags.pokemon')}<input name="name" required maxlength="40" placeholder="${t('tags.searchPokemon')}"></label>
        <label>${t('tags.note')}<textarea name="note" rows="2" maxlength="200" placeholder="${t('tags.notePh')}"></textarea></label>
        <label class="check"><input type="checkbox" name="favorite"> ${t('tags.favorite')}</label>
        <div class="sheet-actions">
          ${existing ? `<button type="button" class="btn danger" data-act="delete">${t('common.delete')}</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>${t('common.cancel')}</button>
          <button class="btn primary">${t('common.save')}</button>
        </div>
      </form>`);
    const f = s.el.querySelector('form');
    f.name.value = tag.name;
    f.note.value = tag.note;
    f.favorite.checked = tag.favorite;
    attachPokemonAutocomplete(f.name, (p) => (tag.pokemonId = p.id));
    f.name.addEventListener('input', () => (tag.pokemonId = null));

    const photoBtn = s.el.querySelector('.photo-pick');
    let photoUrl;
    const showPhoto = () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = tag.photo ? URL.createObjectURL(tag.photo) : null;
      const src = photoUrl ?? (tag.pokemonId ? spriteUrl(tag.pokemonId) : null);
      photoBtn.innerHTML = src ? `<img src="${src}" alt="">` : `<span>${t('tags.addPhoto')}</span>`;
    };
    showPhoto();

    let saved = false;
    s.el.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'photo') {
        const file = await pickFile();
        if (!file) return;
        const blob = await openCropper(file, { aspect: 3 / 4, title: t('crop.tag'), type: 'image/jpeg' });
        if (blob) {
          tag.photo = blob;
          showPhoto();
        }
      } else if (act === 'delete') {
        if (await confirmSheet(t('tags.deleteConfirm', { name: tag.name || t('tags.thisTag') }), { ok: t('common.delete') })) {
          await dbDelete('tags', tag.id);
          saved = true;
          s.close();
        }
      }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      tag.name = f.name.value.trim();
      tag.note = f.note.value.trim();
      tag.favorite = f.favorite.checked;
      try {
        await dbPut('tags', tag);
        navigator.storage?.persist?.();
        saved = true;
        s.close();
      } catch (err) {
        toast(t('tags.saveFail', { msg: err.message }));
      }
    });
    s.closed.then(() => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      resolve(saved);
    });
  });
}
