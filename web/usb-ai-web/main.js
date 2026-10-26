import './style.css';
import '../code-view.js';
import '../message-markdown.css';
import '../response-view.css';
import '../response-view.js';
import * as db from './storage.js';
import { translations, preferredLanguage } from './i18n.js';
import { CATALOG } from './catalog.js';
import { searchModels, estimateMemory, isAuxiliaryGguf, WEB_FILE_LIMIT } from './hub.js';
import { readDocument, chunks, retrieve, documentsForChat } from './retrieval.js';
import { ragContexts, completeWithRetry } from './rag.js';
import { savedModels, downloadCurated, downloadVerified, moveCachedToFolder, addLocalModel, addModelsFromFolder, deleteModel, loadModel, loadedModelId, streamChat } from './runtime.js';
import { canSaveToFolder, showModelFolder } from './folder-models.js';
import { usesSafariCpu, needsSafariFallback, largeModelWarningBrowser } from './browser-capability.js';
import { browserHardware, modelGuidance, recommendedModel } from './model-guidance.js';
import { memoryContext, memoryMarkdown, parseMemoryMarkdown, rememberRequest, memoryCommand, identityMemoryNotes } from './memory.js';
import { splitGgufFile } from './gguf-split.js';

const $ = id => document.getElementById(id);
let language = preferredLanguage();
let chats = [], documents = [], models = [], memories = [], activeId, selectedId, busy = false, controller, installing;
let pendingMemoryPrompt = null;
let thinking = false;
let hubResults = [], hubNext = null, hubSearching = false;
let pendingFirstPrompt = false;
let splitSourceFile, splitController;
const STARTER_ID = 'llama-3.2-3b-iq3m';
const STARTER_FILE = 'Llama-3.2-3B-Instruct-IQ3_M.gguf';
const isStarterModel = model => model?.id === STARTER_ID || [model?.filename, model?.name, model?.url].some(value => typeof value === 'string' && value.endsWith(STARTER_FILE));
const tr = key => translations[language]?.[key] || translations.en[key] || key;
function renderBrowserModelWarning() {
  const browser = largeModelWarningBrowser();
  for (const id of ['browser-model-warning', 'models-browser-warning']) {
    const warning = $(id);
    warning.hidden = !browser;
    if (browser) warning.textContent = tr(`${browser}LargeModelsUnsupported`);
  }
}
const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
const modelSize = bytes => bytes >= 1e9 ? `${(bytes/1e9).toFixed(2)} GB` : `${(bytes/1e6).toFixed(0)} MB`;
function setStatus(text = '', error = false, loading = false) { $('status').textContent = text; $('status').classList.toggle('error', error); $('status').classList.toggle('loading', loading); }
function translate() { document.documentElement.lang = language; document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); }); document.querySelectorAll('[data-placeholder]').forEach(element => { element.placeholder = tr(element.dataset.placeholder); }); $('language').value = language; $('stop').ariaLabel = tr('stop'); $('send').ariaLabel = tr('send'); }
function closeSidebar() { $('sidebar').classList.remove('open'); }
function saveSettings() { return db.put('settings', { id: 'main', language, selectedId, activeId, thinking }); }
function renderChats() { const list = $('chat-list'); list.replaceChildren(); if (!chats.length) list.append(node('p', tr('noChats'), 'empty')); for (const chat of [...chats].sort((a,b) => b.updated - a.updated)) { const button = node('button', chat.title, `chat-item${chat.id === activeId ? ' active' : ''}`); button.onclick = () => { activeId = chat.id; saveSettings(); render(); closeSidebar(); }; list.append(button); } }
function renderMessages() { const box = $('messages'); box.replaceChildren(); const chat = chats.find(item => item.id === activeId); if (!chat?.messages.length) { const welcome = node('div', undefined, 'welcome'); welcome.append(node('div', '✦', 'welcome-mark'), node('h1', tr('welcome')), node('p', models.length ? tr('welcomeNote') : tr(usesSafariCpu() ? 'safariStarterHint' : 'starterHint'))); box.append(welcome); return; } for (const message of chat.messages) { const row = node('article', undefined, `message ${message.role}`); row.append(node('div', message.role === 'user' ? 'U' : '✦', 'avatar')); const content = node('div'); const body = node('div', undefined, 'message-body'); if (message.role === 'assistant') window.USB_AI_RESPONSE_VIEW.render(body, message, language, thinking); else window.USB_AI_CODE_VIEW.render(body, message.text, language); content.append(node('strong', message.role === 'user' ? tr('you') : tr('assistant')), body); if (message.role === 'assistant' && message.text) { const correction = node('button', tr('rememberCorrection'), 'memory-correction'); correction.onclick = () => { pendingMemoryPrompt = null; $('memory-id').value = ''; $('memory-text').value = ''; $('memory-dialog').showModal(); $('memory-text').focus(); }; content.append(correction); } if (message.sources?.length) { const details = node('details', undefined, 'source'); details.append(node('summary', `${tr('sources')} (${message.sources.length})`)); for (const source of message.sources) details.append(node('p', `${source.name}: ${source.text}`)); content.append(details); } row.append(content); box.append(row); } $('thread').scrollTop = $('thread').scrollHeight; }
function appendModelAdvice(info, model, hardware, recommended = false) {
  const advice = modelGuidance(model, hardware);
  const detail = tr(advice.reason).replace('{minimum}', advice.memory.minimum).replace('{recommended}', advice.memory.recommended);
  info.append(node('small', (recommended ? tr('deviceChoice') + ' · ' : '') + detail, 'model-advice ' + advice.fit));
}
function renderModels() {
  const hardware = browserHardware();
  const best = recommendedModel(CATALOG, hardware);
  const summary = $('hardware-advice');
  summary.replaceChildren(node('strong', tr('hardwareAdviceTitle')));
  const hardwareText = hardware.ramGb === null ? tr('browserRamUnknown') : tr('browserHardware').replace('{ram}', hardware.ramGb).replace('{cores}', hardware.cores ?? '?');
  summary.append(node('span', hardwareText + (best ? ' ' + tr('hardwareAdviceChoice').replace('{model}', best.name) : '')));
  const catalog = $('catalog'); catalog.replaceChildren(); for (const item of CATALOG) { const saved = models.some(model => model.id === item.id); const card = node('div', undefined, 'model-card'); const info = node('div'); info.append(node('strong', item.name), node('small', `${(item.size/1e6).toFixed(0)} MB · ${item.license}`)); appendModelAdvice(info, item, hardware, best?.id === item.id); if (item.mobile) info.append(node('small', tr('phoneModel'))); const link = node('a', tr('source')); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(info); if (!saved) { const button = node('button', tr('download'), 'action'); button.disabled = busy || !navigator.onLine; button.onclick = () => run(async () => { setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading'); await downloadCurated(item.id, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }); setStatus(tr('verifying')); models = await savedModels(); renderModels(); await chooseModel(item.id); $('model-progress').textContent = ''; }); card.append(button); } catalog.append(card); }
  const saved = $('saved-models'); saved.replaceChildren(); if (!models.length) saved.append(node('p', tr('chooseModel'), 'hint')); for (const model of models) { const card = node('div', undefined, 'model-card'); const info = node('div'); info.append(node('strong', model.name), node('small', modelSize(model.size))); const partCount = model.shards?.length || model.fileHandles?.length || model.files?.length || 1; if (partCount > 1) info.append(node('small', tr('splitParts').replace('{count}', partCount), 'split-parts')); appendModelAdvice(info, model, hardware); if (model.source === 'directory') info.append(node('small', `${model.folderLabel || 'usb-ai-models'}/${model.filename}`)); else if (model.source === 'download') info.append(node('small', tr('browserCache'))); const invalid = isAuxiliaryGguf(model.filename || model.shards?.[0]?.url || model.url || model.name); if (invalid) info.append(node('small', tr('auxiliaryFile'), 'error')); const needsSplit = model.source === 'directory' && Number(model.size) > WEB_FILE_LIMIT && (model.fileHandles?.length || 1) === 1 || model.source === 'file' && (model.files || []).some(file => file.size > WEB_FILE_LIMIT); if (needsSplit) info.append(node('small', tr('modelNeedsSplit'), 'error')); card.append(info); const actions = node('div', undefined, 'card-actions'); const button = node('button', invalid ? tr('invalidModel') : needsSplit ? tr('splitRequired') : loadedModelId() === model.id ? tr('loaded') : tr('load'), 'action'); button.disabled = invalid || needsSplit || busy || loadedModelId() === model.id; button.onclick = () => run(() => chooseModel(model.id)); actions.append(button); if (model.source === 'directory' && canSaveToFolder()) { const show = node('button', tr('showFolder'), 'action subtle'); show.disabled = busy; show.onclick = () => run(() => showModelFolder(model)); actions.append(show); } if (model.source === 'download' && canSaveToFolder()) { const move = node('button', tr('saveToFolder'), 'action subtle'); move.disabled = busy || !navigator.onLine; move.onclick = () => run(async () => { setBusy(true); $('model-progress').classList.add('loading'); await moveCachedToFolder(model, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }); models = await savedModels(); $('model-progress').classList.remove('loading'); $('model-progress').textContent = ''; renderModels(); setStatus(tr('savedToFolder')); }); actions.append(move); } const remove = node('button', tr('remove'), 'action subtle'); remove.disabled = busy; remove.onclick = () => run(async () => { if (!confirm(tr(model.source === 'directory' ? 'removeFolderReferenceConfirm' : 'deleteModelConfirm'))) return; await deleteModel(model.id); if (selectedId === model.id) selectedId = undefined; models = await savedModels(); await saveSettings(); render(); }); actions.append(remove); card.append(actions); saved.append(card); } }
function renderAttachments() { const box = $('chat-attachments'); box.replaceChildren(); for (const doc of documentsForChat(documents, activeId)) { const chip = node('button', '📄 ' + doc.name, 'attachment-chip'); chip.type = 'button'; chip.title = tr('documents'); chip.onclick = () => { renderDocs(); $('docs-dialog').showModal(); }; box.append(chip); } }
function renderDocs() { const box = $('doc-list'), legacy = $('legacy-doc-list'); box.replaceChildren(); legacy.replaceChildren(); const current = documentsForChat(documents, activeId); if (!current.length) box.append(node('p', tr('noChatDocs'), 'hint')); for (const doc of current) { const card = node('div', undefined, 'doc-card'); card.append(node('span', `${doc.name} · ${doc.chunks.length}`)); const button = node('button', tr('remove'), 'action subtle'); button.onclick = () => run(async () => { await db.remove('documents', doc.id); documents = documents.filter(item => item.id !== doc.id); render(); }); card.append(button); box.append(card); } const old = documents.filter(doc => !doc.chatId); if (old.length) { legacy.append(node('h3', tr('legacyDocs'))); for (const doc of old) { const card = node('div', undefined, 'doc-card'); card.append(node('span', doc.name)); const attach = node('button', tr('attachToChat'), 'action subtle'); attach.onclick = () => run(async () => { if (!activeId) await newChat(); doc.chatId = activeId; await db.put('documents', doc); render(); }); const remove = node('button', tr('remove'), 'action subtle'); remove.onclick = () => run(async () => { await db.remove('documents', doc.id); documents = documents.filter(item => item.id !== doc.id); render(); }); card.append(attach, remove); legacy.append(card); } } }
function renderMemory() {
  const box = $('memory-list'); box.replaceChildren();
  if (!memories.length) box.append(node('p', tr('memoryEmpty'), 'hint'));
  for (const memory of [...memories].sort((a,b) => b.updated - a.updated)) {
    const row = node('div', undefined, 'memory-item');
    const text = node('p', memory.text);
    const edit = node('button', tr('memoryEdit'), 'action subtle');
    edit.onclick = () => { $('memory-id').value = memory.id; $('memory-text').value = memory.text; $('memory-text').focus(); };
    const remove = node('button', tr('remove'), 'action subtle');
    remove.onclick = () => run(async () => { await db.remove('memory', memory.id); memories = memories.filter(item => item.id !== memory.id); renderMemory(); });
    row.append(text, edit, remove); box.append(row);
  }
}
function renderSearch() {
  const box = $('hub-results'); box.replaceChildren();
  for (const item of hubResults) {
    const card = node('div', undefined, 'model-card');
    const info = node('div'); info.append(node('strong', item.name), node('small', `${modelSize(item.size)} · ${item.license}`));
    if (item.filename) info.append(node('small', item.filename));
    if (item.shards?.length) info.append(node('small', tr('splitParts').replace('{count}', item.shards.length), 'split-parts'));
    const memory = estimateMemory(item.size);
    info.append(node('small', tr('memoryEstimate').replace('{minimum}', memory.minimum).replace('{recommended}', memory.recommended)));
    if (item.shards?.length && item.size > WEB_FILE_LIMIT) info.append(node('small', tr(canSaveToFolder() ? 'largeModelFolder' : 'largeModelCache'), 'model-advice'));
    appendModelAdvice(info, item, browserHardware());
    const link = node('a', tr('source')); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(info);
    const installed = models.some(model => model.id === item.id);
    const button = node('button', installed ? tr('load') : tr('download'), 'action');
    button.disabled = busy || (!installed && !navigator.onLine);
    button.onclick = () => run(async () => {
      if (!installed) {
        setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading');
        await downloadVerified(item, ({loaded,total,part,parts}) => { $('model-progress').textContent = `${tr('downloading')} ${part ? `${part}/${parts} · ` : ''}${Math.round(loaded/total*100)}%`; });
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
    $('hub-status').textContent = hubResults.length ? '' : result.oversizedCount ? tr('noSplitRelease') : tr('noResults');
  } catch (error) { $('hub-status').textContent = `${tr('error')}: ${error.message}`; }
  finally { hubSearching = false; renderSearch(); }
}
function render() { translate(); $('thinking-toggle').textContent = tr(thinking ? 'thinkingOn' : 'thinkingOff'); $('thinking-toggle').setAttribute('aria-pressed', String(thinking)); $('thinking-toggle').classList.toggle('on', thinking); renderBrowserModelWarning(); renderChats(); renderMessages(); if ($('models-dialog').open) { renderModels(); renderSearch(); } if ($('docs-dialog').open) renderDocs(); if ($('memory-dialog').open) renderMemory(); $('model-trigger').textContent = `${models.find(model => model.id === selectedId)?.name || tr('chooseModel')} ⌄`; $('send').disabled = busy; $('stop').hidden = !controller; $('attach-files').ariaLabel = tr('attachFiles'); $('attach-files').title = tr('attachFiles'); renderAttachments(); $('capability').textContent = `${navigator.gpu ? tr('capabilityGpu') : tr('capabilityWasm')} · ${navigator.onLine ? tr('private') : tr('offline')}`; $('folder-hint').textContent = tr(canSaveToFolder() ? 'folderHint' : 'folderFallbackHint'); $('choose-folder').hidden = !canSaveToFolder(); $('first-model-choice').hidden = !pendingFirstPrompt; $('download-starter-model').disabled = busy || !navigator.onLine; $('split-start').disabled = !splitSourceFile || busy || !canSaveToFolder(); $('split-cancel').hidden = !splitController; if (!canSaveToFolder()) $('split-progress').textContent = tr('splitBrowserUnavailable'); }
function setBusy(value) {
  busy = value;
  $('send').disabled = value;
  $('stop').hidden = !controller;
  if ($('models-dialog').open) { renderModels(); renderSearch(); }
}
async function run(callback) { try { await callback(); } catch (error) { if (error.name === 'AbortError') { $('model-progress').classList.remove('loading'); $('model-progress').textContent = ''; setStatus(); return; } console.error(error); const message = error.message === 'SMARTPHONE_DISABLED' ? tr('phoneUnavailable') : error.message === 'MODEL_FILE_PERMISSION' ? tr('folderPermission') : error.message === 'NO_GGUF_IN_FOLDER' ? tr('noModelsInFolder') : error.message === 'INCOMPLETE_SHARDS' ? tr('incompleteShards') : error.message === 'AUXILIARY_GGUF' ? tr('auxiliaryFile') : error.message === 'MODEL_NEEDS_SPLIT' ? tr('modelNeedsSplit') : error.message === 'MODEL_STORAGE_LOW' ? tr('modelStorageLow') : error.message === 'LOAD_TIMEOUT' ? tr('loadTimeout') : error.message === 'DOCUMENT_NO_TEXT' ? tr('documentNoText') : /QuotaExceeded|storage|no space/i.test(error.name + ' ' + error.message) ? tr('storageError') : error.message; setStatus(`${tr('error')}: ${message}`, true); $('model-progress').classList.remove('loading'); $('model-progress').textContent = `${tr('error')}: ${message}`; } finally { if (busy && !controller) setBusy(false); } }
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
  let loaded = false;
  try {
    await loadModel(id);
    selectedId = id;
    loaded = true;
    await saveSettings();
    setStatus(tr('ready'));
    progress.textContent = '';
    if ($('models-dialog').open) $('models-dialog').close();
  } finally {
    clearInterval(elapsed);
    progress.classList.remove('loading');
    setBusy(false);
    render();
  }
  if (loaded && pendingFirstPrompt) { pendingFirstPrompt = false; await send(); }
}
async function newChat() { const chat = { id: crypto.randomUUID(), title: tr('newChat').replace('＋ ',''), messages: [], updated: Date.now() }; chats.unshift(chat); activeId = chat.id; await db.put('chats', chat); await saveSettings(); render(); closeSidebar(); $('prompt').focus(); }
async function send() {
  const text = $('prompt').value.trim();
  if (!text || busy) return;
  const command = memoryCommand(text);
  const note = command ?? rememberRequest(text);
  if (note !== null) {
    pendingMemoryPrompt = text;
    $('memory-id').value = '';
    $('memory-text').value = note;
    renderMemory();
    $('memory-dialog').showModal();
    $('memory-text').focus();
    return;
  }
  const directNotes = documentsForChat(documents, activeId).length ? [] : identityMemoryNotes(text, memories);
  if (directNotes.length) {
    let chat = chats.find(item => item.id === activeId);
    if (!chat) { await newChat(); chat = chats.find(item => item.id === activeId); }
    const reply = `${tr('memoryRecallIntro')}\n${directNotes.map(item => `- ${item.text}`).join('\n')}\n${tr('memoryRecallLimit')}`;
    chat.messages.push({ role:'user', text }, { role:'assistant', text:reply });
    chat.title = chat.messages.find(message => message.role === 'user')?.text.slice(0,55) || chat.title;
    chat.updated = Date.now();
    await db.put('chats', chat);
    $('prompt').value = '';
    setStatus(tr('ready'));
    render();
    return;
  }
  if (!selectedId) {
    const starter = usesSafariCpu() ? models.find(model => model.id === 'qwen-0.5b') : models.find(isStarterModel);
    if (starter) {
      await chooseModel(starter.id);
    } else {
      pendingFirstPrompt = true;
      render();
      renderModels(); renderSearch();
      $('models-dialog').showModal();
      setStatus(tr('firstModelTitle'));
      return;
    }
  }
  let chat = chats.find(item => item.id === activeId);
  if (!chat) { await newChat(); chat = chats.find(item => item.id === activeId); }
  const chatDocuments = documentsForChat(documents, chat.id);
  const sources = chatDocuments.length ? retrieve(text, chatDocuments, 3) : [];
  const hasNewDocument = chatDocuments.some(doc => (doc.updated || 0) >= (chat.updated || 0));
  const contexts = ragContexts(hasNewDocument ? [] : chat.messages, text, sources);
  for (const context of contexts) context.unshift({ role:'system', content: thinking ? 'If the model supports reasoning, put intermediate thinking in <think>...</think> and then give a clear final answer.' : 'Answer directly. Do not show intermediate reasoning or <think> content.' });
  const remembered = memoryContext(text, memories);
  if (remembered) for (const context of contexts) context.unshift({ role:'system', content:remembered });
  const answer = { role:'assistant', text:'', sources: sources.map(({name,text}) => ({name,text})) };
  chat.messages.push({ role:'user', text }, answer);
  chat.title = chat.messages.find(message => message.role === 'user')?.text.slice(0,55) || chat.title;
  chat.updated = Date.now();
  $('prompt').value = '';
  controller = new AbortController();
  setBusy(true); setStatus(tr('generating'), false, true); renderMessages();
  const body = $('messages').lastElementChild?.querySelector('.message-body');
  const streamView = body && window.USB_AI_RESPONSE_VIEW.streamRenderer(body, answer, language, thinking, $('thread'));
  try {
    if (loadedModelId() !== selectedId) {
      setStatus(tr('loading'), false, true);
      await loadModel(selectedId);
      setStatus(tr('generating'), false, true);
    }
    answer.usage = await completeWithRetry(contexts, (messages, onToken, signal) => streamChat(messages, onToken, signal, thinking), token => {
      answer.text += token;
      streamView?.update();
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
    streamView?.flush();
    controller = undefined;
    chat.updated = Date.now();
    await db.put('chats', chat);
    setBusy(false); render();
  }
}
async function init() { try { const settings = await db.get('settings','main'); language = settings?.language || preferredLanguage(); selectedId = settings?.selectedId; activeId = settings?.activeId; thinking = !!settings?.thinking; [chats, documents, models, memories] = await Promise.all([db.all('chats'), db.all('documents'), savedModels(), db.all('memory')]); if (isAuxiliaryGguf(models.find(model => model.id === selectedId)?.filename || models.find(model => model.id === selectedId)?.url || '')) { selectedId = undefined; await saveSettings(); } if (!chats.some(chat => chat.id === activeId)) activeId = chats[0]?.id; if (!models.some(model => model.id === selectedId)) selectedId = usesSafariCpu() ? undefined : models.find(isStarterModel)?.id; render(); if (needsSafariFallback(models.find(model => model.id === selectedId))) setStatus(tr('safariLargeModelWarning')); else if (isStarterModel(models.find(model => model.id === selectedId))) await run(() => chooseModel(selectedId)); } catch (error) { setStatus(`${tr('error')}: ${error.message}`, true); } }
$('prompt-form').onsubmit = event => { event.preventDefault(); run(send); };
$('prompt').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('prompt-form').requestSubmit(); } };
$('stop').onclick = () => controller?.abort();
$('thinking-toggle').onclick = () => { thinking = !thinking; saveSettings(); render(); };
$('new-chat').onclick = () => run(newChat);
$('menu').onclick = () => $('sidebar').classList.toggle('open');
for (const id of ['models-open','model-trigger']) $(id).onclick = () => { closeSidebar(); renderModels(); renderSearch(); $('models-dialog').showModal(); };
$('docs-open').onclick = () => { closeSidebar(); renderDocs(); $('docs-dialog').showModal(); };
$('memory-open').onclick = () => { pendingMemoryPrompt = null; closeSidebar(); renderMemory(); $('memory-dialog').showModal(); };
$('memory-dialog').addEventListener('close', () => { pendingMemoryPrompt = null; });
$('memory-form').onsubmit = event => run(async () => { event.preventDefault(); const text = $('memory-text').value.replace(/\s+/g, ' ').trim(); if (!text || text.length > 500) return; if (!$('memory-id').value && memories.length >= 100) throw Error(tr('memoryFull')); const id = $('memory-id').value || crypto.randomUUID(); const note = { id, text, updated:Date.now() }; await db.put('memory', note); memories = memories.filter(item => item.id !== id); memories.push(note); if (pendingMemoryPrompt === $('prompt').value.trim()) $('prompt').value = ''; pendingMemoryPrompt = null; $('memory-id').value = ''; $('memory-text').value = ''; renderMemory(); $('memory-dialog').close(); setStatus(tr('memorySaved')); });
$('memory-export').onclick = () => { const url = URL.createObjectURL(new Blob([memoryMarkdown(memories)], {type:'text/markdown'})); const link = node('a'); link.href = url; link.download = 'usb-ai-memory.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('memory-import').onchange = event => run(async () => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || file.size > 100_000) return; for (const text of parseMemoryMarkdown(await file.text())) { if (memories.length >= 100) break; if (memories.some(note => note.text === text)) continue; const note = { id:crypto.randomUUID(), text, updated:Date.now() }; await db.put('memory', note); memories.push(note); } renderMemory(); });
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
$('language').onchange = () => { language = $('language').value; saveSettings(); render(); };
$('attach-files').onclick = () => $('chat-files').click();
$('model-file').onchange = event => run(async () => { const files = [...event.target.files]; event.target.value = ''; const result = await addLocalModel(files); models = await savedModels(); if (!result.persistent) models.push({ id:result.id, name:result.name, size:files.reduce((n,f) => n+f.size,0) }); renderModels(); setStatus(result.persistent ? tr('modelSaved') : tr('modelSession')); await chooseModel(result.id); });
$('split-file').onchange = event => { splitSourceFile = event.target.files?.[0]; event.target.value = ''; $('split-progress').textContent = splitSourceFile ? `${splitSourceFile.name} · ${modelSize(splitSourceFile.size)}` : ''; $('split-start').disabled = !splitSourceFile || busy || !canSaveToFolder(); };
$('split-cancel').onclick = () => splitController?.abort();
$('split-start').onclick = () => run(async () => {
  if (!splitSourceFile || !canSaveToFolder()) return;
  const directory = await window.showDirectoryPicker({ id:'usb-ai-split-output', mode:'readwrite', startIn:'downloads' });
  const file = splitSourceFile;
  splitController = new AbortController();
  setBusy(true); $('split-start').disabled = true; $('split-cancel').hidden = false;
  try {
    const result = await splitGgufFile(file, directory, { signal:splitController.signal, onProgress:({loaded,total,part,parts}) => {
      $('split-progress').textContent = `${tr('splitWriting')} ${part}/${parts} · ${Math.round(loaded / total * 100)}%`;
    } });
    const id = crypto.randomUUID();
    await db.put('models', { id, name:file.name, source:'directory', filename:result.names[0], size:result.size,
      fileHandle:result.handles[0], fileHandles:result.handles, folderHandle:directory, folderLabel:directory.name });
    models = await savedModels(); renderModels();
    splitSourceFile = undefined; $('split-progress').textContent = tr('splitComplete').replace('{count}', result.names.length);
    setStatus(tr('splitComplete').replace('{count}', result.names.length));
  } catch (error) {
    if (error.name === 'AbortError') $('split-progress').textContent = tr('splitCancelled');
    else { $('split-progress').textContent = `${tr('error')}: ${tr(error.message)}`; throw error; }
  } finally { splitController = undefined; $('split-cancel').hidden = true; setBusy(false); $('split-start').disabled = !splitSourceFile; }
});
$('use-existing-model').onclick = () => { if (canSaveToFolder()) $('choose-folder').click(); else $('model-file').click(); };
$('choose-folder').onclick = () => run(async () => {
  const ids = await addModelsFromFolder();
  models = await savedModels();
  renderModels();
  const selected = models.find(model => ids.includes(model.id) && isStarterModel(model)) || (ids.length === 1 ? models.find(model => model.id === ids[0]) : null);
  if (selected) await chooseModel(selected.id);
  else { const message = tr('folderModelsFound').replace('{count}', ids.length); setStatus(message); $('model-progress').textContent = message; }
});
$('download-starter-model').onclick = () => run(async () => {
  const id = usesSafariCpu() || navigator.deviceMemory && navigator.deviceMemory < 4 ? 'qwen-0.5b' : STARTER_ID;
  setBusy(true); setStatus(tr('starterDownloading'), false, true);
  $('model-progress').classList.add('loading');
  await downloadCurated(id, ({loaded,total}) => {
    const progress = `${tr('starterDownloading')} ${Math.floor(loaded / total * 100)}%`;
    $('model-progress').textContent = progress;
    setStatus(progress, false, true);
  });
  models = await savedModels();
  await chooseModel(id);
});
$('hub-search-form').onsubmit = event => { event.preventDefault(); searchHub(); };
$('hub-more').onclick = () => searchHub(hubNext);
async function uploadFiles(event) {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length) return;
  await run(async () => {
    if (!activeId) await newChat();
    $('doc-status').textContent = tr('readingDocument');
    setStatus(tr('readingDocument'), false, true);
    try {
      for (const file of files) {
        const text = await readDocument(file);
        const parts = chunks(text);
        const doc = { id:crypto.randomUUID(), chatId:activeId, name:file.name, chunks:parts, updated:Date.now() };
        await db.put('documents', doc);
        documents.push(doc);
      }
      render();
      const message = tr('documentReady').replace('{count}', files.length);
      $('doc-status').textContent = message;
      setStatus(message);
      $('prompt').focus();
    } catch (error) {
      render();
      $('doc-status').textContent = error.message === 'DOCUMENT_NO_TEXT' ? tr('documentNoText') : `${tr('error')}: ${error.message}`;
      throw error;
    }
  });
}
$('doc-file').onchange = uploadFiles;
$('chat-files').onchange = uploadFiles;
$('delete-chat').onclick = () => run(async () => { if (!activeId || !confirm(tr('deleteConfirm'))) return; await db.remove('chats', activeId); for (const doc of documents.filter(item => item.chatId === activeId)) await db.remove('documents', doc.id); documents = documents.filter(item => item.chatId !== activeId); chats = chats.filter(chat => chat.id !== activeId); activeId = chats[0]?.id; await saveSettings(); render(); });
$('export-chat').onclick = () => { const chat = chats.find(item => item.id === activeId); if (!chat) return; const content = chat.messages.map(item => `## ${item.role === 'user' ? tr('you') : tr('assistant')}\n\n${item.text}`).join('\n\n'); const url = URL.createObjectURL(new Blob([content], {type:'text/markdown'})); const link = node('a'); link.href = url; link.download = 'usb-ai-chat.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installing = event; });
$('install').onclick = async () => { if (installing) { installing.prompt(); await installing.userChoice; installing = undefined; $('install').hidden = true; } else setStatus(tr('installUnavailable')); };
window.addEventListener('online', render); window.addEventListener('offline', render);
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.warn);
init();
