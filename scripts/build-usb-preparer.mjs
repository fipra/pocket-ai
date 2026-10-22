import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
if (!['win', 'mac'].includes(platform) || (platform === 'win' ? process.platform !== 'win32' : process.platform !== 'darwin')) {
  throw new Error('Crea il preparatore Windows su Windows e quello Mac su macOS.');
}
const release = path.join(project, 'release');
const payload = path.join(project, 'preparer', 'payload');
const appName = platform === 'win' ? 'USB AI.exe' : 'USB AI.app';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: project, stdio: 'inherit', shell: process.platform === 'win32'});
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} è terminato con codice ${code}`)));
  });
}

await run('node', ['scripts/check-model.mjs']);
await fs.rm(payload, {recursive: true, force: true});
await fs.mkdir(payload, {recursive: true});
if (platform === 'win') {
  await run('electron-builder', ['--win', '--x64']);
  const candidates = (await fs.readdir(release)).filter(name => name.endsWith('.exe') && name.startsWith('USB AI'));
  if (candidates.length !== 1) throw new Error(`Atteso un solo EXE portable in release/, trovati: ${candidates.join(', ')}`);
  await fs.copyFile(path.join(release, candidates[0]), path.join(payload, appName));
} else {
  await run('electron-builder', ['--mac', 'dir']);
  const folders = (await fs.readdir(release, {withFileTypes: true})).filter(entry => entry.isDirectory() && /^mac(?:-|$)/.test(entry.name));
  const candidates = [];
  for (const folder of folders) {
    const candidate = path.join(release, folder.name, appName);
    if (await fs.stat(candidate).then(() => true, () => false)) candidates.push(candidate);
  }
  if (candidates.length !== 1) throw new Error(`Attesa una sola app Mac in release/, trovate: ${candidates.length}`);
  await fs.cp(candidates[0], path.join(payload, appName), {recursive: true, verbatimSymlinks: true});
}
await run('electron-builder', ['--projectDir', 'preparer', `--${platform}`]);
console.log(`Preparatore pronto in ${path.join(release, 'preparer')}`);
