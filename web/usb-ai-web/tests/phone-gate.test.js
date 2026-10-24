import test from 'node:test';
import assert from 'node:assert/strict';
import { isSmartphone } from '../phone-gate.js';

test('blocks phones while leaving computers and tablets available', () => {
  assert.equal(isSmartphone('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', undefined), true);
  assert.equal(isSmartphone('Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Mobile Safari/537.36', undefined), true);
  assert.equal(isSmartphone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', undefined), false);
  assert.equal(isSmartphone('Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)', undefined), false);
  assert.equal(isSmartphone('Mozilla/5.0 (Linux; Android 16; Pixel Tablet)', false), false);
  assert.equal(isSmartphone('Reduced user agent', true), true);
});
