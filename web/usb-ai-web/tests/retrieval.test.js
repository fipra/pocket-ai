import test from 'node:test';
import assert from 'node:assert/strict';
import { chunks, retrieve } from '../retrieval.js';

test('chunks retain overlap and final text', () => {
  const text = 'a'.repeat(2400);
  const result = chunks(text);
  assert.equal(result.length, 3);
  assert.equal(result[0].length, 1100);
  assert.equal(result.at(-1).at(-1), 'a');
});
test('retrieval ranks matching local excerpts', () => {
  const docs = [{name:'notes.txt',chunks:['Apples grow on trees.', 'Rust runs native code.']}];
  assert.deepEqual(retrieve('What about apples?', docs).map(item => item.text), ['Apples grow on trees.']);
  assert.deepEqual(retrieve('zzzz', docs), []);
});
