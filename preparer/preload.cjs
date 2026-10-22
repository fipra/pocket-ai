const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('preparer', {
  choose: () => ipcRenderer.invoke('choose'),
  install: () => ipcRenderer.invoke('install'),
  onProgress: callback => ipcRenderer.on('progress', (_event, value) => callback(value))
});
