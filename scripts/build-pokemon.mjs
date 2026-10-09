// Builds data/pokemon.json from PokeAPI's species-name CSV (en / ja / zh).
// Run once at dev time: node scripts/build-pokemon.mjs
import { writeFile } from 'node:fs/promises';

const CSV_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const LANG = { 9: 'en', 1: 'ja', 4: 'zhHant', 12: 'zhHans' };

const csv = await (await fetch(CSV_URL)).text();
const byId = new Map();
for (const line of csv.split(/\r?\n/).slice(1)) {
  if (!line) continue;
  // columns: pokemon_species_id,local_language_id,name,genus (name has no commas)
  const [id, lang, name] = line.split(',');
  const key = LANG[lang];
  if (!key) continue;
  const entry = byId.get(+id) ?? { id: +id };
  entry[key] = name;
  byId.set(+id, entry);
}

const list = [...byId.values()]
  .filter((e) => e.en)
  .sort((a, b) => a.id - b.id)
  .map(({ id, en, ja, zhHant, zhHans }) => ({ id, en, ja: ja ?? '', zh: zhHant ?? zhHans ?? '' }));

await writeFile(new URL('../data/pokemon.json', import.meta.url), JSON.stringify(list));
console.log(`wrote ${list.length} entries; #25 =`, list.find((e) => e.id === 25));
