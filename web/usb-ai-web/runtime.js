import { Wllama, ModelManager, LoggerWithoutDebug } from '@wllama/wllama';
import compatWorker from '@wllama/wllama-compat/wasm/wllama.js?raw';
import { createSHA256 } from 'hash-wasm';
import { CATALOG } from './catalog.js';
import * as db from './storage.js';

const paths = { default: `${import.meta.env.BASE_URL}wasm/wllama.wasm` };
const manager = new ModelManager();
let engine;
let loadedId;
export const loadedModelId = () => loadedId;

function instance() {
  const runtime = new Wllama(paths, { logger: LoggerWithoutDebug, allowOffline: true });
  runtime.setCompat({ wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });
  return runtime;
}
export async function cachedModels() { return manager.getModels(); }
export async function savedModels() { return db.all('models'); }

async function hashBlob(blob, onProgress = () => {}) {
  const hasher = await createSHA256();
  let loaded = 0;
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hasher.update(value); loaded += value.length; onProgress(loaded, blob.size);
    }
  } finally { reader.releaseLock(); }
  return hasher.digest('hex');
}

export async function downloadVerified(item, onProgress) {
  if (!item || !/^https:\/\/huggingface\.co\//.test(item.url) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size)) throw Error('Invalid model metadata');
  await manager.downloadModel({ url: item.url }, { progressCallback: onProgress });
  const model = (await manager.getModels()).find(entry => entry.url === item.url || entry.source?.url === item.url);
  if (!model) throw Error('Downloaded model missing from browser cache');
  try {
    const blobs = await model.open();
    const total = blobs.reduce((sum, blob) => sum + blob.size, 0);
    if (total !== item.size) throw Error('Downloaded model size mismatch');
    if (await hashBlob(blobs[0]) !== item.sha256) throw Error('Downloaded model checksum mismatch');
    await db.put('models', { id: item.id, name: item.name, source: 'download', url: item.url, size: total });
  } catch (error) { await model.remove(); throw error; }
}
export async function downloadCurated(id, onProgress) {
  const item = CATALOG.find(model => model.id === id);
  if (!item) throw Error('Unknown model');
  return downloadVerified(item, onProgress);
}

export async function addLocalModel(files) {
  const parts = [...files];
  if (!parts.length || parts.some(file => !/\.gguf$/i.test(file.name))) throw Error('Select GGUF files');
  const id = crypto.randomUUID();
  const name = parts.length === 1 ? parts[0].name : parts[0].name.replace(/-\d{5}-of-\d{5}/, '');
  // IndexedDB can store Blobs, but browser quotas vary. Keep selected File objects
  // available during this session even when persistent storage is denied.
  sessionFiles.set(id, parts);
  try { await db.put('models', { id, name, source: 'file', files: parts, size: parts.reduce((n, f) => n + f.size, 0) }); }
  catch (error) { return { id, name, persistent: false, error }; }
  return { id, name, persistent: true };
}
const sessionFiles = new Map();
export async function deleteModel(id) {
  if (loadedId === id) await unload();
  const record = await db.get('models', id);
  if (record?.source === 'download') {
    const models = await manager.getModels();
    const target = models.find(model => model.url === record.url || model.source?.url === record.url);
    if (target) await target.remove();
  }
  sessionFiles.delete(id);
  await db.remove('models', id);
}
export async function unload() { if (engine) await engine.exit(); engine = undefined; loadedId = undefined; }
export async function loadModel(id) {
  if (loadedId === id && engine) return;
  const record = await db.get('models', id);
  const files = record?.files || sessionFiles.get(id);
  if (!record && !files) throw Error('Model unavailable');
  await unload();
  const next = instance();
  const mobileSafari = /iP(hone|ad|od)/.test(navigator.userAgent);
  const options = mobileSafari ? { n_ctx: 1024, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true } : { n_ctx: 2048, n_threads: 1, jinja: true };
  try {
    if (files) await next.loadModel(files, options);
    else {
      const models = await manager.getModels();
      const cached = models.find(model => model.url === record.url || model.source?.url === record.url);
      if (!cached) throw Error('Cached model unavailable. Download it again.');
      await next.loadModel(cached, options);
    }
    engine = next; loadedId = id;
  } catch (error) { try { await next.exit(); } catch {} throw error; }
}
export async function streamChat(messages, onToken, signal) {
  if (!engine) throw Error('Select a model first');
  const response = await engine.createChatCompletion({ messages, max_tokens: 512, temperature: 0.7, stream: true, abortSignal: signal });
  for await (const chunk of response) {
    if (signal.aborted) break;
    const token = chunk.choices?.[0]?.delta?.content;
    if (token) onToken(token);
  }
}
