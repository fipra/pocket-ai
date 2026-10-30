import { createSHA256 } from 'hash-wasm';
import { cosineSimilarity } from './semantic-search.js';

const REPO = 'onnx-community/embeddinggemma-2-ONNX';
const REVISION = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0';
const CACHE = 'llamanest-embeddinggemma2-onnx-v1';
const ASSETS = [
  ['config.json', null], ['tokenizer_config.json', null],
  ['tokenizer.json', '4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4'],
  ['processor_config.json', null], ['preprocessor_config.json', null],
  ['onnx/model_q4.onnx', 'f9eeba97acddf139b8ee2ddf04bc30dceafa88de93fadf74d7644e0d61a477a9'],
  ['onnx/model_q4.onnx_data', 'c3975f2d1ab7a1878ae31a7d7a9b7804a827aff3800b60dfceafce21cac3df49'],
  ['onnx/vision_encoder_q4.onnx', '7ea284226d4938f0ad921ab091f1d80a9ca699aa802984ef5cd5eec4f4761d96'],
  ['onnx/vision_encoder_q4.onnx_data', '0a9d6c927334f152a33dd90874f65d6ea5228999abe6a450d3f7813677fa704c'],
];
let engine, indexed = [];
async function hashBlob(blob) {
  const hash = await createSHA256(), reader = blob.stream().getReader();
  try { for (;;) { const {done,value} = await reader.read(); if (done) break; hash.update(value); } }
  finally { reader.releaseLock(); }
  return hash.digest('hex');
}
async function load() {
  if (engine) return engine;
  if (!navigator.gpu) throw Error('PHOTO_WEBGPU_UNAVAILABLE');
  const cache = await caches.open(CACHE), blobs = new Map();
  for (const [i, [name, digest]] of ASSETS.entries()) {
    const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`;
    let hit = await cache.match(url), blob = hit ? await hit.blob() : null;
    if (blob && digest && await hashBlob(blob) !== digest) { await cache.delete(url); blob = null; }
    if (!blob) {
      postMessage({type:'progress',stage:'download',file:name,done:i,total:ASSETS.length});
      const response = await fetch(url);
      if (!response.ok) throw Error(`PHOTO_DOWNLOAD_FAILED: ${name} (${response.status})`);
      blob = await response.blob();
      if (digest && await hashBlob(blob) !== digest) throw Error(`PHOTO_CHECKSUM_FAILED: ${name}`);
      await cache.put(url,new Response(blob,{headers:{'Content-Type':response.headers.get('content-type') || 'application/octet-stream'}}));
    }
    blobs.set(name,blob);
    postMessage({type:'progress',stage:'verify',file:name,done:i+1,total:ASSETS.length});
  }
  const {env,AutoConfig,AutoModel,AutoProcessor,load_image} = await import('@huggingface/transformers');
  env.allowLocalModels = true; env.useCustomCache = true; env.useBrowserCache = false;
  env.customCache = {async match(key) {const path=String(key);for(const [name,blob] of blobs) if(path.endsWith('/'+name))return new Response(blob);},async put(){}};
  env.backends.onnx.wasm.wasmPaths = {
    mjs:new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs',import.meta.url).href,
    wasm:new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm',import.meta.url).href,
  };
  postMessage({type:'progress',stage:'loading'});
  const options = {revision:REVISION,local_files_only:true};
  const config = await AutoConfig.from_pretrained(REPO,options);config.audio_config=null;
  const processor = await AutoProcessor.from_pretrained(REPO,options);
  const model = await AutoModel.from_pretrained(REPO,{...options,config,device:'webgpu',dtype:'q4'});
  engine = {model,processor,load_image}; return engine;
}
function vector(result) {
  const values=result.sentence_embedding?.data;
  if(!values || values.length!==768 || !Array.from(values).every(Number.isFinite))throw Error('PHOTO_INVALID_VECTOR');
  return Array.from(values);
}
self.onmessage = async event => {
  const {type,files,query,selectionId}=event.data || {};
  if(type!=='search')return;
  try {
    const {model,processor,load_image} = await load();
    if(indexed.selectionId!==selectionId){
      indexed=[];
      for(let i=0;i<files.length;i++){
        postMessage({type:'progress',stage:'index',done:i,total:files.length});
        const image=await load_image(files[i]);
        indexed.push({index:i,vector:vector(await model(await processor(null,image)))});
      }
      indexed.selectionId=selectionId;
    }
    postMessage({type:'progress',stage:'query'});
    const text=vector(await model(await processor([`task: search result | query: ${query}`])));
    const results=indexed.map(item=>({index:item.index,score:cosineSimilarity(text,item.vector)})).sort((a,b)=>b.score-a.score);
    postMessage({type:'result',results});
  } catch(error){postMessage({type:'error',message:String(error?.message || error)});}
};
