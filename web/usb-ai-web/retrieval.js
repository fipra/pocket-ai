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
  const terms = [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []))];
  return documents.flatMap(doc => doc.chunks.map((text, index) => ({ name: doc.name, text, index, score: terms.reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), 0) })))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
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
    return text;
  }
  if (!/\.(txt|md|csv|json)$/i.test(file.name)) throw Error('Unsupported document type');
  return file.text();
}
