import { createSHA256 } from 'hash-wasm';
import { normalizeChatMessages } from './chat-messages.js';
import { CATALOG, IOS_DIAGNOSTIC_MODEL } from './catalog.js';
import * as db from './storage.js';
import { isSmartphone, isIPhone } from './phone-gate.js';
import { canSaveToFolder, existingModelsFolder, saveVerifiedFile } from './folder-models.js';
import { groupLocalGgufs, isAuxiliaryGguf, WEB_FILE_LIMIT } from './hub.js';
import { modelOptions, usesSafariCpu, generationLimit } from './browser-capability.js';
import { creatorRequest } from './creator-context.js';
import { createBackendDetector } from './backend-detection.js';
import { iosDiagnosticsEnabled, iosDiagnostic } from './ios-diagnostics.js';

const paths = { default: `${import.meta.env.BASE_URL}wasm/wllama.wasm` };
let managerPromise;
async function modelManager() {
  if (!managerPromise) managerPromise = import('@wllama/wllama').then(({ ModelManager }) => new ModelManager());
  return managerPromise;
}
let engine;
let loadedId;
let creatorModel;
let backendInfo;
export const loadedModelId = () => loadedId;
export const loadedBackend = () => backendInfo ? { ...backendInfo } : undefined;

async function instance(detector, onWorkerError = () => {}) {
  const [{ Wllama, LoggerWithoutDebug }, { default: compatWorker }] = await Promise.all([
    import('@wllama/wllama'),
    import('@wllama/wllama-compat/wasm/wllama.js?raw')
  ]);
  const logger = Object.fromEntries(['debug','log','warn','error'].map(level => [level, (...args) => {
    detector.record(...args);
    if (iosDiagnosticsEnabled()) {
      const line = args.map(String).join(' ');
      if (/calling wllamaStart|loading model\.\.\.|multithread enabled|loading "wllama\.wasm"|compatibility mode|(?:using|not using) compat mode|llama_context: constructing|llama_context: n_ctx\s|llama_model_loader: loaded meta data|load_tensors:.*model buffer|tokenizer.*(?:error|failed)|failed to (?:load|initialize)|out of memory/i.test(line)) iosDiagnostic('runtime', line.slice(0,300));
      for (const arg of args) {
        if (level === 'error' && arg && typeof arg === 'object' && arg.type === 'error' && typeof arg.message === 'string') {
          iosDiagnostic('worker error', arg.message.slice(0,300) || 'Worker error without details');
          onWorkerError(arg.message || 'WebAssembly worker failed');
        }
      }
    }
    LoggerWithoutDebug[level](...args);
  }]));
  const runtime = new Wllama(paths, { logger, allowOffline: true });
  runtime.setCompat({ wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });
  return runtime;
}
export async function cachedModels() { return (await modelManager()).getModels(); }
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

export async function downloadVerified(item, onProgress, { preferCache = false } = {}) {
  if (!item || !/^https:\/\/huggingface\.co\//.test(item.url) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size)) throw Error('Invalid model metadata');
  if (isAuxiliaryGguf(item.url) || item.shards?.some(part => isAuxiliaryGguf(part.url))) throw Error('AUXILIARY_GGUF');
  const parts = item.shards || [item];
  if (parts.some(part => part.size > WEB_FILE_LIMIT || !Number.isSafeInteger(part.size) || !/^[a-f0-9]{64}$/.test(part.sha256))) throw Error('MODEL_NEEDS_SPLIT');
  if (parts.reduce((total, part) => total + part.size, 0) !== item.size) throw Error('Invalid model metadata');
  if ((!canSaveToFolder() || preferCache) && navigator.storage?.estimate) {
    const { quota, usage } = await navigator.storage.estimate();
    if (Number.isFinite(quota) && Number.isFinite(usage) && quota - usage < item.size) throw Error('MODEL_STORAGE_LOW');
  }
  if (canSaveToFolder() && !preferCache) {
    const files = []; let completed = 0;
    for (const [index, part] of parts.entries()) {
      const file = await saveVerifiedFile(part, ({loaded}) => onProgress?.({loaded:completed+loaded,total:item.size,part:index+1,parts:parts.length}));
      files.push(file); completed += file.size;
    }
    await db.put('models', { id:item.id, name:item.name, source:'directory', fileHandle:files[0].handle, fileHandles:files.map(file=>file.handle), folderHandle:files[0].folderHandle, folderLabel:files[0].folderLabel, filename:files[0].filename, url:item.url, size:item.size, shards:parts });
    return;
  }
  const manager = await modelManager();
  await manager.downloadModel({ url: item.url }, { progressCallback: onProgress });
  const model = (await manager.getModels()).find(entry => entry.url === item.url || entry.source?.url === item.url);
  if (!model) throw Error('Downloaded model missing from browser cache');
  try {
    const blobs = await model.open();
    const total = blobs.reduce((sum, blob) => sum + blob.size, 0);
    if (total !== item.size) throw Error('Downloaded model size mismatch');
    if (blobs.length !== parts.length) throw Error('Downloaded model shard count mismatch');
    for (let i=0;i<parts.length;i++) {
      if (blobs[i].size !== parts[i].size || await hashBlob(blobs[i]) !== parts[i].sha256) throw Error('Downloaded model checksum mismatch');
    }
    await db.put('models', { id: item.id, name: item.name, source: 'download', url: item.url, size: total, shards:parts });
  } catch (error) { await model.remove(); throw error; }
}
export async function downloadCurated(id, onProgress) {
  const item = [...CATALOG, ...(iosDiagnosticsEnabled() ? [IOS_DIAGNOSTIC_MODEL] : [])].find(model => model.id === id);
  if (!item) throw Error('Unknown model');
  // The built-in test model must start without opening a directory picker.
  // Users can move the verified cached GGUF to a folder afterward.
  iosDiagnostic('file', `download started · ${item.size} bytes`);
  try {
    const result = await downloadVerified(item, onProgress, { preferCache: true });
    iosDiagnostic('file', 'download and checksum verified');
    return result;
  } catch (error) {
    iosDiagnostic('file error', String(error?.message || error).slice(0,300));
    throw error;
  }
}

export async function moveCachedToFolder(model, onProgress) {
  const sha256 = CATALOG.find(item => item.id === model.id)?.sha256 || /^hf(?:-split)?:([a-f0-9]{64})$/.exec(model.id)?.[1];
  if (model.source !== 'download' || !sha256) throw Error('Model cannot be moved automatically');
  // Start the directory picker before awaiting browser cache operations so it
  // retains the user gesture required by showDirectoryPicker().
  const parts = model.shards || [{...model,sha256}];
  const files = []; let completed = 0;
  for (const part of parts) {
    const saved = await saveVerifiedFile(part, ({loaded}) => onProgress?.({loaded:completed+loaded,total:model.size}));
    files.push(saved); completed += saved.size;
  }
  await db.put('models', { ...model, source:'directory', fileHandle:files[0].handle, fileHandles:files.map(file=>file.handle), folderHandle:files[0].folderHandle, folderLabel:files[0].folderLabel, filename:files[0].filename });
  const cached = (await (await modelManager()).getModels()).find(entry => entry.url === model.url || entry.source?.url === model.url);
  if (cached) await cached.remove();
}

export async function addLocalModel(files) {
  const parts = [...files];
  if (!parts.length || parts.some(file => !/\.gguf$/i.test(file.name))) throw Error('Select GGUF files');
  if (parts.some(file => isAuxiliaryGguf(file.name))) throw Error('AUXILIARY_GGUF');
  if (parts.some(file => file.size > WEB_FILE_LIMIT)) throw Error('MODEL_NEEDS_SPLIT');
  const groups = groupLocalGgufs(parts);
  if (groups.length !== 1 || groups[0].members.length !== parts.length) throw Error('INCOMPLETE_SHARDS');
  const id = crypto.randomUUID();
  const {name, members} = groups[0];
  // IndexedDB can store Blobs, but browser quotas vary. Keep selected File objects
  // available during this session even when persistent storage is denied.
  sessionFiles.set(id, members);
  try { await db.put('models', { id, name, source: 'file', files: members, size: groups[0].size }); }
  catch (error) { return { id, name, persistent: false, error }; }
  return { id, name, persistent: true };
}
export async function addModelsFromFolder() {
  const files = await existingModelsFolder();
  if (!files.length) throw Error('NO_GGUF_IN_FOLDER');
  const current = await savedModels();
  const ids = [];
  for (const group of groupLocalGgufs(files)) {
    const file = group.members[0];
    const previous = current.find(model => model.source === 'directory' && model.filename === file.filename && model.folderLabel === file.folderLabel);
    const id = previous?.id || crypto.randomUUID();
    await db.put('models', { id, name:group.name, source:'directory', filename:file.filename,
      size:group.size, fileHandle:file.fileHandle, fileHandles:group.members.map(member=>member.fileHandle),
      folderHandle:file.folderHandle, folderLabel:file.folderLabel });
    ids.push(id);
  }
  if (!ids.length) throw Error('INCOMPLETE_SHARDS');
  return ids;
}
const sessionFiles = new Map();
export async function deleteModel(id) {
  if (loadedId === id) await unload();
  const record = await db.get('models', id);
  if (record?.source === 'download') {
    const models = await (await modelManager()).getModels();
    const target = models.find(model => model.url === record.url || model.source?.url === record.url);
    if (target) await target.remove();
  }
  sessionFiles.delete(id);
  await db.remove('models', id);
}
export async function unload() { if (engine) await engine.exit(); engine = undefined; loadedId = undefined; creatorModel = undefined; backendInfo = undefined; }
let loadedContext, loadedThreads;
export async function loadModel(id, contextSize = 0, threads = 1) {
  if (isSmartphone() && !isIPhone()) throw Error('SMARTPHONE_DISABLED');
  const diagnostic = iosDiagnosticsEnabled();
  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads});
  if (loadedId === id && engine && loadedContext === options.n_ctx && loadedThreads === options.n_threads) return;
  const record = await db.get('models', id);
  if (record && isAuxiliaryGguf(record.filename || record.shards?.[0]?.url || record.url || record.name)) throw Error('AUXILIARY_GGUF');
  let files = record?.files || sessionFiles.get(id);
  if (record?.source === 'directory') {
    const handles = record.fileHandles || [record.fileHandle];
    files = [];
    for (const handle of handles) {
      if (await handle.queryPermission?.({ mode: 'read' }) !== 'granted' &&
          await handle.requestPermission?.({ mode: 'read' }) !== 'granted') throw Error('MODEL_FILE_PERMISSION');
      files.push(await handle.getFile());
    }
  }
  if (!record && !files) throw Error('Model unavailable');
  if (files?.some(file => file.size > WEB_FILE_LIMIT)) throw Error('MODEL_NEEDS_SPLIT');
  await unload();
  if (diagnostic) iosDiagnostic('environment', `WASM=${typeof WebAssembly !== 'undefined'} · JSPI=${typeof WebAssembly.Suspending === 'function'} · SharedArrayBuffer=${typeof SharedArrayBuffer !== 'undefined'} · crossOriginIsolated=${globalThis.crossOriginIsolated === true} · WebGPU=${!!navigator.gpu} · deviceMemory=${navigator.deviceMemory ?? 'unknown'} · threads=1 · context=512 · GPU layers=0`);
  const detector = createBackendDetector({ forceCpu: options.n_gpu_layers === 0 });
  let rejectWorker;
  const workerFailure = new Promise((_, reject) => { rejectWorker = reject; });
  let next;
  try { next = await instance(detector, message => rejectWorker(Error(message))); }
  catch (error) { iosDiagnostic('engine error', String(error?.message || error).slice(0,300)); throw error; }
  let timer, heartbeat;
  try {
    const loading = (async () => {
      if (files) { iosDiagnostic('file', `${files.length} GGUF part(s), ${files.reduce((n, f) => n + f.size, 0)} bytes ready`); iosDiagnostic('model/context', 'initialization started'); return next.loadModel(files, options); }
      const models = await (await modelManager()).getModels();
      const cached = models.find(model => model.url === record.url || model.source?.url === record.url);
      if (!cached) throw Error('Cached model unavailable. Download it again.');
      iosDiagnostic('file', 'opening cached GGUF');
      if (diagnostic) {
        const blobs = await cached.open();
        iosDiagnostic('file', `cache opened · ${blobs.length} part(s), ${blobs.reduce((n, f) => n + f.size, 0)} bytes`);
        iosDiagnostic('model/context', 'initialization started');
        return next.loadModel(blobs, options);
      }
      return next.loadModel(cached, options);
    })();
    // Safari's compatibility WASM can spend well over 90 seconds compiling on a
    // phone. A short deadline incorrectly reported a healthy load as a failure.
    if (diagnostic) { const start = Date.now(); heartbeat = setInterval(() => iosDiagnostic('waiting', `loading model/context · ${Math.floor((Date.now()-start)/1000)} s`), 15000); }
    await Promise.race([loading, workerFailure, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('LOAD_TIMEOUT')), 300_000); })]);
    const metadata = next.getModelMetadata();
    loadedContext = options.n_ctx;
    loadedThreads = options.n_threads;
    if (diagnostic) iosDiagnostic('model/context', `initialized · training context=${metadata.hparams.nCtxTrain} · vocabulary=${metadata.hparams.nVocab} · tokenizer=${metadata.meta?.['tokenizer.ggml.model'] || 'unknown'} · threads=${next.getNumThreads()} · multithread=${next.isMultithread()} · chat template=${!!next.getChatTemplate()} · add BOS=${next.mustAddBosToken()} · add EOS=${next.mustAddEosToken()}`);
    const creatorMode = metadata.meta?.['llamanest.creator.mode'];
    creatorModel = ['qa', 'lm'].includes(creatorMode) ? { mode: creatorMode, context: metadata.hparams.nCtxTrain } : undefined;
    engine = next; loadedId = id; backendInfo = detector.value();
  } catch (error) { iosDiagnostic('load error', String(error?.message || error).slice(0,300)); void next.exit().catch(() => {}); throw error; }
  finally { clearTimeout(timer); clearInterval(heartbeat); }
}
export async function streamChat(messages, onToken, signal, thinking = false, outputLimit = 0) {
  if (!engine) throw Error('Select a model first');
  if (signal.aborted) return;
  const current = engine;
  const safariCpu = usesSafariCpu();
  let requestMessages = normalizeChatMessages(messages);
  let maxTokens = generationLimit(outputLimit, {iosDiagnostic:iosDiagnosticsEnabled(), safariCpu});
  if (creatorModel) {
    const request = creatorRequest(requestMessages, creatorModel.mode, creatorModel.context, maxTokens);
    requestMessages = request.messages;
    maxTokens = request.maxTokens;
  }
  let settled = false;
  let timer;
  let usage;
  let firstTokenAt;
  let rejectWait;
  const interrupt = reason => {
    if (settled) return;
    settled = true;
    iosDiagnostic('generation interrupted', reason);
    if (engine === current) { engine = undefined; loadedId = undefined; backendInfo = undefined; }
    // Wllama terminates its worker in exit(). A busy WASM call cannot be
    // interrupted reliably with abortSignal alone on Safari.
    void current.exit().catch(() => {});
    rejectWait(Error(reason));
  };
  const interrupted = new Promise((_, reject) => { rejectWait = reject; });
  const abort = () => interrupt('AbortError');
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  // The deadline is only for receiving the first visible token. Once text
  // starts streaming, slow local generation can finish normally.
  if ((safariCpu || iosDiagnosticsEnabled()) && !settled) timer = setTimeout(() => interrupt('GENERATION_TIMEOUT'), 90_000);
  iosDiagnostic('prefill', 'generation request submitted; waiting for first visible token');
  const generation = Promise.resolve().then(() => current.createChatCompletion({
    messages: requestMessages,
    max_tokens: maxTokens,
    temperature: 0.7,
    stream: true,
    chat_template_kwargs: { enable_thinking: thinking },
    abortSignal: signal,
    onData: chunk => {
      if (settled || signal.aborted) return;
      if (chunk.usage || chunk.timings) {
        const inputTokens = chunk.usage?.prompt_tokens ?? chunk.timings?.prompt_n;
        const outputTokens = chunk.usage?.completion_tokens ?? chunk.timings?.predicted_n;
        const tokensPerSecond = chunk.timings?.predicted_per_second;
        if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
          usage = { inputTokens, outputTokens, tokensPerSecond: Number.isFinite(tokensPerSecond) ? tokensPerSecond : null };
        }
      }
      const choice = chunk.choices?.[0];
      const token = choice?.delta?.content ?? choice?.message?.content;
      const reasoning = choice?.delta?.reasoning_content;
      if (reasoning && thinking) { if (!firstTokenAt) iosDiagnostic('decoding', 'first reasoning token received'); clearTimeout(timer); firstTokenAt ??= performance.now(); onToken(`<think>${reasoning}</think>`); }
      if (token) { if (!firstTokenAt) iosDiagnostic('decoding', 'first visible token received'); clearTimeout(timer); firstTokenAt ??= performance.now(); onToken(token); }
    }
  }));
  try {
    await Promise.race([generation, interrupted]);
    iosDiagnostic('generation', firstTokenAt ? 'completed' : 'completed without visible tokens');
    if (usage && !Number.isFinite(usage.tokensPerSecond) && firstTokenAt) {
      usage.tokensPerSecond = usage.outputTokens / Math.max((performance.now() - firstTokenAt) / 1000, 0.001);
    }
    return usage;
  } catch (error) {
    iosDiagnostic('generation error', String(error?.message || error).slice(0,300));
    throw error;
  } finally {
    settled = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
