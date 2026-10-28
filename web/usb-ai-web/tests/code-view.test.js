import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
await import('../../code-view.js');

test('complete and streaming fenced code become code blocks', () => {
  const { blocks } = window.USB_AI_CODE_VIEW;
  assert.deepEqual(blocks('Example\n```html\n<h1>Hello</h1>\n```').map(part => part.type), ['text', 'code']);
  const partial = blocks('```html\n<h1>Still streaming');
  assert.deepEqual(partial.map(part => part.type), ['code']);
  assert.equal(partial[0].incomplete, true);
  assert.equal(partial[0].text, '<h1>Still streaming');
});

test('answers render headings, lists, tables, links and code without injecting HTML', () => {
  const originalDocument = globalThis.document;
  const makeElement = tag => ({
    tagName: tag.toUpperCase(), children: [], className: '', textContent: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    classList: { toggle() {} }
  });
  globalThis.document = {
    createElement: makeElement,
    createTextNode: data => ({ nodeType: 3, data })
  };
  try {
    const container = makeElement('div');
    window.USB_AI_CODE_VIEW.render(container, '# Report\n\n**Summary** and `code`. Model-Q3_K_M.gguf.\n\n- First\n- Second\n\n| Item | Value |\n| --- | --- |\n| GPU | Yes |\n\n> A note\n\n[Safe](https://example.com) [Unsafe](javascript:alert(1)) <script>alert(1)</script>\n\n```js\nconst n = 1;\n```');
    const all = [];
    const visit = item => { all.push(item); for (const child of item.children || []) visit(child); };
    visit(container);
    const tags = all.map(item => item.tagName).filter(Boolean);
    for (const tag of ['H1', 'STRONG', 'UL', 'LI', 'TABLE', 'TH', 'TD', 'BLOCKQUOTE', 'A', 'CODE']) assert.ok(tags.includes(tag), tag);
    assert.ok(!tags.includes('SCRIPT'));
    const links = all.filter(item => item.tagName === 'A');
    assert.equal(links.length, 1);
    assert.equal(links[0].href, 'https://example.com/');
    assert.equal(links[0].rel, 'noopener noreferrer');
    assert.ok(all.some(item => item.data?.includes('<script>alert(1)</script>')));
    assert.ok(all.some(item => item.textContent === 'const n = 1;'));
    const visibleText = item => item.data || item.textContent || (item.children || []).map(visibleText).join('');
    assert.ok(visibleText(container).includes('Model-Q3_K_M.gguf'));
    const tableOnly = makeElement('div');
    window.USB_AI_CODE_VIEW.render(tableOnly, '| Name | Value |\n| --- | --- |\n| RAM | 8 GB |');
    assert.equal(tableOnly.children[0].children[0].tagName, 'TABLE');
  } finally { globalThis.document = originalDocument; }
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

test('complete HTML documents are recognized with filename or no language label', () => {
  const { blocks, appFiles, render } = window.USB_AI_CODE_VIEW;
  const documentText = '<!doctype html><html><body>Hello</body></html>';
  const originalDocument = globalThis.document;
  const makeElement = tag => ({ tagName: tag.toUpperCase(), children: [], classList: { toggle() {} },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } });
  globalThis.document = { createElement: makeElement, createTextNode: data => ({ nodeType: 3, data }) };
  try {
    for (const label of ['html', 'index.html', '']) {
      const answer = '```' + label + '\n' + documentText + '\n```';
      assert.equal(appFiles(blocks(answer)).files[0].text, documentText);
      const container = makeElement('div');
      render(container, answer, 'it');
      const bar = container.children[0].children[0];
      assert.deepEqual(bar.children.slice(1).map(button => button.textContent), ['Copia', 'Anteprima app', 'Salva app ZIP']);
    }
    assert.equal(appFiles(blocks('```\n<div>fragment</div>\n```')), null);
    assert.equal(appFiles(blocks('```html\n' + documentText)).files[0].text, documentText);
    const partial = '```html\n<!doctype html><html><body>';
    assert.equal(appFiles(blocks(partial)).incomplete, true);
    const container = makeElement('div');
    render(container, partial, 'it');
    const buttons = container.children[0].children[0].children;
    assert.equal(buttons[2].disabled, undefined);
    assert.equal(buttons[3].disabled, true);
    assert.match(buttons[3].title, /incompleto/);
  } finally { globalThis.document = originalDocument; }
});
