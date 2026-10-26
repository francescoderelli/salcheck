# SALCheck: email, dichiarazioni e storico settimanale

Il RA inserisce la propria email, vede le sedi associate alla colonna `ResponsabileArea` del CSV Albert e salva la dichiarazione direttamente sul sito. Non riceve codici e non deve esportare risposte.

Il responsabile importa il CSV nuovo. Il confronto conserva il prodotto iniziale, il SAL dichiarato e l'importazione di partenza. I salvataggi successivi non spostano l'impegno originale. Ogni importazione aggiunge allo storico un riscontro con data e file; la chiusura e l'apertura di un nuovo impegno conservano anche il ciclo precedente. Se manca il nuovo CSV, lo stato è “In attesa del prossimo CSV”. Pratiche scomparse o riassegnate richiedono verifica.

## Accesso concordato

L'email è dichiarata, non autenticata. Le API restituiscono esclusivamente le sedi, le pratiche e lo storico dell'email della sessione; cambiare parametri nella pagina non amplia questa vista. Chi entra dichiarando l'email di un altro RA può impersonarlo: è il limite accettato per questo flusso operativo. L'autore nello storico è quindi una **email dichiarata**, non un'identità certificata.

La gestione nazionale e l'importazione CSV richiedono, in aggiunta, la password del responsabile. Scrivere soltanto la sua email non apre tutte le sedi. Non sono necessari Entra, Graph o autorizzazioni IT.

## Archivio e pubblicazione

GitHub contiene soltanto codice e test sintetici. Non aggiungere CSV, database, password o dati aziendali al repository pubblico.

- `public/`: interfaccia servita dal servizio condiviso.
- `assets/`: parser CSV e motore SAL.
- `store.cjs`: archivio SQLite persistente, dichiarazioni, importazioni e cronologia.
- `server.cjs`: API e sessioni per email; nessuna dipendenza esterna da installare.
- `../email/`: copia statica per GitHub Pages generata da `node build-pages.cjs`.

**GitHub Pages da solo non conserva dichiarazioni condivise.** Serve una singola istanza Node.js 24 con disco persistente e HTTPS. Il sito può essere servito dallo stesso servizio; oppure GitHub Pages può collegarsi alla sua origine HTTPS tramite `public/config.js`, rigenerando poi `email/`. La configurazione vuota su Pages mostra “Archivio condiviso non ancora collegato” e non simula un salvataggio.

Variabili del servizio:

```text
SALCHECK_DATABASE_PATH=<percorso assoluto su disco persistente>/salcheck.sqlite
SALCHECK_MANAGER_EMAIL=<email del responsabile>
SALCHECK_MANAGER_PASSWORD=<password di almeno 16 caratteri>
SALCHECK_ALLOWED_ORIGINS=<origine HTTPS del sito>,<origine HTTPS del servizio>
SALCHECK_HOST=0.0.0.0
PORT=<porta del servizio>
```

Avvio: `npm start` in questa directory. L'archivio non deve stare nelle directory pubbliche; mantenerne una copia di sicurezza persistente. Per copiare direttamente il file SQLite, fermare il servizio prima della copia e riavviarlo dopo. Le sessioni durano otto ore e non vengono salvate nel browser; un riavvio del servizio richiede di reinserire l'email, ma non cancella lo storico.

Il CSV viene analizzato nel browser, anche in presenza di BOM, virgolette, virgole e righe a capo. Il servizio riceve blocchi di 500 pratiche, senza anagrafiche clienti o indirizzi. Solo il completamento di tutti i blocchi pubblica il CSV; l'importazione incompleta lascia attivo quello precedente. Gli importi sono in centesimi. “Importo riscontrato” indica un aumento aggregato del prodotto compatibile con l'impegno, non la prova della singola registrazione.

## Verifica

`npm test` prova tre settimane e un nuovo ciclo, riapertura del database, baseline immutabile, importazioni incomplete, pratiche mancanti, isolamento delle risposte API per email, protezione gestione e storico filtrato. I test non usano dati aziendali.

Il servizio deve ancora essere ospitato e collegato per essere utilizzabile da computer diversi. La sola pubblicazione di questi file non attiva l'archivio.

## OneDrive aziendale

OneDrive può conservare esportazioni e copie storiche. Il servizio attuale usa SQLite: non mettere il database attivo in una cartella sincronizzata tra più computer. OneDrive da solo non espone le API usate da questa interfaccia. Un collegamento tramite Power Automate richiede una verifica di licenza e disponibilità: il trigger HTTP Request è Premium, anche se il connettore OneDrive for Business è Standard. Questa integrazione non è implementata né attivata in questo ramo.

Riferimenti: [GitHub Pages è hosting statico](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [OneDrive for Business](https://learn.microsoft.com/en-us/connectors/onedriveforbusinessconnector/), [trigger HTTP Request Premium](https://learn.microsoft.com/en-us/sharepoint/dev/declarative-customization/site-design-trigger-flow-tutorial).
