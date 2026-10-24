import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFromEntry, searchModels, searchTerm } from '../hub.js';

const hash = 'a'.repeat(64);
test('only verified standalone GGUF files become results', () => {
  const valid = modelFromEntry('owner/repo', { path:'models/tiny-q4.gguf', size:30_000_000, lfs:{sha256:hash} }, 'apache-2.0');
  assert.equal(valid.sha256, hash);
  assert.equal(valid.url, 'https://huggingface.co/owner/repo/resolve/main/models/tiny-q4.gguf');
  assert.equal(modelFromEntry('owner/repo', { path:'../tiny.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'mmproj.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'tiny.gguf', size:30_000_000 }), null);
  const large = modelFromEntry('owner/repo', { path:'Qwen3.5-9B-Q4_K_M.gguf', size:5_627_044_256, lfs:{sha256:hash} });
  assert.equal(large.tooLargeForWeb, true);
});
test('a GGUF filename searches for its model repository', () => {
  assert.equal(searchTerm('Qwen_Qwen3.5-9B-Q4_K_M.gguf'), 'Qwen3.5-9B');
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
test('full Qwen GGUF filename finds large files but marks them unavailable in Web', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    return { ok:true, json:async () => url.includes('/tree/')
      ? [{path:'Qwen3.5-9B-Q4_K_M.gguf',size:5_627_044_256,lfs:{sha256:hash}}]
      : [{id:'owner/Qwen3.5-9B-GGUF',tags:['license:apache-2.0']}] };
  };
  const result = await searchModels('Qwen_Qwen3.5-9B-Q4_K_M.gguf', 0, fetcher);
  assert.match(urls[0], /search=Qwen3\.5-9B/);
  assert.equal(result.models[0].tooLargeForWeb, true);
  assert.match(result.models[0].name, /Qwen3\.5-9B-Q4_K_M\.gguf/);
});
