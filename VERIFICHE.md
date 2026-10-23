# Verifiche della versione Rust

- Il progetto Rust compila su macOS arm64 dalla radice della repo. `cargo test --offline`: 9 test superati, inclusi il catalogo dei quattro modelli, la raccomandazione per RAM, lo stato API e il ripiego alla porta successiva quando quella predefinita è occupata. `cargo build --release --locked --offline`: riuscito. `cargo fmt --check`: riuscito.
- Il pacchetto Mac include eseguibile, `llama-cli`, `pdftotext`, librerie dinamiche e modelli GGUF locali. Verificare nuovamente il pacchetto dopo ogni build.
- La versione Windows viene costruita su GitHub Actions (Windows Server 2022), che verifica test, file del pacchetto, assenza di conversazioni e avvio di `llama-cli` e `pdftotext`, poi pubblica uno ZIP portatile. Restano da verificare su un PC Windows reale apertura della UI, download del modello, inferenza e uso da chiavetta.
- I download dal catalogo verificano intestazione GGUF e SHA-256, più la dimensione esatta quando disponibile; il test locale conferma l'hash di un file noto e il rifiuto di un file non GGUF. I download completi dalla rete richiedono una prova manuale con accesso a Internet; il sandbox corrente non risolve `huggingface.co`.
- L'inferenza reale e l'interfaccia nel browser non sono verificabili nell'ambiente sandbox corrente: la porta locale e il backend Metal possono essere bloccati.
- Il selettore della lingua salva la preferenza nel workspace; il test copre inglese predefinito, selezione tedesca, titolo localizzato e rifiuto di codici sconosciuti.
- Il JavaScript della nuova interfaccia e del dizionario supera `node --check`; i riferimenti agli ID HTML sono presenti. La resa visiva e il flusso completo richiedono verifica manuale nel browser dell'utente.
- La ricerca è lessicale; PDF scansionati richiedono OCR esterno. Il workspace non è cifrato.
