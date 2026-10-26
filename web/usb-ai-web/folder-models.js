import { createSHA256 } from 'hash-wasm';
import { isAuxiliaryGguf } from './hub.js';

let folder;
let folderLabel;

export function canSaveToFolder() {
  return typeof window.showDirectoryPicker === 'function';
}

export async function existingModelsFolder() {
  if (!canSaveToFolder()) throw Error('FOLDER_UNAVAILABLE');
  const parent = await window.showDirectoryPicker({ id: 'usb-ai-models-import', mode: 'read', startIn: 'downloads' });
  let directory = parent;
  if (parent.name !== 'usb-ai-models') {
    try { directory = await parent.getDirectoryHandle('usb-ai-models'); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
  }
  const files = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind !== 'file' || !/^[^/\\]+\.gguf$/i.test(name) || isAuxiliaryGguf(name)) continue;
    const file = await handle.getFile();
    if (file.size < (/-\d{5}-of-\d{5}\.gguf$/i.test(name) ? 1024 : 32_000_000)) continue;
    files.push({ filename:name, size:file.size, fileHandle:handle, folderHandle:directory,
      folderLabel:parent === directory ? parent.name : `${parent.name}/usb-ai-models` });
  }
  return files;
}

async function modelsFolder() {
  if (folder) {
    const permission = await folder.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted') return folder;
    if (await folder.requestPermission?.({ mode: 'readwrite' }) === 'granted') return folder;
  }
  // The user chooses Downloads. A website cannot silently access that folder.
  const parent = await window.showDirectoryPicker({ id: 'usb-ai-models', mode: 'readwrite', startIn: 'downloads' });
  folder = parent.name === 'usb-ai-models' ? parent : await parent.getDirectoryHandle('usb-ai-models', { create: true });
  folderLabel = parent.name === 'usb-ai-models' ? parent.name : `${parent.name}/usb-ai-models`;
  return folder;
}

export async function showModelFolder(model) {
  if (!canSaveToFolder() || !model?.fileHandle) throw Error('FOLDER_UNAVAILABLE');
  // Browsers do not expose an API to open Finder or Explorer directly. The
  // directory picker opens at the model's file so the user can locate it.
  await window.showDirectoryPicker({ id: 'usb-ai-models-reveal', mode: 'read', startIn: model.folderHandle || model.fileHandle });
}

export async function saveVerifiedFile(item, onProgress = () => {}, fetcher = fetch) {
  if (!canSaveToFolder()) throw Error('FOLDER_UNAVAILABLE');
  if (!item || !/^https:\/\/huggingface\.co\//.test(item.url) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size)) throw Error('Invalid model metadata');
  const directory = await modelsFolder();
  const filename = decodeURIComponent(new URL(item.url).pathname.split('/').at(-1));
  if (!/^[^/\\]+\.gguf$/i.test(filename)) throw Error('Invalid GGUF filename');
  let existed = true;
  try { await directory.getFileHandle(filename); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; existed = false; }
  const handle = await directory.getFileHandle(filename, { create: true });
  if (existed) {
    const existing = await handle.getFile();
    if (existing.size === item.size) {
      const hasher = await createSHA256();
      const reader = existing.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          hasher.update(value);
        }
      } finally { reader.releaseLock(); }
      if (hasher.digest('hex') === item.sha256) {
        onProgress({ loaded:item.size, total:item.size });
        return { handle, filename, size:item.size, folderHandle:directory, folderLabel };
      }
    }
  }
  let writable;
  try {
    const response = await fetcher(item.url);
    if (!response.ok || !response.body) throw Error(`Model download: HTTP ${response.status}`);
    writable = await handle.createWritable();
    const reader = response.body.getReader();
    const hasher = await createSHA256();
    let loaded = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        if (loaded > item.size) throw Error('Downloaded model size mismatch');
        hasher.update(value);
        await writable.write(value);
        onProgress({ loaded, total: item.size });
      }
    } finally { reader.releaseLock(); }
    if (loaded !== item.size) throw Error('Downloaded model size mismatch');
    if (hasher.digest('hex') !== item.sha256) throw Error('Downloaded model checksum mismatch');
    await writable.close();
    return { handle, filename, size: loaded, folderHandle: directory, folderLabel };
  } catch (error) {
    if (writable) await writable.abort().catch(() => {});
    if (!existed) await directory.removeEntry(filename).catch(() => {});
    throw error;
  }
}
