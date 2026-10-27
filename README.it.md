# LlamaNest by FipraAI

> [!IMPORTANT]
> **Per usare commercialmente le versioni attuali di LlamaNest serve prima una licenza scritta separata e a pagamento.** Questo vale anche per l'uso interno in azienda, i lavori per clienti, i servizi a pagamento, la rivendita e l'integrazione in un prodotto commerciale. [Contatta il titolare del progetto per un accordo](https://github.com/fipra/usb-ai/issues/new?title=Richiesta%20licenza%20commerciale) e leggi le [condizioni commerciali](COMMERCIAL_LICENSE.md).
>
> Le vecchie copie pubblicate sotto MIT conservano i diritti di uso commerciale: vedi la [cronologia delle licenze](LICENSING_HISTORY.md). Strumenti e modelli di terzi hanno licenze proprie.

Assistente AI locale e portatile. L'applicazione è scritta in Rust, apre la propria interfaccia nel browser e usa `llama-server` per mantenere i modelli GGUF caricati sul computer. Non richiede account o API cloud. Conversazioni, documenti indicizzati e modelli possono restare sulla stessa chiavetta USB.

## Licenze

Il codice e le release pubblicati fino al commit
[`4cf59ef`](https://github.com/fipra/usb-ai/commit/4cf59ef7709235092ef3ceba74aab680a3001d4e)
restano disponibili sotto [licenza MIT](LICENSE-MIT-LEGACY), compresi i relativi
diritti per uso commerciale. I pacchetti delle release già pubblicate non
vengono modificati da questo cambio di licenza. La
[cronologia delle licenze](LICENSING_HISTORY.md) indica il commit di riferimento
e le impronte SHA-256 dei pacchetti storici.

Nelle distribuzioni future, tutto il codice LlamaNest di cui Fabrizio Casula
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
- Risposte formattate con titoli, elenchi, tabelle, link e blocchi di codice copiabili nelle versioni Web, Mac e Windows.
- Quantizzazione locale dei GGUF in Q8_0, Q4_K_M, Q3_K_M o Q2_K nelle versioni Mac e Windows.
- Importazione di PDF testuali, TXT e Markdown (massimo 20 MB per file).
- Ricerca per parole chiave nei documenti, con estratti e numeri di pagina per i PDF.
- Nel Laboratorio locale, creazione di esempi da PDF testuali, Word `.docx`, TXT o Markdown, revisione delle risposte, Fine tuning di un alunno Qwen supportato ed esportazione di un GGUF per la chat desktop.
- Conversazioni persistenti ed esportazione Markdown.
- Pacchetti portabili separati per Mac e Windows.
- Scelta tra modelli 0,5B, 3B, 7B e 9B con indicazione della RAM del computer e stima di compatibilità.
- Interfaccia in inglese per impostazione predefinita; italiano, tedesco, francese e spagnolo selezionabili dal menu nella barra laterale. La preferenza resta salvata e guida la lingua delle risposte, salvo richiesta esplicita diversa.

L'interfaccia si apre normalmente su `http://127.0.0.1:48157`. Se la porta è occupata, l'app sceglie automaticamente una porta libera tra `48158` e `48167` e apre l'indirizzo corretto nel browser. L'avvio normale ascolta solo sul computer locale. Su Windows, usa `Avvia LlamaNest LAN.cmd` oppure, nel pacchetto GPU, `Avvia LlamaNest LAN GPU.cmd` per aprire l'app anche da altri computer: per esempio `http://dtiwinai:48157/` o `http://161.62.136.186:48157/`. Questi avvii impostano `USB_AI_BIND_ADDR=0.0.0.0`; se la porta scelta è diversa, usa quella mostrata nella finestra dell'app. Consenti la porta TCP nel firewall di Windows solo per reti fidate. La modalità LAN non ha login e usa HTTP senza cifratura: chi può raggiungere la porta può accedere all'area di lavoro. I dati sono salvati senza cifratura in `PocketAI-data/`.

L'addestramento e l'esportazione GGUF del Laboratorio richiedono per ora un Mac Apple Silicon con MLX-LM installato. Sia nella generazione da documento nel Fine tuning sia nella Distillazione, l'insegnante può essere un GGUF locale (offline) oppure un modello OpenRouter che consente la distillazione. OpenRouter può rispondere alle domande salvate o creare cinque esempi da un tema. Inserisci una chiave API OpenRouter in una delle due schede, scrivi parte del nome del modello e sceglilo dai suggerimenti. La stessa chiave vale per entrambe le schede e resta nello spazio dati locale non cifrato finché non la rimuovi. Estratti del documento, domande o temi inviati a OpenRouter raggiungono il provider del modello e le richieste possono comportare costi. Controlla le risposte prima di addestrare. Per leggere i Word `.docx` serve Python 3, per i PDF testuali `pdftotext`; i PDF scansionati richiedono prima OCR. Il Fine tuning non garantisce che il modello ricordi ogni dettaglio: se servono risposte esatte, consegna anche i documenti di riferimento.

In **Modelli → Quantizza modello**, scegli un GGUF e il livello desiderato. L'app verifica una stima della RAM e lo spazio libero, mostra i byte scritti e permette di annullare. L'originale resta intatto; il risultato viene aggiunto alla libreria con un suffisso come `-Q3_K_M.gguf`. Una seconda quantizzazione può peggiorare molto la qualità e richiede una conferma esplicita. Per risultati migliori usa un originale F16/BF16/F32. I vecchi ZIP delle release potrebbero non includere ancora `llama-quantize`: crea il pacchetto dal sorgente aggiornato o scarica una nuova release che lo include. La Web autonoma offre un link alle versioni locali.

Lo spazio per la quantizzazione viene misurato sull'unità della cartella `models/` dell'app, che può essere diversa dal disco di sistema. Il controllo usa una stima prudente basata sulla grandezza del GGUF originale più un margine; il risultato Q2 può occupare meno spazio. Su Windows, la verifica legge direttamente lo spazio dell'unità di destinazione.

## Avvio dal sorgente

Servono Rust, `llama-server`, `llama-cli` e `llama-quantize` di llama.cpp e, per leggere i PDF, `pdftotext` di Poppler. Su macOS puoi installare llama.cpp e Poppler con `brew install llama.cpp poppler`. Poi esegui:

```bash
cargo run --release
```

Il browser si apre automaticamente. Apri **Scegli un modello** per vedere RAM totale, core logici e architettura rilevati sul computer in uso. Il pulsante **Importa GGUF in models** permette di scegliere un file già scaricato: l'app lo copia in `models/` e conserva l'originale. Su Windows, la cartella è `USB-AI-Rust-Windows-x64\models`, accanto a `bin` e `PocketAI-data`. Puoi anche copiare un `.gguf` direttamente in questa cartella e premere **Aggiorna modelli locali**. I nuovi download finiscono nella stessa cartella, mostrano l'avanzamento e sono verificati con SHA-256 e formato GGUF. I modelli scaricati con versioni precedenti in `PocketAI-data\models` restano utilizzabili. Per scaricare serve Internet una volta; chat e documenti funzionano offline dopo il download.

| Modello | Download circa | RAM minima indicativa | RAM più comoda | Licenza |
|---|---:|---:|---:|---|
| Qwen 2.5 0,5B | 0,49 GB | 4 GB | 6 GB | Apache 2.0 |
| Qwen 2.5 3B | 2,1 GB | 8 GB | 10 GB | Qwen Research |
| Qwen 2.5 7B | 4,68 GB | 12 GB | 16 GB | Apache 2.0 |
| Gemma 2 9B | 5,76 GB | 16 GB | 24 GB | Gemma |

Queste soglie sono stime prudenti basate sulla **RAM totale**, non una misura della memoria libera. Velocità e capacità effettive dipendono anche da GPU, contesto e programmi aperti. Il catalogo e le fonti dei file sono in [models/catalog.json](models/catalog.json).

Su Windows, installa Rust, `llama-server.exe`, `llama-cli.exe`, `llama-quantize.exe` e `pdftotext.exe` nel PATH, poi esegui `cargo run --release` da PowerShell.

Questa repo non contiene pesi GGUF nel controllo versione. Una copia locale del modello rimane in `models/` e viene inclusa nel pacchetto portabile. Usa un modello *instruct* compatibile e controlla la sua licenza prima di distribuirlo.

## Pacchetto per chiavetta USB

**Mac:** scarica dalla [nuova release macOS](https://github.com/fipra/usb-ai/releases/tag/rust-mac-stop-2026-10-24) lo ZIP **arm64** per Apple Silicon oppure **x86_64** per Intel. Estrai l'intera cartella sulla chiavetta e fai doppio clic su `Avvia LlamaNest.command`. La cartella include eseguibile, licenza e strumenti necessari, ma non modelli o dati personali. Al primo avvio scegli e scarica un modello. La GPU viene usata tramite Metal se il backend è disponibile; controlla con `bin/llama-server --list-devices` nella cartella estratta. Per creare il pacchetto dal sorgente su un Mac della stessa architettura, esegui `python3 scripts/package-mac.py`.

**Primo avvio su macOS:** il launcher verifica la firma locale dei binari e delle librerie inclusi e, se presenti, rimuove i loro attributi di quarantena prima di aprire l'app. Questo evita il blocco di una `.dylib` al primo prompt. L'operazione riguarda solo `bin/` e `lib/` della cartella estratta. La build non ha firma Developer ID né notarizzazione Apple, quindi macOS potrebbe chiedere di autorizzare il launcher stesso. Non modificare i binari del pacchetto dopo l'estrazione.

**Windows x64:** scarica lo ZIP **USB-AI-Rust-Windows-x64.zip** dalla [nuova release Windows portatile](https://github.com/fipra/usb-ai/releases/tag/rust-windows-stop-2026-10-24) ed estrai **tutta la cartella**. Usa `Avvia LlamaNest GPU.cmd` per provare l'accelerazione Vulkan con una GPU compatibile, inclusa NVIDIA RTX; senza GPU Vulkan, questo avvio usa la CPU. Usa `Avvia LlamaNest.cmd` per la modalità CPU. La modalità GPU richiede un driver grafico Vulkan funzionante; `bin\gpu\llama-server.exe --list-devices` mostra i dispositivi rilevati. Non servono Rust, Cargo o PowerShell sul PC di destinazione. I dati e i modelli restano nella cartella portatile. L'inferenza GPU va collaudata su un PC Windows reale.

Per ricreare il pacchetto da sorgente su Windows, lo script `scripts/package-windows.ps1` richiede Rust, `llama-server.exe`, `llama-cli.exe`, `llama-quantize.exe` e `pdftotext.exe`; la release sopra è generata automaticamente da GitHub Actions.

## Dati e requisiti


- `POCKET_AI_HOME` sceglie una cartella dati alternativa.
- `USB_AI_DIR` sceglie la cartella base che contiene `models/` e, per impostazione predefinita, `PocketAI-data/`.
- `LLAMA_SERVER`, `LLAMA_QUANTIZE` e `PDFTOTEXT` indicano eseguibili esterni alternativi.
- Alla prima risposta l'app avvia `llama-server`; le risposte successive riutilizzano il modello caricato fino al cambio GGUF o alla chiusura di LlamaNest. La risposta appare mentre viene generata. Il pulsante Stop interrompe la risposta corrente e conserva il testo già prodotto, così puoi inviare un altro prompt.
- I PDF scansionati richiedono OCR esterno; la ricerca nei documenti è lessicale, non semantica.

## Sviluppo e verifica

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

Vedi [VERIFICHE.md](VERIFICHE.md) per lo stato dei controlli e [README.md](README.md) per la guida principale in inglese.
