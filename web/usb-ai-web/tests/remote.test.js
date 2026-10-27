import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteChat, remoteDownload, remoteModels, validateRemoteUrl } from '../remote.js';

const config = { url: 'https://dtiwinai.insel.ch:8080', token: 'a'.repeat(64) };

test('remote URL accepts only a server origin', () => {
  assert.equal(validateRemoteUrl(config.url), config.url);
  for (const value of ['ftp://dtiwinai:8080', 'https://user:pass@dtiwinai:8080', 'https://dtiwinai:8080/api', 'https://dtiwinai:8080/?next=evil']) {
    assert.throws(() => validateRemoteUrl(value));
  }
});

test('remote model listing and verified download use the configured bridge', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) return Response.json({ models: [{ id:'model-1', name:'model.gguf', size:123 }] });
    return Response.json({ id:'model-1', name:'model.gguf', size:123 });
  };
  try {
    const models = await remoteModels(config);
    assert.equal(models[0].id, 'remote:model-1');
    const saved = await remoteDownload(config, { url:'https://huggingface.co/owner/repo/resolve/main/model.gguf', sha256:'a'.repeat(64), size:123 });
    assert.equal(saved.id, 'model-1');
    assert.deepEqual(JSON.parse(calls[1].options.body), { repo:'owner/repo', path:'model.gguf', sha256:'a'.repeat(64), size:123 });
    assert.equal(calls[1].options.headers.Authorization, 'Bearer ' + config.token);
    await assert.rejects(remoteDownload(config, { url:'https://evil.example/model.gguf', sha256:'a'.repeat(64), size:123 }));
  } finally { globalThis.fetch = original; }
});

test('remote chat streams tokens and returns usage', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"Ciao"}}]}\n\ndata: {"usage":{"prompt_tokens":4,"completion_tokens":1},"choices":[]}\n\ndata: [DONE]\n\n', { headers:{ 'Content-Type':'text/event-stream' } });
  try {
    const tokens = [];
    const usage = await remoteChat(config, 'model-1', [{ role:'user', content:'ciao' }], token => tokens.push(token), new AbortController().signal);
    assert.deepEqual(tokens, ['Ciao']);
    assert.equal(usage.inputTokens, 4);
    assert.equal(usage.outputTokens, 1);
  } finally { globalThis.fetch = original; }
});
