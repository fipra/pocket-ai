(() => {
  const translations = {
    it: {
      open: 'Guarda la demo', title: 'Prova Offllama in anteprima', intro: 'Dal modello alla prima risposta, in due passaggi.',
      notice: 'Demo illustrativa: non scarica modelli e non invia domande.', stepModel: '01 / MODELLO',
      chooseModel: 'Scegli un modello', modelInfo: 'GGUF · circa 2,1 GB · RAM consigliata 8 GB',
      loadModel: 'Scarica modello', modelPrompt: 'Premi il pulsante per vedere il caricamento.',
      downloading: 'Download simulato in corso…', modelReady: 'Modello pronto. Ora prova la chat.',
      stepChat: '02 / CHAT', tryChat: 'Invia una domanda', send: 'Invia', restart: 'Ricomincia la demo',
      chatWait: 'La chat si attiva dopo il caricamento del modello.',
      close: 'Chiudi demo', progress: 'Avanzamento simulato', example: 'Domanda di esempio',
      offlineQuestion: 'Posso usarlo senza Internet?', offlineAnswer: 'Sì. Dopo aver scaricato un modello, la chat funziona in locale anche senza Internet.',
      privacyQuestion: 'Dove restano le mie chat?', privacyAnswer: 'Le conversazioni restano nella cartella PocketAI-data sul tuo computer o sulla chiavetta USB.',
    },
    en: {
      open: 'Watch the demo', title: 'Preview Offllama', intro: 'From model selection to your first answer in two steps.',
      notice: 'Illustrative demo: no model is downloaded and no question is sent.', stepModel: '01 / MODEL',
      chooseModel: 'Choose a model', modelInfo: 'GGUF · about 2.1 GB · 8 GB RAM recommended',
      loadModel: 'Download model', modelPrompt: 'Press the button to see model setup.',
      downloading: 'Simulated download in progress…', modelReady: 'Model ready. Now try the chat.',
      stepChat: '02 / CHAT', tryChat: 'Ask a question', send: 'Send', restart: 'Restart the demo',
      chatWait: 'The chat becomes available after the model is ready.',
      close: 'Close demo', progress: 'Simulated progress', example: 'Example question',
      offlineQuestion: 'Can I use it without Internet?', offlineAnswer: 'Yes. Once you have downloaded a model, chat runs locally without Internet.',
      privacyQuestion: 'Where are my chats stored?', privacyAnswer: 'Conversations stay in the PocketAI-data folder on your computer or USB drive.',
    },
    fr: {
      open: 'Voir la démo', title: 'Découvrez Offllama', intro: 'Du choix du modèle à la première réponse en deux étapes.',
      notice: 'Démo illustrative : aucun modèle n’est téléchargé et aucune question n’est envoyée.', stepModel: '01 / MODÈLE',
      chooseModel: 'Choisissez un modèle', modelInfo: 'GGUF · environ 2,1 Go · 8 Go de RAM recommandés',
      loadModel: 'Télécharger le modèle', modelPrompt: 'Appuyez sur le bouton pour voir la préparation du modèle.',
      downloading: 'Téléchargement simulé en cours…', modelReady: 'Modèle prêt. Essayez maintenant la discussion.',
      stepChat: '02 / DISCUSSION', tryChat: 'Posez une question', send: 'Envoyer', restart: 'Recommencer la démo',
      chatWait: 'La discussion devient disponible lorsque le modèle est prêt.',
      close: 'Fermer la démo', progress: 'Progression simulée', example: 'Question d’exemple',
      offlineQuestion: 'Puis-je l’utiliser sans Internet ?', offlineAnswer: 'Oui. Après le téléchargement d’un modèle, la discussion fonctionne en local sans Internet.',
      privacyQuestion: 'Où sont stockées mes discussions ?', privacyAnswer: 'Les conversations restent dans le dossier PocketAI-data sur votre ordinateur ou votre clé USB.',
    },
    de: {
      open: 'Demo ansehen', title: 'Offllama in der Vorschau', intro: 'In zwei Schritten vom Modell zur ersten Antwort.',
      notice: 'Beispiel-Demo: Es wird kein Modell heruntergeladen und keine Frage gesendet.', stepModel: '01 / MODELL',
      chooseModel: 'Modell auswählen', modelInfo: 'GGUF · etwa 2,1 GB · 8 GB RAM empfohlen',
      loadModel: 'Modell herunterladen', modelPrompt: 'Drücke die Taste, um die Einrichtung zu sehen.',
      downloading: 'Simulierter Download läuft…', modelReady: 'Modell bereit. Probiere jetzt den Chat aus.',
      stepChat: '02 / CHAT', tryChat: 'Frage stellen', send: 'Senden', restart: 'Demo neu starten',
      chatWait: 'Der Chat ist verfügbar, sobald das Modell bereit ist.',
      close: 'Demo schließen', progress: 'Simulierter Fortschritt', example: 'Beispielfrage',
      offlineQuestion: 'Kann ich es ohne Internet nutzen?', offlineAnswer: 'Ja. Sobald du ein Modell heruntergeladen hast, funktioniert der Chat lokal ohne Internet.',
      privacyQuestion: 'Wo bleiben meine Chats?', privacyAnswer: 'Unterhaltungen bleiben im Ordner PocketAI-data auf deinem Computer oder USB-Stick.',
    },
    es: {
      open: 'Ver la demo', title: 'Descubre Offllama', intro: 'Del modelo a la primera respuesta en dos pasos.',
      notice: 'Demo ilustrativa: no se descarga ningún modelo ni se envía ninguna pregunta.', stepModel: '01 / MODELO',
      chooseModel: 'Elige un modelo', modelInfo: 'GGUF · unos 2,1 GB · se recomiendan 8 GB de RAM',
      loadModel: 'Descargar modelo', modelPrompt: 'Pulsa el botón para ver la preparación del modelo.',
      downloading: 'Descarga simulada en curso…', modelReady: 'Modelo listo. Ahora prueba el chat.',
      stepChat: '02 / CHAT', tryChat: 'Haz una pregunta', send: 'Enviar', restart: 'Reiniciar la demo',
      chatWait: 'El chat estará disponible cuando el modelo esté listo.',
      close: 'Cerrar demo', progress: 'Progreso simulado', example: 'Pregunta de ejemplo',
      offlineQuestion: '¿Puedo usarlo sin Internet?', offlineAnswer: 'Sí. Después de descargar un modelo, el chat funciona localmente sin Internet.',
      privacyQuestion: '¿Dónde se guardan mis chats?', privacyAnswer: 'Las conversaciones permanecen en la carpeta PocketAI-data de tu ordenador o memoria USB.',
    },
  };

  const $ = id => document.getElementById(id);
  const dialog = $('demo-dialog');
  const copy = translations[document.documentElement.lang] || translations.en;
  const samples = { offline: [copy.offlineQuestion, copy.offlineAnswer], privacy: [copy.privacyQuestion, copy.privacyAnswer] };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  let loaded = false;
  let answering = false;
  let selected = 'offline';

  $('open-demo').textContent = copy.open;
  dialog.querySelectorAll('[data-demo-text]').forEach(node => { node.textContent = copy[node.dataset.demoText]; });
  $('demo-close').setAttribute('aria-label', copy.close);
  $('demo-progress').setAttribute('aria-label', copy.progress);
  $('demo-prompt').setAttribute('aria-label', copy.example);
  dialog.querySelectorAll('[data-demo-sample]').forEach(button => {
    button.textContent = samples[button.dataset.demoSample][0];
    button.onclick = () => {
      selected = button.dataset.demoSample;
      $('demo-prompt').value = samples[selected][0];
    };
  });

  function clearTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function reset() {
    clearTimer();
    loaded = false;
    answering = false;
    selected = 'offline';
    $('demo-load').disabled = false;
    $('demo-load').textContent = copy.loadModel;
    $('demo-status').textContent = copy.modelPrompt;
    $('demo-progress').hidden = true;
    $('demo-progress').setAttribute('aria-valuenow', '0');
    $('demo-progress-fill').style.width = '0%';
    const waiting = document.createElement('p');
    waiting.className = 'demo-status';
    waiting.textContent = copy.chatWait;
    $('demo-messages').replaceChildren(waiting);
    $('demo-prompt').value = samples[selected][0];
    $('demo-prompt').disabled = true;
    $('demo-send').disabled = true;
    dialog.querySelectorAll('[data-demo-sample]').forEach(button => { button.disabled = true; });
  }

  $('open-demo').onclick = () => { reset(); dialog.showModal(); };
  $('demo-close').onclick = () => dialog.close();
  $('demo-reset').onclick = reset;
  dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
  dialog.addEventListener('close', clearTimer);

  $('demo-load').onclick = () => {
    if (loaded || timer !== null) return;
    $('demo-load').disabled = true;
    $('demo-progress').hidden = false;
    $('demo-status').textContent = copy.downloading;
    let progress = 0;
    const advance = () => {
      progress = Math.min(100, progress + (reduceMotion ? 100 : 20));
      $('demo-progress').setAttribute('aria-valuenow', String(progress));
      $('demo-progress-fill').style.width = `${progress}%`;
      if (progress === 100) {
        clearTimer();
        loaded = true;
        $('demo-status').textContent = copy.modelReady;
        $('demo-messages').replaceChildren();
        $('demo-prompt').disabled = false;
        $('demo-send').disabled = false;
        dialog.querySelectorAll('[data-demo-sample]').forEach(button => { button.disabled = false; });
      }
    };
    if (reduceMotion) advance();
    else timer = setInterval(advance, 260);
  };

  $('demo-form').onsubmit = event => {
    event.preventDefault();
    if (!loaded || answering) return;
    answering = true;
    $('demo-send').disabled = true;
    dialog.querySelectorAll('[data-demo-sample]').forEach(button => { button.disabled = true; });
    const [question, response] = samples[selected];
    const user = document.createElement('p');
    user.className = 'demo-message user';
    user.textContent = question;
    const assistant = document.createElement('p');
    assistant.className = 'demo-message assistant';
    $('demo-messages').append(user, assistant);
    $('demo-messages').scrollTop = $('demo-messages').scrollHeight;
    const finish = () => {
      clearTimer();
      answering = false;
      $('demo-send').disabled = false;
      dialog.querySelectorAll('[data-demo-sample]').forEach(button => { button.disabled = false; });
    };
    if (reduceMotion) { assistant.textContent = response; finish(); return; }
    const chars = [...response];
    let index = 0;
    timer = setInterval(() => {
      index = Math.min(chars.length, index + 3);
      assistant.textContent = chars.slice(0, index).join('');
      $('demo-messages').scrollTop = $('demo-messages').scrollHeight;
      if (index === chars.length) finish();
    }, 35);
  };
})();
