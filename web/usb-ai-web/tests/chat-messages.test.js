import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatMessages } from '../chat-messages.js';

test('Qwen receives only one initial system message with all app instructions', () => {
  const messages = [
    { role: 'system', content: 'Remember preferences' },
    { role: 'system', content: 'Answer directly' },
    { role: 'system', content: 'Use Markdown' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' },
    { role: 'user', content: 'Continue' }
  ];
  const before = structuredClone(messages);
  const result = normalizeChatMessages(messages);
  assert.deepEqual(result, [
    { role: 'system', content: 'Remember preferences\n\nAnswer directly\n\nUse Markdown' },
    ...messages.slice(3)
  ]);
  assert.deepEqual(messages, before);
});

test('conversations without system instructions keep their content and order', () => {
  const messages = [{ role: 'user', content: 'Hello' }];
  assert.deepEqual(normalizeChatMessages(messages), messages);
  assert.deepEqual(normalizeChatMessages([]), []);
});
