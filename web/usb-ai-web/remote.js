export function validateRemoteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Enter a server URL such as https://dtiwinai.insel.ch:8081');
  return url.origin;
}

export async function remoteRequest(config, path, options = {}) {
  const base = validateRemoteUrl(config.url);
  if (!config.token || config.token.length < 32) throw Error('Enter the server access token');
  const host = new URL(base).hostname;
  const privateIpv4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
  const localHost = host.endsWith('.local') || privateIpv4;
  if (globalThis.location?.protocol === 'https:' && base.startsWith('http:') && !localHost) throw Error('This HTTPS site requires an HTTPS server URL for this host');
  const response = await fetch(base + path, {
    ...options,
    targetAddressSpace: base.startsWith('http:') && localHost ? 'local' : undefined,
    headers: { Authorization: `Bearer ${config.token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.error || `Remote server: HTTP ${response.status}`);
  }
  return response;
}

export async function remoteModels(config) {
  const response = await remoteRequest(config, '/models');
  const data = await response.json();
  return data.models.map(model => ({ ...model, id: `remote:${model.id}`, remoteId: model.id, source: 'remote' }));
}

export async function remoteDownload(config, model) {
  const url = new URL(model.url);
  const match = /^\/([^/]+\/[^/]+)\/resolve\/main\/(.+\.gguf)$/i.exec(url.pathname);
  if (url.origin !== 'https://huggingface.co' || !match || !model.sha256 || !model.size) throw Error('This model has no verified Hugging Face source');
  const response = await remoteRequest(config, '/download', { method: 'POST', body: JSON.stringify({ repo: match[1], path: decodeURIComponent(match[2]), sha256: model.sha256, size: model.size }) });
  return response.json();
}

export async function remoteChat(config, modelId, messages, onToken, signal) {
  const response = await remoteRequest(config, '/chat', { method: 'POST', body: JSON.stringify({ model: modelId, messages }), signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '', done = false, usage;
  while (true) {
    const { value, done: ended } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream: !ended });
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end).trim();
      pending = pending.slice(end + 1);
      if (!line.startsWith('data: ')) continue;
      if (line === 'data: [DONE]') { done = true; continue; }
      const event = JSON.parse(line.slice(6));
      if (event.error) throw Error(event.error.message || String(event.error));
      const choice = event.choices?.[0];
      const token = choice?.delta?.content;
      if (token) onToken(token);
      if (event.usage) usage = { inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens, tokensPerSecond: null };
    }
    if (ended) break;
  }
  if (!done && !signal.aborted) throw Error('Remote response ended early');
  return usage;
}
