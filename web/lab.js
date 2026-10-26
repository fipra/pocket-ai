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
  let editingPair = null;
  let editingPrompt = null;
  let answerEditing = false;
  let lastPreviewPrompt = null;
  let correctionRecorded = false;
  let activeTab = 'train';
  let wasDistilling = false;

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
    $('job-detail').textContent = job.error || (job.kind === 'distill' ? `${job.done}/${job.total} ${tr('jobProgress')}` : '');
    $('cancel-job').disabled = !job.active;
    if (job.kind === 'distill' && job.total) $('job-progress').value = Math.round(job.done / job.total * 100);
    else if (job.active) $('job-progress').removeAttribute('value');
    else $('job-progress').value = job.phase === 'complete' ? 100 : 0;
    $('job-log').textContent = job.log || '';
    if (job.kind === 'train' && !job.active) message('train-message', job.error || phase, job.phase === 'failed');
    if (job.kind === 'export' && !job.active) message('export-message', job.error || (job.phase === 'complete' ? `${tr('modelReady')} ${job.output}` : phase), job.phase === 'failed');
    if (job.kind === 'distill' && !job.active) message('generate-message', job.error || phase, job.phase === 'failed');
    if (job.kind === 'preview' && !job.active) {
      message('preview-message', job.error || phase, job.phase === 'failed');
      $('preview-output').hidden = job.phase !== 'complete';
      $('preview-output').textContent = job.phase === 'complete' ? (job.response || '') : '';
      $('correction').hidden = job.phase !== 'complete' || (!lastPreviewPrompt && !correctionRecorded);
    }
  }

  function render() {
    if (!status) return;
    const busy = saving || status.job?.active === true;
    $('pair-count').textContent = `${training.length < 5 ? `${training.length}/5` : training.length} ${tr('pairCount')}`;
    $('prompt-count').textContent = `${prompts.length}/30 ${tr('promptCount')}`;
    for (const id of ['pair-add', 'pair-example', 'pair-clear', 'prompt-add', 'prompt-example', 'prompt-clear']) $(id).disabled = busy;
    for (const id of ['pair-prompt', 'pair-answer', 'teacher-prompt', 'pair-cancel', 'prompt-cancel']) $(id).disabled = busy;
    document.querySelectorAll('#pair-list button, #prompt-list button, #answer-list button').forEach(node => { node.disabled = busy; });
    const pendingPair = Boolean($('pair-prompt').value.trim() || $('pair-answer').value.trim());
    const pendingPrompt = Boolean($('teacher-prompt').value.trim());
    const longTraining = training.some(row => [...(row.completion || '')].length > 4000);
    const answersMatch = !prompts.length || (prompts.length === distilled.length && prompts.every((row, index) => row.prompt === distilled[index].prompt));
    $('train-start').disabled = busy || pendingPair || longTraining || !status.trainSupported || training.length < 5;
    $('train-start').textContent = tr(status.canContinue ? 'continueTrain' : 'trainStart');
    $('iterations-label').textContent = tr(status.canContinue ? 'additionalIterations' : 'iterations');
    $('train-mode').hidden = !status.canContinue;
    $('train-mode').textContent = status.canContinue ? tr('continueHelp') : '';
    $('generate-start').disabled = busy || pendingPrompt || prompts.length === 0 || !models.length;
    $('preview-start').disabled = busy || !status.adapterFresh;
    $('export-model').disabled = busy || !status.adapterFresh || !status.trainSupported;
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
    $('base-model').textContent = status.baseModel || '';
    $('workspace').textContent = status.workspace || '';
    if (!models.length) message('generate-message', tr('noModels'));
    else if (pendingPrompt) message('generate-message', tr('pendingPrompt'));
    else if (prompts.length === 0) message('generate-message', tr('needQuestion'));
    else if (status.job?.kind !== 'distill') message('generate-message');
    if (pendingPair) message('train-message', tr('pendingPair'));
    else if (longTraining) message('train-message', tr('shortenAnswer'));
    else if (training.length < 5) message('train-message', tr('trainNeedFive'));
    else if (status.job?.kind !== 'train') message('train-message');
    if (!status.adapter && status.job?.kind !== 'preview') message('preview-message', tr('noAdapter'));
    else if (status.adapter && !status.adapterFresh && status.job?.kind !== 'preview') message('preview-message', tr('needsRetrain'));
    else if (status.adapterFresh && status.job?.kind !== 'preview') message('preview-message');
    renderJob();
  }

  async function saveRows(kind, rows) {
    if (saving) return;
    saving = true;
    const messageId = kind === 'training' ? 'pair-message' : kind === 'prompts' ? 'prompt-message' : 'answer-message';
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
      render();
    }
  }

  $('tab-train').onclick = () => tab('train');
  $('tab-distill').onclick = () => tab('distill');
  $('pair-reset').onclick = () => resetPath('training');
  $('prompt-reset').onclick = () => resetPath('prompts');
  for (const [kind, prefix] of [['training','pair'],['prompts','prompt']]) {
    $(`${prefix}-export`).onclick = () => exportCopy(kind);
    $(`${prefix}-import`).onclick = () => $(`${prefix}-file`).click();
    $(`${prefix}-file`).addEventListener('change', async event => {
      const file = event.target.files[0];
      if (file) await importCopy(kind, file);
      event.target.value = '';
    });
  }
  $('pair-example').onclick = () => {
    $('pair-prompt').value = tr('pairExamplePrompt');
    $('pair-answer').value = tr('pairExampleAnswer');
    $('pair-prompt').focus();
  };
  $('prompt-example').onclick = () => { $('teacher-prompt').value = tr('promptExample'); $('teacher-prompt').focus(); };
  $('pair-cancel').onclick = clearPairForm;
  $('prompt-cancel').onclick = clearPromptForm;
  $('pair-clear').onclick = clearPairForm;
  $('prompt-clear').onclick = clearPromptForm;
  for (const id of ['pair-prompt','pair-answer','teacher-prompt']) $(id).addEventListener('input', render);
  window.addEventListener('beforeunload', event => {
    if ($('pair-prompt').value.trim() || $('pair-answer').value.trim() || $('teacher-prompt').value.trim() || $('correction-answer').value.trim() || answerEditing) {
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
  $('train-start').onclick = async () => {
    try { status = await api('train', {iterations:Number($('iterations').value)}); correctionRecorded = false; $('correction').hidden = true; render(); }
    catch (error) { message('train-message', error.message, true); }
  };
  $('export-model').onclick = async () => {
    try { status = await api('export_model'); render(); }
    catch (error) { message('export-message', error.message, true); }
  };
  $('generate-start').onclick = async () => {
    try { status = await api('distill', {teacher:$('teacher').value}); wasDistilling = true; render(); }
    catch (error) { message('generate-message', error.message, true); }
  };
  $('preview-start').onclick = async () => {
    const prompt = $('preview-prompt').value.trim();
    if (!prompt) return message('preview-message', tr('previewNeed'), true);
    try {
      status = await api('preview', {prompt});
      lastPreviewPrompt = prompt;
      correctionRecorded = false;
      $('preview-output').hidden = true;
      $('correction').hidden = true;
      $('correction-answer').value = '';
      message('correction-message');
      render();
    }
    catch (error) { message('preview-message', error.message, true); }
  };
  $('correction-save').onclick = async () => {
    const completion = $('correction-answer').value.trim();
    if (!completion) return message('correction-message', tr('correctionNeed'), true);
    if (!lastPreviewPrompt) return;
    const index = training.findIndex(row => row.prompt === lastPreviewPrompt);
    if (index >= 0 && training[index].completion === completion) {
      return message('correction-message', tr('correctionAlreadyPresent'));
    }
    if (index < 0 && training.length >= 200) return message('correction-message', tr('pairLimit'), true);
    const next = training.slice();
    if (index < 0) next.push({prompt:lastPreviewPrompt, completion});
    else next[index] = {prompt:lastPreviewPrompt, completion};
    try {
      await saveRows('training', next);
      lastPreviewPrompt = null;
      correctionRecorded = true;
      $('correction-answer').value = '';
      message('correction-message', tr('correctionSaved'));
      render();
    } catch (error) { message('correction-message', `${tr('failedSave')} ${error.message}`, true); }
  };
  $('use-answers').onclick = async () => {
    if (training.length && !window.confirm(tr('copyConfirm'))) return;
    try {
      status = await api('use_distilled');
      training = (await api('examples', {kind:'training'})).examples;
      clearPairForm(); renderList('training'); render(); tab('train');
      message('pair-message', tr('copied'));
      window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) { message('answer-message', error.message, true); }
  };
  $('cancel-job').onclick = async () => {
    try { status = await api('cancel'); render(); }
    catch (error) { message('generate-message', error.message, true); }
  };

  async function refresh() {
    try {
      status = await api('status');
      const job = status.job;
      if (job?.kind === 'distill' && job.active) wasDistilling = true;
      if (wasDistilling && job?.kind === 'distill' && !job.active) {
        wasDistilling = false;
        if (job.phase === 'complete') {
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
    const selector = $('teacher');
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
    const loaded = await Promise.allSettled([
      api('status'), api('examples', {kind:'training'}),
      api('examples', {kind:'prompts'}), api('examples', {kind:'distilled'})
    ]);
    status = loaded[0].status === 'fulfilled' ? loaded[0].value : null;
    training = loaded[1].status === 'fulfilled' ? loaded[1].value.examples : [];
    prompts = loaded[2].status === 'fulfilled' ? loaded[2].value.examples : [];
    distilled = loaded[3].status === 'fulfilled' ? loaded[3].value.examples : [];
    renderList('training'); renderList('prompts'); renderAnswers(); render();
    if (status?.job?.kind === 'distill' && status.job.active) wasDistilling = true;
    setInterval(refresh, 1500);
  })();
})();
