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
