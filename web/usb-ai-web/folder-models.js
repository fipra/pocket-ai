import { createSHA256 } from 'hash-wasm';

let folder;

export function canSaveToFolder() {
  return typeof window.showDirectoryPicker === 'function';
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
  return folder;
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
    return { handle, filename, size: loaded };
  } catch (error) {
    if (writable) await writable.abort().catch(() => {});
    if (!existed) await directory.removeEntry(filename).catch(() => {});
    throw error;
  }
}
