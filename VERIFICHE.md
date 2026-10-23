# Verifiche della versione Rust

- Il progetto Rust compila su macOS arm64 dalla radice della repo. `cargo test --offline`: 6 test superati, incluso il ripiego alla porta successiva quando quella predefinita è occupata. `cargo build --release --locked --offline`: riuscito. `cargo fmt --check`: riuscito.
- Il pacchetto Mac include eseguibile, `llama-cli`, `pdftotext`, librerie dinamiche e modelli GGUF locali. Verificare nuovamente il pacchetto dopo ogni build.
- La versione Windows ha uno script di packaging, ma richiede build e collaudo su Windows x64.
- Il download del modello predefinito verifica dimensione, intestazione GGUF e SHA-256; il test locale conferma l'hash di un file noto e il rifiuto di un file non GGUF. Il download completo dalla rete richiede una prova manuale con accesso a Internet; il sandbox corrente non risolve `huggingface.co`.
- L'inferenza reale e l'interfaccia nel browser non sono verificabili nell'ambiente sandbox corrente: la porta locale e il backend Metal possono essere bloccati.
- La ricerca è lessicale; PDF scansionati richiedono OCR esterno. Il workspace non è cifrato.
