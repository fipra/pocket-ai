export const MAX_CHAT_BYTES = 2_000_000;
export const MAX_LINK_LENGTH = 6000;
const encoder = new TextEncoder();

export function sharedChat(chat) {
  if (!chat || typeof chat.title !== 'string' || !Array.isArray(chat.messages) || !chat.messages.length || chat.messages.length > 10000) throw new Error('INVALID_CHAT');
  const messages = chat.messages.map(message => {
    if (!['user', 'assistant'].includes(message.role) || typeof message.text !== 'string') throw new Error('INVALID_CHAT');
    return {role:message.role, text:message.text};
  });
  const result = {format:'llamanest-chat', version:1, title:chat.title.slice(0, 200), messages};
  if (encoder.encode(JSON.stringify(result)).length > MAX_CHAT_BYTES) throw new Error('CHAT_TOO_LARGE');
  return result;
}
export function parseSharedChat(text) {
  if (typeof text !== 'string' || encoder.encode(text).length > MAX_CHAT_BYTES) throw new Error('INVALID_CHAT');
  const value = JSON.parse(text);
  if (value.format !== 'llamanest-chat' || value.version !== 1) throw new Error('INVALID_CHAT');
  return sharedChat(value);
}
async function transformBytes(bytes, type) {
  const stream = new Blob([bytes]).stream().pipeThrough(type === 'compress' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const parts = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_CHAT_BYTES) { await reader.cancel(); throw new Error('CHAT_TOO_LARGE'); }
    parts.push(value);
  }
  return new Uint8Array(await new Blob(parts).arrayBuffer());
}
export async function createShareLink(chat, base) {
  const bytes = await transformBytes(encoder.encode(JSON.stringify(sharedChat(chat))), 'compress');
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  const payload = btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
  const url = new URL(base); url.search = ''; url.hash = `chat=${payload}`;
  return url.href.length <= MAX_LINK_LENGTH ? url.href : null;
}
export async function parseShareLink(hash) {
  const payload = new URLSearchParams(hash.replace(/^#/, '')).get('chat');
  if (!payload || payload.length > MAX_LINK_LENGTH || !/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('INVALID_CHAT');
  const binary = atob(payload.replaceAll('-','+').replaceAll('_','/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return parseSharedChat(new TextDecoder('utf-8', {fatal:true}).decode(await transformBytes(bytes, 'decompress')));
}
