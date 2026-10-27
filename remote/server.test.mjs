import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

test('bridge authenticates, lists only configured models, and streams chat', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'llamanest-bridge-'));
  const modelFolder = join(directory, 'models', 'one');
  await mkdir(modelFolder, { recursive:true });
  const modelPath = join(modelFolder, 'test.gguf');
  await writeFile(modelPath, 'GGUF');
  const shards = Array.from({ length: 4 }, (_, index) => join(modelFolder, `split-${String(index + 1).padStart(5, '0')}-of-00004.gguf`));
  await Promise.all(shards.map(path => writeFile(path, 'GGUF')));
  const upstream = createServer(async (request, response) => {
    if (request.url === '/models') return response.end(JSON.stringify({ data:[
      { id:'test-model', status:{ args:['llama-server', '--model', modelPath] } },
      ...shards.map((path, index) => ({ id:`split-${index + 1}`, status:{ args:['llama-server', '--model', path] } }))
    ] }));
    if (request.url === '/v1/chat/completions') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      assert.equal(JSON.parse(raw).model, 'test-model');
      response.writeHead(200, { 'Content-Type':'text/event-stream' });
      return response.end('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
    }
    response.writeHead(404).end();
  });
  const llamaPort = await listen(upstream);
  const reservation = createServer();
  const bridgePort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const token = 'b'.repeat(64);
  const origin = 'https://llamanest.vercel.app';
  const child = spawn(process.execPath, ['remote/server.mjs'], { cwd:process.cwd(), env:{ ...process.env, LLAMANEST_TOKEN:token, LLAMANEST_MODELS_DIR:join(directory,'models'), LLAMANEST_PORT:String(bridgePort), LLAMANEST_LLAMA_PORT:String(llamaPort), LLAMA_SERVER:'missing-llama-server-for-test' }, stdio:['ignore','pipe','pipe'], windowsHide:true });
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('Bridge did not start: ' + output)), 10_000);
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('listening')) { clearTimeout(timer); resolve(); } });
      child.once('exit', code => { clearTimeout(timer); reject(Error('Bridge exited: ' + code + ' ' + output)); });
    });
    const url = `http://127.0.0.1:${bridgePort}`;
    const preflight = await fetch(url + '/models', { method:'OPTIONS', headers:{ Origin:origin, 'Access-Control-Request-Private-Network':'true' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
    const unauthorized = await fetch(url + '/models', { headers:{ Origin:origin } });
    assert.equal(unauthorized.status, 401);
    const blocked = await fetch(url + '/models', { headers:{ Origin:'https://evil.example', Authorization:'Bearer ' + token } });
    assert.equal(blocked.status, 403);
    const headers = { Origin:origin, Authorization:'Bearer ' + token };
    const models = await (await fetch(url + '/models', { headers })).json();
    assert.deepEqual(models.models, [
      { id:'test-model', name:'test.gguf', size:4 },
      { id:'split-1', name:'split.gguf', size:16 }
    ]);
    const chat = await fetch(url + '/chat', { method:'POST', headers:{ ...headers, 'Content-Type':'application/json' }, body:JSON.stringify({ model:'test-model', messages:[{ role:'user', content:'hello' }] }) });
    assert.equal(chat.status, 200);
    assert.match(await chat.text(), /"content":"ok"/);
  } finally {
    child.kill();
    await new Promise(resolve => upstream.close(resolve));
    await rm(directory, { recursive:true, force:true });
  }
});
