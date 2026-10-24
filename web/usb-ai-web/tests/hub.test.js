import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFromEntry, searchModels } from '../hub.js';

const hash = 'a'.repeat(64);
test('only verified standalone GGUF files become results', () => {
  const valid = modelFromEntry('owner/repo', { path:'models/tiny-q4.gguf', size:30_000_000, lfs:{sha256:hash} }, 'apache-2.0');
  assert.equal(valid.sha256, hash);
  assert.equal(valid.url, 'https://huggingface.co/owner/repo/resolve/main/models/tiny-q4.gguf');
  assert.equal(modelFromEntry('owner/repo', { path:'../tiny.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'mmproj.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'tiny.gguf', size:30_000_000 }), null);
});
test('search lists verified files from public repositories', async () => {
  const fetcher = async url => ({ ok:true, json:async () => url.includes('/tree/')
    ? [{path:'tiny.gguf',size:30_000_000,lfs:{sha256:hash}}]
    : [{id:'owner/repo',tags:['license:apache-2.0']}] });
  const result = await searchModels('tiny', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].license, 'apache-2.0');
  assert.equal(result.nextSkip, null);
});
