import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, semanticResults, embeddingQuery, embeddingPassage, buildSemanticIndex, ensureSemanticIndex } from '../semantic-search.js';

test('semantic results rank by cosine similarity and keep source metadata', () => {
  const entries = [{name:'other.txt',index:1,vector:[0,1]}, {name:'answer.txt',index:3,vector:[2,0]}];
  const results = semanticResults([1,0], entries, 1);
  assert.deepEqual(results, [{name:'answer.txt',index:3,score:1}]);
});

test('invalid and incompatible vectors are rejected instead of producing misleading rankings', () => {
  assert.throws(() => cosineSimilarity([1,0], [1]), /Incompatible/);
  assert.throws(() => cosineSimilarity([0,0], [1,0]), /Empty/);
  assert.throws(() => cosineSimilarity([NaN], [1]), /Invalid/);
});

test('question and document instructions remain distinct', () => {
  assert.equal(embeddingQuery('Dove?'), 'task: question answering | query: Dove?');
  assert.equal(embeddingPassage('', 'Risposta'), 'title: none | text: Risposta');
});

test('indexing preserves provenance and reports progress only for completed passages', async () => {
  const progress = [];
  const index = await buildSemanticIndex([{id:'doc1', name:'contratto.txt', chunks:['uno','due']}], async text => text.endsWith('uno') ? [1,0] : [0,1], {onProgress:(done,total) => progress.push([done,total])});
  assert.deepEqual(progress, [[1,2],[2,2]]);
  assert.equal(index[1].documentId, 'doc1');
  assert.equal(index[1].index, 1);
  assert.equal(semanticResults([0,1], index, 1)[0].text, 'due');
});

test('cancelled and invalid indexing never return an incomplete index', async () => {
  const controller = new AbortController();
  await assert.rejects(buildSemanticIndex([{id:'d',name:'a',chunks:['a','b']}], async () => {controller.abort(); return [1,0]}, {signal:controller.signal}), {name:'AbortError'});
  await assert.rejects(buildSemanticIndex([{id:'d',name:'a',chunks:['a']}], async () => [NaN]), /Invalid embedding/);
});

test('stored embeddings are reused only when the model and document remain unchanged', async () => {
  const doc = {id:'a',name:'contratto',chunks:['prima']};
  let calls=0, saves=0;
  const embed=async () => {calls++; return [1,0]};
  const save=async () => {saves++};
  await ensureSemanticIndex([doc],embed,save,{modelId:'v1'});
  await ensureSemanticIndex([doc],embed,save,{modelId:'v1'});
  assert.equal(calls,1); assert.equal(saves,1);
  doc.chunks[0]='cambiato';
  await ensureSemanticIndex([doc],embed,save,{modelId:'v1'});
  await ensureSemanticIndex([doc],embed,save,{modelId:'v2'});
  assert.equal(calls,3); assert.equal(saves,3);
});
