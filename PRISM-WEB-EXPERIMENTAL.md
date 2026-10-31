# LlamaNest Prism WebGPU — prova sperimentale

[Apri LlamaNest Prism WebGPU](https://llamanest.vercel.app/prism-gpu/)

Questa versione separata usa WebGPU per i livelli del modello. Alcune operazioni passano alla CPU: è una soluzione ibrida e può essere più lenta dell'app Mac. Richiede Chrome con WebGPU e JSPI attivi. Non usa la GPU se non viene confermato il caricamento dei livelli.

Nelle prove su un MacBook M2, Ternary Bonsai 2 2B e 9B in formato PQ2_0 hanno risposto; il 9B ha raggiunto circa 1,5–1,6 token al secondo nei test effettuati. Compatibilità e velocità dipendono dal dispositivo, dal browser, dal modello e dalle impostazioni. Il modello va scelto o scaricato separatamente; i file GGUF sopra 3 GB richiedono la divisione.

Le conversazioni e i modelli di questa prova sono separati dalla versione Web principale. Le versioni esistenti non sono sostituite.
