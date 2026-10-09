// Offline Pokémon name search over data/pokemon.json ({id, en, ja, zh}).

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let cached;
export async function loadPokemon() {
  cached ??= fetch(new URL('../data/pokemon.json', import.meta.url)).then((r) => r.json());
  return cached;
}

export function searchPokemon(list, query, limit = 8) {
  const q = fold(query);
  if (!q) return [];
  const idMatch = q.match(/^#?(\d+)$/);
  if (idMatch) {
    const id = +idMatch[1];
    return list.filter((p) => String(p.id).startsWith(String(id))).sort((a, b) => a.id - b.id).slice(0, limit);
  }
  const prefix = [];
  const contains = [];
  for (const p of list) {
    const names = [p.en, p.ja, p.zh].filter(Boolean).map(fold);
    if (names.some((n) => n.startsWith(q))) prefix.push(p);
    else if (names.some((n) => n.includes(q))) contains.push(p);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}

export const spriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
