import test from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../i18n.js';
import { CATALOG } from '../catalog.js';
import { readFileSync } from 'node:fs';

test('all five languages cover every visible English string', () => {
  assert.deepEqual(Object.keys(translations).sort(), ['de','en','es','fr','it']);
  const keys = Object.keys(translations.en).sort();
  for (const [language, strings] of Object.entries(translations)) {
    assert.deepEqual(Object.keys(strings).sort(), keys, language);
    assert.ok(Object.values(strings).every(value => typeof value === 'string' && value.length), language);
  }
});
test('curated downloads have pinned integrity data', () => {
  for (const model of CATALOG) {
    assert.match(model.url, /^https:\/\//);
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
    assert.ok(model.size > 0);
  }
});
test('the only built-in test model is the pinned Llama 3.2 1B GGUF', () => {
  assert.deepEqual(CATALOG.map(model => model.id), ['llama-3.2-1b']);
  const starter = CATALOG[0];
  assert.equal(starter.size, 807694464);
  assert.equal(starter.sha256, '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83');
  assert.match(starter.url, /Llama-3\.2-1B-Instruct-Q4_K_M\.gguf$/);
  const desktop = JSON.parse(readFileSync(new URL('../../../models/catalog.json', import.meta.url), 'utf8'))[0];
  assert.equal(starter.id, desktop.id);
  assert.equal(starter.url, desktop.url);
  assert.equal(starter.size, desktop.size_bytes);
  assert.equal(starter.sha256, desktop.sha256);
});
