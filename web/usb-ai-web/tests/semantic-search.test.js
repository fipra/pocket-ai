import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, semanticResults, embeddingQuery, embeddingPassage } from '../semantic-search.js';

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
