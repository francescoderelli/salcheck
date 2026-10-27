# SALCheck V4 — consegna e pubblicazione su ChatGPT Sites

## Sorgenti da distribuire
- Repository: `francescoderelli/salcheck`
- Ramo **`salcheck-v4`**. Non usare `main` (è la V2 GitHub Pages), né `salcheck-email-storico` (V3 online).
- Cartella Sites da distribuire: **`cloud/`**. Non caricare la root del repository come progetto Sites.
- `cloud/.openai/hosting.json` conserva l'identificativo del **progetto Sites esistente**. Utilizzare il deploy/aggiornamento dello stesso progetto, non crearne un altro.
- URL esistente da mantenere: `https://salcheck-storico-ra.merrysquid130.chatgpt.site/workspace` (o reindirizzamento corrispondente a `/workspace.html`).
- Non toccare il sito V2 `https://francescoderelli.github.io/salcheck/v2/`.

## Funzionalità V3 da conservare senza modifiche di logica
1. Accesso RA mediante email **dichiarata**, senza OTP (scelta esplicita del proprietario); lettura solo delle commesse collegate a `ResponsabileArea`.
2. Account Gestione con identità nativa verificata via Sites e variabile `SALCHECK_OWNER_EMAIL`; caricamento CSV Albert, metadati, copie OneDrive.
3. Ruolo Direzione: email già autorizzate in `lib/access.mjs`, accesso a tutte le sedi, consultazione **senza modifiche**.
4. Motore SAL V2 `public/assets/engine.js` e report `public/report-v2.js`: stesso comportamento per IVA 10/22, ritenute 4/8/11, reverse charge, incassi, categorie SAL e simulazioni.
5. Dichiarazioni RA e importo atteso determinato automaticamente; storico eventi, riscontri settimanali, baseline immutabile, chiusura e riapertura dei cicli.
6. Archivio Cloudflare D1 esistente e relative migrazioni; **non azzerare i dati e non applicare reset/migrazioni distruttive**. Non pubblicare CSV o database su GitHub.
7. Backup NDJSON e collegamento locale alla cartella OneDrive.

## Migliorie V4
- `GET /api/report-stream`: flusso NDJSON con pagine da 1.000 commesse, autenticato, filtrato per RA, con revisione CSV obbligatoria; tutto su una singola risposta HTTP.
- Caricamento progressivo visibile e controllo di completezza. Se flusso interrotto, il report incompleto **non viene montato**. Compatibilità temporanea con `/api/report` se un backend precedente restituisce 404.
- Storico SAL caricato **solo quando si apre la scheda**, invece che prima del cruscotto.
- Controllo settimanale visualizzato per pagine da 100 righe, senza migliaia di righe DOM nascoste.
- `GET /api/import-log`: registro delle pubblicazioni e recuperi metadati leggibile da Gestione/Direzione, proibito agli RA; nuova scheda **Storico caricamenti**.
- Shell visiva riprogettata con intestazione, colori, bottoni e schede **coerenti con la V2**; report economico interno mantiene i suoi CSS V2.
- **Nessuna nuova tabella o migrazione** in V4. Il registro utilizza i dati già presenti in `imports` e `audit`.

## Verifica prima della pubblicazione
1. Esaminare il workflow GitHub **SALCheck V4 checks** sul branch `salcheck-v4`, che usa Node 24 ed esegue `node --test tests/workflow.test.mjs`.
2. Controllare `node --check lib/api.mjs`, `node --check lib/store.mjs`, `node --check public/app.js`.
3. Completare una prova in ambiente di test/preproduzione con **database isolato o snapshot**, prima di aggiornare l'app con dati aziendali.
4. Verificare i tre accessi (RA, Gestione, Direzione), assicurandosi che un RA non veda altre sedi e che la Direzione non possa salvare.
5. Verificare i totali SAL V2 con un CSV noto, simulazioni IVA, ritenute bancarie, dichiarazione RA, CSV successivo, riscontro parziale/completo e storico precedente.
6. Prova iniziale su un report RA, poi su tutte le sedi; cronometrare avvio, prima schermata e caricamento totale. Se emerge un errore, mantenere/ristabilire l'app V3 con database intatto.

## Istruzione per ChatGPT Work
«Apri il repository GitHub francescoderelli/salcheck, usa esclusivamente il branch `salcheck-v4` e la cartella `cloud`. Controlla che il workflow V4 sia verde e verifica le funzioni prima di pubblicare. Aggiorna **lo stesso** progetto Sites identificato da `.openai/hosting.json`, conservando il database Cloudflare D1, la variabile `SALCHECK_OWNER_EMAIL`, le dichiarazioni, le sessioni e lo storico. Non creare un nuovo progetto e non resettare il database. Mantieni gli indirizzi URL esistenti e verifica accessi RA, Direzione e Gestione, caricamento report, storico SAL e storico caricamenti prima di dichiarare il deploy completato.»

## Aggiornamento prestazioni — caricamento immediato V4 (27 ottobre 2026)

La prima V4 ottimizzava il trasporto delle pratiche con un singolo streaming NDJSON, ma continuava a trasferire **tutte** le commesse prima di mostrare il cruscotto. Ciò è inefficiente per utenti Direzione e Gestione con l'intera rete.

**Nuova architettura pronta sul ramo `salcheck-v4`:**

1. **`GET /api/dashboard`** restituisce aggregati economici dal database D1 raggruppati per sede e rete, con filtro RA **applicato sul server**. Non scarica il dettaglio delle commesse; richiede comunque la stessa sessione autenticata. I KPI rapidi rappresentano il CSV pubblicato **prima** delle esclusioni manuali e simulazioni IVA individuali e sono esplicitamente distinti dai KPI ricalcolati nel report completo.
2. L'interfaccia `/workspace` apre il cruscotto rapido e la classifica sedi con stile V2: **il caricamento integrale del report non parte automaticamente al login**.
3. Selezionando una sede, `GET /api/report-stream?site=...&network=...` recupera **solo** le commesse di quella sede/rete, sempre nel perimetro di accesso del RA. È previsto l'esplicito pulsante **«Apri report nazionale completo»** per chi necessita dell'intera analisi V2.
4. Report V2, filtri, IVA, fatturazione e incassi mantengono le regole economiche esistenti. Il download Excel/CSV nel report di una sede riguarda solo le pratiche caricate per quella sede. Per un export nazionale usare «Apri report nazionale completo».
5. Se l'utente visualizza già il dettaglio, il tasto Aggiorna aggiorna anche il report V2; altrimenti aggiorna solo il riepilogo veloce. La sezione Controllo settimanale continua a mostrare 100 impegni per pagina e gli altri due storici si caricano a richiesta.
6. **Nessuna migrazione database aggiuntiva**: lettura diretta dalle tabelle correnti e verifica della revisione import. `SALCHECK_OWNER_EMAIL`, dichiarazioni, confronto settimanale, autenticazione email senza OTP e ruolo Direzione rimangono invariati.

**Eseguire test nel progetto Work prima del deploy**:
- Dashboard RA: KPI solo proprie commesse, senza trasferimento iniziale del report.
- Dashboard Direzione: tutte le sedi, senza permessi di scrittura.
- Click su una sede: soltanto le pratiche del sito selezionato, ma con tutte le caratteristiche visuali della V2.
- «Apri report nazionale completo»: può avere tempi di caricamento proporzionali al numero totale di commesse; non confonderlo con il cruscotto rapido.
- Confermare KPI rapidi contro CSV e KPI completi, tenendo conto di esclusioni e simulazioni.
- Confrontare con cronometro tempi di ingresso, cruscotto rapido e dettaglio di sede; non assumere miglioramenti numerici senza misurazione reale.

**Distribuire l'HEAD più recente del ramo `salcheck-v4`**, non i commit precedenti che ancora caricavano tutto il report all'accesso. Verificare la suite GitHub Actions su quel commit e conservare lo stesso progetto Sites/database.
