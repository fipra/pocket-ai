import test from 'node:test';
import assert from 'node:assert/strict';
import { planGgufSplit, splitGgufFile } from '../gguf-split.js';
import { groupLocalGgufs } from '../hub.js';

function u32(value) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; }
function u64(value) { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true); return bytes; }
function str(value) { const bytes = new TextEncoder().encode(value); return [u64(bytes.length), bytes]; }
function sampleFile() {
  const header = [new TextEncoder().encode('GGUF'), u32(3), u64(3), u64(1),
    ...str('general.architecture'), u32(8), ...str('llama')];
  for (let i = 0; i < 3; i++) header.push(...str(`tensor.${i}`), u32(1), u64(2_750_000), u32(0), u64(i * 11_000_000));
  const headerBlob = new Blob(header);
  const padding = new Uint8Array((32 - headerBlob.size % 32) % 32);
  const blob = new Blob([headerBlob, padding, ...Array.from({length:3}, (_, i) => new Uint8Array(11_000_000).fill(i + 1))]);
  return { name:'Example-Q4_K_M.gguf', size:blob.size, slice:(...args) => blob.slice(...args) };
}
function memoryDirectory() {
  const files = new Map();
  return { files, async getFileHandle(name, options = {}) {
    if (!options.create && !files.has(name)) throw new DOMException('Missing', 'NotFoundError');
    if (options.create && !files.has(name)) files.set(name, undefined);
    return { name, async createWritable() {
      const chunks = [];
      return { async write(bytes) { chunks.push(bytes); }, async close() { files.set(name, new Blob(chunks)); }, async abort() { files.delete(name); } };
    } };
  }, async removeEntry(name) { files.delete(name); } };
}

test('splits a large local GGUF by complete tensors and registers numbered parts', async () => {
  const file = sampleFile(), directory = memoryDirectory();
  const plan = await planGgufSplit(file, 15_000_000);
  assert.equal(plan.groups.length, 3);
  const result = await splitGgufFile(file, directory, { targetBytes:15_000_000 });
  assert.deepEqual(result.names, [1, 2, 3].map(i => `Example-Q4_K_M-0000${i}-of-00003.gguf`));
  const parts = result.names.map(name => ({ filename:name, size:directory.files.get(name).size }));
  assert.equal(groupLocalGgufs(parts).length, 1);
  for (const [index, name] of result.names.entries()) {
    const bytes = new Uint8Array(await directory.files.get(name).slice(0, 24).arrayBuffer());
    const view = new DataView(bytes.buffer);
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'GGUF');
    assert.equal(view.getUint32(4, true), 3);
    assert.equal(Number(view.getBigUint64(8, true)), 1);
    assert.ok(directory.files.get(name).size < 2_000_000_000);
    assert.equal(index + 1, result.names.indexOf(name) + 1);
  }
});

test('cancelling a split removes partial output and preserves the input', async () => {
  const file = sampleFile(), directory = memoryDirectory(), controller = new AbortController();
  await assert.rejects(splitGgufFile(file, directory, { targetBytes:15_000_000, signal:controller.signal,
    onProgress:() => controller.abort() }), { name:'AbortError' });
  assert.equal(directory.files.size, 0);
  assert.equal(file.size > 32_000_000, true);
});
