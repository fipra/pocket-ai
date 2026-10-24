import test from 'node:test';
import assert from 'node:assert/strict';
import { ragContexts, completeWithRetry } from '../rag.js';

test('document prompts stay short and retry with one excerpt and no history', () => {
  const sources = [{name:'report.txt',text:'a'.repeat(1100)}, {name:'report.txt',text:'b'.repeat(1100)}];
  const contexts = ragContexts([{role:'assistant',text:'x'.repeat(5000)}], 'Riassumi il documento', sources);
  assert.equal(contexts.length, 2);
  assert.ok(contexts[0].at(-1).content.length < 1600);
  assert.ok(contexts[0].slice(0,-1).reduce((n,m)=>n+m.content.length,0) <= 700);
  assert.equal(contexts[1].length, 1);
  assert.ok(contexts[1][0].content.length < 700);
});

test('empty first completion retries automatically and streams the answer', async () => {
  const contexts = ragContexts([], 'Riassumi il documento', [{name:'report.txt',text:'Revenue grew.'}]);
  const seen = []; let calls = 0, retries = 0;
  await completeWithRetry(contexts, async (_messages,onToken) => { calls++; if (calls===2) onToken('Revenue grew.'); }, token=>seen.push(token), {aborted:false}, ()=>retries++);
  assert.equal(calls,2);
  assert.equal(retries,1);
  assert.deepEqual(seen,['Revenue grew.']);
});

test('no model text after retries reports a real failure', async () => {
  await assert.rejects(completeWithRetry([[],[]],async()=>{},()=>{},{aborted:false}),/EMPTY_MODEL_RESPONSE/);
});
