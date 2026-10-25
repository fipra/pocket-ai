import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
await import('../../code-view.js');

test('complete fenced code becomes a code block, partial streaming text stays visible', () => {
  const { blocks } = window.USB_AI_CODE_VIEW;
  assert.deepEqual(blocks('Example\n```html\n<h1>Hello</h1>\n```').map(part => part.type), ['text', 'code']);
  assert.deepEqual(blocks('```html\n<h1>Still streaming').map(part => part.type), ['text']);
});

test('stream rendering coalesces tokens and flushes the final answer', () => {
  const originalDocument = globalThis.document;
  const originalAnimation = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let next = 1;
  globalThis.document = { createTextNode: data => ({ nodeType:3, data }) };
  globalThis.requestAnimationFrame = callback => { const id = next++; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  try {
    const container = { childNodes:[], firstChild:null, replaceChildren(child) { this.childNodes = [child]; this.firstChild = child; } };
    let answer = '';
    const view = window.USB_AI_CODE_VIEW.streamRenderer(container, () => answer, 'en');
    answer = 'C'; view.update(); answer = 'Ci'; view.update(); answer = 'Ciao'; view.update();
    assert.equal(frames.size, 1);
    frames.values().next().value(); frames.clear();
    assert.equal(container.firstChild.data, 'Ciao');
    answer = 'Ciao!'; view.update(); view.flush();
    assert.equal(frames.size, 0);
    assert.equal(container.firstChild.data, 'Ciao!');
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalAnimation;
    globalThis.cancelAnimationFrame = originalCancel;
  }
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

test('generated app files preserve local references and become a standalone ZIP', () => {
  const { appFiles, previewDocument, zipFiles } = window.USB_AI_CODE_VIEW;
  const parts = [
    { type: 'code', language: 'html', text: '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><button>Go</button><script src="./calcolatrice.js"></script></body></html>' },
    { type: 'code', language: 'css', text: 'button { color: green }' },
    { type: 'code', language: 'javascript', text: 'document.querySelector("button").onclick = () => alert("OK")' }
  ];
  const app = appFiles(parts);
  assert.deepEqual(app.files.map(file => file.name), ['index.html', 'style.css', 'calcolatrice.js']);
  assert.deepEqual(app.missing, []);
  const preview = previewDocument(parts, app.files[0].text);
  assert.doesNotMatch(preview, /src="\.\/calcolatrice\.js"/);
  assert.doesNotMatch(preview, /href="\.\/style\.css"/);
  assert.match(preview, /onclick = \(\) => alert/);
  const zip = zipFiles(app.files);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 12, true), 3);
  for (const name of ['index.html', 'style.css', 'calcolatrice.js']) assert.ok(new TextDecoder().decode(zip).includes(name));
});

test('missing generated JavaScript prevents exporting a broken app', () => {
  const { appFiles } = window.USB_AI_CODE_VIEW;
  const app = appFiles([{ type: 'code', language: 'html', text: '<html><script src="calcolatrice.js"></script></html>' }]);
  assert.deepEqual(app.missing, ['calcolatrice.js']);
});
