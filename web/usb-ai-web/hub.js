const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PART = /^[A-Za-z0-9._-]+$/;
const HASH = /^[a-f0-9]{64}$/;

export function modelFromEntry(repo, entry, license = 'see source') {
  if (!REPO.test(repo) || typeof entry?.path !== 'string') return null;
  const parts = entry.path.split('/');
  const name = parts.at(-1);
  if (!parts.every(part => PART.test(part) && part !== '.' && part !== '..') || !/\.gguf$/i.test(name) || /mmproj/i.test(name) || /-of-\d+\.gguf$/i.test(name)) return null;
  const size = entry.size;
  const sha256 = String(entry.lfs?.sha256 || entry.lfs?.oid || '').toLowerCase();
  if (!Number.isSafeInteger(size) || size < 1_048_576 || size > 2_000_000_000 || !HASH.test(sha256)) return null;
  const url = `https://huggingface.co/${repo}/resolve/main/${parts.map(encodeURIComponent).join('/')}`;
  return { id: `hf:${sha256}`, name: `${repo} / ${name}`, size, sha256, url,
    source: `https://huggingface.co/${repo}/blob/main/${parts.map(encodeURIComponent).join('/')}`, license };
}

export async function searchModels(query, skip = 0, fetcher = fetch) {
  const term = query.trim();
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
    models.push(...entries.map(entry => modelFromEntry(repo.id, entry, license)).filter(Boolean).slice(0, 5));
  }
  return { models, nextSkip: repos.length === 8 ? skip + 8 : null };
}
