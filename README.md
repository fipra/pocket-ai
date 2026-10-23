# USB AI Rust

Assistente AI locale e portatile. L'applicazione è scritta in Rust, apre la propria interfaccia nel browser e usa `llama-cli` per eseguire modelli GGUF sul computer. Non richiede account o API cloud. Conversazioni, documenti indicizzati e modelli possono restare sulla stessa chiavetta USB.

## Funzioni

- Chat con un modello GGUF locale.
- Importazione di PDF testuali, TXT e Markdown (massimo 20 MB per file).
- Ricerca per parole chiave nei documenti, con estratti e numeri di pagina per i PDF.
- Conversazioni persistenti ed esportazione Markdown.
- Pacchetti portabili separati per Mac e Windows.

L'interfaccia si apre su `http://127.0.0.1:48157`; il server ascolta solo sul computer locale. I dati sono salvati senza cifratura in `PocketAI-data/`.

## Avvio dal sorgente

Servono Rust, `llama-cli` di llama.cpp e, per leggere i PDF, `pdftotext` di Poppler. Su macOS puoi installare gli ultimi due con `brew install llama.cpp poppler`. Poi esegui:

```bash
cargo run --release
```

Il browser si apre automaticamente. Se manca un modello, premi **Scarica modello base (491 MB)** nell'interfaccia: il download parte solo dopo il clic, mostra l'avanzamento e verifica dimensione e SHA-256 prima dell'uso. Per scaricarlo serve Internet una volta; chat e documenti funzionano offline dopo il download. Puoi anche copiare un tuo modello `.gguf` in `models/`.

Puoi avviare con doppio clic su `Avvia-Mac.command`, se gli strumenti necessari sono già installati. Su Windows, installa Rust, `llama-cli.exe` e `pdftotext.exe` nel PATH e usa `Avvia-Windows.cmd`.

Questa repo non contiene pesi GGUF nel controllo versione. Una copia locale del modello rimane in `models/` e viene inclusa nel pacchetto portabile. Usa un modello *instruct* compatibile e controlla la sua licenza prima di distribuirlo.

## Pacchetto per chiavetta USB

**Mac:** su un Mac della stessa architettura del computer di destinazione, esegui:

```bash
python3 scripts/package-mac.py
```

La cartella `release/USB-AI-Rust-mac-<architettura>/` include l'eseguibile Rust, `llama-cli`, `pdftotext`, le librerie richieste e i GGUF presenti in `models/`. Se non contiene un modello, chi usa la chiavetta può scaricare quello base dall'interfaccia quando ha Internet. Copia **tutta la cartella** sulla chiavetta e fai doppio clic su `Avvia USB AI Rust.command`. Il pacchetto creato qui è per Apple Silicon (`arm64`); per Intel serve una build su Mac Intel. La build è firmata localmente per integrità, ma non ha firma Developer ID né notarizzazione Apple.

**Windows x64:** su un PC Windows con Rust, `llama-cli.exe` e `pdftotext.exe` nel PATH, esegui in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1
```

Copia `release\USB-AI-Rust-Windows-x64\` sulla chiavetta e fai doppio clic su `Avvia USB AI Rust.cmd`. Lo script copia le DLL trovate accanto agli strumenti; alcune installazioni possono richiedere altre DLL. La build Windows va compilata e verificata su Windows: il pacchetto Mac non funziona su Windows.

Le conversazioni nella cartella `release/` vengono svuotate a ogni creazione del pacchetto. Il workspace principale in `PocketAI-data/` resta intatto. Il pacchetto include eventuali documenti già presenti nel proprio workspace, quindi controlla la cartella prima di condividerla.

## Dati e requisiti

- `POCKET_AI_HOME` sceglie una cartella dati alternativa.
- `USB_AI_DIR` sceglie la cartella base che contiene `models/` e, per impostazione predefinita, `PocketAI-data/`.
- `LLAMA_CLI` e `PDFTOTEXT` indicano eseguibili esterni alternativi.
- L'app usa `llama-cli` come processo per ogni risposta: il modello viene ricaricato a ogni messaggio. Non sono ancora disponibili streaming e pulsante per interrompere la generazione.
- I PDF scansionati richiedono OCR esterno; la ricerca nei documenti è lessicale, non semantica.

## Sviluppo e verifica

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

Vedi [VERIFICHE.md](VERIFICHE.md) per lo stato dei controlli e [README.en.md](README.en.md) per la guida in inglese. Il codice dell'applicazione è sotto [licenza MIT](LICENSE); modelli e strumenti di terzi conservano le rispettive licenze.
