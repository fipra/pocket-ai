# USB AI Rust

Assistente AI locale e portatile. L'applicazione è scritta in Rust, apre la propria interfaccia nel browser e usa `llama-server` per mantenere i modelli GGUF caricati sul computer. Non richiede account o API cloud. Conversazioni, documenti indicizzati e modelli possono restare sulla stessa chiavetta USB.

## Licenze

Il codice e le release pubblicati fino al commit
[`4cf59ef`](https://github.com/fipra/usb-ai/commit/4cf59ef7709235092ef3ceba74aab680a3001d4e)
restano disponibili sotto [licenza MIT](LICENSE-MIT-LEGACY), compresi i relativi
diritti per uso commerciale. I pacchetti delle release già pubblicate non
vengono modificati da questo cambio di licenza. La
[cronologia delle licenze](LICENSING_HISTORY.md) indica il commit di riferimento
e le impronte SHA-256 dei pacchetti storici.

Nelle distribuzioni future, tutto il codice USB AI di cui Fabrizio Casula
detiene i diritti viene offerto sotto la
[USB AI Personal Use License v1.0](LICENSE), compreso il codice già pubblicato
in precedenza sotto MIT. L'uso personale, didattico e per ricerca non
commerciale è gratuito. Uso commerciale, rivendita, ridistribuzione
commerciale e integrazione in prodotti commerciali richiedono un accordo
scritto separato e a pagamento: vedi
[licenza commerciale](COMMERCIAL_LICENSE.md). Le copie già concesse sotto MIT
restano utilizzabili anche per scopi commerciali. Strumenti, dipendenze e
modelli di terzi mantengono le rispettive licenze.

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

Servono Rust, `llama-server` e `llama-cli` di llama.cpp e, per leggere i PDF, `pdftotext` di Poppler. Su macOS puoi installare llama.cpp e Poppler con `brew install llama.cpp poppler`. Poi esegui:

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

Su Windows, installa Rust, `llama-server.exe`, `llama-cli.exe` e `pdftotext.exe` nel PATH, poi esegui `cargo run --release` da PowerShell.

Questa repo non contiene pesi GGUF nel controllo versione. Una copia locale del modello rimane in `models/` e viene inclusa nel pacchetto portabile. Usa un modello *instruct* compatibile e controlla la sua licenza prima di distribuirlo.

## Pacchetto per chiavetta USB

**Mac:** scarica dalla [release macOS](https://github.com/fipra/usb-ai/releases/tag/rust-mac-portable) lo ZIP **arm64** per Apple Silicon oppure **x86_64** per Intel. Estrai l'intera cartella sulla chiavetta e fai doppio clic su `Avvia USB AI Rust.command`. La cartella include eseguibile e strumenti necessari, ma non modelli o dati personali. Al primo avvio scegli e scarica un modello. Per creare il pacchetto dal sorgente su un Mac della stessa architettura, esegui `python3 scripts/package-mac.py`.

**Primo avvio su macOS:** il launcher verifica la firma locale dei binari e delle librerie inclusi e, se presenti, rimuove i loro attributi di quarantena prima di aprire l'app. Questo evita il blocco di una `.dylib` al primo prompt. L'operazione riguarda solo `bin/` e `lib/` della cartella estratta. La build non ha firma Developer ID né notarizzazione Apple, quindi macOS potrebbe chiedere di autorizzare il launcher stesso. Non modificare i binari del pacchetto dopo l'estrazione.

**Windows x64:** scarica lo ZIP **USB-AI-Rust-Windows-x64.zip** dalla [release Windows portatile](https://github.com/fipra/usb-ai/releases/tag/rust-windows-portable), estrai **tutta la cartella** e fai doppio clic su `Avvia USB AI Rust.cmd`. Non servono Rust, Cargo, PowerShell o installazioni aggiuntive sul PC di destinazione. Al primo avvio scegli un modello e scaricalo dall'interfaccia; poi puoi usare la chiavetta offline. I dati e il modello scaricato restano nella cartella portatile. La build è per Windows x64 ed è da collaudare su un PC Windows reale. Il file `Prepara.USB.AI.0.1.0.exe` della vecchia release è Electron e non appartiene alla versione Rust.

Per ricreare il pacchetto da sorgente su Windows, lo script `scripts/package-windows.ps1` richiede Rust, `llama-server.exe`, `llama-cli.exe` e `pdftotext.exe`; la release sopra è generata automaticamente da GitHub Actions.

## Dati e requisiti

- `POCKET_AI_HOME` sceglie una cartella dati alternativa.
- `USB_AI_DIR` sceglie la cartella base che contiene `models/` e, per impostazione predefinita, `PocketAI-data/`.
- `LLAMA_SERVER` e `PDFTOTEXT` indicano eseguibili esterni alternativi.
- Alla prima risposta l'app avvia `llama-server`; le risposte successive riutilizzano il modello caricato fino al cambio GGUF o alla chiusura di USB AI. Non sono ancora disponibili streaming e pulsante per interrompere la generazione.
- I PDF scansionati richiedono OCR esterno; la ricerca nei documenti è lessicale, non semantica.

## Sviluppo e verifica

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

Vedi [VERIFICHE.md](VERIFICHE.md) per lo stato dei controlli e [README.md](README.md) per la guida principale in inglese.
