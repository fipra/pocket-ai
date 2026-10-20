import {t,normalizeLanguage} from './i18n.js';

const $=id=>document.getElementById(id);
const api=window.pocket;
const welcome=$('messages').innerHTML;
let state,active,busy=false,live;
const lang=()=>normalizeLanguage(state?.language);
const tr=(key,values)=>t(lang(),key,values);

function translateDom(root=document){
 for(const node of root.querySelectorAll('[data-i18n]'))node.textContent=tr(node.dataset.i18n);
 for(const node of root.querySelectorAll('[data-i18n-html]'))node.innerHTML=tr(node.dataset.i18nHtml);
 $('prompt').placeholder=tr('message');$('prompt').setAttribute('aria-label',tr('message'));
 $('models').setAttribute('aria-label',tr('model'));
 $('language').setAttribute('aria-label',tr('language'));
 const idea=$('idea'),learn=$('learn');if(idea)idea.dataset.prompt=tr('ideaPrompt');if(learn)learn.dataset.prompt=tr('learnPrompt');
}
function notice(message=''){$('notice').textContent=message;}
async function action(fn){try{await fn();}catch(error){notice(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}}
function lock(value){
 busy=value;
 for(const id of ['new','delete','export','import-docs','load','import-model','models','rag','settings','language'])$(id).disabled=value;
 $('send').disabled=value||!state?.model;$('stop').hidden=!value;
 document.querySelectorAll('#chats button,#docs button').forEach(button=>button.disabled=value);
}
function el(tag,text,cls){const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
function render(){
 document.documentElement.lang=lang();$('language').value=lang();
 $('status').textContent=state.model?'● '+state.model+' · '+tr('local'):tr('noModel');$('root').textContent=state.root;
 $('chats').replaceChildren();for(const chat of state.chats){const button=el('button',chat.title,chat.id===active?'active':'');button.onclick=()=>{if(!busy){active=chat.id;render();}};$('chats').append(button);}
 $('docs').replaceChildren();for(const doc of state.documents){const node=el('div',doc.name,'doc');const button=el('button','×');button.setAttribute('aria-label',tr('remove',{name:doc.name}));button.onclick=()=>action(async()=>{state=await api.call('delete-document',doc.id);render();});node.append(button);$('docs').append(node);}
 const chat=state.chats.find(item=>item.id===active);$('title').textContent=chat?.title||tr('homeTitle');
 if(chat?.messages.length){$('messages').replaceChildren();for(const message of chat.messages)addMessage(message);}else $('messages').innerHTML=welcome;
 translateDom();lock(busy);$('messages').scrollTop=$('messages').scrollHeight;
}
function addMessage(message){
 const node=el('div',null,'bubble '+message.role);node.append(el('div',message.role==='user'?tr('you'):'POCKET AI','who'));
 const body=el('div',message.text);node.append(body);
 for(const [index,source] of (message.sources||[]).entries()){
  const details=el('details',null,'source');details.append(el('summary',`[${index+1}] ${source.name}${source.page?' · '+tr('page')+' '+source.page:''}`),el('div',source.text));node.append(details);
 }
 if(message.interrupted)node.append(el('small',tr('interrupted')));
 $('messages').append(node);return body;
}
function modelHelp(key){$('model-help').dataset.i18n=key;$('model-help').textContent=tr(key);}
async function models(){
 const list=await api.call('models');$('models').replaceChildren();for(const model of list){const option=el('option',model.name);option.value=model.id;$('models').append(option);}
 modelHelp(list.length?'modelReady':'modelMissing');
}

$('settings').onclick=()=>action(async()=>{await models();$('modal').showModal();});
$('close').onclick=()=>$('modal').close();
$('language').onchange=()=>action(async()=>{state=await api.call('set-language',$('language').value);render();});
$('import-model').onclick=()=>action(async()=>{lock(true);modelHelp('copyingModel');try{await api.call('import-model');await models();}finally{lock(false);}});
$('load').onclick=()=>action(async()=>{if(!$('models').value)return;lock(true);modelHelp('loadingModel');try{state=await api.call('load-model',$('models').value);render();$('modal').close();notice();}catch(error){$('model-help').removeAttribute('data-i18n');$('model-help').textContent=error.message;state=await api.call('state');render();throw error;}finally{lock(false);}});
$('new').onclick=()=>action(async()=>{const chat=await api.call('new-chat');state=await api.call('state');active=chat.id;render();});
$('delete').onclick=()=>action(async()=>{if(active&&confirm(tr('deleteConfirm'))){state=await api.call('delete-chat',active);active=state.chats[0]?.id;render();}});
$('export').onclick=()=>action(async()=>{if(active)await api.call('export-chat',active);});
$('import-docs').onclick=()=>action(async()=>{lock(true);notice(tr('readingDocs'));try{const before=state.documents.length;const result=await api.call('import-documents');state=result.state;if(state.documents.length>before)$('rag').checked=true;render();notice(result.errors.length?result.errors.join('\n'):tr(state.documents.length>before?'docImported':'noneImported'));}finally{lock(false);}});
$('stop').onclick=()=>api.call('stop');
api.onToken(({chatId,chunk})=>{if(chatId===active&&live){live.textContent+=chunk;$('messages').scrollTop=$('messages').scrollHeight;}});
$('form').onsubmit=event=>{event.preventDefault();if(busy)return;action(async()=>{const text=$('prompt').value.trim();if(!text||!state.model)return;notice();lock(true);try{if(!active){const chat=await api.call('new-chat');active=chat.id;state=await api.call('state');}if(!state.chats.find(chat=>chat.id===active)?.messages.length)$('messages').replaceChildren();addMessage({role:'user',text});live=addMessage({role:'assistant',text:''});$('prompt').value='';state=await api.call('send',{chatId:active,text,documents:$('rag').checked});}finally{live=null;state=await api.call('state');lock(false);render();}});};
$('prompt').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('form').requestSubmit();}};
document.addEventListener('click',event=>{if(event.target.dataset.prompt){$('prompt').value=event.target.dataset.prompt;$('prompt').focus();}});
$('library').onclick=()=>document.querySelector('.documents').classList.toggle('open');

action(async()=>{state=await api.call('state');active=state.chats[0]?.id;$('rag').checked=state.documents.length>0;render();if(!state.model){await models();$('modal').showModal();}});
