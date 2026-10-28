(() => {
  const $ = id => document.getElementById(id);
  const dictionaries = window.LLAMANEST_LAB_I18N;
  let language = (navigator.languages || [navigator.language || 'en'])
    .map(value => value.toLowerCase().split('-')[0]).find(value => dictionaries[value]) || 'en';
  const tr = key => dictionaries[language][key] || dictionaries.en[key] || key;
  let status = null;
  let training = [];
  let prompts = [];
  let distilled = [];
  let models = [];
  let saving = false;
  let savingTarget = null;
  let pendingAction = null;
  let editingPair = null;
  let editingPrompt = null;
  let answerEditing = false;
  let lastPreviewPrompt = null;
  let correctionFromVerification = false;
  let verificationCorrectionsPending = false;
  let correctionRecorded = false;
  let activeTab = 'train';
  let wasDistilling = false;
  let wasDocumentGenerating = false;
  const openrouterModels = {doc:[], distill:[]};
  const modelSearchTimer = {doc:null, distill:null};
  const modelSearchSerial = {doc:0, distill:0};
  const modelSearching = {doc:false, distill:false};

  async function api(action, data = {}) {
    const response = await fetch(action === 'state' ? '/api' : '/lab/api', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, ...data})
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function message(id, text = '', error = false) {
    const node = $(id);
    node.textContent = text;
    node.classList.toggle('error', error);
  }
  const localError = error => tr(error.message);

  async function withPending(buttonId, action) {
    if (pendingAction) return;
    pendingAction = buttonId;
    render();
    try { return await action(); }
    finally { pendingAction = null; render(); }
  }

  function translate() {
    document.documentElement.lang = language;
    document.title = `LlamaNest ${tr('labName')}`;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = tr(node.dataset.i18n); });
    document.querySelector('.tabs').setAttribute('aria-label', tr('paths'));
    $('preview-prompt').placeholder = tr('previewExample');
    $('guide-teacher-prompt').textContent = tr('guideTeacherPrompt');
    $('guide-json').textContent = JSON.stringify({format:'llamanest-lab-v1',kind:'training',examples:[
      {prompt:tr('guideSamplePrompt'),completion:tr('guideSampleAnswer')}
    ]}, null, 2);
    $('openrouter-search').placeholder = tr('openrouterSearchHint');
    $('distill-openrouter-search').placeholder = tr('openrouterSearchHint');
  }

  function tab(name) {
    activeTab = name;
    for (const value of ['train', 'distill']) {
      $(`panel-${value}`).hidden = value !== name;
      $(`tab-${value}`).setAttribute('aria-selected', String(value === name));
    }
  }

  function button(label, className, callback) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `button ${className}`;
    node.textContent = tr(label);
    node.disabled = saving || status?.job?.active === true;
    node.onclick = callback;
    return node;
  }

  function rowCard(row, index, kind) {
    const card = document.createElement('div');
    card.className = 'example';
    const label = document.createElement('strong');
    label.textContent = `${index + 1}. ${tr('question')}`;
    const prompt = document.createElement('p');
    prompt.textContent = row.prompt;
    card.append(label, prompt);
    if (kind === 'training') {
      const answerLabel = document.createElement('strong');
      answerLabel.textContent = tr('answer');
      const answer = document.createElement('p');
      answer.className = 'answer-text';
      answer.textContent = row.completion || '';
      card.append(answerLabel, answer);
      if ([...(row.completion || '')].length > 4000) {
        const warning = document.createElement('div');
        warning.className = 'warning';
        warning.textContent = tr('shortenAnswer');
        card.append(warning);
      }
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      button('edit', 'secondary', () => {
        if (kind === 'training') {
          editingPair = index;
          $('pair-prompt').value = row.prompt;
          $('pair-answer').value = row.completion;
          $('pair-add').textContent = tr('updatePair');
          $('pair-cancel').hidden = false;
          $('pair-prompt').focus();
        } else {
          editingPrompt = index;
          $('teacher-prompt').value = row.prompt;
          $('prompt-add').textContent = tr('updateQuestion');
          $('prompt-cancel').hidden = false;
          $('teacher-prompt').focus();
        }
      }),
      button('delete', 'danger', async () => {
        const rows = (kind === 'training' ? training : prompts).filter((_, position) => position !== index);
        try {
          await saveRows(kind, rows);
          if (kind === 'training') clearPairForm();
          else clearPromptForm();
        }
        catch (_) { /* The save error is already shown beside the list. */ }
      })
    );
    card.append(actions);
    return card;
  }

  function renderList(kind) {
    const rows = kind === 'training' ? training : prompts;
    const list = $(kind === 'training' ? 'pair-list' : 'prompt-list');
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = tr(kind === 'training' ? 'pairEmpty' : 'promptEmpty');
      list.append(empty);
    } else rows.forEach((row, index) => list.append(rowCard(row, index, kind)));
  }

  function renderAnswers() {
    const list = $('answer-list');
    list.replaceChildren();
    $('review-empty').hidden = distilled.length > 0;
    distilled.forEach((row, index) => {
      const card = document.createElement('div');
      card.className = 'example';
      const promptLabel = document.createElement('strong');
      promptLabel.textContent = `${index + 1}. ${tr('question')}`;
      const prompt = document.createElement('p');
      prompt.textContent = row.prompt;
      const answerLabel = document.createElement('strong');
      answerLabel.textContent = tr('answer');
      const answer = document.createElement('p');
      answer.className = 'answer-text';
      answer.textContent = row.completion || '';
      const actions = document.createElement('div');
      actions.className = 'actions';
      const edit = button('edit', 'secondary', () => {
        answerEditing = true;
        const field = document.createElement('textarea');
        field.className = 'answer-edit';
        field.maxLength = 4000;
        field.value = row.completion || '';
        const save = button('saveAnswer', 'secondary', async () => {
          const value = field.value.trim();
          if (!value) return message('answer-message', tr('answerRequired'), true);
          const next = distilled.map((item, position) => position === index ? {...item, completion:value} : item);
          try { await saveRows('distilled', next); answerEditing = false; render(); }
          catch (_) { /* The save error is already shown beside the list. */ }
        });
        answer.replaceWith(field);
        actions.replaceChildren(save, button('cancelEdit', 'quiet', () => {
          answerEditing = false;
          renderAnswers(); render();
        }));
        render();
        field.focus();
      });
      actions.append(edit);
      card.append(promptLabel, prompt, answerLabel, answer);
      if ([...(row.completion || '')].length > 4000) {
        const warning = document.createElement('div');
        warning.className = 'warning';
        warning.textContent = tr('shortenAnswer');
        card.append(warning);
      }
      card.append(actions);
      list.append(card);
    });
  }

  function renderJob() {
    const job = status?.job;
    $('job').hidden = !job || (!job.active && job.phase !== 'failed');
    if (!job) return;
    const kind = tr(`job${job.kind[0].toUpperCase()}${job.kind.slice(1)}`);
    const phase = tr(`job${job.phase[0].toUpperCase()}${job.phase.slice(1)}`);
    $('job-title').textContent = `${kind} · ${phase}`;
    $('job-title').classList.toggle('loading', job.active);
    $('job').setAttribute('aria-busy', String(job.active));
    $('job-detail').textContent = (job.error ? tr(job.error) : null) || (['distill', 'auto', 'document', 'verify'].includes(job.kind) ? `${job.done}/${job.total} ${tr(job.kind === 'verify' ? 'verifyProgress' : 'jobProgress')}` : job.active ? tr('pleaseWait') : '');
    $('cancel-job').disabled = !job.active || pendingAction === 'cancel-job';
    if (['distill', 'auto', 'document', 'verify'].includes(job.kind) && job.total) $('job-progress').value = Math.round(job.done / job.total * 100);
    else if (job.active) $('job-progress').removeAttribute('value');
    else $('job-progress').value = job.phase === 'complete' ? 100 : 0;
    $('job-log').textContent = job.log || '';
    if (job.kind === 'train' && !job.active) message('train-message', job.error || phase, job.phase === 'failed');
    if (job.kind === 'export' && !job.active) message('export-message', job.error ? tr(job.error) : (job.phase === 'complete' ? `${tr('modelReady')} ${job.output}` : phase), job.phase === 'failed');
    if (job.kind === 'distill' && !job.active) message('generate-message', job.error || phase, job.phase === 'failed');
    if (job.kind === 'auto' && !job.active) message('auto-message', job.error ? tr(job.error) : (job.phase === 'complete' ? tr('autoReady') : phase), job.phase === 'failed');
    if (job.kind === 'document' && !job.active) message('doc-message', job.error ? tr(job.error) : job.phase === 'complete' ? tr('documentReady') : phase, job.phase === 'failed');
    if (job.kind === 'preview' && !job.active) {
      message('preview-message', job.error || phase, job.phase === 'failed');
      $('preview-output').hidden = job.phase !== 'complete';
      $('preview-output').textContent = job.phase === 'complete' ? (job.response || '') : '';
      $('correction').hidden = job.phase !== 'complete' || (!lastPreviewPrompt && !correctionRecorded);
    }
    if (job.kind === 'verify' && !job.active && job.phase === 'failed') message('verify-message', job.error || phase, true);
  }

  function renderVerification() {
    const job = status.job;
    let report = status.verification;
    if (job?.kind === 'verify' && job.response) {
      try { report = JSON.parse(job.response); } catch { /* Keep the last complete report. */ }
    }
    const container = $('verify-report');
    container.replaceChildren();
    container.hidden = !report;
    if (!report) {
      if (job?.kind === 'verify' && job.active) message('verify-message', tr('verifyRunning'));
      else if (job?.kind === 'verify' && job.phase === 'cancelled') message('verify-message', tr('jobCancelled'));
      else if (job?.kind !== 'verify') message('verify-message');
      return;
    }
    const adapter = Array.isArray(report.adapter) ? report.adapter : [];
    const gguf = Array.isArray(report.gguf) ? report.gguf : [];
    const total = training.length;
    const passed = rows => rows.filter(row => row.match === true).length;
    const summary = `${tr('verifyAdapter')}: ${passed(adapter)}/${total} · ${report.ggufName ? `${tr('verifyGguf')}: ${passed(gguf)}/${total}` : tr('verifyNoGguf')}`;
    const failed = job?.kind === 'verify' && job.phase === 'failed';
    const progress = verificationCorrectionsPending ? `${summary} · ${tr('verifyNeedsRetrain')}`
      : job?.kind === 'verify' && job.active ? `${summary} · ${tr('verifyRunning')}` : summary;
    message('verify-message', failed ? `${progress} · ${job.error || tr('jobFailed')}` : progress,
      failed || adapter.some(row => !row.match) || gguf.some(row => !row.match));
    for (let index = 0; index < Math.max(adapter.length, gguf.length); index++) {
      const row = adapter[index] || gguf[index];
      const card = document.createElement('div');
      card.className = 'example';
      const title = document.createElement('strong');
      title.textContent = `${index + 1}. ${row.prompt}`;
      const expected = document.createElement('p');
      expected.textContent = `${tr('verifyExpected')}: ${row.expected}`;
      card.append(title, expected);
      for (const [label, result] of [[tr('verifyAdapter'), adapter[index]], [tr('verifyGguf'), gguf[index]]]) {
        if (!result) continue;
        const answer = document.createElement('p');
        answer.textContent = `${result.match ? '✓' : '✗'} ${label}: ${result.actual || tr('verifyEmpty')}`;
        card.append(answer);
      }
      if (!job?.active) {
        const correct = button('verifyCorrect', 'secondary', () => {
          lastPreviewPrompt = row.prompt;
          correctionFromVerification = true;
          correctionRecorded = false;
          $('correction-answer').value = training.find(item => item.prompt === row.prompt)?.completion || row.expected || '';
          $('correction').hidden = false;
          message('correction-message', tr('verifyCorrectionHelp'));
          $('correction').scrollIntoView({behavior:'smooth', block:'center'});
          $('correction-answer').focus();
          render();
        });
        card.append(correct);
      }
      container.append(card);
    }
  }

  function render() {
    if (!status) return;
    const busy = saving || Boolean(pendingAction) || status.job?.active === true;
    const runningButton = {train:'train-start',preview:'preview-start',verify:'verify-start',export:'export-model',distill:'generate-start',auto:'auto-start',document:'doc-generate'}[status.job?.active ? status.job.kind : ''];
    for (const id of ['train-start','choose-local-model','choose-gguf-model','preview-start','verify-start','export-model','generate-start','auto-start','doc-upload','doc-generate','openrouter-save','openrouter-remove','distill-openrouter-save','distill-openrouter-remove','use-answers','cancel-job','pair-import','prompt-import','correction-save']) {
      const loading = id === pendingAction || id === runningButton;
      $(id).classList.toggle('loading', loading);
      $(id).setAttribute('aria-busy', String(loading));
    }
    for (const id of ['pair-message','prompt-message','answer-message']) $(id).classList.toggle('loading', id === savingTarget);
    $('pair-count').textContent = `${training.length < 5 ? `${training.length}/5` : training.length} ${tr('pairCount')}`;
    $('doc-name').textContent = status.document?.name || tr('documentNone');
    const cloud = $('doc-provider').value === 'openrouter';
    $('doc-local-options').hidden = cloud;
    $('doc-openrouter-options').hidden = !cloud;
    $('doc-provider').disabled = busy;
    $('doc-upload').disabled = busy;
    $('doc-teacher').disabled = busy;
    $('doc-count').disabled = busy;
    $('openrouter-key').disabled = busy;
    $('openrouter-save').disabled = busy || !$('openrouter-key').value.trim();
    $('openrouter-remove').disabled = busy || !status.openrouterConfigured;
    $('openrouter-search').disabled = busy || !status.openrouterConfigured;
    $('openrouter-key-status').textContent = tr(status.openrouterConfigured ? 'openrouterKeySaved' : 'openrouterKeyMissing');
    $('openrouter-search-status').classList.toggle('loading', modelSearching.doc);
    const chosenCloudModel = openrouterModels.doc.some(model => model.id === $('openrouter-search').value.trim());
    $('doc-generate').disabled = busy || !status.document || (cloud ? !status.openrouterConfigured || !chosenCloudModel : !models.length) || training.length + Number($('doc-count').value) > 200;
    const distillCloud = $('distill-provider').value === 'openrouter';
    $('distill-local-options').hidden = distillCloud;
    $('distill-openrouter-options').hidden = !distillCloud;
    $('distill-provider').disabled = busy;
    $('teacher').disabled = busy;
    $('distill-openrouter-key').disabled = busy;
    $('distill-openrouter-save').disabled = busy || !$('distill-openrouter-key').value.trim();
    $('distill-openrouter-remove').disabled = busy || !status.openrouterConfigured;
    $('distill-openrouter-search').disabled = busy || !status.openrouterConfigured;
    $('distill-openrouter-key-status').textContent = tr(status.openrouterConfigured ? 'openrouterKeySaved' : 'openrouterKeyMissing');
    $('distill-openrouter-search-status').classList.toggle('loading', modelSearching.distill);
    const chosenDistillModel = openrouterModels.distill.some(model => model.id === $('distill-openrouter-search').value.trim());
    const teacherReady = distillCloud ? status.openrouterConfigured && chosenDistillModel : models.length > 0;
    $('prompt-count').textContent = `${prompts.length}/30 ${tr('promptCount')}`;
    for (const id of ['pair-add', 'pair-example', 'pair-clear', 'prompt-add', 'prompt-example', 'prompt-clear']) $(id).disabled = busy;
    for (const id of ['pair-prompt', 'pair-answer', 'teacher-prompt', 'auto-topic', 'pair-cancel', 'prompt-cancel']) $(id).disabled = busy;
    document.querySelectorAll('#pair-list button, #prompt-list button, #answer-list button').forEach(node => { node.disabled = busy; });
    const pendingPair = Boolean($('pair-prompt').value.trim() || $('pair-answer').value.trim());
    const pendingPrompt = Boolean($('teacher-prompt').value.trim());
    const longTraining = training.some(row => [...(row.completion || '')].length > 4000);
    const answersMatch = !prompts.length || (prompts.length === distilled.length && prompts.every((row, index) => row.prompt === distilled[index].prompt));
    const localSelected = status.baseModel === '@local';
    const localReady = localSelected && status.localModelValid;
    $('choose-local-model').disabled = busy;
    $('choose-gguf-model').disabled = busy;
    $('train-start').disabled = busy || pendingPair || longTraining || !status.trainSupported || !localReady || training.length < 5;
    $('restart-base-label').hidden = !status.canContinue;
    $('restart-base').disabled = busy;
    $('train-start').textContent = tr(status.canContinue && !$('restart-base').checked ? 'continueTrain' : 'trainStart');
    $('iterations-label').textContent = tr(status.canContinue && !$('restart-base').checked ? 'additionalIterations' : 'iterations');
    $('train-mode').hidden = !status.canContinue;
    $('train-mode').textContent = status.canContinue ? tr($('restart-base').checked ? 'restartHelp' : 'continueHelp') : '';
    $('generate-start').disabled = busy || pendingPrompt || prompts.length === 0 || !teacherReady;
    $('auto-start').disabled = busy || !$('auto-topic').value.trim() || !teacherReady;
    $('preview-start').disabled = busy || !status.adapterFresh || !localReady;
    $('verify-start').disabled = busy || !status.adapterFresh || !localReady;
    $('export-model').disabled = busy || !status.adapterFresh || !status.trainSupported || !localReady;
    $('correction-save').disabled = busy || !lastPreviewPrompt;
    $('pair-export').disabled = busy || !training.length;
    $('prompt-export').disabled = busy || !prompts.length;
    $('pair-import').disabled = busy;
    $('prompt-import').disabled = busy;
    $('pair-reset').disabled = busy;
    $('prompt-reset').disabled = busy;
    $('use-answers').disabled = busy || answerEditing || !answersMatch || !distilled.length || distilled.some(row => [...(row.completion || '')].length > 4000);
    if (distilled.length && !answersMatch) message('answer-message', tr('staleAnswers'), true);
    else if ($('answer-message').textContent === tr('staleAnswers')) message('answer-message');
    $('base-model').textContent = localSelected ? status.resolvedBaseModel || '' : '';
    const chatNote = $('chat-model-note');
    if (localSelected) {
      chatNote.textContent = tr(localReady ? 'localModelSelected' : 'localModelMissing')
        .replace('{name}', status.localModelName || tr('localModelUnknown'));
    } else {
      chatNote.textContent = tr('localModelChooseFirst');
    }
    $('distill-target-model').textContent = localReady
      ? tr('localModelOption').replace('{name}', status.localModelName || tr('localModelUnknown'))
      : tr('localModelChooseFirst');
    $('workspace').textContent = status.workspace || '';
    if (!models.length && !distillCloud) message('generate-message', tr('noModels'));
    else if (pendingPrompt) message('generate-message', tr('pendingPrompt'));
    else if (prompts.length === 0) message('generate-message', tr('needQuestion'));
    else if (status.job?.kind !== 'distill') message('generate-message');
    if (!models.length && !distillCloud) message('auto-message', tr('noModels'));
    else if (status.job?.kind !== 'auto') message('auto-message');
    if (pendingPair) message('train-message', tr('pendingPair'));
    else if (longTraining) message('train-message', tr('shortenAnswer'));
    else if (training.length < 5) message('train-message', tr('trainNeedFive'));
    else if (status.job?.kind !== 'train') message('train-message');
    if (!status.adapter && status.job?.kind !== 'preview') message('preview-message', tr('noAdapter'));
    else if (status.adapter && !status.adapterFresh && status.job?.kind !== 'preview') message('preview-message', tr(status.adapterNeedsFormatUpgrade ? 'trainFormatChanged' : 'needsRetrain'));
    else if (status.adapterFresh && status.job?.kind !== 'preview') message('preview-message');
    renderJob();
    renderVerification();
  }

  async function saveRows(kind, rows) {
    if (saving) return;
    saving = true;
    const messageId = kind === 'training' ? 'pair-message' : kind === 'prompts' ? 'prompt-message' : 'answer-message';
    savingTarget = messageId;
    message(messageId, tr('saving'));
    render();
    try {
      status = await api('save', {kind, examples:rows});
      if (kind === 'training') training = rows;
      else if (kind === 'prompts') prompts = rows;
      else distilled = rows;
      if (kind === 'distilled') renderAnswers();
      else renderList(kind);
      message(messageId, tr('saved'));
    } catch (error) {
      message(messageId, `${tr('failedSave')} ${error.message}`, true);
      throw error;
    } finally {
      saving = false;
      savingTarget = null;
      render();
    }
  }

  function clearPairForm() {
    editingPair = null;
    $('pair-prompt').value = '';
    $('pair-answer').value = '';
    $('pair-add').textContent = tr('addPair');
    $('pair-cancel').hidden = true;
    render();
  }
  function clearPromptForm() {
    editingPrompt = null;
    $('teacher-prompt').value = '';
    $('prompt-add').textContent = tr('addQuestion');
    $('prompt-cancel').hidden = true;
    render();
  }

  function exportCopy(kind) {
    const examples = kind === 'training' ? training : prompts;
    const name = kind === 'training' ? 'llamanest-fine-tuning.json' : 'llamanest-domande.json';
    const backup = JSON.stringify({format:'llamanest-lab-v1',kind,examples}, null, 2);
    const url = URL.createObjectURL(new Blob([backup], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function parseCopy(text) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return {examples:data};
      if (Array.isArray(data.examples)) return data;
      if (typeof data.prompt === 'string') return {examples:[data]};
    } catch (_) { /* JSONL uses one JSON object per line. */ }
    return {examples:text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))};
  }

  async function importCopy(kind, file) {
    const messageId = kind === 'training' ? 'pair-message' : 'prompt-message';
    if (file.size > 2 * 1024 * 1024) return message(messageId, tr('fileTooLarge'), true);
    try {
      const copy = parseCopy(await file.text());
      if (copy.kind && copy.kind !== kind) return message(messageId, tr('wrongCopy'), true);
      if (!Array.isArray(copy.examples)) return message(messageId, tr('invalidCopy'), true);
      if (kind === 'prompts' && copy.examples.length > 30) return message(messageId, tr('promptLimit'), true);
      if (kind === 'training' && copy.examples.length > 200) return message(messageId, tr('pairLimit'), true);
      const current = kind === 'training' ? training : prompts;
      if (current.length && !window.confirm(tr('replaceCopy'))) return;
      await saveRows(kind, copy.examples);
      if (kind === 'training') clearPairForm();
      else clearPromptForm();
      message(messageId, tr('imported'));
    } catch (error) { message(messageId, `${tr('invalidCopy')} ${error.message}`, true); }
  }

  async function resetPath(kind) {
    const trainingPath = kind === 'training';
    if (!window.confirm(tr(trainingPath ? 'resetTrainingConfirm' : 'resetPromptsConfirm'))) return;
    const messageId = trainingPath ? 'pair-message' : 'prompt-message';
    saving = true;
    savingTarget = messageId;
    message(messageId, tr('saving'));
    render();
    try {
      status = await api('reset', {kind});
      if (trainingPath) {
        training = [];
        lastPreviewPrompt = null;
        correctionRecorded = false;
        $('correction').hidden = true;
        $('correction-answer').value = '';
        $('preview-output').hidden = true;
        $('preview-output').textContent = '';
        clearPairForm();
        renderList('training');
      } else {
        prompts = [];
        distilled = [];
        answerEditing = false;
        wasDistilling = false;
        clearPromptForm();
        renderList('prompts');
        renderAnswers();
        message('answer-message');
      }
      message(messageId, tr('resetDone'));
    } catch (error) {
      message(messageId, error.message, true);
    } finally {
      saving = false;
      savingTarget = null;
      render();
    }
  }

  $('tab-train').onclick = () => tab('train');
  $('tab-distill').onclick = () => tab('distill');
  $('choose-local-model').onclick = async () => {
    try { await withPending('choose-local-model', async () => {
      status = await api('choose_local_model', {kind:'folder'});
      render();
      message('train-message');
    }); }
    catch (error) { message('train-message', localError(error), true); }
  };
  $('choose-gguf-model').onclick = async () => {
    try { await withPending('choose-gguf-model', async () => {
      status = await api('choose_local_model', {kind:'file'});
      render();
      message('train-message');
    }); }
    catch (error) { message('train-message', localError(error), true); }
  };
  $('pair-reset').onclick = () => resetPath('training');
  $('prompt-reset').onclick = () => resetPath('prompts');
  $('doc-provider').onchange = render;
  $('distill-provider').onchange = render;
  const routerPanels = [
    {kind:'doc', prefix:'openrouter-', feedback:'doc-message'},
    {kind:'distill', prefix:'distill-openrouter-', feedback:'generate-message'}
  ];
  function clearRouterChoices() {
    for (const {kind, prefix} of routerPanels) {
      clearTimeout(modelSearchTimer[kind]);
      modelSearchSerial[kind]++;
      modelSearching[kind] = false;
      openrouterModels[kind] = [];
      $(`${prefix}key`).value = '';
      $(`${prefix}search`).value = '';
      $(`${prefix}models`).replaceChildren();
      message(`${prefix}search-status`);
    }
  }
  for (const {kind, prefix, feedback} of routerPanels) {
    $(`${prefix}key`).oninput = render;
    $(`${prefix}save`).onclick = async () => {
      const key = $(`${prefix}key`).value.trim();
      try { await withPending(`${prefix}save`, async () => {
        status = await api('save_openrouter_key', {key});
        clearRouterChoices();
        message(feedback, tr('openrouterKeySaved'));
      }); } catch (error) { message(feedback, localError(error), true); }
    };
    $(`${prefix}remove`).onclick = async () => {
      try { await withPending(`${prefix}remove`, async () => {
        status = await api('remove_openrouter_key');
        clearRouterChoices();
        message(feedback, tr('openrouterKeyRemoved'));
      }); } catch (error) { message(feedback, localError(error), true); }
    };
    $(`${prefix}search`).oninput = () => {
      clearTimeout(modelSearchTimer[kind]);
      const serial = ++modelSearchSerial[kind];
      const query = $(`${prefix}search`).value.trim();
      if (openrouterModels[kind].some(model => model.id === query)) {
        modelSearching[kind] = false;
        message(`${prefix}search-status`, tr('openrouterChooseModel'));
        render();
        return;
      }
      openrouterModels[kind] = [];
      $(`${prefix}models`).replaceChildren();
      modelSearching[kind] = false;
      if (query.length < 2 || !status?.openrouterConfigured) {
        message(`${prefix}search-status`, tr('openrouterSearchHint'));
        render();
        return;
      }
      modelSearchTimer[kind] = setTimeout(async () => {
        modelSearching[kind] = true;
        message(`${prefix}search-status`, tr('openrouterSearching'));
        render();
        try {
          const result = await api('openrouter_models', {query});
          if (serial !== modelSearchSerial[kind]) return;
          openrouterModels[kind] = result.models || [];
          $(`${prefix}models`).replaceChildren(...openrouterModels[kind].map(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.label = model.name;
            return option;
          }));
          message(`${prefix}search-status`, tr(openrouterModels[kind].length ? 'openrouterChooseModel' : 'openrouterNoModels'));
        } catch (error) {
          if (serial === modelSearchSerial[kind]) message(`${prefix}search-status`, localError(error), true);
        } finally {
          if (serial === modelSearchSerial[kind]) { modelSearching[kind] = false; render(); }
        }
      }, 350);
      render();
    };
  }
  $('doc-upload').onclick = () => $('doc-file').click();
  $('doc-file').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return message('doc-message', tr('documentTooLarge'), true);
    try { await withPending('doc-upload', async () => {
      const response = await fetch('/lab/document-upload/' + encodeURIComponent(file.name), {method:'POST', body:file});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || `HTTP ${response.status}`);
      status = result;
      render();
      message('doc-message', tr('documentLoaded'));
    }); } catch (error) { message('doc-message', localError(error), true); }
  };
  $('doc-generate').onclick = async () => {
    try { await withPending('doc-generate', async () => {
      const provider = $('doc-provider').value;
      const teacher = provider === 'openrouter' ? $('openrouter-search').value.trim() : $('doc-teacher').value;
      status = await api('document_examples', {provider, teacher, count:Number($('doc-count').value)});
      wasDocumentGenerating = true;
      render();
    }); } catch (error) { message('doc-message', localError(error), true); }
  };
  for (const [kind, prefix] of [['training','pair'],['prompts','prompt']]) {
    $(`${prefix}-export`).onclick = () => exportCopy(kind);
    $(`${prefix}-import`).onclick = () => $(`${prefix}-file`).click();
    $(`${prefix}-file`).addEventListener('change', async event => {
      const file = event.target.files[0];
      if (file) await withPending(`${prefix}-import`, () => importCopy(kind, file));
      event.target.value = '';
    });
  }
  $('pair-example').onclick = () => {
    $('pair-prompt').value = tr('pairExamplePrompt');
    $('pair-answer').value = tr('pairExampleAnswer');
    $('pair-prompt').focus();
  };
  $('prompt-example').onclick = () => { $('teacher-prompt').value = tr('promptExample'); $('teacher-prompt').focus(); };
  $('auto-topic').addEventListener('input', render);
  $('pair-cancel').onclick = clearPairForm;
  $('prompt-cancel').onclick = clearPromptForm;
  $('pair-clear').onclick = clearPairForm;
  $('prompt-clear').onclick = clearPromptForm;
  for (const id of ['pair-prompt','pair-answer','teacher-prompt']) $(id).addEventListener('input', render);
  window.addEventListener('beforeunload', event => {
    if ($('pair-prompt').value.trim() || $('pair-answer').value.trim() || $('teacher-prompt').value.trim() || $('auto-topic').value.trim() || $('correction-answer').value.trim() || answerEditing) {
      event.preventDefault(); event.returnValue = '';
    }
  });
  $('pair-add').onclick = async () => {
    const prompt = $('pair-prompt').value.trim();
    const completion = $('pair-answer').value.trim();
    if (!prompt || !completion) return message('pair-message', tr('needBoth'), true);
    if (editingPair === null && training.length >= 200) return message('pair-message', tr('pairLimit'), true);
    if (training.some((row, index) => index !== editingPair && row.prompt === prompt)) return message('pair-message', tr('duplicate'), true);
    const next = training.slice();
    if (editingPair === null) next.push({prompt, completion});
    else next[editingPair] = {prompt, completion};
    try { await saveRows('training', next); clearPairForm(); }
    catch (_) { /* Keep the entered text for another attempt. */ }
  };
  $('prompt-add').onclick = async () => {
    const prompt = $('teacher-prompt').value.trim();
    if (!prompt) return message('prompt-message', tr('needQuestion'), true);
    if (editingPrompt === null && prompts.length >= 30) return message('prompt-message', tr('promptLimit'), true);
    if (prompts.some((row, index) => index !== editingPrompt && row.prompt === prompt)) return message('prompt-message', tr('duplicate'), true);
    const next = prompts.slice();
    if (editingPrompt === null) next.push({prompt});
    else next[editingPrompt] = {prompt};
    try { await saveRows('prompts', next); clearPromptForm(); }
    catch (_) { /* Keep the entered text for another attempt. */ }
  };
  $('restart-base').onchange = render;
  $('train-start').onclick = async () => {
    try { await withPending('train-start', async () => { status = await api('train', {iterations:Number($('iterations').value),restartFromBase:$('restart-base').checked}); verificationCorrectionsPending = false; correctionRecorded = false; $('correction').hidden = true; render(); }); }
    catch (error) { message('train-message', error.message, true); }
  };
  $('export-model').onclick = async () => {
    try { await withPending('export-model', async () => { status = await api('export_model'); render(); }); }
    catch (error) { message('export-message', error.message, true); }
  };
  $('generate-start').onclick = async () => {
    const provider = $('distill-provider').value;
    const teacher = provider === 'openrouter' ? $('distill-openrouter-search').value.trim() : $('teacher').value;
    try { await withPending('generate-start', async () => { status = await api('distill', {provider, teacher}); wasDistilling = true; render(); }); }
    catch (error) { message('generate-message', error.message, true); }
  };
  $('auto-start').onclick = async () => {
    const provider = $('distill-provider').value;
    const teacher = provider === 'openrouter' ? $('distill-openrouter-search').value.trim() : $('teacher').value;
    const topic = $('auto-topic').value.trim();
    if (!topic) return message('auto-message', tr('autoNeedTopic'), true);
    const replace = prompts.length > 0 || distilled.length > 0;
    if (replace && !window.confirm(tr('autoReplaceConfirm'))) return;
    try { await withPending('auto-start', async () => { status = await api('auto_distill', {provider, teacher, topic, replace}); wasDistilling = true; render(); }); }
    catch (error) { message('auto-message', error.message, true); }
  };
  $('preview-start').onclick = async () => {
    const prompt = $('preview-prompt').value.trim();
    if (!prompt) return message('preview-message', tr('previewNeed'), true);
    try { await withPending('preview-start', async () => {
      status = await api('preview', {prompt});
      lastPreviewPrompt = prompt;
      correctionFromVerification = false;
      correctionRecorded = false;
      $('preview-output').hidden = true;
      $('correction').hidden = true;
      $('correction-answer').value = '';
      message('correction-message');
      render();
    }); }
    catch (error) { message('preview-message', error.message, true); }
  };
  $('verify-start').onclick = async () => {
    try { await withPending('verify-start', async () => { status = await api('verify_model'); verificationCorrectionsPending = false; render(); }); }
    catch (error) { message('verify-message', error.message, true); }
  };
  $('correction-save').onclick = async () => {
    const completion = $('correction-answer').value.trim();
    if (!completion) return message('correction-message', tr('correctionNeed'), true);
    if (!lastPreviewPrompt) return;
    const index = training.findIndex(row => row.prompt === lastPreviewPrompt);
    if (index >= 0 && training[index].completion === completion && !correctionFromVerification) {
      return message('correction-message', tr('correctionAlreadyPresent'));
    }
    if (index < 0 && training.length >= 200) return message('correction-message', tr('pairLimit'), true);
    const next = training.slice();
    if (index < 0) next.push({prompt:lastPreviewPrompt, completion});
    else next[index] = {prompt:lastPreviewPrompt, completion};
    try { await withPending('correction-save', async () => {
      await saveRows('training', next);
      if (correctionFromVerification) verificationCorrectionsPending = true;
      lastPreviewPrompt = null;
      correctionRecorded = true;
      $('correction-answer').value = '';
      message('correction-message', tr(correctionFromVerification ? 'verifyCorrectionSaved' : 'correctionSaved'));
      correctionFromVerification = false;
      render();
    }); } catch (error) { message('correction-message', `${tr('failedSave')} ${error.message}`, true); }
  };
  $('use-answers').onclick = async () => {
    if (training.length && !window.confirm(tr('copyConfirm'))) return;
    try { await withPending('use-answers', async () => {
      status = await api('use_distilled');
      training = (await api('examples', {kind:'training'})).examples;
      clearPairForm(); renderList('training'); render(); tab('train');
      message('pair-message', tr('copied'));
      window.scrollTo({top:0,behavior:'smooth'});
    }); } catch (error) { message('answer-message', error.message, true); }
  };
  $('cancel-job').onclick = async () => {
    try { await withPending('cancel-job', async () => { status = await api('cancel'); render(); }); }
    catch (error) { message('generate-message', error.message, true); }
  };

  async function refresh() {
    try {
      status = await api('status');
      $('initial-loading').hidden = true;
      const job = status.job;
      if (job?.kind === 'document' && job.active) wasDocumentGenerating = true;
      if (wasDocumentGenerating && job?.kind === 'document' && !job.active) {
        wasDocumentGenerating = false;
        if (job.phase === 'complete') {
          training = (await api('examples', {kind:'training'})).examples;
          renderList('training');
        }
      }
      if (['distill', 'auto'].includes(job?.kind) && job.active) wasDistilling = true;
      if (wasDistilling && ['distill', 'auto'].includes(job?.kind) && !job.active) {
        wasDistilling = false;
        if (job.phase === 'complete') {
          if (job.kind === 'auto') {
            prompts = (await api('examples', {kind:'prompts'})).examples;
            renderList('prompts');
            $('auto-topic').value = '';
          }
          distilled = (await api('examples', {kind:'distilled'})).examples;
          renderAnswers();
          message('answer-message');
        }
      }
      render();
    } catch (error) { message('train-message', error.message, true); }
  }

  (async () => {
    try {
      const app = await api('state');
      if (dictionaries[app.language]) language = app.language;
      models = app.models || [];
    } catch (_) { /* The chat may be busy. */ }
    translate();
    for (const id of ['teacher','doc-teacher']) {
      const selector = $(id);
      selector.replaceChildren();
      if (!models.length) {
        const option = document.createElement('option');
        option.textContent = tr('noModels');
        selector.append(option);
      } else models.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        selector.append(option);
      });
    }
    const loaded = await Promise.allSettled([
      api('status'), api('examples', {kind:'training'}),
      api('examples', {kind:'prompts'}), api('examples', {kind:'distilled'})
    ]);
    status = loaded[0].status === 'fulfilled' ? loaded[0].value : null;
    $('initial-loading').hidden = Boolean(status);
    if (!status) {
      $('initial-loading').classList.remove('loading');
      $('initial-loading').textContent = tr('loadFailed');
    }
    training = loaded[1].status === 'fulfilled' ? loaded[1].value.examples : [];
    prompts = loaded[2].status === 'fulfilled' ? loaded[2].value.examples : [];
    distilled = loaded[3].status === 'fulfilled' ? loaded[3].value.examples : [];
    renderList('training'); renderList('prompts'); renderAnswers(); render();
    if (['distill', 'auto'].includes(status?.job?.kind) && status.job.active) wasDistilling = true;
    if (status?.job?.kind === 'document' && status.job.active) wasDocumentGenerating = true;
    setInterval(refresh, 1500);
  })();
})();
