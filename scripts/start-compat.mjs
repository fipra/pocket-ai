import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const electron=path.join(root,'node_modules','electron','dist',process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
const child=spawn(electron,['.'],{cwd:root,stdio:'inherit',env:{...process.env,POCKET_AI_COMPAT_MODE:'1'}});
child.on('error',error=>{console.error('Impossibile avviare Electron:',error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{if(!signal)process.exitCode=code??1;});
