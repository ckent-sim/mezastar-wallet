// Builds data/tags.json from the official Pokémon Mezastar SG site (tag number, name, set, group).
// Images are NOT downloaded — the app shows them from the official server and caches them on view.
// Run when a new version releases: node scripts/build-tags.mjs
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://world.pokemonmezastar.com/sg/tag/';

const decode = (s) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const GROUPS = [
  [/superstar/i, 'superstar'],
  [/star pok/i, 'star'],
  [/★|2.?4/, 'regular'],
  [/regular tag/i, 'special'],
];
const groupOf = (heading) => GROUPS.find(([re]) => re.test(heading))?.[1] ?? 'other';

async function page(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'mezastar-wallet tag list builder (fan app)' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

const root = await page(BASE);

const versions = new Map();
// version links: <a href="./37860/">Galaxy Version 2</a>
for (const m of root.matchAll(/<a[^>]+href="((?:\.\/|[^"]*\/sg\/tag\/)(\d+)\/)"[^>]*>([\s\S]*?)<\/a>/g)) {
  const name = decode(m[3]);
  if (/version/i.test(name) && !versions.has(name)) versions.set(name, new URL(m[1], BASE).href);
}
// the root page is the newest version; its name is in the heading
const newest = decode(root.match(/tag-content_heding_title[^>]*>\s*<b[^>]*>([\s\S]*?)<\/b>/)?.[1] ?? '') || 'Latest';

const sets = [[newest, BASE], ...versions];
const tags = [];
for (const [set, url] of sets) {
  const html = url === BASE ? root : await page(url);
  // walk headings and list items in document order
  let heading = '';
  const re = /<h4[^>]*class="[^"]*tag-sub_title[^"]*"[^>]*>([\s\S]*?)<\/h4>|<li[^>]*class="[^"]*tag-all_list_child[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let n = 0;
  for (const m of html.matchAll(re)) {
    if (m[1] != null) {
      heading = decode(m[1]);
      continue;
    }
    const li = m[2];
    const no = decode(li.match(/class="tag-no"[^>]*>([\s\S]*?)</)?.[1] ?? '');
    const name = decode(li.match(/class="tag-name"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
    const img = li.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? '';
    if (!no) continue;
    tags.push({ no, name, set, group: groupOf(heading), img });
    n++;
  }
  console.log(`${set}: ${n} tags`);
  await new Promise((r) => setTimeout(r, 500)); // be gentle with the official site
}

// link each tag to a Pokédex number via the bundled name list (strips forms like "(Complete Forme)")
const dex = JSON.parse(await readFile(new URL('../data/pokemon.json', import.meta.url)));
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const byName = new Map(dex.map((p) => [fold(p.en), p.id]));
const base = (name) => name
  .replace(/\(.*?\)/g, '')
  .replace(/^(mega|gigantamax|dynamax|alolan|galarian|hisuian|paldean|shadow rider|ice rider|crowned)\s+/i, '')
  .replace(/\s+(ex|gx|v|vmax|x|y)$/i, '')
  .trim();
let unmatched = 0;
for (const t of tags) {
  t.dex = byName.get(fold(t.name)) ?? byName.get(fold(base(t.name))) ?? null;
  if (!t.dex) unmatched++;
}

await writeFile(
  new URL('../data/tags.json', import.meta.url),
  JSON.stringify({ source: BASE, updated: new Date().toISOString().slice(0, 10), sets: sets.map(([s]) => s), tags }),
);
console.log(`wrote ${tags.length} tags in ${sets.length} sets (${unmatched} without Pokédex match)`);
