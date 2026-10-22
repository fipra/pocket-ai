import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const appName = process.platform === 'win32' ? 'USB AI.exe' : 'USB AI.app';

async function walk(root, relative = '') {
  const current = path.join(root, relative);
  const stat = await fs.lstat(current);
  if (stat.isSymbolicLink()) return [{relative, kind: 'link', target: await fs.readlink(current)}];
  if (stat.isDirectory()) {
    const children = await fs.readdir(current);
    const entries = [{relative, kind: 'directory'}];
    for (const child of children) entries.push(...await walk(root, path.join(relative, child)));
    return entries;
  }
  if (!stat.isFile()) throw new Error(`Elemento non supportato: ${relative}`);
  return [{relative, kind: 'file', size: stat.size}];
}

async function digest(file) {
  const hash = createHash('sha256');
  const handle = await fs.open(file, 'r');
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally { await handle.close(); }
  return hash.digest('hex');
}

export async function prepareUsb(source, destination, onProgress = () => {}) {
  const sourceStat = await fs.lstat(source);
  if (!sourceStat.isFile() && !sourceStat.isDirectory()) throw new Error('Pacchetto app non valido.');
  const destinationStat = await fs.stat(destination);
  if (!destinationStat.isDirectory()) throw new Error('Seleziona una cartella sulla chiavetta.');
  const target = path.join(destination, appName);
  const temp = path.join(destination, `.usb-ai-copy-${process.pid}-${Date.now()}`);
  if (await fs.lstat(target).then(() => true, () => false)) throw new Error(`${appName} è già presente. Scegli una cartella vuota per l’app; PocketAI-data non verrà modificata.`);
  const items = await walk(source);
  const bytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
  const available = await fs.statfs(destination).then(stat => Number(stat.bavail) * Number(stat.bsize));
  if (available < bytes + 100 * 1024 * 1024) throw new Error('Spazio insufficiente sulla chiavetta (serve anche un margine di 100 MB).');
  let copied = 0;
  try {
    await fs.cp(source, temp, {recursive: true, errorOnExist: true, force: false, preserveTimestamps: true, verbatimSymlinks: true});
    for (const item of items) {
      const original = path.join(source, item.relative);
      const duplicate = path.join(temp, item.relative);
      if (item.kind === 'file') {
        const stat = await fs.stat(duplicate);
        if (stat.size !== item.size || await digest(original) !== await digest(duplicate)) throw new Error(`Verifica fallita: ${item.relative || appName}`);
        copied += item.size;
        onProgress({copied, total: bytes});
      } else if (item.kind === 'link' && await fs.readlink(duplicate) !== item.target) {
        throw new Error(`Verifica fallita: ${item.relative}`);
      }
    }
    await fs.rename(temp, target);
    await fs.mkdir(path.join(destination, 'PocketAI-data'), {recursive: true});
    return {target, bytes};
  } catch (error) {
    await fs.rm(temp, {recursive: true, force: true}).catch(() => {});
    throw error;
  }
}
