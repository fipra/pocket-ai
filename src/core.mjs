import fs from 'node:fs/promises';
import path from 'node:path';
export async function readJSON(file, fallback) {
 try { return JSON.parse(await fs.readFile(file,'utf8')); }
 catch(e) { if(e.code==='ENOENT') return fallback; throw new Error(`Workspace cannot be read: ${file}. Keep the file and restore a backup.`,{cause:e}); }
}
export async function writeJSON(file,data) {
 await fs.mkdir(path.dirname(file),{recursive:true});
 const tmp=file+'.tmp'; await fs.writeFile(tmp,JSON.stringify(data,null,2)); await fs.rename(tmp,file);
}
const stop=new Set('il lo la i gli le di a da in con su per tra fra un una uno e o che sono come cosa quale quali del della dei delle nel nella the a an is are of and to what who where when how can my me please do does this that for in on with from der die das den dem des ein eine einer einem einen und oder ist sind was wie wer wo wann von mit fuer fur im am zu zum zur the le la les un une des du de et ou est sont qui quoi que quel quelle quels quelles dans sur pour avec ce cette ces el los las un una unos unas de del y o es son que quien como donde cuando para por con mi mis en este esta estos estas'.split(' '));
export function terms(s){return (s.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>1&&!stop.has(t));}
export function chunks(text,size=900,overlap=120){
 text=text.replace(/\s+/g,' ').trim(); const out=[];
 for(let i=0;i<text.length;i+=size-overlap) {out.push(text.slice(i,i+size)); if(i+size>=text.length)break;} return out;
}
const equivalents={password:['passwort','kennwort','contrasena','passe'],passwort:['password','kennwort','contrasena','passe'],kennwort:['password','passwort'],contrasena:['password','passwort'],passe:['password','passwort'],portale:['portal','portail'],portal:['portale','portail'],portail:['portal','portale']};
export function retrieve(query,documents,limit=4){
 const q=[...new Set(terms(query).flatMap(t=>[t,...(equivalents[t]||[])]))]; if(!q.length)return [];
 const rows=documents.flatMap(d=>d.chunks.map(c=>({...c,name:d.name,docId:d.id})));
 const tokenized=rows.map(c=>terms(c.text+' '+c.name)); const avg=tokenized.reduce((s,t)=>s+t.length,0)/Math.max(rows.length,1);
 const df=q.map(t=>tokenized.filter(ts=>ts.includes(t)).length);
 const matches=rows.map((c,i)=>({...c,score:q.reduce((s,t,j)=>{const tf=tokenized[i].filter(x=>x===t).length;return s+Math.log(1+(rows.length-df[j]+.5)/(df[j]+.5))*tf*2.2/(tf+1.2*(.25+.75*tokenized[i].length/(avg||1)));},0)})).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
 if(matches.length)return matches;
 const overview=terms(query).some(term=>['document','dokument','docu','file','pdf','testo','text','texte','texto','summar','summary','riassum','zusammenfass','resum','parla','about','worum','inhalt','contient','contiene','contains','trata','leggi','leggere','read','lies','lesen','lis','analiz','analys','analisi','spieg','explain','descriv','describ','sintes','synthes','argoment','topic','dice','scritto','contenut','punti'].some(prefix=>term.startsWith(prefix)));
 if(documents.length>=1&&overview){const lastDoc=documents.at(-1);return (documents.length===1?rows:rows.filter(r=>r.docId===lastDoc.id)).slice(0,limit);}
 return [];
}
export function historyForModel(messages,system){return [{type:'system',text:system},...messages.slice(-8).map(m=>m.role==='user'?{type:'user',text:m.text}:{type:'model',response:[m.text]})];}
