import test from 'node:test';
import assert from 'node:assert/strict';
import { chunks, retrieve, documentQuestion, recentContext, readDocument } from '../retrieval.js';

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
  assert.deepEqual(retrieve('zzzz', docs).map(item => item.text), ['Apples grow on trees.', 'Rust runs native code.']);
});
test('generic summary request includes recent document excerpts within context budget', () => {
  const docs = [
    {name:'old.txt',updated:1,chunks:['old content']},
    {name:'report.txt',updated:2,chunks:['Revenue rose in June.'.repeat(100), 'Costs fell in July.'.repeat(100)]}
  ];
  const sources = retrieve('Riassumi il documento', docs, 3);
  assert.equal(sources[0].name, 'report.txt');
  const question = documentQuestion('Riassumi il documento', sources);
  assert.match(question, /Revenue rose/);
  assert.ok(question.length < 3000);
  const context = recentContext([{role:'user',text:'a'.repeat(5000)},{role:'assistant',text:'b'.repeat(5000)}], question);
  assert.equal(context.at(-1).content, question);
  assert.ok(context.slice(0,-1).reduce((sum,message)=>sum+message.content.length,0) <= 2400);
});
test('empty text documents are rejected instead of silently saved', async () => {
  await assert.rejects(readDocument({name:'scan.txt',size:0,text:async()=>''}), /DOCUMENT_NO_TEXT/);
});
