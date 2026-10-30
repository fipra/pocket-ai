import { createSHA256 } from 'hash-wasm';

const REPO = 'onnx-community/embeddinggemma-2-ONNX';
const REVISION = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0';
const CACHE = 'llamanest-embeddinggemma2-onnx-v1';
const ASSETS = [
  ['config.json', null],
  ['tokenizer_config.json', null],
  ['tokenizer.json', '4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4'],
  ['onnx/model_q4.onnx', 'f9eeba97acddf139b8ee2ddf04bc30dceafa88de93fadf74d7644e0d61a477a9'],
  ['onnx/model_q4.onnx_data', 'c3975f2d1ab7a1878ae31a7d7a9b7804a827aff3800b60dfceafce21cac3df49'],
];
export const EMBEDDING_MODEL_ID = `${REPO}@${REVISION}:q4`;
let active;
let loading;
let transformerEnv;
async function sha256(blob) {
  const hash = await createSHA256();
  const reader = blob.stream().getReader();
  try { for (;;) { const {done,value} = await reader.read(); if (done) break; hash.update(value); } }
  finally { reader.releaseLock(); }
  return hash.digest('hex');
}
async function files(onProgress) {
  const cache = await caches.open(CACHE);
  const values = new Map();
  for (const [i, [name, expected]] of ASSETS.entries()) {
    const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`;
    let response = await cache.match(url);
    let blob = response ? await response.blob() : null;
    if (blob && expected && await sha256(blob) !== expected) { await cache.delete(url); blob = null; }
    if (!blob) {
      onProgress?.({stage:'download',file:name,index:i,total:ASSETS.length});
      response = await fetch(url);
      if (!response.ok) throw Error(`Model download failed (${response.status}): ${name}`);
      blob = await response.blob();
      if (expected && await sha256(blob) !== expected) throw Error(`Model checksum mismatch: ${name}`);
      await cache.put(url, new Response(blob, {headers:{'Content-Type':response.headers.get('content-type') || 'application/octet-stream'}}));
    }
    values.set(name, blob);
    onProgress?.({stage:'verified',file:name,index:i+1,total:ASSETS.length});
  }
  return values;
}
export async function loadEmbeddingModel(onProgress) {
  if (active) return active;
  if (loading) return loading;
  loading = (async () => {
    if (!navigator.gpu) throw Error('EMBEDDING_WEBGPU_UNAVAILABLE');
    const blobs = await files(onProgress);
    const {env, AutoConfig, AutoModel, AutoTokenizer} = await import('@huggingface/transformers');
    transformerEnv = env;
    env.allowLocalModels = true;
    env.useCustomCache = true;
    env.useBrowserCache = false;
    env.customCache = {
      async match(key) {
        const path = String(key);
        for (const [name, blob] of blobs) if (path.endsWith('/' + name)) return new Response(blob);
        return undefined;
      },
      async put() {},
    };
    env.backends.onnx.wasm.wasmPaths = {
      mjs:new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
      wasm:new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
    };
    onProgress?.({stage:'loading'});
    const options = {revision:REVISION,local_files_only:true};
    const config = await AutoConfig.from_pretrained(REPO, options);
    config.vision_config = null; config.audio_config = null;
    const tokenizer = await AutoTokenizer.from_pretrained(REPO, options);
    const model = await AutoModel.from_pretrained(REPO, {...options,config,device:'webgpu',dtype:'q4'});
    active = {model,tokenizer};
    return active;
  })();
  try { return await loading; }
  catch (error) { if (transformerEnv) { transformerEnv.customCache = null; transformerEnv.useCustomCache = false; } throw error; }
  finally { loading = undefined; }
}
export async function embedText(text, onProgress) {
  const {model,tokenizer} = await loadEmbeddingModel(onProgress);
  const result = await model(await tokenizer([text], {truncation:true, max_length:512}));
  const vector = result.sentence_embedding?.data;
  if (!vector || vector.length !== 768 || !Array.from(vector).every(Number.isFinite)) throw Error('Invalid embedding');
  return Array.from(vector);
}
export async function unloadEmbeddingModel() {
  const previous = active;
  active = undefined;
  if (previous) await previous.model.dispose();
  if (transformerEnv) { transformerEnv.customCache = null; transformerEnv.useCustomCache = false; }
}
