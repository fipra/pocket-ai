import test from 'node:test';
import assert from 'node:assert/strict';
import { BONSAI_HASH, BONSAI_SIZE, findSavedBonsai } from '../bonsai-recommendation.js';

test('reuses the saved Bonsai file across supported storage sources', () => {
  const cached = {id:`hf:${BONSAI_HASH}`,source:'download',size:BONSAI_SIZE};
  const directory = {id:'local',source:'directory',filename:'Ternary-Bonsai-2-9B-PQ2_0.gguf',size:BONSAI_SIZE};
  const selected = {id:'local-file',source:'file',files:[{name:'Ternary-Bonsai-2-9B-PQ2_0.gguf'}],size:BONSAI_SIZE};
  for (const model of [cached, directory, selected]) assert.equal(findSavedBonsai([model]), model);
  assert.equal(findSavedBonsai([{...directory,size:1}]), undefined);
  assert.equal(findSavedBonsai([{...cached,source:'remote'}]), undefined);
});
