import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {randomBytes} from 'node:crypto';
import {sharedChat, parseSharedChat, createShareLink, parseShareLink} from '../chat-share.js';
test('shared link and file round trip preserve messages but exclude metadata', async () => {
  const chat = {title:'Saluti',messages:[{role:'user',text:'Ciao 🌍'},{role:'assistant',text:'Buongiorno!'}], secret:'not shared'};
  const expected = sharedChat(chat);
  assert.deepEqual(parseSharedChat(JSON.stringify(expected)), expected);
  const url = await createShareLink(chat, 'https://example.com/app/?sensitive=1');
  assert.ok(!url.includes('sensitive'));
  assert.deepEqual(await parseShareLink(new URL(url).hash), expected);
  assert.ok(!JSON.stringify(expected).includes('secret'));
});
test('invalid chat inputs are rejected', async () => {
  assert.throws(() => parseSharedChat('{"format":"wrong","version":1}'));
  assert.throws(() => sharedChat({title:'x',messages:[{role:'system',text:'x'}]}));
  await assert.rejects(() => parseShareLink('#chat=bad!'));
});
test('large incompressible chats fall back to a file', async () => {
  const text = randomBytes(12000).toString('hex');
  assert.equal(await createShareLink({title:'test',messages:[{role:'user',text}]},'https://example.com/app/'), null);
});
