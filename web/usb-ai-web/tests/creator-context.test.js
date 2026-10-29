import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatorRequest } from '../creator-context.js';

test('creator uses the last prompt and budgets UTF-8 bytes plus Q&A markers', () => {
  const messages = [{role:'system',content:'system'}, {role:'user',content:'old'}, {role:'user',content:'caffè'}];
  assert.deepEqual(creatorRequest(messages, 'qa', 12, 100), {messages:[messages[2]], maxTokens:4});
  assert.equal(creatorRequest(messages, 'lm', 12, 100).maxTokens, 6);
  assert.throws(() => creatorRequest(messages, 'qa', 8, 100), /CREATOR_PROMPT_TOO_LONG/);
});
