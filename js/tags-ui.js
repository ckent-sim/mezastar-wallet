// My Tags: searchable grid of owned Pokémon tags (photo, name, note, favorite).
import { dbAll, dbPut, dbDelete } from './db.js';
import { openCropper } from './cropper.js';
import { openSheet, confirmSheet } from './sheet.js';
import { attachPokemonAutocomplete } from './autocomplete.js';
import { spriteUrl } from './pokemon.js';
import { uid, pickFile, toast, esc } from './util.js';

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
      <h1 class="screen-title">My Tags <small>${all.length || ''}</small></h1>
      <button class="btn primary" data-act="add">＋ Add tag</button>
    </div>
    <div class="search-row">
      <input type="search" placeholder="Search name or note" aria-label="Search tags">
      <button class="chip" data-act="fav" aria-pressed="${favOnly}">★ Favorites</button>
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
      .filter((t) => (!favOnly || t.favorite) && (!q || fold(t.name).includes(q) || fold(t.note).includes(q)))
      .sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name));
    view.querySelector('[data-act=fav]').classList.toggle('on', favOnly);
    if (!all.length) {
      grid.innerHTML = `<div class="empty wide"><div class="empty-art">🏷️</div>
        <p>Keep track of the Mezastar tags you own. Snap a photo, crop it, and name the Pokémon.</p></div>`;
      return;
    }
    grid.innerHTML = list.length ? list.map((t) => `
      <article class="tag-card" data-id="${t.id}">
        <button class="tag-open" data-act="open" aria-label="Edit ${esc(t.name)}">
          ${thumb(t) ? `<img src="${thumb(t)}" alt="" loading="lazy">` : '<div class="no-photo">?</div>'}
          <span class="tag-name">${esc(t.name || 'Unnamed')}</span>
          ${t.note ? `<span class="tag-note">${esc(t.note)}</span>` : ''}
        </button>
        <button class="fav ${t.favorite ? 'on' : ''}" data-act="star" aria-label="Favorite" aria-pressed="${!!t.favorite}">★</button>
      </article>`).join('') : '<p class="muted">No tags match.</p>';
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
    const tag = all.find((t) => t.id === id);
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
      <h3>${existing ? 'Edit tag' : 'New tag'}</h3>
      <form class="form">
        <button type="button" class="photo-pick" data-act="photo" aria-label="Choose photo"></button>
        <label>Pokémon<input name="name" required maxlength="40" placeholder="Search Pokémon…"></label>
        <label>Note<textarea name="note" rows="2" maxlength="200" placeholder="e.g. Ultra Star, duplicate ×2"></textarea></label>
        <label class="check"><input type="checkbox" name="favorite"> ★ Favorite</label>
        <div class="sheet-actions">
          ${existing ? '<button type="button" class="btn danger" data-act="delete">Delete</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>Cancel</button>
          <button class="btn primary">Save</button>
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
      photoBtn.innerHTML = src ? `<img src="${src}" alt="">` : '<span>📷<br>Add photo</span>';
    };
    showPhoto();

    let saved = false;
    s.el.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'photo') {
        const file = await pickFile();
        if (!file) return;
        const blob = await openCropper(file, { aspect: 3 / 4, title: 'Crop tag photo', type: 'image/jpeg' });
        if (blob) {
          tag.photo = blob;
          showPhoto();
        }
      } else if (act === 'delete') {
        if (await confirmSheet(`Delete “${tag.name || 'this tag'}”?`)) {
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
        toast(`Couldn't save: ${err.message}`);
      }
    });
    s.closed.then(() => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      resolve(saved);
    });
  });
}
