const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['state','set-language','models','import-model','load-model','new-chat','delete-chat','delete-document','import-documents','stop','send','export-chat']);
contextBridge.exposeInMainWorld('pocket',{call:(name,...args)=>{if(!allowed.has(name))throw Error('Invalid operation');return ipcRenderer.invoke(name,...args);},onToken:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('token',listener);return ()=>ipcRenderer.removeListener('token',listener);}});
