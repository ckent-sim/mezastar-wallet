import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchPokemon, spriteUrl } from '../js/pokemon.js';

const list = JSON.parse(await readFile(new URL('../data/pokemon.json', import.meta.url)));

test('english prefix, case-insensitive', () => {
  assert.equal(searchPokemon(list, 'PIKA')[0].id, 25);
});

test('japanese and chinese names', () => {
  assert.ok(searchPokemon(list, 'ピカ').some((p) => p.id === 25));
  assert.ok(searchPokemon(list, '皮卡').some((p) => p.id === 25));
});

test('id lookup with #', () => {
  assert.equal(searchPokemon(list, '#6')[0].id, 6);
});

test('prefix matches rank before substring matches', () => {
  const r = searchPokemon(list, 'char', 20);
  assert.equal(r[0].en, 'Charmander');
});

test('accent-insensitive (Flabébé)', () => {
  assert.ok(searchPokemon(list, 'flabebe').some((p) => p.id === 669));
});

test('empty query returns nothing', () => {
  assert.deepEqual(searchPokemon(list, '  '), []);
});

test('limit respected', () => {
  assert.equal(searchPokemon(list, 'a', 5).length, 5);
});

test('sprite url', () => {
  assert.match(spriteUrl(25), /\/25\.png$/);
});
