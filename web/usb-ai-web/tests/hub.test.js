import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateMemory, modelFromEntry, modelsFromEntries, searchModels, searchTerm, splitSearchTerm } from '../hub.js';

const hash = 'a'.repeat(64);
test('only verified standalone GGUF files become results', () => {
  const valid = modelFromEntry('owner/repo', { path:'models/tiny-q4.gguf', size:100_000_000, lfs:{sha256:hash} }, 'apache-2.0');
  assert.equal(valid.sha256, hash);
  assert.equal(valid.url, 'https://huggingface.co/owner/repo/resolve/main/models/tiny-q4.gguf');
  assert.equal(modelFromEntry('owner/repo', { path:'../tiny.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'mmproj.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'tiny.gguf', size:30_000_000 }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'tiny.gguf', size:5_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'adapter.gguf', size:100_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'mtp-q4.gguf', size:100_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'draft-q4.gguf', size:100_000_000, lfs:{sha256:hash} }), null);
  const large = modelFromEntry('owner/repo', { path:'Qwen3.5-9B-Q4_K_M.gguf', size:5_627_044_256, lfs:{sha256:hash} });
  assert.equal(large.tooLargeForWeb, true);
});
test('a GGUF filename searches for its model repository', () => {
  assert.equal(searchTerm('Qwen_Qwen3.5-9B-Q4_K_M.gguf'), 'Qwen3.5-9B');
  assert.equal(splitSearchTerm('Qwen 3.5 9B'), 'Qwen3.5-9B-split');
});
test('search lists verified files from public repositories', async () => {
  const fetcher = async url => ({ ok:true, json:async () => url.includes('/tree/')
    ? [{path:'tiny.gguf',size:100_000_000,lfs:{sha256:hash}}]
    : [{id:'owner/repo',tags:['license:apache-2.0']}] });
  const result = await searchModels('tiny', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].license, 'apache-2.0');
  assert.equal(result.nextSkip, null);
});
test('search includes all usable quantizations and prioritizes Web-compatible files', async () => {
  const entries = Array.from({length:15}, (_,i) => ({path:`model-Q${i}.gguf`,size:i === 14 ? 100_000_000 : 3_000_000_000+i,lfs:{sha256:(i+1).toString(16).padStart(64,'0')}}));
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/') ? entries : [{id:'owner/repo',tags:[]}]});
  const result = await searchModels('model', 0, fetcher);
  assert.equal(result.models.length, 15);
  assert.equal(result.models[0].tooLargeForWeb, false);
});
test('memory estimate includes browser and inference overhead', () => {
  assert.deepEqual(estimateMemory(1_073_741_824), {minimum:3,recommended:6});
});
test('complete GGUF shard sets can exceed 2 GB in total', () => {
  const entries = [1,2,3].map(i => ({path:`large-0000${i}-of-00003.gguf`,size:1_100_000_000,lfs:{sha256:String(i).repeat(64)}}));
  const models = modelsFromEntries('owner/repo', entries);
  assert.equal(models.length, 1);
  assert.equal(models[0].size, 3_300_000_000);
  assert.equal(models[0].tooLargeForWeb, false);
  assert.equal(models[0].shards.length, 3);
  assert.match(models[0].shards[1].url, /large-00002-of-00003\.gguf$/);
  assert.equal(modelsFromEntries('owner/repo', entries.slice(0,2)).length, 0);
});
test('search includes split repositories before single files above 2 GB', async () => {
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/')
    ? url.includes('/split/')
      ? [1,2].map(i=>({path:`Qwen3.5-9B-0000${i}-of-00002.gguf`,size:1_500_000_000,lfs:{sha256:String(i).repeat(64)}}))
      : [{path:'Qwen3.5-9B-Q4.gguf',size:5_000_000_000,lfs:{sha256:hash}}]
    : url.includes('search=Qwen3.5-9B-split')
      ? [{id:'owner/split',tags:[]}]
      : [{id:'owner/single',tags:[]}]});
  const result = await searchModels('Qwen 3.5 9B', 0, fetcher);
  assert.equal(result.models[0].shards.length, 2);
  assert.equal(result.models[0].tooLargeForWeb, false);
  assert.equal(result.models[1].tooLargeForWeb, true);
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
test('exact GGUF filename takes priority over similar quantizations', async () => {
  const fetcher = async url => ({ ok:true, json:async () => url.includes('/tree/')
    ? [
      {path:'Qwen_Qwen3.5-9B-Q3_K_M.gguf',size:4_000_000_000,lfs:{sha256:hash}},
      {path:'Qwen_Qwen3.5-9B-Q4_K_M.gguf',size:6_000_000_000,lfs:{sha256:'b'.repeat(64)}}
    ] : [{id:'bartowski/Qwen_Qwen3.5-9B-GGUF',tags:[]}] });
  const result = await searchModels('Qwen_Qwen3.5-9B-Q4_K_M.gguf', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.match(result.models[0].name, /Qwen_Qwen3\.5-9B-Q4_K_M\.gguf/);
});
