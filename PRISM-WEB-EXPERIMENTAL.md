# LlamaNest Prism Web — prova sperimentale

[Apri la versione sperimentale Prism Web](https://llamanest.vercel.app/prism-web/)

Questa prova usa il motore PrismML nel browser **solo su CPU**. WebGPU non è ancora funzionante nel prototipo: il modello viene caricato sulla GPU, ma l'esecuzione si blocca prima di generare una risposta. Non sono previste le prestazioni della versione Mac con Metal.

La prova usa dati del browser separati dalla versione Web principale. Scegli un modello GGUF compatibile, ad esempio Ternary Bonsai 2 2B PQ2_0; i modelli non sono inclusi. Il modello 9B non è stato verificato in questa versione e potrebbe richiedere di dividere il file GGUF per rispettare i limiti del browser. Velocità, memoria necessaria e compatibilità dipendono dal dispositivo e dal browser.

Il sito principale e le altre versioni non vengono sostituiti da questo esperimento.
