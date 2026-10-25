import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existingModelsFolder, saveVerifiedFile, showModelFolder } from '../folder-models.js';

test('an existing GGUF is discovered in the selected folder without copying or downloading it', async () => {
  const model = { kind:'file', getFile:async () => ({ size:1_599_668_768 }) };
  const support = { kind:'file', getFile:async () => ({ size:100_000_000 }) };
  const directory = { name:'usb-ai-models', async *entries() {
    yield ['Llama-3.2-3B-Instruct-IQ3_M.gguf', model];
    yield ['mmproj-Llama.gguf', support];
  } };
  globalThis.window = { showDirectoryPicker:async options => {
    assert.equal(options.mode, 'read');
    assert.equal(options.startIn, 'downloads');
    return directory;
  } };
  const files = await existingModelsFolder();
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'Llama-3.2-3B-Instruct-IQ3_M.gguf');
  assert.equal(files[0].fileHandle, model);
  assert.equal(files[0].folderHandle, directory);
  delete globalThis.window;
});

test('verified GGUF streams into a usb-ai-models subfolder', async () => {
  const bytes = new TextEncoder().encode('GGUF test data');
  const calls = [];
  const fileHandle = {
    createWritable: async () => ({
      write: async value => calls.push(['write', value.byteLength]),
      close: async () => calls.push(['close']),
      abort: async () => calls.push(['abort'])
    })
  };
  const subfolder = {
    getFileHandle: async (_name, options) => {
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
      return fileHandle;
    },
    removeEntry: async name => calls.push(['remove', name])
  };
  globalThis.window = { showDirectoryPicker: async options => {
    if (options.id === 'usb-ai-models-reveal') {
      assert.equal(options.startIn, subfolder);
      return subfolder;
    }
    assert.equal(options.startIn, 'downloads');
    return { name: 'Downloads', getDirectoryHandle: async (name, flags) => {
      assert.equal(name, 'usb-ai-models');
      assert.equal(flags.create, true);
      return subfolder;
    } };
  } };
  const item = {
    url: 'https://huggingface.co/example/model/resolve/main/example.gguf',
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
  const saved = await saveVerifiedFile(item, () => {}, async () => new Response(bytes));
  assert.equal(saved.filename, 'example.gguf');
  assert.equal(saved.size, bytes.byteLength);
  assert.equal(saved.folderLabel, 'Downloads/usb-ai-models');
  await showModelFolder({ fileHandle, folderHandle: saved.folderHandle });
  assert.deepEqual(calls, [['write', bytes.byteLength], ['close']]);
  await assert.rejects(saveVerifiedFile({ ...item, sha256: '0'.repeat(64) }, () => {}, async () => new Response(bytes)), /checksum mismatch/);
  assert.deepEqual(calls.slice(-3), [['write', bytes.byteLength], ['abort'], ['remove', 'example.gguf']]);
  delete globalThis.window;
});
