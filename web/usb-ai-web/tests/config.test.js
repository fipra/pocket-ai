import test from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../i18n.js';
import { CATALOG } from '../catalog.js';

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
