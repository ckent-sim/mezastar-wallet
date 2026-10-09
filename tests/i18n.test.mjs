import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, t, setLang, getLang } from '../js/i18n.js';

test('every language has exactly the same keys', () => {
  const en = Object.keys(STRINGS.en).sort();
  for (const [lang, dict] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(dict).sort(), en, `${lang} keys differ from en`);
  }
});

test('placeholders match between languages', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, en] of Object.entries(STRINGS.en)) {
    for (const lang of Object.keys(STRINGS)) {
      assert.deepEqual(vars(STRINGS[lang][key]), vars(en), `${lang}:${key}`);
    }
  }
});

test('t() interpolates and switches language', () => {
  setLang('en');
  assert.equal(t('tags.deleteConfirm', { name: 'Pikachu' }), 'Delete “Pikachu”?');
  setLang('zh');
  assert.equal(getLang(), 'zh');
  assert.equal(t('tags.deleteConfirm', { name: '皮卡丘' }), '删除“皮卡丘”？');
  setLang('xx'); // unknown → ignored
  assert.equal(getLang(), 'zh');
});

test('unknown key falls back to the key', () => {
  assert.equal(t('nope.missing'), 'nope.missing');
});
