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
test('the only built-in test model is the pinned Qwen 0.5B GGUF', () => {
  assert.deepEqual(CATALOG.map(model => model.id), ['qwen-0.5b']);
  const starter = CATALOG[0];
  assert.equal(starter.size, 491400032);
  assert.equal(starter.sha256, '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db');
  assert.match(starter.url, /qwen2\.5-0\.5b-instruct-q4_k_m\.gguf$/);
});
