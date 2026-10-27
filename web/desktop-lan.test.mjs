import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';

test('desktop chat creates request IDs on an HTTP LAN page', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Script(html.match(/<script>([\s\S]*?)<\/script>/)?.[1]));
  const source = html.match(/function newRequestId\(\)\{[^\n]+\}/)?.[0];
  assert.ok(source);
  let next = 0;
  const crypto = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index++) bytes[index] = next++;
      return bytes;
    }
  };
  const newRequestId = runInNewContext(`${source}; newRequestId`, { crypto, Uint8Array, Array });
  const first = newRequestId();
  const second = newRequestId();
  assert.match(first, /^[a-f0-9]{32}$/);
  assert.match(second, /^[a-f0-9]{32}$/);
  assert.notEqual(first, second);
  assert.match(html, /activeRequestId=newRequestId\(\)/);
});
