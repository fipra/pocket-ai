# USB AI

**Created by FipraAI** · Contact: [fabrizio.casula@gmail.com](mailto:fabrizio.casula@gmail.com)
### Il tuo assistente locale, anche su una chiavetta USB

USB AI è un'app desktop per **chattare con un modello linguistico e consultare i tuoi documenti direttamente sul computer**. Non richiede account, Ollama o API cloud. Una volta preparato il pacchetto con il modello incluso, funziona anche senza Internet.

> **In breve:** porta app, modello, conversazioni e testi indicizzati in una cartella sulla USB. Inserisci la chiavetta in un computer compatibile, apri USB AI e riprendi da dove eri rimasto.

## Cosa puoi fare

| Funzione | Come funziona |
| --- | --- |
| **Chat locale** | Le risposte vengono generate sul computer. Puoi creare più conversazioni, fermare una risposta ed esportare una chat in Markdown. |
| **Domande sui documenti** | Importa PDF con testo, TXT o Markdown. USB AI mostra i passaggi usati e, per i PDF, le pagine. |
| **Cinque lingue** | Interfaccia e risposte in italiano, inglese, tedesco, francese e spagnolo. |
| **Modello sostituibile** | Il pacchetto può includere un piccolo modello Qwen; puoi importare un altro modello *instruct* GGUF compatibile. |
| **Dati portatili** | Conversazioni, documenti indicizzati e modelli importati risiedono in `PocketAI-data/`. |

## Inizia a usarlo

### Pacchetto pronto per l'utente

Scarica un **pacchetto compilato** per il tuo sistema operativo dagli artefatti o dalle release del progetto, quando disponibili. **Code → Download ZIP** su GitHub scarica invece il sorgente: non è un'app già pronta.

1. **Windows:** estrai il pacchetto portable in una cartella scrivibile e avvia l'EXE. **Mac:** estrai lo ZIP e apri la `.app` da una cartella scrivibile; non avviarla dalla DMG in sola lettura.
2. Nella finestra iniziale scegli il modello e premi **Carica modello**.
3. Scrivi nella chat. Per interrogare i tuoi file, usa **Importa documenti** e attiva **Cerca nei miei documenti**.

Il pacchetto compilato include il modello: per usarlo non servono Node.js, Ollama o download aggiuntivi. Questa versione non configura ancora firma o notarizzazione; Windows o macOS potrebbero mostrare un avviso di sicurezza.

### Avvio dal codice sorgente

Installa **Node.js 22 o successivo**, poi esegui nella cartella del progetto:

```sh
npm ci
npm run model:download
npm start
```

`model:download` usa Internet solo per la preparazione e verifica il GGUF tramite dimensione e SHA-256. I pesi del modello e `node_modules/` non sono nel repository. Se su Windows la finestra non compare in un ambiente aziendale, prova `npm run start:compat`: riduce l'isolamento di Chromium, quindi usalo solo con documenti attendibili.

Su Mac puoi avviare il sorgente con un doppio clic su `Avvia-Mac.command` dopo aver installato Node.js 22+. Il launcher installa le dipendenze al primo avvio e richiede Internet per questa configurazione. Se macOS blocca il file scaricato da GitHub, apri Terminale nella cartella estratta ed esegui `xattr -d com.apple.quarantine Avvia-Mac.command`; poi riprova il doppio clic. Se il file ha perso il permesso di esecuzione durante la copia, esegui anche `chmod +x Avvia-Mac.command`.

## Portalo su USB

Metti **l'EXE portable Windows** oppure **la `.app` Mac estratta** in una cartella scrivibile sulla chiavetta. Al primo avvio l'app crea `PocketAI-data/` accanto al programma. Lì conserva conversazioni, testi indicizzati, preferenze e modelli importati. La stessa cartella dati può essere usata dalle build Windows e Mac, **una alla volta**.

```text
Chiavetta USB/
├── USB AI.exe  oppure  USB AI.app
└── PocketAI-data/
    ├── workspace.json
    ├── models/
    └── session/
```

Chiudi USB AI prima di espellere la chiavetta. La cartella dati **non è cifrata**: proteggi la USB e conserva un backup. Il sistema ospite può creare cache o altri metadati, quindi non è garantita l'assenza di tracce. Velocità e memoria dipendono dal computer; una USB lenta può allungare l'avvio.

Per scegliere un'altra posizione dei dati, imposta `POCKET_AI_HOME` su un percorso assoluto prima dell'avvio. In sviluppo, la cartella predefinita è `PocketAI-data/` dentro il progetto.

## Documenti e limiti

La ricerca usa parole chiave e seleziona fino a quattro passaggi da fornire al modello. Puoi controllare i brani e le pagine mostrati sotto la risposta, ma **le risposte possono essere inesatte**: verifica la fonte originale. Il modello Qwen2.5 0.5B previsto per la build è leggero e dimostrativo; per attività più complesse puoi importare un GGUF più capace, se il computer ha memoria sufficiente.

Sono supportati PDF con testo selezionabile, TXT e Markdown, fino a **20 MB per file**. I PDF scansionati richiedono OCR esterno. File Word, Excel e immagini non sono supportati. La ricerca non è semantica e può non trovare sinonimi o richieste vaghe.

## Scegliere un modello più potente

Se il computer ha abbastanza RAM e potenza di calcolo, puoi scaricare un modello più grande e usarlo al posto di quello incluso. USB AI accetta file **GGUF instruct**: apri **Modello e archivio locale → Importa GGUF**, scegli il file scaricato, poi selezionalo e premi **Carica modello**. L'importazione ne crea una copia in `PocketAI-data/models/`, quindi controlla anche lo spazio libero sulla USB.

Questi esempi appartengono alla famiglia Qwen2.5 Instruct. I pesi indicati sono per la quantizzazione **Q4_K_M**; la RAM è una **stima prudente della memoria totale del computer**, non la dimensione del download né una garanzia di velocità.

| Modello | File Q4_K_M circa | RAM consigliata circa | Indicazione |
| --- | ---: | ---: | --- |
| [Qwen2.5 0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/main) | 0,5 GB | 4 GB | Il più leggero; qualità limitata. |
| [Qwen2.5 1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/tree/main) | 1,1 GB | 6 GB | Primo passo oltre il modello incluso. |
| [Qwen2.5 3B](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main) | 2,1 GB | 8 GB | Più capace; richiede più tempo per rispondere. |
| [Qwen2.5 7B](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/tree/main) | 4,7 GB | 16 GB | Per computer più potenti; vedi la nota sui file suddivisi. |

**Prima di scaricare:** scegli proprio un file `q4_k_m.gguf`, non i pesi FP16. Alcuni modelli grandi, incluso il 7B ufficiale nella tabella, sono distribuiti in più parti: l'importazione di USB AI seleziona **un solo file GGUF**, quindi quelle parti vanno prima unite in un GGUF unico con uno strumento compatibile. Per iniziare, i modelli 1.5B e 3B elencati sopra sono file singoli.

La memoria effettiva include anche il contesto della chat e i buffer di calcolo; sistema operativo e altre app ne consumano altra. La velocità dipende molto da CPU, accelerazione GPU, memoria disponibile e supporto del motore al modello scelto. Più RAM permette di *caricare* un modello grande, ma non rende automaticamente rapide le risposte. Prova prima un modello piccolo e controlla la licenza del modello prima di ridistribuirlo.

## Sviluppo e build

```sh
npm test              # test automatici
npm run dist:win      # pacchetto Windows, su Windows x64
npm run dist:mac      # pacchetti Mac, sul Mac di destinazione
```

Le build richiedono prima `npm ci` e `npm run model:download`; senza GGUF il packaging si ferma. I risultati sono in `release/`. Le dipendenze native vanno installate sulla piattaforma di destinazione. Mac Intel e Apple Silicon richiedono build distinte. Il workflow in `.github/workflows/build.yml` prepara le varianti su runner nativi quando viene avviato manualmente; non pubblica una release automaticamente.

Il progetto è organizzato in `src/` (processo Electron e logica), `ui/` (interfaccia), `tests/`, `scripts/` e `models/` (manifest e avvisi del modello). Leggi [VERIFICHE.md](VERIFICHE.md) per lo stato delle verifiche e [AGENTS.md](AGENTS.md) per contribuire.

## Licenze

Il modello predefinito proviene da [Qwen2.5 0.5B Instruct GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF). Manifest, licenza e model card sono in `models/`. Prima di distribuire un modello diverso, controlla la sua licenza e conserva gli avvisi richiesti.
