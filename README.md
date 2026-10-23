# USB AI Rust

Assistente AI locale e portatile. L'applicazione è scritta in Rust, apre la propria interfaccia nel browser e usa `llama-cli` per eseguire modelli GGUF sul computer. Non richiede account o API cloud. Conversazioni, documenti indicizzati e modelli possono restare sulla stessa chiavetta USB.

## Funzioni

- Chat con un modello GGUF locale.
- Importazione di PDF testuali, TXT e Markdown (massimo 20 MB per file).
- Ricerca per parole chiave nei documenti, con estratti e numeri di pagina per i PDF.
- Conversazioni persistenti ed esportazione Markdown.
- Pacchetti portabili separati per Mac e Windows.
- Scelta tra modelli 0,5B, 3B, 7B e 9B con indicazione della RAM del computer e stima di compatibilità.
- Interfaccia in inglese per impostazione predefinita; italiano, tedesco, francese e spagnolo selezionabili dal menu nella barra laterale. La preferenza resta salvata e guida la lingua delle risposte, salvo richiesta esplicita diversa.

L'interfaccia si apre normalmente su `http://127.0.0.1:48157`. Se la porta è occupata, l'app sceglie automaticamente una porta libera tra `48158` e `48167` e apre l'indirizzo corretto nel browser. Il server ascolta solo sul computer locale. I dati sono salvati senza cifratura in `PocketAI-data/`.

## Avvio dal sorgente

Servono Rust, `llama-cli` di llama.cpp e, per leggere i PDF, `pdftotext` di Poppler. Su macOS puoi installare gli ultimi due con `brew install llama.cpp poppler`. Poi esegui:

```bash
cargo run --release
```

Il browser si apre automaticamente. Apri **Scegli un modello** per vedere RAM totale, core logici e architettura rilevati sul computer in uso. Puoi scaricare uno dei modelli del catalogo; il download parte solo dopo il clic, mostra l'avanzamento e verifica SHA-256 e formato GGUF prima dell'uso. Per scaricarlo serve Internet una volta; chat e documenti funzionano offline dopo il download. Puoi anche copiare un tuo modello `.gguf` in `models/`.

| Modello | Download circa | RAM minima indicativa | RAM più comoda | Licenza |
|---|---:|---:|---:|---|
| Qwen 2.5 0,5B | 0,49 GB | 4 GB | 6 GB | Apache 2.0 |
| Qwen 2.5 3B | 2,1 GB | 8 GB | 10 GB | Qwen Research |
| Qwen 2.5 7B | 4,68 GB | 12 GB | 16 GB | Apache 2.0 |
| Gemma 2 9B | 5,76 GB | 16 GB | 24 GB | Gemma |

Queste soglie sono stime prudenti basate sulla **RAM totale**, non una misura della memoria libera. Velocità e capacità effettive dipendono anche da GPU, contesto e programmi aperti. Il catalogo e le fonti dei file sono in [models/catalog.json](models/catalog.json).

Su Windows, installa Rust, `llama-cli.exe` e `pdftotext.exe` nel PATH, poi esegui `cargo run --release` da PowerShell.

Questa repo non contiene pesi GGUF nel controllo versione. Una copia locale del modello rimane in `models/` e viene inclusa nel pacchetto portabile. Usa un modello *instruct* compatibile e controlla la sua licenza prima di distribuirlo.

## Pacchetto per chiavetta USB

**Mac:** su un Mac della stessa architettura del computer di destinazione, esegui:

```bash
python3 scripts/package-mac.py
```

La cartella `release/USB-AI-Rust-mac-<architettura>/` include l'eseguibile Rust, `llama-cli`, `pdftotext`, le librerie richieste e i GGUF presenti in `models/`. Se non contiene un modello, chi usa la chiavetta può sceglierne uno nel catalogo e scaricarlo quando ha Internet. Copia **tutta la cartella** sulla chiavetta e fai doppio clic su `Avvia USB AI Rust.command`. Il pacchetto creato qui è per Apple Silicon (`arm64`); per Intel serve una build su Mac Intel. La build è firmata localmente per integrità, ma non ha firma Developer ID né notarizzazione Apple.

**Windows x64:** scarica lo ZIP **USB-AI-Rust-Windows-x64.zip** dalla [release Windows portatile](https://github.com/fipra/usb-ai/releases/tag/rust-windows-portable), estrai **tutta la cartella** e fai doppio clic su `Avvia USB AI Rust.cmd`. Non servono Rust, Cargo, PowerShell o installazioni aggiuntive sul PC di destinazione. Al primo avvio scegli un modello e scaricalo dall'interfaccia; poi puoi usare la chiavetta offline. I dati e il modello scaricato restano nella cartella portatile. La build è per Windows x64 ed è da collaudare su un PC Windows reale. Il file `Prepara.USB.AI.0.1.0.exe` della vecchia release è Electron e non appartiene alla versione Rust.

Per ricreare il pacchetto da sorgente su Windows, lo script `scripts/package-windows.ps1` richiede Rust, `llama-cli.exe` e `pdftotext.exe`; la release sopra è generata automaticamente da GitHub Actions.

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
