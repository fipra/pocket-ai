(() => {
  // The Italian HTML is the readable fallback when JavaScript is unavailable.
  const rows = [
    ["Perché LlamaNest", "Why LlamaNest", "Pourquoi LlamaNest", "Warum LlamaNest", "Por qué LlamaNest"],
    ["Come funziona", "How it works", "Comment ça marche", "So funktioniert es", "Cómo funciona"],
    ["Scarica gratis ↓", "Download free ↓", "Télécharger gratuitement ↓", "Kostenlos herunterladen ↓", "Descargar gratis ↓"],
    ["Un progetto FipraAI", "A FipraAI project", "Un projet FipraAI", "Ein Projekt von FipraAI", "Un proyecto de FipraAI"],
    ["La tua AI.", "Your AI.", "Votre IA.", "Deine KI.", "Tu IA."],
    ["Senza cloud.", "Without the cloud.", "Sans cloud.", "Ohne Cloud.", "Sin nube."],
    ["Scrivi testi, riassumi documenti e trova risposte nei tuoi file con un'AI che lavora sul tuo dispositivo. Chat e documenti non vengono inviati al cloud. Usala dal browser oppure scaricala per Mac o Windows: dopo il download del modello, l'app per computer funziona anche senza Internet.", "Write, summarize documents, and find answers in your files with AI that runs on your device. Your chats and documents aren't sent to the cloud. Use it in your browser or download it for Mac or Windows: after downloading a model, the desktop app also works without Internet.", "Rédigez des textes, résumez des documents et trouvez des réponses dans vos fichiers grâce à une IA qui fonctionne sur votre appareil. Vos discussions et documents ne sont pas envoyés dans le cloud. Utilisez-la dans votre navigateur ou téléchargez-la pour Mac ou Windows : après le téléchargement d'un modèle, l'application pour ordinateur fonctionne aussi sans Internet.", "Schreibe Texte, fasse Dokumente zusammen und finde Antworten in deinen Dateien – mit einer KI, die auf deinem Gerät läuft. Chats und Dokumente werden nicht in die Cloud gesendet. Nutze sie im Browser oder lade sie für Mac oder Windows herunter: Nach dem Modelldownload funktioniert die Desktop-App auch ohne Internet.", "Escribe textos, resume documentos y encuentra respuestas en tus archivos con una IA que funciona en tu dispositivo. Tus chats y documentos no se envían a la nube. Úsala en el navegador o descárgala para Mac o Windows: tras descargar un modelo, la aplicación de escritorio también funciona sin Internet."],
    ["Scarica LlamaNest", "Download LlamaNest", "Télécharger LlamaNest", "LlamaNest herunterladen", "Descargar LlamaNest"],
    ["Apri LlamaNest Web", "Open LlamaNest Web", "Ouvrir LlamaNest Web", "LlamaNest Web öffnen", "Abrir LlamaNest Web"],
    ["Scopri come funziona", "See how it works", "Découvrez comment ça marche", "So funktioniert es", "Descubre cómo funciona"],
    ["Gratis per uso personale · Nessun account · Web, Mac e Windows", "Free for personal use · No account · Web, Mac and Windows", "Gratuit pour un usage personnel · Sans compte · Web, Mac et Windows", "Für private Nutzung kostenlos · Kein Konto · Web, Mac und Windows", "Gratis para uso personal · Sin cuenta · Web, Mac y Windows"],
    ["LlamaNest · sul tuo computer", "LlamaNest · on your computer", "LlamaNest · sur votre ordinateur", "LlamaNest · auf deinem Computer", "LlamaNest · en tu ordenador"],
    ["Nuova chat", "New chat", "Nouvelle discussion", "Neuer Chat", "Nuevo chat"],
    ["Posso usarlo anche senza Internet?", "Can I use it without Internet?", "Puis-je l'utiliser sans Internet ?", "Kann ich es ohne Internet nutzen?", "¿Puedo usarlo sin Internet?"],
    ["Sì. Dopo aver scaricato un modello, puoi conversare e cercare nei tuoi documenti direttamente sul computer, anche offline.", "Yes. Once you download a model, you can chat and search your documents directly on your computer, even offline.", "Oui. Après avoir téléchargé un modèle, vous pouvez discuter et rechercher dans vos documents directement sur votre ordinateur, même hors ligne.", "Ja. Nach dem Download eines Modells kannst du direkt auf deinem Computer chatten und deine Dokumente durchsuchen, auch offline.", "Sí. Después de descargar un modelo, puedes conversar y buscar en tus documentos directamente en tu ordenador, incluso sin conexión."],
    ["Chiedi a LlamaNest…", "Ask LlamaNest…", "Demandez à LlamaNest…", "Frag LlamaNest…", "Pregunta a LlamaNest…"],
    ["Pronto anche per la tua chiavetta USB", "Ready for your USB drive too", "Prêt aussi pour votre clé USB", "Auch für deinen USB-Stick bereit", "También listo para tu memoria USB"],
    ["Scegli la tua versione.", "Choose your version.", "Choisissez votre version.", "Wähle deine Version.", "Elige tu versión."],
    ["Scarica lo ZIP adatto al tuo computer. Estrai la cartella sul disco o direttamente su una chiavetta USB.", "Download the ZIP for your computer. Extract the folder to your drive or directly to a USB drive.", "Téléchargez le ZIP adapté à votre ordinateur. Extrayez le dossier sur votre disque ou directement sur une clé USB.", "Lade die passende ZIP-Datei herunter. Entpacke den Ordner auf deinen Computer oder direkt auf einen USB-Stick.", "Descarga el ZIP adecuado para tu ordenador. Extrae la carpeta en el disco o directamente en una memoria USB."],
    ["Per Mac con chip M1, M2, M3, M4 o successivi.", "For Macs with an M1, M2, M3, M4 or newer chip.", "Pour les Mac avec puce M1, M2, M3, M4 ou plus récente.", "Für Macs mit M1-, M2-, M3-, M4-Chip oder neuer.", "Para Mac con chip M1, M2, M3, M4 o posterior."],
    ["Scarica per Mac", "Download for Mac", "Télécharger pour Mac", "Für Mac herunterladen", "Descargar para Mac"],
    ["Per Mac con processore Intel.", "For Macs with an Intel processor.", "Pour les Mac avec processeur Intel.", "Für Macs mit Intel-Prozessor.", "Para Mac con procesador Intel."],
    ["Scarica per Mac Intel", "Download for Intel Mac", "Télécharger pour Mac Intel", "Für Intel-Mac herunterladen", "Descargar para Mac Intel"],
    ["Per PC Windows con processore a 64 bit.", "For Windows PCs with a 64-bit processor.", "Pour les PC Windows avec processeur 64 bits.", "Für Windows-PCs mit 64-Bit-Prozessor.", "Para PC Windows con procesador de 64 bits."],
    ["Scarica per Windows", "Download for Windows", "Télécharger pour Windows", "Für Windows herunterladen", "Descargar para Windows"],
    ["Queste nuove release usano la licenza USB AI per uso personale, didattico e ricerca non commerciale. Per l'uso commerciale serve un accordo separato. Le vecchie release MIT restano disponibili su GitHub.", "These new releases use the USB AI license for personal, educational, and non-commercial research use. Commercial use requires a separate agreement. Earlier MIT releases remain available on GitHub.", "Ces nouvelles versions utilisent la licence USB AI pour un usage personnel, pédagogique et de recherche non commerciale. Un accord distinct est requis pour un usage commercial. Les anciennes versions MIT restent disponibles sur GitHub.", "Diese neuen Versionen stehen unter der USB-AI-Lizenz für private, pädagogische und nichtkommerzielle Forschungszwecke. Für kommerzielle Nutzung ist eine gesonderte Vereinbarung erforderlich. Frühere MIT-Versionen bleiben auf GitHub verfügbar.", "Estas nuevas versiones usan la licencia USB AI para uso personal, educativo y de investigación no comercial. El uso comercial requiere un acuerdo aparte. Las versiones MIT anteriores siguen disponibles en GitHub."],
    ["Informazioni sulle licenze", "Licensing information", "Informations sur les licences", "Lizenzinformationen", "Información sobre licencias"],
    ["Semplice per davvero", "Truly simple", "Vraiment simple", "Ganz einfach", "Realmente sencillo"],
    ["Uno spazio tutto tuo.", "A space of your own.", "Un espace à vous.", "Dein eigener Bereich.", "Un espacio solo tuyo."],
    ["Usa LlamaNest nel browser o nell'app per Mac e Windows: il modello lavora sul tuo dispositivo. Con l'app per computer puoi anche tenere tutto su una chiavetta USB.", "Use LlamaNest in your browser or in the Mac and Windows app: the model runs on your device. With the desktop app, you can also keep everything on a USB drive.", "Utilisez LlamaNest dans votre navigateur ou l'application pour Mac et Windows : le modèle fonctionne sur votre appareil. Avec l'application pour ordinateur, vous pouvez aussi tout conserver sur une clé USB.", "Nutze LlamaNest im Browser oder in der App für Mac und Windows: Das Modell läuft auf deinem Gerät. Mit der Desktop-App kannst du auch alles auf einem USB-Stick speichern.", "Usa LlamaNest en el navegador o en la aplicación para Mac y Windows: el modelo funciona en tu dispositivo. Con la aplicación de escritorio, también puedes guardar todo en una memoria USB."],
    ["I tuoi documenti", "Your documents", "Vos documents", "Deine Dokumente", "Tus documentos"],
    ["Importa PDF testuali, TXT e Markdown. Cerca i passaggi rilevanti e consulta le fonti nella chat.", "Import text PDFs, TXT, and Markdown. Find relevant passages and check sources in the chat.", "Importez des PDF textuels, des fichiers TXT et Markdown. Retrouvez les passages pertinents et consultez les sources dans la discussion.", "Importiere Text-PDFs, TXT und Markdown. Finde relevante Stellen und prüfe Quellen im Chat.", "Importa PDF de texto, TXT y Markdown. Encuentra fragmentos relevantes y consulta las fuentes en el chat."],
    ["Anche sul Web", "Also on the Web", "Aussi sur le Web", "Auch im Web", "También en la Web"],
    ["Apri LlamaNest nel browser, senza installare un programma. Il modello lavora sul tuo dispositivo e i documenti restano nel browser.", "Open LlamaNest in your browser without installing an app. The model runs on your device and documents stay in your browser.", "Ouvrez LlamaNest dans votre navigateur sans installer de programme. Le modèle fonctionne sur votre appareil et les documents restent dans le navigateur.", "Öffne LlamaNest im Browser, ohne ein Programm zu installieren. Das Modell läuft auf deinem Gerät und Dokumente bleiben im Browser.", "Abre LlamaNest en el navegador sin instalar un programa. El modelo funciona en tu dispositivo y los documentos permanecen en el navegador."],
    ["Anche senza Internet", "Also without Internet", "Aussi sans Internet", "Auch ohne Internet", "También sin Internet"],
    ["Nell'app per Mac e Windows, dopo aver scaricato un modello, puoi chattare e consultare i tuoi documenti anche offline.", "In the Mac and Windows app, after downloading a model, you can chat and consult your documents offline too.", "Dans l'application pour Mac et Windows, après avoir téléchargé un modèle, vous pouvez discuter et consulter vos documents même hors ligne.", "In der App für Mac und Windows kannst du nach dem Modelldownload auch offline chatten und deine Dokumente nutzen.", "En la aplicación para Mac y Windows, tras descargar un modelo, también puedes chatear y consultar tus documentos sin conexión."],
    ["Inizia in tre passi", "Get started in three steps", "Commencez en trois étapes", "In drei Schritten starten", "Empieza en tres pasos"],
    ["Dallo ZIP alla prima chat.", "From ZIP to your first chat.", "Du ZIP à votre première discussion.", "Von der ZIP-Datei zum ersten Chat.", "Del ZIP a tu primer chat."],
    ["Non serve un account. Tieni intera la cartella estratta per conservare il tuo spazio di lavoro.", "No account needed. Keep the extracted folder intact to preserve your workspace.", "Aucun compte nécessaire. Gardez le dossier extrait intact pour conserver votre espace de travail.", "Du brauchst kein Konto. Lass den entpackten Ordner vollständig, damit dein Arbeitsbereich erhalten bleibt.", "No necesitas una cuenta. Conserva intacta la carpeta extraída para mantener tu espacio de trabajo."],
    ["01 / SCARICA", "01 / DOWNLOAD", "01 / TÉLÉCHARGER", "01 / HERUNTERLADEN", "01 / DESCARGAR"],
    ["Scegli Mac o Windows", "Choose Mac or Windows", "Choisissez Mac ou Windows", "Mac oder Windows wählen", "Elige Mac o Windows"],
    ["Scarica la versione corretta e decomprimi lo ZIP sul computer o sulla chiavetta.", "Download the right version and extract the ZIP to your computer or USB drive.", "Téléchargez la bonne version et extrayez le ZIP sur votre ordinateur ou clé USB.", "Lade die passende Version herunter und entpacke die ZIP-Datei auf deinen Computer oder USB-Stick.", "Descarga la versión adecuada y extrae el ZIP en el ordenador o en la memoria USB."],
    ["02 / AVVIA", "02 / START", "02 / LANCER", "02 / STARTEN", "02 / INICIAR"],
    ["Apri LlamaNest", "Open LlamaNest", "Ouvrez LlamaNest", "LlamaNest öffnen", "Abre LlamaNest"],
    ["Su Mac apri “Avvia LlamaNest.command”; su Windows apri “Avvia LlamaNest.cmd”.", "On Mac, open “Avvia LlamaNest.command”; on Windows, open “Avvia LlamaNest.cmd”.", "Sur Mac, ouvrez « Avvia LlamaNest.command » ; sur Windows, ouvrez « Avvia LlamaNest.cmd ».", "Öffne auf dem Mac „Avvia LlamaNest.command“ und unter Windows „Avvia LlamaNest.cmd“.", "En Mac, abre «Avvia LlamaNest.command»; en Windows, abre «Avvia LlamaNest.cmd»."],
    ["03 / CONVERSA", "03 / CHAT", "03 / DISCUTER", "03 / CHATTEN", "03 / CONVERSAR"],
    ["Scegli un modello", "Choose a model", "Choisissez un modèle", "Modell wählen", "Elige un modelo"],
    ["Scarica un modello compatibile con la RAM del tuo computer. Poi puoi lavorare anche offline.", "Download a model that fits your computer's RAM. Then you can work offline too.", "Téléchargez un modèle adapté à la RAM de votre ordinateur. Vous pourrez ensuite travailler hors ligne.", "Lade ein Modell herunter, das zum RAM deines Computers passt. Danach kannst du auch offline arbeiten.", "Descarga un modelo compatible con la RAM de tu ordenador. Después también podrás trabajar sin conexión."],
    ["La tua AI, alle tue condizioni.", "Your AI, your way.", "Votre IA, à vos conditions.", "Deine KI, nach deinen Regeln.", "Tu IA, a tu manera."],
    ["Aprila sul Web o scaricala per Mac e Windows. Le tue chat e i tuoi documenti restano sul tuo dispositivo.", "Open it on the Web or download it for Mac and Windows. Your chats and documents stay on your device.", "Ouvrez-la sur le Web ou téléchargez-la pour Mac et Windows. Vos discussions et documents restent sur votre appareil.", "Öffne sie im Web oder lade sie für Mac und Windows herunter. Deine Chats und Dokumente bleiben auf deinem Gerät.", "Ábrela en la Web o descárgala para Mac y Windows. Tus chats y documentos permanecen en tu dispositivo."],
    ["Scegli la tua versione", "Choose your version", "Choisissez votre version", "Wähle deine Version", "Elige tu versión"],
    ["· un progetto di Fabrizio Casula", "· a project by Fabrizio Casula", "· un projet de Fabrizio Casula", "· ein Projekt von Fabrizio Casula", "· un proyecto de Fabrizio Casula"],
    ["© 2026 Fabrizio Casula · Copie precedenti MIT; distribuzioni future con licenza per uso personale", "© 2026 Fabrizio Casula · Earlier copies: MIT; future distributions: personal-use license", "© 2026 Fabrizio Casula · Copies antérieures : MIT ; futures distributions : licence d'utilisation personnelle", "© 2026 Fabrizio Casula · Frühere Kopien: MIT; zukünftige Distributionen: Lizenz für private Nutzung", "© 2026 Fabrizio Casula · Copias anteriores: MIT; futuras distribuciones: licencia de uso personal"],
    ["Codice su GitHub", "Code on GitHub", "Code sur GitHub", "Code auf GitHub", "Código en GitHub"],
    ["Release Mac", "Mac releases", "Versions Mac", "Mac-Releases", "Versiones Mac"],
    ["Release Windows", "Windows releases", "Versions Windows", "Windows-Releases", "Versiones Windows"]
  ];

  const attributes = [
    ["LlamaNest, torna all'inizio", "LlamaNest, back to top", "LlamaNest, retour en haut", "LlamaNest, zurück nach oben", "LlamaNest, volver arriba"],
    ["Volpe, simbolo di LlamaNest", "Fox, LlamaNest symbol", "Renard, symbole de LlamaNest", "Fuchs, Symbol von LlamaNest", "Zorro, símbolo de LlamaNest"],
    ["Navigazione principale", "Main navigation", "Navigation principale", "Hauptnavigation", "Navegación principal"],
    ["Anteprima illustrativa della chat LlamaNest", "Illustrative preview of LlamaNest chat", "Aperçu illustratif du chat LlamaNest", "Illustrative Vorschau des LlamaNest Chats", "Vista ilustrativa del chat de LlamaNest"],
    ["Scarica LlamaNest per Mac Apple Silicon, file ZIP", "Download LlamaNest for Apple Silicon Mac, ZIP file", "Télécharger LlamaNest pour Mac Apple Silicon, fichier ZIP", "LlamaNest für Apple Silicon Mac herunterladen, ZIP-Datei", "Descargar LlamaNest para Mac Apple Silicon, archivo ZIP"],
    ["Scarica LlamaNest per Mac Intel, file ZIP", "Download LlamaNest for Intel Mac, ZIP file", "Télécharger LlamaNest pour Mac Intel, fichier ZIP", "LlamaNest für Intel-Mac herunterladen, ZIP-Datei", "Descargar LlamaNest para Mac Intel, archivo ZIP"],
    ["Scarica LlamaNest per Windows x64, file ZIP", "Download LlamaNest for Windows x64, ZIP file", "Télécharger LlamaNest pour Windows x64, fichier ZIP", "LlamaNest für Windows x64 herunterladen, ZIP-Datei", "Descargar LlamaNest para Windows x64, archivo ZIP"],
    ["Link utili", "Useful links", "Liens utiles", "Nützliche Links", "Enlaces útiles"]
  ];

  const locales = ["it", "en", "fr", "de", "es"];
  const preferred = navigator.languages || [navigator.language || "en"];
  const language = preferred.map(value => value.toLowerCase().split("-")[0]).find(value => locales.includes(value)) || "en";
  const column = locales.indexOf(language);
  document.documentElement.lang = language;
  if (language === "it") return;

  const dictionary = new Map(rows.map(row => [row[0], row[column]]));
  const attributeDictionary = new Map(attributes.map(row => [row[0], row[column]]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const original = node.textContent.trim();
    if (!dictionary.has(original)) continue;
    const leading = node.textContent.match(/^\s*/)[0];
    const trailing = node.textContent.match(/\s*$/)[0];
    node.textContent = leading + dictionary.get(original) + trailing;
  }
  document.querySelectorAll("[aria-label]").forEach(element => {
    const value = element.getAttribute("aria-label");
    if (attributeDictionary.has(value)) element.setAttribute("aria-label", attributeDictionary.get(value));
  });
  const meta = {
    en: ["LlamaNest by FipraAI — Private AI for Web, Mac and Windows", "Write, summarize documents, and ask questions about your files with LlamaNest. Chats and documents stay on your device. Available on the Web, Mac and Windows.", "LlamaNest by FipraAI — Your AI, without the cloud", "Write, summarize, and search your documents with AI that runs on your device. On the Web, Mac and Windows."],
    fr: ["LlamaNest by FipraAI — IA privée sur le Web, Mac et Windows", "Rédigez, résumez des documents et interrogez vos fichiers avec LlamaNest. Discussions et documents restent sur votre appareil. Disponible sur le Web, Mac et Windows.", "LlamaNest by FipraAI — Votre IA, sans cloud", "Rédigez, résumez et recherchez dans vos documents avec une IA qui fonctionne sur votre appareil. Sur le Web, Mac et Windows."],
    de: ["LlamaNest by FipraAI — Private KI im Web, auf Mac und Windows", "Schreibe Texte, fasse Dokumente zusammen und stelle Fragen zu deinen Dateien mit LlamaNest. Chats und Dokumente bleiben auf deinem Gerät. Im Web, auf Mac und Windows.", "LlamaNest by FipraAI — Deine KI, ohne Cloud", "Schreibe, fasse zusammen und durchsuche deine Dokumente mit KI auf deinem Gerät. Im Web, auf Mac und Windows."],
    es: ["LlamaNest by FipraAI — IA privada en la Web, Mac y Windows", "Escribe, resume documentos y haz preguntas sobre tus archivos con LlamaNest. Los chats y documentos permanecen en tu dispositivo. Disponible en la Web, Mac y Windows.", "LlamaNest by FipraAI — Tu IA, sin nube", "Escribe, resume y busca en tus documentos con una IA que funciona en tu dispositivo. En la Web, Mac y Windows."]
  }[language];
  document.title = meta[0];
  document.querySelector('meta[name="description"]').content = meta[1];
  document.querySelector('meta[property="og:title"]').content = meta[2];
  document.querySelector('meta[property="og:description"]').content = meta[3];
  document.querySelector('meta[property="og:locale"]').content = ({ en: "en_US", fr: "fr_FR", de: "de_DE", es: "es_ES" })[language];
  document.querySelector('meta[name="twitter:title"]').content = meta[2];
  document.querySelector('meta[name="twitter:description"]').content = meta[3];
})();
