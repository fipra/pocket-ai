import './style.css';
import '../code-view.js';
import * as db from './storage.js';
import { translations, preferredLanguage } from './i18n.js';
import { CATALOG } from './catalog.js';
import { searchModels, estimateMemory, isAuxiliaryGguf } from './hub.js';
import { readDocument, chunks, retrieve } from './retrieval.js';
import { ragContexts, completeWithRetry } from './rag.js';
import { savedModels, downloadCurated, downloadVerified, moveCachedToFolder, addLocalModel, deleteModel, loadModel, loadedModelId, streamChat } from './runtime.js';
import { canSaveToFolder, showModelFolder } from './folder-models.js';
import { usesSafariCpu } from './browser-capability.js';

const $ = id => document.getElementById(id);
let language = preferredLanguage();
let chats = [], documents = [], models = [], activeId, selectedId, useDocs = false, busy = false, controller, installing;
let hubResults = [], hubNext = null, hubSearching = false;
const STARTER_ID = 'llama-3.2-3b-iq3m';
const STARTER_FILE = 'Llama-3.2-3B-Instruct-IQ3_M.gguf';
const isStarterModel = model => model?.id === STARTER_ID || [model?.filename, model?.name, model?.url].some(value => typeof value === 'string' && value.endsWith(STARTER_FILE));
const tr = key => translations[language]?.[key] || translations.en[key] || key;
const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
function setStatus(text = '', error = false, loading = false) { $('status').textContent = text; $('status').classList.toggle('error', error); $('status').classList.toggle('loading', loading); }
function translate() { document.documentElement.lang = language; document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); }); document.querySelectorAll('[data-placeholder]').forEach(element => { element.placeholder = tr(element.dataset.placeholder); }); $('language').value = language; $('stop').ariaLabel = tr('stop'); $('send').ariaLabel = tr('send'); }
function closeSidebar() { $('sidebar').classList.remove('open'); }
function saveSettings() { return db.put('settings', { id: 'main', language, selectedId, useDocs, activeId }); }
function renderChats() { const list = $('chat-list'); list.replaceChildren(); if (!chats.length) list.append(node('p', tr('noChats'), 'empty')); for (const chat of [...chats].sort((a,b) => b.updated - a.updated)) { const button = node('button', chat.title, `chat-item${chat.id === activeId ? ' active' : ''}`); button.onclick = () => { activeId = chat.id; saveSettings(); render(); closeSidebar(); }; list.append(button); } }
function renderMessages() { const box = $('messages'); box.replaceChildren(); const chat = chats.find(item => item.id === activeId); if (!chat?.messages.length) { const welcome = node('div', undefined, 'welcome'); welcome.append(node('div', '✦', 'welcome-mark'), node('h1', tr('welcome')), node('p', models.length ? tr('welcomeNote') : tr(usesSafariCpu() ? 'safariStarterHint' : 'starterHint'))); box.append(welcome); return; } for (const message of chat.messages) { const row = node('article', undefined, `message ${message.role}`); row.append(node('div', message.role === 'user' ? 'U' : '✦', 'avatar')); const content = node('div'); const body = node('div', undefined, 'message-body'); window.USB_AI_CODE_VIEW.render(body, message.text, language); content.append(node('strong', message.role === 'user' ? tr('you') : tr('assistant')), body); if (message.sources?.length) { const details = node('details', undefined, 'source'); details.append(node('summary', `${tr('sources')} (${message.sources.length})`)); for (const source of message.sources) details.append(node('p', `${source.name}: ${source.text}`)); content.append(details); } row.append(content); box.append(row); } $('thread').scrollTop = $('thread').scrollHeight; }
function renderModels() { const catalog = $('catalog'); catalog.replaceChildren(); for (const item of CATALOG) { const saved = models.some(model => model.id === item.id); const card = node('div', undefined, 'model-card'); const info = node('div'); info.append(node('strong', item.name), node('small', `${(item.size/1e6).toFixed(0)} MB · ${item.license}`)); if (item.mobile) info.append(node('small', tr('phoneModel'))); const link = node('a', tr('source')); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(info); if (!saved) { const button = node('button', tr('download'), 'action'); button.disabled = busy || !navigator.onLine; button.onclick = () => run(async () => { setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading'); await downloadCurated(item.id, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }); setStatus(tr('verifying')); models = await savedModels(); renderModels(); await chooseModel(item.id); $('model-progress').textContent = ''; }); card.append(button); } catalog.append(card); }
  const saved = $('saved-models'); saved.replaceChildren(); if (!models.length) saved.append(node('p', tr('chooseModel'), 'hint')); for (const model of models) { const card = node('div', undefined, 'model-card'); const info = node('div'); info.append(node('strong', model.name), node('small', `${(model.size/1e6).toFixed(0)} MB`)); if (model.source === 'directory') info.append(node('small', `${model.folderLabel || 'usb-ai-models'}/${model.filename}`)); else if (model.source === 'download') info.append(node('small', tr('browserCache'))); const invalid = isAuxiliaryGguf(model.filename || model.shards?.[0]?.url || model.url || model.name); if (invalid) info.append(node('small', tr('auxiliaryFile'), 'error')); card.append(info); const actions = node('div', undefined, 'card-actions'); const button = node('button', invalid ? tr('invalidModel') : loadedModelId() === model.id ? tr('loaded') : tr('load'), 'action'); button.disabled = invalid || busy || loadedModelId() === model.id; button.onclick = () => run(() => chooseModel(model.id)); actions.append(button); if (model.source === 'directory' && canSaveToFolder()) { const show = node('button', tr('showFolder'), 'action subtle'); show.disabled = busy; show.onclick = () => run(() => showModelFolder(model)); actions.append(show); } if (model.source === 'download' && canSaveToFolder()) { const move = node('button', tr('saveToFolder'), 'action subtle'); move.disabled = busy || !navigator.onLine; move.onclick = () => run(async () => { setBusy(true); $('model-progress').classList.add('loading'); await moveCachedToFolder(model, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }); models = await savedModels(); $('model-progress').classList.remove('loading'); $('model-progress').textContent = ''; renderModels(); setStatus(tr('savedToFolder')); }); actions.append(move); } const remove = node('button', tr('remove'), 'action subtle'); remove.disabled = busy; remove.onclick = () => run(async () => { if (!confirm(tr(model.source === 'directory' ? 'removeFolderReferenceConfirm' : 'deleteModelConfirm'))) return; await deleteModel(model.id); if (selectedId === model.id) selectedId = undefined; models = await savedModels(); await saveSettings(); render(); }); actions.append(remove); card.append(actions); saved.append(card); } }
function renderDocs() { const box = $('doc-list'); box.replaceChildren(); if (!documents.length) box.append(node('p', tr('noDocs'), 'hint')); for (const doc of documents) { const card = node('div', undefined, 'doc-card'); card.append(node('span', `${doc.name} · ${doc.chunks.length}`)); const button = node('button', tr('remove'), 'action subtle'); button.onclick = () => run(async () => { await db.remove('documents', doc.id); documents = documents.filter(item => item.id !== doc.id); renderDocs(); }); card.append(button); box.append(card); } }
function renderSearch() {
  const box = $('hub-results'); box.replaceChildren();
  for (const item of hubResults) {
    const card = node('div', undefined, 'model-card');
    const info = node('div'); info.append(node('strong', item.name), node('small', `${(item.size/1e6).toFixed(0)} MB · ${item.license}`));
    const memory = estimateMemory(item.size);
    info.append(node('small', tr('memoryEstimate').replace('{minimum}', memory.minimum).replace('{recommended}', memory.recommended)));
    const link = node('a', tr('source')); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(info);
    const installed = models.some(model => model.id === item.id);
    const button = node('button', installed ? tr('load') : tr('download'), 'action');
    button.disabled = busy || (!installed && !navigator.onLine);
    button.onclick = () => run(async () => {
      if (!installed) {
        setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading');
        await downloadVerified(item, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; });
        models = await savedModels();
        $('model-progress').textContent = '';
      }
      await chooseModel(item.id);
    });
    card.append(button); box.append(card);
  }
  $('hub-more').hidden = hubNext == null || hubSearching;
  $('hub-more').disabled = busy;
}
async function searchHub(skip = 0) {
  if (hubSearching) return;
  const query = $('hub-query').value.trim();
  hubSearching = true; $('hub-status').textContent = tr('searching');
  if (skip === 0) { hubResults = []; hubNext = null; renderSearch(); }
  try {
    const result = await searchModels(query, skip);
    hubResults.push(...result.models.filter(model => !hubResults.some(existing => existing.name.toLowerCase() === model.name.toLowerCase()))); hubNext = result.nextSkip;
    $('hub-status').textContent = hubResults.length ? '' : tr('noResults');
  } catch (error) { $('hub-status').textContent = `${tr('error')}: ${error.message}`; }
  finally { hubSearching = false; renderSearch(); }
}
function render() { translate(); renderChats(); renderMessages(); renderModels(); renderSearch(); renderDocs(); $('model-trigger').textContent = `${models.find(model => model.id === selectedId)?.name || tr('chooseModel')} ⌄`; $('send').disabled = busy; $('stop').hidden = !controller; $('use-docs').classList.toggle('on', useDocs); $('use-docs').textContent = useDocs ? `▣ ${tr('useDocs')}` : `▤ ${tr('useDocs')}`; $('capability').textContent = `${navigator.gpu ? tr('capabilityGpu') : tr('capabilityWasm')} · ${navigator.onLine ? tr('private') : tr('offline')}`; $('folder-hint').textContent = tr(canSaveToFolder() ? 'folderHint' : 'folderFallbackHint'); }
function setBusy(value) { busy = value; render(); }
async function run(callback) { try { await callback(); } catch (error) { if (error.name === 'AbortError') { $('model-progress').classList.remove('loading'); $('model-progress').textContent = ''; setStatus(); return; } console.error(error); const message = error.message === 'SMARTPHONE_DISABLED' ? tr('phoneUnavailable') : error.message === 'MODEL_FILE_PERMISSION' ? tr('folderPermission') : error.message === 'AUXILIARY_GGUF' ? tr('auxiliaryFile') : error.message === 'LOAD_TIMEOUT' ? tr('loadTimeout') : error.message === 'DOCUMENT_NO_TEXT' ? tr('documentNoText') : /QuotaExceeded|storage|no space/i.test(error.name + ' ' + error.message) ? tr('storageError') : error.message; setStatus(`${tr('error')}: ${message}`, true); $('model-progress').classList.remove('loading'); $('model-progress').textContent = `${tr('error')}: ${message}`; } finally { if (busy && !controller) setBusy(false); } }
async function chooseModel(id) {
  if (busy && controller) return;
  setBusy(true);
  setStatus(tr('loading'), false, true);
  const progress = $('model-progress');
  progress.classList.add('loading');
  progress.textContent = tr('loading');
  const started = Date.now();
  const elapsed = setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    progress.textContent = `${tr('loading')} ${seconds} s${seconds >= 60 ? ` · ${tr('loadSlow')}` : ''}`;
    setStatus(progress.textContent, false, true);
  }, 1000);
  try {
    await loadModel(id);
    selectedId = id;
    await saveSettings();
    setStatus(tr('ready'));
    progress.textContent = '';
    if ($('models-dialog').open) $('models-dialog').close();
  } finally {
    clearInterval(elapsed);
    progress.classList.remove('loading');
    setBusy(false);
  }
}
async function newChat() { const chat = { id: crypto.randomUUID(), title: tr('newChat').replace('＋ ',''), messages: [], updated: Date.now() }; chats.unshift(chat); activeId = chat.id; await db.put('chats', chat); await saveSettings(); render(); closeSidebar(); $('prompt').focus(); }
async function send() {
  const text = $('prompt').value.trim();
  if (!text || busy) return;
  if (!selectedId) {
    const starter = models.find(isStarterModel);
    if (starter) {
      await chooseModel(starter.id);
    } else if (navigator.onLine) {
      const id = usesSafariCpu() || navigator.deviceMemory && navigator.deviceMemory < 4 ? 'qwen-0.5b' : STARTER_ID;
      setBusy(true);
      setStatus(tr('starterDownloading'), false, true);
      $('model-progress').classList.add('loading');
      await downloadCurated(id, ({ loaded, total }) => {
        const progress = `${tr('starterDownloading')} ${Math.floor(loaded / total * 100)}%`;
        $('model-progress').textContent = progress;
        setStatus(progress, false, true);
      });
      models = await savedModels();
      await chooseModel(id);
    } else {
      $('models-dialog').showModal();
      setStatus(tr('noModel'), true);
      return;
    }
  }
  let chat = chats.find(item => item.id === activeId);
  if (!chat) { await newChat(); chat = chats.find(item => item.id === activeId); }
  const sources = useDocs ? retrieve(text, documents, 3) : [];
  const contexts = ragContexts(chat.messages, text, sources);
  const answer = { role:'assistant', text:'', sources: sources.map(({name,text}) => ({name,text})) };
  chat.messages.push({ role:'user', text }, answer);
  chat.title = chat.messages.find(message => message.role === 'user')?.text.slice(0,55) || chat.title;
  chat.updated = Date.now();
  $('prompt').value = '';
  controller = new AbortController();
  setBusy(true); setStatus(tr('generating'), false, true); renderMessages();
  try {
    if (loadedModelId() !== selectedId) {
      setStatus(tr('loading'), false, true);
      await loadModel(selectedId);
      setStatus(tr('generating'), false, true);
    }
    await completeWithRetry(contexts, streamChat, token => {
      answer.text += token;
      const body = $('messages').lastElementChild?.querySelector('.message-body');
      if (body) { window.USB_AI_CODE_VIEW.render(body, answer.text, language); $('thread').scrollTop = $('thread').scrollHeight; }
    }, controller.signal, () => {
      answer.text = '';
      setStatus(tr('retryingAnswer'));
    });
    setStatus(controller.signal.aborted ? tr('stopped') : tr('ready'));
  } catch (error) {
    if (!controller.signal.aborted) {
      const message = error.message === 'EMPTY_MODEL_RESPONSE' ? tr('emptyResponse') : error.message === 'GENERATION_TIMEOUT' ? tr('safariGenerationTimeout') : `${tr('error')}: ${error.message}`;
      answer.text ||= message;
      setStatus(message, true);
    }
  } finally {
    controller = undefined;
    chat.updated = Date.now();
    await db.put('chats', chat);
    setBusy(false); render();
  }
}
async function init() { try { const settings = await db.get('settings','main'); language = settings?.language || preferredLanguage(); selectedId = settings?.selectedId; activeId = settings?.activeId; useDocs = !!settings?.useDocs; [chats, documents, models] = await Promise.all([db.all('chats'), db.all('documents'), savedModels()]); if (isAuxiliaryGguf(models.find(model => model.id === selectedId)?.filename || models.find(model => model.id === selectedId)?.url || '')) { selectedId = undefined; await saveSettings(); } if (!chats.some(chat => chat.id === activeId)) activeId = chats[0]?.id; if (!models.some(model => model.id === selectedId)) selectedId = models.find(isStarterModel)?.id; render(); if (isStarterModel(models.find(model => model.id === selectedId))) await run(() => chooseModel(selectedId)); } catch (error) { setStatus(`${tr('error')}: ${error.message}`, true); } }
$('prompt-form').onsubmit = event => { event.preventDefault(); run(send); };
$('prompt').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('prompt-form').requestSubmit(); } };
$('stop').onclick = () => controller?.abort();
$('new-chat').onclick = () => run(newChat);
$('menu').onclick = () => $('sidebar').classList.toggle('open');
for (const id of ['models-open','model-trigger']) $(id).onclick = () => { closeSidebar(); $('models-dialog').showModal(); };
$('docs-open').onclick = () => { closeSidebar(); $('docs-dialog').showModal(); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
$('language').onchange = () => { language = $('language').value; saveSettings(); render(); };
$('use-docs').onclick = () => { useDocs = !useDocs; saveSettings(); render(); };
$('model-file').onchange = event => run(async () => { const files = [...event.target.files]; event.target.value = ''; const result = await addLocalModel(files); models = await savedModels(); if (!result.persistent) models.push({ id:result.id, name:result.name, size:files.reduce((n,f) => n+f.size,0) }); renderModels(); setStatus(result.persistent ? tr('modelSaved') : tr('modelSession')); await chooseModel(result.id); });
$('hub-search-form').onsubmit = event => { event.preventDefault(); searchHub(); };
$('hub-more').onclick = () => searchHub(hubNext);
$('doc-file').onchange = event => run(async () => {
  const files = [...event.target.files];
  event.target.value = '';
  $('doc-status').textContent = tr('readingDocument');
  try {
    for (const file of files) {
      const text = await readDocument(file);
      const parts = chunks(text);
      const doc = { id:crypto.randomUUID(), name:file.name, chunks:parts, updated:Date.now() };
      await db.put('documents', doc);
      documents.push(doc);
    }
    useDocs = true;
    await saveSettings(); render();
    const message = tr('documentReady').replace('{count}', files.length);
    $('doc-status').textContent = message;
    $('docs-dialog').close();
    setStatus(message);
    $('prompt').focus();
  } catch (error) {
    $('doc-status').textContent = error.message === 'DOCUMENT_NO_TEXT' ? tr('documentNoText') : `${tr('error')}: ${error.message}`;
    throw error;
  }
});
$('delete-chat').onclick = () => run(async () => { if (!activeId || !confirm(tr('deleteConfirm'))) return; await db.remove('chats', activeId); chats = chats.filter(chat => chat.id !== activeId); activeId = chats[0]?.id; await saveSettings(); render(); });
$('export-chat').onclick = () => { const chat = chats.find(item => item.id === activeId); if (!chat) return; const content = chat.messages.map(item => `## ${item.role === 'user' ? tr('you') : tr('assistant')}\n\n${item.text}`).join('\n\n'); const url = URL.createObjectURL(new Blob([content], {type:'text/markdown'})); const link = node('a'); link.href = url; link.download = 'usb-ai-chat.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installing = event; });
$('install').onclick = async () => { if (installing) { installing.prompt(); await installing.userChoice; installing = undefined; $('install').hidden = true; } else setStatus(tr('installUnavailable')); };
window.addEventListener('online', render); window.addEventListener('offline', render);
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.warn);
init();
