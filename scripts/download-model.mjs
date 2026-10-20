import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo='Qwen/Qwen2.5-0.5B-Instruct-GGUF';
const revision='9217f5db79a29953eb74d5343926648285ec7e67';
const name='qwen2.5-0.5b-instruct-q4_k_m.gguf';
const dir=path.join(root,'models');await fs.mkdir(dir,{recursive:true});
const destination=path.join(dir,name),temp=destination+'.part';
async function modelAlreadyReady(){
 try{
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'model-manifest.json'),'utf8'));
  if(manifest.repo!==repo||manifest.revision!==revision||manifest.file!==name||!Number.isSafeInteger(manifest.size)||!(/^[a-f0-9]{64}$/i).test(manifest.sha256))return false;
  await Promise.all([fs.access(path.join(dir,'QWEN-LICENSE.txt')),fs.access(path.join(dir,'QWEN-MODEL-CARD.md'))]);
  if((await fs.stat(destination)).size!==manifest.size)return false;
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(destination))hash.update(chunk);
  return hash.digest('hex').toLowerCase()===manifest.sha256.toLowerCase();
 }catch{return false;}
}
async function download(file,target){
 const response=await fetch(`https://huggingface.co/${repo}/resolve/${revision}/${file}`,{signal:AbortSignal.timeout(30*60*1000)});
 if(!response.ok)throw Error(`Download ${file}: HTTP ${response.status}`);
 const out=await fs.open(target,'w');const hash=createHash('sha256');let size=0,last=0;
 try{for await(const chunk of response.body){await out.write(chunk);hash.update(chunk);size+=chunk.length;if(size-last>25*1024*1024){console.log(`${Math.round(size/1024/1024)} MiB`);last=size;}}}finally{await out.close();}
 return {size,sha256:hash.digest('hex')};
}
try{
 if(await modelAlreadyReady()){
  console.log('Modello gia presente e verificato: '+destination);
  process.exit(0);
 }
 console.log('Download iniziale del modello ufficiale Qwen 0.5B. Dopo il packaging, gli utenti non devono scaricarlo.');
 const metadata=await download(name,temp);
 const handle=await fs.open(temp);const header=Buffer.alloc(4);try{await handle.read(header,0,4,0);}finally{await handle.close();}
 if(header.toString()!=='GGUF'||metadata.size<100000000)throw Error('File GGUF incompleto o non valido');
 await download('LICENSE',path.join(dir,'QWEN-LICENSE.txt'));
 await download('README.md',path.join(dir,'QWEN-MODEL-CARD.md'));
 await fs.rename(temp,destination);
 await fs.writeFile(path.join(dir,'model-manifest.json'),JSON.stringify({repo,revision,file:name,...metadata},null,2));
 console.log('Modello pronto: '+destination);
}catch(e){await fs.rm(temp,{force:true});console.error(e.message);process.exitCode=1;}
