(() => {
  // The Italian HTML is the readable fallback when JavaScript is unavailable.
  const rows = [
    ["Perché USB AI", "Why USB AI", "Pourquoi USB AI", "Warum USB AI", "Por qué USB AI"],
    ["Come funziona", "How it works", "Comment ça marche", "So funktioniert es", "Cómo funciona"],
    ["Scarica gratis ↓", "Download free ↓", "Télécharger gratuitement ↓", "Kostenlos herunterladen ↓", "Descargar gratis ↓"],
    ["Un progetto FipraAI", "A FipraAI project", "Un projet FipraAI", "Ein Projekt von FipraAI", "Un proyecto de FipraAI"],
    ["La tua AI.", "Your AI.", "Votre IA.", "Deine KI.", "Tu IA."],
    ["Ovunque vai.", "Wherever you go.", "Où que vous soyez.", "Überall dabei.", "Donde vayas."],
    ["Un assistente AI gratuito da tenere sul computer o su una chiavetta USB. Scegli un modello, conversa e lavora con i tuoi documenti, in locale.", "A free AI assistant for your computer or USB drive. Choose a model, chat, and work with your documents locally.", "Un assistant IA gratuit à conserver sur votre ordinateur ou une clé USB. Choisissez un modèle, discutez et travaillez avec vos documents en local.", "Ein kostenloser KI-Assistent für deinen Computer oder USB-Stick. Wähle ein Modell, chatte und arbeite lokal mit deinen Dokumenten.", "Un asistente de IA gratuito para tu ordenador o memoria USB. Elige un modelo, conversa y trabaja con tus documentos de forma local."],
    ["Scarica USB AI", "Download USB AI", "Télécharger USB AI", "USB AI herunterladen", "Descargar USB AI"],
    ["Scopri come funziona", "See how it works", "Découvrez comment ça marche", "So funktioniert es", "Descubre cómo funciona"],
    ["Gratis · Nessun account · Mac e Windows", "Free · No account · Mac and Windows", "Gratuit · Sans compte · Mac et Windows", "Kostenlos · Kein Konto · Mac und Windows", "Gratis · Sin cuenta · Mac y Windows"],
    ["USB AI · sul tuo computer", "USB AI · on your computer", "USB AI · sur votre ordinateur", "USB AI · auf deinem Computer", "USB AI · en tu ordenador"],
    ["Nuova chat", "New chat", "Nouvelle discussion", "Neuer Chat", "Nuevo chat"],
    ["Posso usarlo anche senza Internet?", "Can I use it without Internet?", "Puis-je l'utiliser sans Internet ?", "Kann ich es ohne Internet nutzen?", "¿Puedo usarlo sin Internet?"],
    ["Sì. Dopo aver scaricato un modello, puoi conversare e cercare nei tuoi documenti direttamente sul computer, anche offline.", "Yes. Once you download a model, you can chat and search your documents directly on your computer, even offline.", "Oui. Après avoir téléchargé un modèle, vous pouvez discuter et rechercher dans vos documents directement sur votre ordinateur, même hors ligne.", "Ja. Nach dem Download eines Modells kannst du direkt auf deinem Computer chatten und deine Dokumente durchsuchen, auch offline.", "Sí. Después de descargar un modelo, puedes conversar y buscar en tus documentos directamente en tu ordenador, incluso sin conexión."],
    ["Chiedi a USB AI…", "Ask USB AI…", "Demandez à USB AI…", "Frag USB AI…", "Pregunta a USB AI…"],
    ["Pronto anche per la tua chiavetta USB", "Ready for your USB drive too", "Prêt aussi pour votre clé USB", "Auch für deinen USB-Stick bereit", "También listo para tu memoria USB"],
    ["Scegli la tua versione.", "Choose your version.", "Choisissez votre version.", "Wähle deine Version.", "Elige tu versión."],
    ["Scarica lo ZIP adatto al tuo computer. Estrai la cartella sul disco o direttamente su una chiavetta USB.", "Download the ZIP for your computer. Extract the folder to your drive or directly to a USB drive.", "Téléchargez le ZIP adapté à votre ordinateur. Extrayez le dossier sur votre disque ou directement sur une clé USB.", "Lade die passende ZIP-Datei herunter. Entpacke den Ordner auf deinen Computer oder direkt auf einen USB-Stick.", "Descarga el ZIP adecuado para tu ordenador. Extrae la carpeta en el disco o directamente en una memoria USB."],
    ["Per Mac con chip M1, M2, M3, M4 o successivi.", "For Macs with an M1, M2, M3, M4 or newer chip.", "Pour les Mac avec puce M1, M2, M3, M4 ou plus récente.", "Für Macs mit M1-, M2-, M3-, M4-Chip oder neuer.", "Para Mac con chip M1, M2, M3, M4 o posterior."],
    ["Scarica per Mac", "Download for Mac", "Télécharger pour Mac", "Für Mac herunterladen", "Descargar para Mac"],
    ["Per Mac con processore Intel.", "For Macs with an Intel processor.", "Pour les Mac avec processeur Intel.", "Für Macs mit Intel-Prozessor.", "Para Mac con procesador Intel."],
    ["Scarica per Mac Intel", "Download for Intel Mac", "Télécharger pour Mac Intel", "Für Intel-Mac herunterladen", "Descargar para Mac Intel"],
    ["Per PC Windows con processore a 64 bit.", "For Windows PCs with a 64-bit processor.", "Pour les PC Windows avec processeur 64 bits.", "Für Windows-PCs mit 64-Bit-Prozessor.", "Para PC Windows con procesador de 64 bits."],
    ["Scarica per Windows", "Download for Windows", "Télécharger pour Windows", "Für Windows herunterladen", "Descargar para Windows"],
    ["I file arrivano dalle release ufficiali su GitHub. Il programma è gratuito; i modelli AI si scaricano separatamente al primo utilizzo.", "Files come from the official GitHub releases. The app is free; AI models are downloaded separately when first used.", "Les fichiers proviennent des versions officielles sur GitHub. L'application est gratuite ; les modèles IA se téléchargent séparément lors de la première utilisation.", "Die Dateien stammen aus den offiziellen GitHub-Releases. Die App ist kostenlos; KI-Modelle werden bei der ersten Nutzung separat heruntergeladen.", "Los archivos proceden de las versiones oficiales de GitHub. La aplicación es gratuita; los modelos de IA se descargan por separado al usarla por primera vez."],
    ["Semplice per davvero", "Truly simple", "Vraiment simple", "Ganz einfach", "Realmente sencillo"],
    ["Uno spazio tutto tuo.", "A space of your own.", "Un espace à vous.", "Dein eigener Bereich.", "Un espacio solo tuyo."],
    ["USB AI porta modelli, chat e documenti nella cartella che scegli. Puoi tenerla sul computer o portarla con te.", "USB AI keeps models, chats, and documents in a folder you choose. Keep it on your computer or take it with you.", "USB AI conserve modèles, discussions et documents dans le dossier de votre choix. Gardez-le sur votre ordinateur ou emportez-le.", "USB AI speichert Modelle, Chats und Dokumente in einem Ordner deiner Wahl. Behalte ihn auf deinem Computer oder nimm ihn mit.", "USB AI guarda modelos, chats y documentos en la carpeta que elijas. Puedes dejarla en el ordenador o llevarla contigo."],
    ["I tuoi documenti", "Your documents", "Vos documents", "Deine Dokumente", "Tus documentos"],
    ["Importa PDF testuali, TXT e Markdown. Cerca i passaggi rilevanti e consulta le fonti nella chat.", "Import text PDFs, TXT, and Markdown. Find relevant passages and check sources in the chat.", "Importez des PDF textuels, des fichiers TXT et Markdown. Retrouvez les passages pertinents et consultez les sources dans la discussion.", "Importiere Text-PDFs, TXT und Markdown. Finde relevante Stellen und prüfe Quellen im Chat.", "Importa PDF de texto, TXT y Markdown. Encuentra fragmentos relevantes y consulta las fuentes en el chat."],
    ["Portalo con te", "Take it with you", "Emportez-le", "Nimm es mit", "Llévalo contigo"],
    ["Estrai la cartella su una chiavetta USB. Modelli e dati restano insieme al programma.", "Extract the folder to a USB drive. Models and data stay with the app.", "Extrayez le dossier sur une clé USB. Les modèles et les données restent avec l'application.", "Entpacke den Ordner auf einen USB-Stick. Modelle und Daten bleiben bei der App.", "Extrae la carpeta en una memoria USB. Los modelos y datos permanecen junto a la aplicación."],
    ["Libero di scegliere", "Choose freely", "Libre de choisir", "Freie Modellwahl", "Elige libremente"],
    ["Scegli un modello GGUF con una stima della RAM necessaria. Dopo il download, la chat funziona in locale.", "Choose a GGUF model with an estimate of the RAM it needs. After downloading, chat runs locally.", "Choisissez un modèle GGUF avec une estimation de la RAM nécessaire. Après téléchargement, la discussion fonctionne en local.", "Wähle ein GGUF-Modell mit einer Schätzung des RAM-Bedarfs. Nach dem Download läuft der Chat lokal.", "Elige un modelo GGUF con una estimación de la RAM necesaria. Tras descargarlo, el chat funciona localmente."],
    ["Inizia in tre passi", "Get started in three steps", "Commencez en trois étapes", "In drei Schritten starten", "Empieza en tres pasos"],
    ["Dallo ZIP alla prima chat.", "From ZIP to your first chat.", "Du ZIP à votre première discussion.", "Von der ZIP-Datei zum ersten Chat.", "Del ZIP a tu primer chat."],
    ["Non serve un account. Tieni intera la cartella estratta per conservare il tuo spazio di lavoro.", "No account needed. Keep the extracted folder intact to preserve your workspace.", "Aucun compte nécessaire. Gardez le dossier extrait intact pour conserver votre espace de travail.", "Du brauchst kein Konto. Lass den entpackten Ordner vollständig, damit dein Arbeitsbereich erhalten bleibt.", "No necesitas una cuenta. Conserva intacta la carpeta extraída para mantener tu espacio de trabajo."],
    ["01 / SCARICA", "01 / DOWNLOAD", "01 / TÉLÉCHARGER", "01 / HERUNTERLADEN", "01 / DESCARGAR"],
    ["Scegli Mac o Windows", "Choose Mac or Windows", "Choisissez Mac ou Windows", "Mac oder Windows wählen", "Elige Mac o Windows"],
    ["Scarica la versione corretta e decomprimi lo ZIP sul computer o sulla chiavetta.", "Download the right version and extract the ZIP to your computer or USB drive.", "Téléchargez la bonne version et extrayez le ZIP sur votre ordinateur ou clé USB.", "Lade die passende Version herunter und entpacke die ZIP-Datei auf deinen Computer oder USB-Stick.", "Descarga la versión adecuada y extrae el ZIP en el ordenador o en la memoria USB."],
    ["02 / AVVIA", "02 / START", "02 / LANCER", "02 / STARTEN", "02 / INICIAR"],
    ["Apri USB AI", "Open USB AI", "Ouvrez USB AI", "USB AI öffnen", "Abre USB AI"],
    ["Su Mac apri “Avvia USB AI Rust.command”; su Windows apri “Avvia USB AI Rust.cmd”.", "On Mac, open “Avvia USB AI Rust.command”; on Windows, open “Avvia USB AI Rust.cmd”.", "Sur Mac, ouvrez « Avvia USB AI Rust.command » ; sur Windows, ouvrez « Avvia USB AI Rust.cmd ».", "Öffne auf dem Mac „Avvia USB AI Rust.command“ und unter Windows „Avvia USB AI Rust.cmd“.", "En Mac, abre «Avvia USB AI Rust.command»; en Windows, abre «Avvia USB AI Rust.cmd»."],
    ["03 / CONVERSA", "03 / CHAT", "03 / DISCUTER", "03 / CHATTEN", "03 / CONVERSAR"],
    ["Scegli un modello", "Choose a model", "Choisissez un modèle", "Modell wählen", "Elige un modelo"],
    ["Scarica un modello compatibile con la RAM del tuo computer. Poi puoi lavorare anche offline.", "Download a model that fits your computer's RAM. Then you can work offline too.", "Téléchargez un modèle adapté à la RAM de votre ordinateur. Vous pourrez ensuite travailler hors ligne.", "Lade ein Modell herunter, das zum RAM deines Computers passt. Danach kannst du auch offline arbeiten.", "Descarga un modelo compatible con la RAM de tu ordenador. Después también podrás trabajar sin conexión."],
    ["La tua AI, alle tue condizioni.", "Your AI, your way.", "Votre IA, à vos conditions.", "Deine KI, nach deinen Regeln.", "Tu IA, a tu manera."],
    ["Un assistente locale, gratuito e portatile. Scaricalo e scegli dove tenere il tuo spazio di lavoro.", "A local, free, portable assistant. Download it and choose where to keep your workspace.", "Un assistant local, gratuit et portable. Téléchargez-le et choisissez où conserver votre espace de travail.", "Ein lokaler, kostenloser und tragbarer Assistent. Lade ihn herunter und wähle, wo dein Arbeitsbereich liegen soll.", "Un asistente local, gratuito y portátil. Descárgalo y elige dónde guardar tu espacio de trabajo."],
    ["Scegli la tua versione", "Choose your version", "Choisissez votre version", "Wähle deine Version", "Elige tu versión"],
    ["· un progetto di Fabrizio Casula", "· a project by Fabrizio Casula", "· un projet de Fabrizio Casula", "· ein Projekt von Fabrizio Casula", "· un proyecto de Fabrizio Casula"],
    ["© 2026 Fabrizio Casula · Codice con licenza MIT", "© 2026 Fabrizio Casula · MIT licensed code", "© 2026 Fabrizio Casula · Code sous licence MIT", "© 2026 Fabrizio Casula · Code unter MIT-Lizenz", "© 2026 Fabrizio Casula · Código con licencia MIT"],
    ["Codice su GitHub", "Code on GitHub", "Code sur GitHub", "Code auf GitHub", "Código en GitHub"],
    ["Release Mac", "Mac releases", "Versions Mac", "Mac-Releases", "Versiones Mac"],
    ["Release Windows", "Windows releases", "Versions Windows", "Windows-Releases", "Versiones Windows"]
  ];

  const attributes = [
    ["USB AI, torna all'inizio", "USB AI, back to top", "USB AI, retour en haut", "USB AI, zurück nach oben", "USB AI, volver arriba"],
    ["Volpe, simbolo di USB AI", "Fox, USB AI symbol", "Renard, symbole de USB AI", "Fuchs, Symbol von USB AI", "Zorro, símbolo de USB AI"],
    ["Navigazione principale", "Main navigation", "Navigation principale", "Hauptnavigation", "Navegación principal"],
    ["Anteprima illustrativa della chat USB AI", "Illustrative preview of USB AI chat", "Aperçu illustratif du chat USB AI", "Illustrative Vorschau des USB AI Chats", "Vista ilustrativa del chat de USB AI"],
    ["Scarica USB AI per Mac Apple Silicon, file ZIP", "Download USB AI for Apple Silicon Mac, ZIP file", "Télécharger USB AI pour Mac Apple Silicon, fichier ZIP", "USB AI für Apple Silicon Mac herunterladen, ZIP-Datei", "Descargar USB AI para Mac Apple Silicon, archivo ZIP"],
    ["Scarica USB AI per Mac Intel, file ZIP", "Download USB AI for Intel Mac, ZIP file", "Télécharger USB AI pour Mac Intel, fichier ZIP", "USB AI für Intel-Mac herunterladen, ZIP-Datei", "Descargar USB AI para Mac Intel, archivo ZIP"],
    ["Scarica USB AI per Windows x64, file ZIP", "Download USB AI for Windows x64, ZIP file", "Télécharger USB AI pour Windows x64, fichier ZIP", "USB AI für Windows x64 herunterladen, ZIP-Datei", "Descargar USB AI para Windows x64, archivo ZIP"],
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
    en: ["USB AI — Local, portable AI for Mac and Windows", "USB AI is a free, portable AI assistant for Mac and Windows. Keep it on your computer or a USB drive and use GGUF models locally.", "USB AI — Your AI, wherever you go", "A free, portable AI assistant for Mac and Windows, created by FipraAI."],
    fr: ["USB AI — IA locale et portable pour Mac et Windows", "USB AI est un assistant IA gratuit et portable pour Mac et Windows. Gardez-le sur votre ordinateur ou une clé USB et utilisez des modèles GGUF en local.", "USB AI — Votre IA, partout avec vous", "Un assistant IA gratuit et portable pour Mac et Windows, créé par FipraAI."],
    de: ["USB AI — Lokale, tragbare KI für Mac und Windows", "USB AI ist ein kostenloser, tragbarer KI-Assistent für Mac und Windows. Nutze GGUF-Modelle lokal auf deinem Computer oder USB-Stick.", "USB AI — Deine KI, überall dabei", "Ein kostenloser, tragbarer KI-Assistent für Mac und Windows von FipraAI."],
    es: ["USB AI — IA local y portátil para Mac y Windows", "USB AI es un asistente de IA gratuito y portátil para Mac y Windows. Guárdalo en tu ordenador o memoria USB y usa modelos GGUF de forma local.", "USB AI — Tu IA, donde vayas", "Un asistente de IA gratuito y portátil para Mac y Windows, creado por FipraAI."]
  }[language];
  document.title = meta[0];
  document.querySelector('meta[name="description"]').content = meta[1];
  document.querySelector('meta[property="og:title"]').content = meta[2];
  document.querySelector('meta[property="og:description"]').content = meta[3];
  document.querySelector('meta[property="og:locale"]').content = ({ en: "en_US", fr: "fr_FR", de: "de_DE", es: "es_ES" })[language];
  document.querySelector('meta[name="twitter:title"]').content = meta[2];
  document.querySelector('meta[name="twitter:description"]').content = meta[3];
})();
