// Browser-side GGUF v3 splitter. Tensor payloads are copied in small slices;
// arbitrary byte chunks are not valid GGUF shards.
export const SPLIT_TARGET_BYTES = 1_500_000_000;
const MAX_TENSOR_SPAN_BYTES = 1_900_000_000;
const MAX_HEADER_BYTES = 256 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const pad = (n, alignment) => Math.ceil(n / alignment) * alignment;

class Cursor {
  constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.pos = 0; }
  need(length) { if (this.pos + length > this.bytes.length) throw Error('GGUF_HEADER_MORE'); }
  take(length) { this.need(length); const value = this.bytes.subarray(this.pos, this.pos + length); this.pos += length; return value; }
  u8() { this.need(1); return this.view.getUint8(this.pos++); }
  u16() { this.need(2); const value = this.view.getUint16(this.pos, true); this.pos += 2; return value; }
  u32() { this.need(4); const value = this.view.getUint32(this.pos, true); this.pos += 4; return value; }
  u64() { this.need(8); const value = Number(this.view.getBigUint64(this.pos, true)); this.pos += 8; if (!Number.isSafeInteger(value)) throw Error('GGUF_INVALID'); return value; }
  string() { const size = this.u64(); if (size > MAX_HEADER_BYTES) throw Error('GGUF_INVALID'); return decoder.decode(this.take(size)); }
  skipValue(type, depth = 0) {
    if (depth > 4) throw Error('GGUF_INVALID');
    if ([0, 1, 7].includes(type)) this.take(1);
    else if ([2, 3].includes(type)) this.take(2);
    else if ([4, 5, 6].includes(type)) this.take(4);
    else if ([10, 11, 12].includes(type)) this.take(8);
    else if (type === 8) { const size = this.u64(); if (size > MAX_HEADER_BYTES) throw Error('GGUF_INVALID'); this.take(size); }
    else if (type === 9) {
      const inner = this.u32(), count = this.u64();
      if (count > MAX_HEADER_BYTES) throw Error('GGUF_INVALID');
      const width = { 0:1, 1:1, 2:2, 3:2, 4:4, 5:4, 6:4, 7:1, 10:8, 11:8, 12:8 }[inner];
      if (width) this.take(count * width);
      else { for (let i = 0; i < count; i++) this.skipValue(inner, depth + 1); }
    } else throw Error('GGUF_UNSUPPORTED');
  }
}

function parseHeader(bytes, fileSize) {
  const c = new Cursor(bytes);
  if (decoder.decode(c.take(4)) !== 'GGUF' || c.u32() !== 3) throw Error('GGUF_UNSUPPORTED');
  const tensorCount = c.u64(), kvCount = c.u64();
  if (!tensorCount || tensorCount > 1_000_000 || kvCount > 1_000_000) throw Error('GGUF_INVALID');
  const kvStart = c.pos; let alignment = 32, alignmentEntry;
  for (let i = 0; i < kvCount; i++) {
    const start = c.pos, key = c.string(), type = c.u32();
    if (key.startsWith('split.')) throw Error('GGUF_ALREADY_SPLIT');
    if (key === 'general.alignment') {
      if (type !== 4) throw Error('GGUF_UNSUPPORTED');
      alignment = c.u32();
      alignmentEntry = bytes.subarray(start, c.pos);
    } else c.skipValue(type);
  }
  if (alignment < 8 || alignment > 4096 || (alignment & (alignment - 1))) throw Error('GGUF_UNSUPPORTED');
  const kvRaw = bytes.subarray(kvStart, c.pos);
  const tensors = [];
  for (let i = 0; i < tensorCount; i++) {
    const start = c.pos;
    const name = c.string(), dimensions = c.u32();
    if (!name || dimensions > 8) throw Error('GGUF_INVALID');
    c.take(dimensions * 8); c.u32();
    const raw = bytes.subarray(start, c.pos);
    const offset = c.u64();
    if (offset % alignment) throw Error('GGUF_INVALID');
    tensors.push({ name, raw, offset });
  }
  const dataStart = pad(c.pos, alignment);
  if (dataStart > fileSize || tensors[0].offset !== 0) throw Error('GGUF_INVALID');
  for (let i = 0; i < tensors.length; i++) {
    const end = i + 1 < tensors.length ? tensors[i + 1].offset : fileSize - dataStart;
    if (end <= tensors[i].offset || end > fileSize - dataStart) throw Error('GGUF_INVALID');
    tensors[i].size = end - tensors[i].offset;
  }
  return { bytes, tensorCount, kvCount, kvRaw, alignment, alignmentEntry, dataStart, tensors };
}

function integer(value, size) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  if (size === 2) view.setUint16(0, value, true);
  else if (size === 4) view.setUint32(0, value, true);
  else view.setBigUint64(0, BigInt(value), true);
  return bytes;
}
function ggufString(value) { const bytes = encoder.encode(value); return [integer(bytes.length, 8), bytes]; }
function kvInteger(key, type, value, size) { return [...ggufString(key), integer(type, 4), integer(value, size)]; }
function flatten(chunks) {
  const total = chunks.reduce((n, part) => n + part.length, 0);
  const bytes = new Uint8Array(total); let at = 0;
  for (const part of chunks) { bytes.set(part, at); at += part.length; }
  return bytes;
}

export function shardHeader(plan, shardIndex) {
  const group = plan.groups[shardIndex], first = shardIndex === 0;
  const splitKvs = [
    ...kvInteger('split.no', 2, shardIndex, 2),
    ...kvInteger('split.count', 2, plan.groups.length, 2),
    ...kvInteger('split.tensors.count', 5, plan.tensorCount, 4)
  ];
  const chunks = [encoder.encode('GGUF'), integer(3, 4), integer(group.length, 8),
    integer((first ? plan.kvCount : plan.alignmentEntry ? 1 : 0) + 3, 8),
    ...(first ? [plan.kvRaw] : plan.alignmentEntry ? [plan.alignmentEntry] : []), ...splitKvs];
  let offset = 0;
  for (const tensor of group) {
    chunks.push(tensor.raw, integer(offset, 8));
    offset += tensor.size;
  }
  const raw = flatten(chunks);
  return flatten([raw, new Uint8Array(pad(raw.length, plan.alignment) - raw.length)]);
}

export async function planGgufSplit(file, targetBytes = SPLIT_TARGET_BYTES) {
  if (!file || !/\.gguf$/i.test(file.name || '') || !Number.isSafeInteger(file.size) || file.size < 32_000_000) throw Error('GGUF_INVALID');
  if (!Number.isSafeInteger(targetBytes) || targetBytes < 1_000_000 || targetBytes > 1_800_000_000) throw Error('GGUF_INVALID');
  let length = Math.min(file.size, 1024 * 1024), plan;
  while (!plan) {
    try { plan = parseHeader(new Uint8Array(await file.slice(0, length).arrayBuffer()), file.size); }
    catch (error) {
      if (error.message !== 'GGUF_HEADER_MORE') throw error;
      if (length >= Math.min(file.size, MAX_HEADER_BYTES)) throw Error('GGUF_UNSUPPORTED');
      length = Math.min(file.size, MAX_HEADER_BYTES, length * 2);
    }
  }
  const groups = []; let group = [], total = 0;
  for (const tensor of plan.tensors) {
    if (tensor.size > MAX_TENSOR_SPAN_BYTES) throw Error('GGUF_TENSOR_TOO_LARGE');
    if (group.length && total + tensor.size > targetBytes) { groups.push(group); group = []; total = 0; }
    group.push(tensor); total += tensor.size;
  }
  if (group.length) groups.push(group);
  if (groups.length < 2 || groups.length > 1000) throw Error('GGUF_UNSUPPORTED');
  plan.groups = groups;
  for (let i = 0; i < groups.length; i++) {
    const size = shardHeader(plan, i).length + groups[i].reduce((n, tensor) => n + tensor.size, 0);
    if (size > 2_000_000_000) throw Error('GGUF_TENSOR_TOO_LARGE');
  }
  return plan;
}

export async function splitGgufFile(file, directory, { signal, onProgress = () => {}, targetBytes = SPLIT_TARGET_BYTES } = {}) {
  const plan = await planGgufSplit(file, targetBytes);
  const base = file.name.slice(0, -5), handles = [], created = [];
  const names = plan.groups.map((_, i) => `${base}-${String(i + 1).padStart(5, '0')}-of-${String(plan.groups.length).padStart(5, '0')}.gguf`);
  // Never replace a user's existing shard, including an incomplete prior run.
  for (const name of names) {
    try { await directory.getFileHandle(name); throw Error('GGUF_OUTPUT_EXISTS'); }
    catch (error) { if (error.message === 'GGUF_OUTPUT_EXISTS' || error.name !== 'NotFoundError') throw error; }
  }
  let copied = 0;
  try {
    for (let i = 0; i < plan.groups.length; i++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const handle = await directory.getFileHandle(names[i], { create: true });
      created.push(names[i]);
      const writable = await handle.createWritable();
      try {
        await writable.write(shardHeader(plan, i));
        for (const tensor of plan.groups[i]) {
          const start = plan.dataStart + tensor.offset, end = start + tensor.size;
          for (let at = start; at < end; at += CHUNK_BYTES) {
            if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
            const chunk = new Uint8Array(await file.slice(at, Math.min(at + CHUNK_BYTES, end)).arrayBuffer());
            await writable.write(chunk);
            copied += chunk.length;
            onProgress({ loaded:copied, total:file.size - plan.dataStart, part:i + 1, parts:plan.groups.length });
          }
        }
        await writable.close();
      } catch (error) { await writable.abort().catch(() => {}); throw error; }
      handles.push(handle);
    }
  } catch (error) {
    for (const name of created) await directory.removeEntry(name).catch(() => {});
    throw error;
  }
  return { handles, names, size:handles.reduce((n, _, i) => n + shardHeader(plan, i).length + plan.groups[i].reduce((sum, tensor) => sum + tensor.size, 0), 0) };
}
