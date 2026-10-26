import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafari, isFirefox, largeModelWarningBrowser, usesSafariCpu, modelOptions, needsSafariFallback } from '../browser-capability.js';

const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0';

test('large model notice appears only in Safari and Firefox', () => {
  assert.equal(largeModelWarningBrowser(safari), 'safari');
  assert.equal(isFirefox(firefox), true);
  assert.equal(largeModelWarningBrowser(firefox), 'firefox');
  assert.equal(largeModelWarningBrowser(chrome), null);
});

test('Safari without WebGPU uses a smaller CPU context', () => {
  assert.equal(isSafari(safari), true);
  assert.equal(usesSafariCpu(safari, undefined), true);
  assert.deepEqual(modelOptions({ safariCpu: true }), { n_ctx: 2048, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: true });
});

test('Chrome and Safari with WebGPU retain the standard context', () => {
  assert.equal(isSafari(chrome), false);
  assert.equal(usesSafariCpu(safari, {}), false);
  assert.equal(modelOptions({ safariCpu: false, deviceMemory: 8 }).n_ctx, 8192);
});

test('Safari CPU avoids automatic 3B loading while retaining small models', () => {
  assert.equal(needsSafariFallback({ size: 1_599_668_768 }, true), true);
  assert.equal(needsSafariFallback({ size: 491_400_032 }, true), false);
  assert.equal(needsSafariFallback({ size: 1_599_668_768 }, false), false);
});
