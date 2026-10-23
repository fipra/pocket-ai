# Verifiche della versione Rust

- Il progetto Rust compila su macOS arm64 dalla radice della repo. `cargo test --offline`: 8 test superati, inclusi il catalogo dei quattro modelli, la raccomandazione per RAM, lo stato API e il ripiego alla porta successiva quando quella predefinita è occupata. `cargo build --release --locked --offline`: riuscito. `cargo fmt --check`: riuscito.
- Il pacchetto Mac include eseguibile, `llama-cli`, `pdftotext`, librerie dinamiche e modelli GGUF locali. Verificare nuovamente il pacchetto dopo ogni build.
- La versione Windows ha uno script di packaging, ma richiede build e collaudo su Windows x64.
- I download dal catalogo verificano intestazione GGUF e SHA-256, più la dimensione esatta quando disponibile; il test locale conferma l'hash di un file noto e il rifiuto di un file non GGUF. I download completi dalla rete richiedono una prova manuale con accesso a Internet; il sandbox corrente non risolve `huggingface.co`.
- L'inferenza reale e l'interfaccia nel browser non sono verificabili nell'ambiente sandbox corrente: la porta locale e il backend Metal possono essere bloccati.
- Il JavaScript della nuova interfaccia supera `node --check`; i riferimenti agli ID HTML sono presenti. La resa visiva e il flusso completo richiedono verifica manuale nel browser dell'utente.
- La ricerca è lessicale; PDF scansionati richiedono OCR esterno. Il workspace non è cifrato.
