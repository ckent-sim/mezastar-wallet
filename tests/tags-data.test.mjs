import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/tags.json', import.meta.url)));

test('catalog has sets and well-formed tags', () => {
  assert.ok(data.sets.length >= 1);
  assert.match(data.source, /^https:\/\/world\.pokemonmezastar\.com\//);
  for (const tag of data.tags) {
    assert.match(tag.no, /^([0-9]+-[0-9]+-[0-9]{3}|R-[0-9]+-[0-9]+)$/, tag.no);
    assert.ok(tag.name, tag.no);
    assert.ok(data.sets.includes(tag.set), tag.no);
    assert.ok(['superstar', 'star', 'regular', 'special'].includes(tag.group), `${tag.no} group ${tag.group}`);
    assert.match(tag.img, /^https:\/\//, tag.no);
  }
});

test('a tag number appears at most once per set', () => {
  const seen = new Set();
  for (const tag of data.tags) {
    const key = `${tag.set}|${tag.no}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
});

test('every set has tags', () => {
  for (const s of data.sets) assert.ok(data.tags.some((tag) => tag.set === s), s);
});
