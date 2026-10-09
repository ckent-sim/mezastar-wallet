// Pokémon name autocomplete on a text input, backed by the bundled offline list.
import { loadPokemon, searchPokemon } from './pokemon.js';
import { esc } from './util.js';

/** onPick(entry) is called when a suggestion is chosen. */
export function attachPokemonAutocomplete(input, onPick = () => {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ac-wrap';
  input.replaceWith(wrap);
  wrap.append(input);
  const list = document.createElement('ul');
  list.className = 'ac-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.append(list);
  input.setAttribute('autocomplete', 'off');

  let items = [];
  let active = -1;

  const render = () => {
    list.hidden = !items.length;
    list.innerHTML = items.map((p, i) => `
      <li role="option" data-i="${i}" class="${i === active ? 'on' : ''}">
        <span class="ac-no">#${String(p.id).padStart(4, '0')}</span>
        <b>${esc(p.en)}</b><small>${esc(p.ja)} ${esc(p.zh)}</small>
      </li>`).join('');
  };
  const pick = (p) => {
    input.value = p.en;
    items = [];
    render();
    onPick(p);
  };

  input.addEventListener('input', async () => {
    items = searchPokemon(await loadPokemon(), input.value, 8);
    active = -1;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      items = [];
      render();
    }
  });
  // pointerdown fires before blur, so the pick isn't lost
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    pick(items[+li.dataset.i]);
  });
  input.addEventListener('blur', () => setTimeout(() => {
    items = [];
    render();
  }, 100));
}
