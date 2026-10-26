export function documentsForChat(documents, chatId) {
  return chatId ? documents.filter(document => document.chatId === chatId) : [];
}

export function chunks(text, size = 1100, overlap = 180) {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const result = [];
  for (let start = 0; start < clean.length; start += size - overlap) {
    result.push(clean.slice(start, start + size));
    if (start + size >= clean.length) break;
  }
  return result;
}
export function retrieve(question, documents, limit = 4) {
  const query = question.toLowerCase();
  const generic = new Set(['the','and','for','this','that','document','summary','summarize','analysis','analyze','analyse','please','what','about','questo','questa','documento','documenti','riassumi','riassunto','analizza','analisi','analizzare','fai','fammi','puoi','nuovo','secondo','ultimo','dimmi','cosa','della','delle','degli','pour','avec','résume','résumé','analyser','dieses','dokument','zusammenfassung','analysiere','resume','resumen','analiza','analisis']);
  const named = documents.filter(doc => {
    const name = doc.name.toLowerCase();
    const stem = name.replace(/\.[^.]+$/, '');
    return query.includes(name) || (stem.length >= 4 && !generic.has(stem) && query.includes(stem));
  });
  if (named.length) documents = named;
  const terms = [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(term => !generic.has(term)))];
  const scored = documents.flatMap(doc => doc.chunks.map((text, index) => ({ name: doc.name, text, index, updated:doc.updated || 0, score: terms.reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), 0) })))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.updated - a.updated).slice(0, limit);
  if (scored.length) return scored;
  // Generic requests such as "summarize this document" still need context.
  const latest = [...documents].sort((a,b) => (b.updated || 0) - (a.updated || 0))[0];
  if (!latest?.chunks.length) return [];
  const count = Math.min(limit, 3, latest.chunks.length);
  const indexes = [...new Set(Array.from({length:count}, (_,i) => Math.round(i * (latest.chunks.length - 1) / Math.max(1,count-1))))];
  return indexes.map(index => ({name:latest.name,text:latest.chunks[index],index,score:0}));
}

export function documentQuestion(question, sources, maxExcerptChars = 2600) {
  if (!sources.length) return question;
  let remaining = maxExcerptChars;
  const excerpts = sources.map((source,i) => {
    const text = source.text.slice(0, Math.min(remaining, 900));
    remaining -= text.length;
    return text ? `[${i+1}] ${source.name}: ${text}` : '';
  }).filter(Boolean);
  return `${question}\n\nLocal document excerpts:\n${excerpts.join('\n\n')}\n\nAnswer using these excerpts. Cite the source numbers. If the excerpts are insufficient, say so.`;
}

export function recentContext(messages, question, maxHistoryChars = 2400) {
  let remaining = maxHistoryChars;
  const history = [];
  for (const message of [...messages].reverse()) {
    if (remaining <= 0) break;
    const clean = message.role === 'assistant' ? message.text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim() : message.text;
    const content = clean.slice(-remaining);
    history.push({role:message.role,content});
    remaining -= content.length;
  }
  return [...history.reverse(), {role:'user',content:question}];
}
export async function readDocument(file) {
  if (file.size > 20_000_000) throw Error('Document exceeds 20 MB');
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text += `\n[Page ${page}]\n` + content.items.map(item => item.str).join(' ');
    }
    if (!text.trim()) throw Error('DOCUMENT_NO_TEXT');
    return text;
  }
  if (!/\.(txt|md|csv|json)$/i.test(file.name)) throw Error('Unsupported document type');
  const text = await file.text();
  if (!text.trim()) throw Error('DOCUMENT_NO_TEXT');
  return text;
}
