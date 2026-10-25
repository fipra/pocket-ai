import test from 'node:test';
import assert from 'node:assert/strict';
import { relevantMemories, memoryContext, memoryMarkdown, parseMemoryMarkdown } from '../memory.js';

test('memory uses only relevant confirmed notes and keeps the prompt short', () => {
  const notes = [
    { id:'a', text:'For project Atlas, reports use Swiss francs.', updated:1 },
    { id:'b', text:'The cat is called Luna.', updated:2 },
    { id:'c', text:'Atlas dates use day-month-year format.', updated:3 },
  ];
  assert.deepEqual(relevantMemories('Prepare an Atlas report', notes).map(item => item.id), ['c', 'a']);
  assert.match(memoryContext('Prepare an Atlas report', notes), /Swiss francs/);
  assert.doesNotMatch(memoryContext('Prepare an Atlas report', notes), /Luna/);
  assert.equal(memoryContext('Unrelated question', notes), '');
  assert.match(memoryMarkdown(notes), /^# USB-AI memory/m);
  assert.deepEqual(parseMemoryMarkdown(memoryMarkdown(notes)), notes.map(note => note.text));
});
