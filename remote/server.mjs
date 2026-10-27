import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { resolve, join, relative, basename } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const origin = process.env.LLAMANEST_ORIGIN || 'https://llamanest.vercel.app';
const token = process.env.LLAMANEST_TOKEN || '';
const port = Number(process.env.LLAMANEST_PORT || 8088);
const llamaPort = Number(process.env.LLAMANEST_LLAMA_PORT || 18088);
const modelDir = resolve(process.env.LLAMANEST_MODELS_DIR || './models');
const llamaExecutable = process.env.LLAMA_SERVER || (process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
const tlsCert = process.env.LLAMANEST_TLS_CERT;
const tlsKey = process.env.LLAMANEST_TLS_KEY;
const repoPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const pathPattern = /^[A-Za-z0-9._/-]+\.gguf$/i;
const shaPattern = /^[a-f0-9]{64}$/;
let llama;
let downloading = false;

if (token.length < 32) throw Error('Set LLAMANEST_TOKEN to a random value of at least 32 characters');
if (!!tlsCert !== !!tlsKey) throw Error('Set both LLAMANEST_TLS_CERT and LLAMANEST_TLS_KEY');
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(llamaPort) || llamaPort < 1 || llamaPort > 65535 || port === llamaPort) throw Error('Invalid port');
await mkdir(modelDir, { recursive: true });

function startLlama() {
  llama = spawn(llamaExecutable, ['--models-dir', modelDir, '--host', '127.0.0.1', '--port', String(llamaPort), '--n-gpu-layers', 'all', '--no-webui'], { stdio: 'inherit', windowsHide: true });
  llama.on('error', error => console.error('llama-server:', error.message));
  llama.on('exit', (code, signal) => console.error('llama-server stopped:', code ?? signal));
}
function cors(request, response) {
  if (request.headers.origin !== origin) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Private-Network', 'true');
  return true;
}
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 20_000) throw Error('Request too large');
  }
  return JSON.parse(raw);
}
async function models(reload = false) {
  const response = await fetch(`http://127.0.0.1:${llamaPort}/models${reload ? '?reload=1' : ''}`);
  if (!response.ok) throw Error(`llama-server models: HTTP ${response.status}`);
  const data = await response.json();
  const result = [];
  for (const model of data.data || []) {
    const args = model.status?.args;
    const modelArg = Array.isArray(args) ? args.lastIndexOf('--model') : -1;
    const configuredPath = model.path || (modelArg >= 0 ? args[modelArg + 1] : null);
    if (typeof configuredPath !== 'string' || !model.id) continue;
    const path = resolve(configuredPath);
    const rel = relative(modelDir, path);
    if (!rel || rel.startsWith('..') || resolve(modelDir, rel) !== path || !path.toLowerCase().endsWith('.gguf')) continue;
    let size = (await stat(path)).size;
    const shard = /^(.*-)(\d{5})-of-(\d{5})\.gguf$/i.exec(path);
    if (shard) {
      if (shard[2] !== '00001') continue;
      const count = Number(shard[3]);
      if (count < 2 || count > 99999) continue;
      for (let index = 2; index <= count; index++) {
        const sibling = `${shard[1]}${String(index).padStart(5, '0')}-of-${shard[3]}.gguf`;
        if (!existsSync(sibling)) { size = 0; break; }
        size += (await stat(sibling)).size;
      }
      if (!size) continue;
    }
    result.push({ id: model.id, name: shard ? basename(path).replace(/-00001-of-\d{5}(?=\.gguf$)/i, '') : basename(path), size, path });
  }
  return result;
}
async function download(data) {
  const { repo, path, sha256, size } = data;
  if (repo.length > 100 || path.length > 180 || !repoPattern.test(repo) || !pathPattern.test(path) || path.split('/').some(part => part === '.' || part === '..' || !part) || /(?:mmproj|adapter|lora|imatrix)/i.test(path) || /-\d{5}-of-\d{5}\.gguf$/i.test(path) || !shaPattern.test(sha256) || !Number.isSafeInteger(size) || size < 32_000_000 || size > 64_000_000_000) throw Error('Invalid GGUF metadata');
  const tree = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`);
  if (!tree.ok) throw Error(`Hugging Face metadata: HTTP ${tree.status}`);
  const entries = await tree.json();
  const entry = entries.find(item => item.path === path);
  if (!entry || entry.size !== size || String(entry.lfs?.sha256 || entry.lfs?.oid || '').toLowerCase() !== sha256) throw Error('GGUF metadata no longer matches Hugging Face');
  const filename = `${sha256.slice(0,16)}-${path.split('/').at(-1)}`;
  const destinationDir = modelDir;
  const destination = join(destinationDir, filename);
  await mkdir(destinationDir, { recursive: true });
  if (existsSync(destination)) {
    if ((await stat(destination)).size !== size) throw Error('An incomplete model already exists');
    const existingHash = createHash('sha256');
    for await (const chunk of createReadStream(destination)) existingHash.update(chunk);
    if (existingHash.digest('hex') !== sha256) throw Error('Existing GGUF hash mismatch');
    const found = (await models(true)).find(item => item.path.toLowerCase() === destination.toLowerCase());
    if (!found) throw Error('llama-server did not register this GGUF');
    return { id: found.id, name: found.name, size: found.size };
  }
  const temporary = `${destination}.part`;
  await rm(temporary, { force: true });
  const url = `https://huggingface.co/${repo}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) throw Error(`GGUF download: HTTP ${response.status}`);
  const hash = createHash('sha256');
  let bytes = 0;
  const verify = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; if (bytes > size) return callback(Error('GGUF exceeds expected size')); hash.update(chunk); callback(null, chunk); } });
  try {
    await pipeline(response.body, verify, createWriteStream(temporary, { flags: 'wx' }));
    const file = await open(temporary, 'r');
    const header = Buffer.alloc(4);
    try { await file.read(header, 0, 4, 0); } finally { await file.close(); }
    if (bytes !== size || hash.digest('hex') !== sha256 || header.toString() !== 'GGUF') throw Error('GGUF size, hash or format mismatch');
    await rename(temporary, destination);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
  const found = (await models(true)).find(item => item.path.toLowerCase() === destination.toLowerCase());
  if (!found) throw Error('llama-server did not register this GGUF');
  return { id: found.id, name: found.name, size: found.size };
}
async function chat(request, response) {
  const data = await body(request);
  if (!(await models()).some(item => item.id === data.model) || !Array.isArray(data.messages) || data.messages.length > 32 || data.messages.some(message => !['system','user','assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 50_000)) throw Error('Invalid chat request');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000);
  response.once('close', () => controller.abort());
  try {
    const upstream = await fetch(`http://127.0.0.1:${llamaPort}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: data.model, messages: data.messages, stream: true, max_tokens: 3072, temperature: 0.7, stream_options: { include_usage: true } }), signal: controller.signal });
    if (!upstream.ok || !upstream.body) throw Error(`llama-server: HTTP ${upstream.status} ${await upstream.text()}`);
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    for await (const chunk of upstream.body) { if (response.destroyed) break; response.write(chunk); }
    response.end();
  } finally { clearTimeout(timeout); }
}

startLlama();
const handler = async (request, response) => {
  try {
    if (!cors(request, response)) return json(response, 403, { error: 'Origin not allowed' });
    if (request.method === 'OPTIONS') return response.writeHead(204).end();
    if (request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: 'Unauthorized' });
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, { status: 'ok' });
    if (request.method === 'GET' && request.url === '/models') return json(response, 200, { models: (await models()).map(({ id, name, size }) => ({ id, name, size })) });
    if (request.method === 'POST' && request.url === '/download') {
      if (downloading) return json(response, 409, { error: 'A download is already running' });
      downloading = true;
      try { return json(response, 200, await download(await body(request))); }
      finally { downloading = false; }
    }
    if (request.method === 'POST' && request.url === '/chat') return await chat(request, response);
    json(response, 404, { error: 'Not found' });
  } catch (error) { if (!response.headersSent) json(response, 400, { error: error.message }); else response.destroy(error); }
};
const server = tlsCert ? createHttpsServer({ cert: await readFile(tlsCert), key: await readFile(tlsKey) }, handler) : createHttpServer(handler);
server.on('error', error => {
  console.error(`LlamaNest bridge failed to listen on port ${port}: ${error.message}`);
  llama?.kill();
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => console.log(`LlamaNest bridge listening on ${tlsCert ? 'https' : 'http'} port ${port}; allowed origin ${origin}; models ${modelDir}`));
process.on('SIGINT', () => { server.close(); llama?.kill(); });
