const {app,BrowserWindow}=require('electron');
const path=require('node:path');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'i18n-smoke-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 await win.loadFile(path.join(__dirname,'../ui/index.html'));
 const result=await win.webContents.executeJavaScript(`new Promise(resolve=>{setTimeout(async()=>{const select=document.getElementById('language');const rows=[{lang:document.documentElement.lang,label:document.getElementById('new').textContent,options:select.options.length}];for(const language of ['it','de','fr','es']){select.value=language;select.dispatchEvent(new Event('change'));await new Promise(done=>setTimeout(done,100));rows.push({lang:document.documentElement.lang,label:document.getElementById('new').textContent});}resolve(rows)},100)})`);
 console.log(JSON.stringify(result));
 const expected=['New chat','Nuova conversazione','Neuer Chat','Nouvelle conversation','Nueva conversación'];
 if(result.some((row,index)=>row.lang!==['en','it','de','fr','es'][index]||!row.label.includes(expected[index]))||result[0].options!==5)process.exitCode=1;
 const conversation=await win.webContents.executeJavaScript(`new Promise(resolve=>{document.getElementById('new').click();setTimeout(()=>resolve({messages:document.querySelectorAll('.bubble').length,source:document.querySelector('.source summary')?.textContent}),150)})`);
 console.log(JSON.stringify(conversation));
 if(conversation.messages!==2||!conversation.source?.includes('Página 2'))process.exitCode=1;
 win.destroy();app.quit();
}).catch(error=>{console.error(error);process.exitCode=1;app.quit();});
