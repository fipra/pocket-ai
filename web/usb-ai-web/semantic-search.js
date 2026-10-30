// Helpers for comparing real embeddings. The caller owns model loading and storage.
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) && !ArrayBuffer.isView(a)) throw Error('Invalid embedding');
  if ((!Array.isArray(b) && !ArrayBuffer.isView(b)) || !a.length || a.length !== b.length) throw Error('Incompatible embeddings');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Invalid embedding');
    dot += x * y; normA += x * x; normB += y * y;
  }
  if (!normA || !normB) throw Error('Empty embedding');
  return dot / Math.sqrt(normA * normB);
}

export function semanticResults(queryVector, entries, limit = 4) {
  if (!Number.isInteger(limit) || limit < 1) throw Error('Invalid result limit');
  return entries.map(entry => ({ ...entry, score: cosineSimilarity(queryVector, entry.vector) }))
    .sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ vector, ...result }) => result);
}

export const embeddingQuery = text => `task: question answering | query: ${text}`;
export const embeddingPassage = (title, text) => `title: ${title || 'none'} | text: ${text}`;

// The embedding function must be supplied by a compatible local runtime.
// No partial index is returned when a request fails or is cancelled.
export async function buildSemanticIndex(documents, embed, { signal, onProgress = () => {} } = {}) {
  const entries = documents.flatMap(doc => doc.chunks.map((text, index) => ({ documentId:doc.id, name:doc.name, text, index })));
  const output = [];
  for (const [i, entry] of entries.entries()) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const vector = await embed(embeddingPassage(entry.name, entry.text));
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    // Self-comparison validates the complete vector and excludes zero vectors.
    cosineSimilarity(vector, vector);
    if (output.length && vector.length !== output[0].vector.length) throw Error('Incompatible embeddings');
    output.push({ ...entry, vector: Array.from(vector) });
    onProgress(i + 1, entries.length);
  }
  return output;
}

// Callers provide the local document store and a real embedding runtime.
// Existing vectors are reused only for the exact text, filename and model version.
export async function ensureSemanticIndex(documents, embed, saveDocument, { signal, onProgress = () => {}, modelId } = {}) {
  if (!modelId) throw Error('Missing embedding model identifier');
  const total = documents.reduce((n, doc) => n + doc.chunks.length, 0);
  let completed = 0;
  const entries = [];
  for (const document of documents) {
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const cached = document.semanticIndex;
    const valid = cached?.modelId === modelId && cached.name === document.name &&
      Array.isArray(cached.entries) && cached.entries.length === document.chunks.length &&
      cached.entries.every((item, i) => item.index === i && item.text === document.chunks[i] && item.documentId === document.id && item.name === document.name);
    if (valid) {
      for (const item of cached.entries) cosineSimilarity(item.vector, item.vector);
      entries.push(...cached.entries);
      completed += cached.entries.length;
      onProgress(completed, total);
      continue;
    }
    const fresh = await buildSemanticIndex([document], embed, {signal, onProgress:done => onProgress(completed + done, total)});
    if (signal?.aborted) throw new DOMException('Indexing cancelled', 'AbortError');
    const updated = {...document, semanticIndex:{modelId, name:document.name, entries:fresh}};
    await saveDocument(updated);
    document.semanticIndex = updated.semanticIndex;
    entries.push(...fresh);
    completed += fresh.length;
  }
  return entries;
}
