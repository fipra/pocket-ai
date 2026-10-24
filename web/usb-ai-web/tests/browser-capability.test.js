import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafari, usesSafariCpu, modelOptions } from '../browser-capability.js';

const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

test('Safari without WebGPU uses a smaller CPU context', () => {
  assert.equal(isSafari(safari), true);
  assert.equal(usesSafariCpu(safari, undefined), true);
  assert.deepEqual(modelOptions({ safariCpu: true }), { n_ctx: 2048, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: false });
});

test('Chrome and Safari with WebGPU retain the standard context', () => {
  assert.equal(isSafari(chrome), false);
  assert.equal(usesSafariCpu(safari, {}), false);
  assert.equal(modelOptions({ safariCpu: false, deviceMemory: 8 }).n_ctx, 8192);
});
