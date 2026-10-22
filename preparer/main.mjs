import {app, BrowserWindow, dialog, ipcMain} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareUsb} from './copy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appName = process.platform === 'win32' ? 'USB AI.exe' : 'USB AI.app';
const source = path.join(process.resourcesPath, 'payload', appName);
let window;
let selected;
let busy = false;

app.whenReady().then(async () => {
  if (!await fs.stat(source).then(() => true, () => false)) {
    dialog.showErrorBox('Prepara USB AI', 'Pacchetto dell’app mancante. Scarica di nuovo il preparatore completo.');
    app.quit();
    return;
  }
  window = new BrowserWindow({
    width: 600, height: 470, resizable: false, title: 'Prepara USB AI',
    webPreferences: {preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true}
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('choose', async event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || busy) return null;
    const choice = await dialog.showOpenDialog(window, {title: 'Scegli una cartella sulla chiavetta USB', properties: ['openDirectory']});
    selected = choice.canceled ? selected : choice.filePaths[0];
    return selected;
  });
  ipcMain.handle('install', async event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || busy) throw new Error('Operazione non consentita o già in corso.');
    if (!selected) throw new Error('Scegli prima la chiavetta USB.');
    busy = true;
    try {
      return await prepareUsb(source, selected, progress => {
        if (!window.isDestroyed()) window.webContents.send('progress', progress);
      });
    } finally { busy = false; }
  });
  await window.loadFile(path.join(here, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
