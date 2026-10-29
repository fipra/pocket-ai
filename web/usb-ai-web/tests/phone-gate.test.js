import test from 'node:test';
import assert from 'node:assert/strict';
import { isSmartphone, isIPhone } from '../phone-gate.js';
import { iosDiagnosticsEnabled } from '../ios-diagnostics.js';

test('identifies phones and retains the Android gate', () => {
  assert.equal(isSmartphone('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', undefined), true);
  assert.equal(isSmartphone('Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Mobile Safari/537.36', undefined), true);
  assert.equal(isSmartphone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', undefined), false);
  assert.equal(isSmartphone('Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)', undefined), false);
  assert.equal(isSmartphone('Mozilla/5.0 (Linux; Android 16; Pixel Tablet)', false), false);
  assert.equal(isSmartphone('Reduced user agent', true), true);
});
test('iPhone diagnostics require both iPhone and the opt-in parameter', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)';
  assert.equal(isIPhone(iphone),true);
  assert.equal(iosDiagnosticsEnabled(iphone,'?iosdiag=1'),true);
  assert.equal(iosDiagnosticsEnabled(iphone,''),false);
  assert.equal(iosDiagnosticsEnabled('Android Mobile','?iosdiag=1'),false);
});
