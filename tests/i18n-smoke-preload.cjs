const {contextBridge}=require('electron');
let language='en';
let chats=[];
contextBridge.exposeInMainWorld('pocket',{
 call:async (name,...args)=>{
  if(name==='set-language'){language=args[0];}
  if(name==='new-chat'){const chat={id:'test',title:'Test',messages:[{role:'user',text:'Hello'},{role:'assistant',text:'Hello',sources:[{name:'guide.pdf',page:2,text:'Example'}]}]};chats=[chat];return chat;}
  if(name==='state'||name==='set-language')return {chats,documents:[],model:'',root:'test',language};
  if(name==='models')return [];
  throw Error('Unexpected call: '+name);
 },
 onToken:()=>()=>{}
});
