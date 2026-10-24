const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PART = /^[A-Za-z0-9._-]+$/;
const HASH = /^[a-f0-9]{64}$/;
const WEB_FILE_LIMIT = 2_000_000_000;
const MIN_MODEL_SIZE = 32_000_000;

export function estimateMemory(size) {
  const gib = size / 1_073_741_824;
  return { minimum: Math.ceil(gib + 2), recommended: Math.ceil(gib * 1.3 + 4) };
}

export function searchTerm(query) {
  const raw = query.trim();
  if (!/\.gguf$/i.test(raw)) return raw;
  return raw.split('/').at(-1)
    .replace(/\.gguf$/i, '')
    .replace(/[-_.](?:I?Q\d+(?:_[A-Za-z0-9]+)*|BF16|F16)$/i, '')
    .replace(/^Qwen_(?=Qwen)/i, '');
}

export function modelFromEntry(repo, entry, license = 'see source', allowShard = false) {
  if (!REPO.test(repo) || typeof entry?.path !== 'string') return null;
  const parts = entry.path.split('/');
  const name = parts.at(-1);
  if (!parts.every(part => PART.test(part) && part !== '.' && part !== '..') || !/\.gguf$/i.test(name) || /(?:mmproj|adapter|lora|vocab|tokenizer|embedding)/i.test(name) || (!allowShard && /-of-\d+\.gguf$/i.test(name))) return null;
  const size = entry.size;
  const sha256 = String(entry.lfs?.sha256 || entry.lfs?.oid || '').toLowerCase();
  if (!Number.isSafeInteger(size) || size < MIN_MODEL_SIZE || !HASH.test(sha256)) return null;
  const url = `https://huggingface.co/${repo}/resolve/main/${parts.map(encodeURIComponent).join('/')}`;
  return { id: `hf:${sha256}`, name: `${repo} / ${name}`, size, sha256, url, tooLargeForWeb: size > WEB_FILE_LIMIT,
    source: `https://huggingface.co/${repo}/blob/main/${parts.map(encodeURIComponent).join('/')}`, license };
}

export function modelsFromEntries(repo, entries, license = 'see source') {
  const models = entries.map(entry => modelFromEntry(repo, entry, license)).filter(Boolean);
  const groups = new Map();
  for (const entry of entries) {
    const match = /^(.+)-(\d{5})-of-(\d{5})\.gguf$/i.exec(entry?.path || '');
    if (!match) continue;
    const number = Number(match[2]), count = Number(match[3]);
    if (count < 2 || count > 1000 || number < 1 || number > count) continue;
    const key = `${match[1]}:${count}`;
    if (!groups.has(key)) groups.set(key, { name: match[1], count, entries: new Map() });
    groups.get(key).entries.set(number, entry);
  }
  for (const group of groups.values()) {
    if (group.entries.size !== group.count) continue;
    const shards = Array.from({length:group.count}, (_,i) => modelFromEntry(repo, group.entries.get(i+1), license, true));
    if (shards.some(shard => !shard || shard.tooLargeForWeb)) continue;
    const parts = shards;
    models.push({id:`hf-split:${parts[0].sha256}`,name:`${repo} / ${group.name}.gguf`,size:parts.reduce((sum,part)=>sum+part.size,0),sha256:parts[0].sha256,url:parts[0].url,source:parts[0].source,license,tooLargeForWeb:false,shards:parts});
  }
  return models;
}

export async function searchModels(query, skip = 0, fetcher = fetch) {
  const term = searchTerm(query);
  const requestedName = query.trim().split('/').at(-1).toLowerCase();
  const alternateName = requestedName.replace(/^qwen_(?=qwen)/, '');
  const filenameSearch = /\.gguf$/i.test(requestedName);
  if (term.length < 2 || term.length > 80) throw Error('Use 2–80 characters');
  const response = await fetcher(`https://huggingface.co/api/models?filter=gguf&search=${encodeURIComponent(term)}&sort=downloads&direction=-1&limit=8&skip=${skip}`);
  if (!response.ok) throw Error(`Hugging Face search: HTTP ${response.status}`);
  const repos = await response.json();
  if (!Array.isArray(repos)) throw Error('Invalid search results');
  const models = [];
  for (const repo of repos) {
    if (!REPO.test(repo.id || '') || repo.gated) continue;
    const tree = await fetcher(`https://huggingface.co/api/models/${repo.id}/tree/main?recursive=true`);
    if (!tree.ok) continue;
    const entries = await tree.json();
    if (!Array.isArray(entries)) continue;
    const license = repo.tags?.find(tag => tag.startsWith('license:'))?.slice(8) || 'see source';
    const files = modelsFromEntries(repo.id, entries, license);
    if (filenameSearch) files.sort((a, b) => {
      const score = item => item.name.toLowerCase().endsWith(` / ${requestedName}`) ? 2 : item.name.toLowerCase().endsWith(` / ${alternateName}`) ? 1 : 0;
      return score(b) - score(a);
    });
    models.push(...files);
  }
  const exact = filenameSearch ? models.filter(item => item.name.toLowerCase().endsWith(` / ${requestedName}`)) : [];
  const alternate = filenameSearch ? models.filter(item => item.name.toLowerCase().endsWith(` / ${alternateName}`)) : [];
  const selected = exact.length ? exact : alternate.length ? alternate : models;
  selected.sort((a, b) => Number(a.tooLargeForWeb) - Number(b.tooLargeForWeb) || a.size - b.size);
  return { models: selected, nextSkip: repos.length === 8 ? skip + 8 : null };
}
