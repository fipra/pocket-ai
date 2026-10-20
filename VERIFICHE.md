# Verifiche del 20 ottobre 2026

- npm install completato; package-lock.json incluso.
- Quattro test automatici superati: recupero dei passaggi/pagine, chunking, salvataggio e gestione archivio corrotto, conversione cronologia.
- Sintassi JavaScript verificata.
- Modello ufficiale scaricato (491.400.032 byte); revisione e SHA-256 nel manifest.
- Inferenza reale su CPU Linux con node-llama-cpp: “Salve Fabrizio!” e “Il codice del progetto è ALFA42.” Due sessioni consecutive create e liberate sullo stesso contesto.
- Interfaccia grafica non collaudata end-to-end: il download del browser di test in questo ambiente è fallito. Il test con bridge simulato non è stato eseguito.
- Eseguibili Windows e Mac non compilati, firmati né collaudati. Usare gli script locali o il workflow allegato su sistemi nativi.
- Importazione PDF, stop e uso effettivo su USB richiedono collaudo sull’app desktop.

Questa consegna è un prototipo sorgente con pesi inclusi, non una release pronta per vendita.
