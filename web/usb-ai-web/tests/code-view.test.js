import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
await import('../../code-view.js');

test('complete fenced code becomes a code block, partial streaming text stays visible', () => {
  const { blocks } = window.USB_AI_CODE_VIEW;
  assert.deepEqual(blocks('Example\n```html\n<h1>Hello</h1>\n```').map(part => part.type), ['text', 'code']);
  assert.deepEqual(blocks('```html\n<h1>Still streaming').map(part => part.type), ['text']);
});

test('preview stays sandboxed with no external network access', () => {
  const { previewDocument } = window.USB_AI_CODE_VIEW;
  const parts = [
    { type: 'code', language: 'html', text: '<body><button>Go</button><script src="app.js"></script></body>' },
    { type: 'code', language: 'css', text: 'button{color:green}' },
    { type: 'code', language: 'javascript', text: 'document.querySelector("button").onclick=()=>{}' }
  ];
  const preview = previewDocument(parts, parts[0].text);
  assert.match(preview, /default-src 'none'/);
  assert.doesNotMatch(preview, /src="app.js"/);
  assert.match(preview, /button\{color:green\}/);
  assert.match(preview, /document.querySelector/);
});
