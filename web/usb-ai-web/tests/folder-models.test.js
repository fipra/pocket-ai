import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { saveVerifiedFile, showModelFolder } from '../folder-models.js';

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
