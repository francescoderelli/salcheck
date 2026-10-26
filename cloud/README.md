# SALCheck — dichiarazioni e riscontro settimanale

Applicazione con archivio online Cloudflare D1, distribuita tramite Sites. Il codice contiene solo struttura e dati dimostrativi nei test. Non caricare CSV, copie dello storico, credenziali o dati aziendali in questo repository.

## Uso

1. Il responsabile apre `/gestione`, accede con il proprio account ChatGPT autorizzato e importa il CSV Albert. I RA non importano file.
2. Dopo l’accesso si apre il report V2 originale: perimetro, filtri, quattro indicatori economici, classifica sedi, categorie delle pratiche, IVA/ritenute e report Excel/CSV. Un RA inserisce la propria email aziendale: il servizio filtra le pratiche usando ResponsabileArea nel CSV. Nella colonna **Verifica** seleziona **SAL da caricare**, aggiunge eventuali note, poi **Salva**. Il campo importo modificabile è stato rimosso: il servizio ricava il SAL dal report. Per un SAL parziale con più ipotesi occorre scegliere l’IVA nel report, senza digitare importi. I pulsanti **Controllo settimanale** e **Storico** mostrano impegni e riscontri condivisi.
3. Il responsabile importa il CSV della settimana successiva. Il sistema confronta l'aumento del ProdottoLordo con il primo importo dichiarato, aggiungendo un riscontro allo storico.
4. **Chiudi impegno** congela l'esito. Un eventuale nuovo impegno parte dal CSV corrente; tutti gli eventi precedenti restano nello storico.

## Accessi

L'email RA è dichiarata, senza password o messaggio di verifica: chi conosce l'email di un altro RA può dichiararla. Il filtro è applicato dal servizio, ma non prova l'identità. Il responsabile usa invece l'identità ChatGPT fornita dalla piattaforma Sites; il ruolo non si ottiene digitandone l'email. Il sito conserva anche un proprio controllo di pubblico: finché rimane privato, è disponibile al solo proprietario.

La variabile nativa Sites `SALCHECK_OWNER_EMAIL` identifica l'account proprietario verificato. Al primo accesso si associa anche l'identificativo stabile fornito dalla piattaforma. Non inserire questo valore o altri segreti nel frontend. I token RA durano otto ore e restano nella memoria della pagina; nel database è salvata soltanto l'impronta del token.

## Storico e copie OneDrive

D1 conserva dichiarazioni, versioni, confronti e metadati delle importazioni. Il nuovo CSV conserva anche macroarea, stato, indirizzo e righe economiche aggregate necessarie al motore V2. Gli import precedenti non conservavano tali dettagli. Il comando Gestione → Recupera indirizzi e dettagli dal CSV già caricato completa i soli metadati: procede soltanto se chiavi, assegnazioni RA e valori economici di tutte le pratiche coincidono. Non crea nuovi confronti settimanali e non cambia dichiarazioni, importi o revisione del CSV. Una revisione separata dei metadati fa ricaricare il report agli altri utenti al successivo Aggiorna. Il nuovo CSV sostituisce i dati operativi correnti, conservando tutti i confronti e gli eventi delle dichiarazioni. I vecchi blocchi di caricamento completi vengono rimossi dopo la pubblicazione per contenere le dimensioni; il CSV originale resta sul computer del responsabile.

**Collega cartella OneDrive** usa il selettore del browser per una cartella locale sincronizzata. Il browser deve supportare File System Access (Chrome/Edge). L'autorizzazione può dover essere ripetuta. Dopo ogni importazione pubblicata, se cartella e permessi sono disponibili, viene salvata una copia NDJSON con data e ora. **Salva copia nella cartella** include anche dichiarazioni arrivate dopo l'ultima importazione. **Scarica copia** è l'alternativa manuale.

Non è un collegamento Graph o un processo pianificato: il salvataggio avviene nel browser aperto; la sincronizzazione online è gestita dal client OneDrive. La copia contiene tabelle applicative e marcatore finale `complete`, esclude sessioni e segreti e viene interrotta se i dati cambiano mentre si esportano. Il ripristino richiede un intervento tecnico: non esiste un'importazione autonoma delle copie nell'interfaccia.

## Limiti del confronto

Gli importi sono in centesimi. Il prodotto iniziale e il SAL atteso non cambiano con i salvataggi successivi. Un aumento positivo che raggiunge l'atteso entro due centesimi è **Importo riscontrato**; altrimenti è parziale o assente. Diminuzioni, pratiche mancanti e riassegnazioni richiedono verifica. Il CSV mostra valori aggregati e non prova quale registrazione specifica abbia generato l'aumento.

## Sviluppo e verifica

- Node >=24 per i test SQLite; dipendenze installate con il helper Sites.
- `node --test tests/workflow.test.mjs`: confronto del motore V2 (IVA mista e ritenuta 8%), paginazione del report e separazione RA, ciclo settimanale, salvataggi concorrenti, importazioni incomplete, riassegnazioni e accesso API.
- `node node_modules/typescript/bin/tsc --noEmit`.
- Schema in `db/schema.ts`, migrazioni generate con Drizzle in `drizzle/`. Mai creare tabelle durante una richiesta.
- Build e pubblicazione tramite gli helper ufficiali Sites. Conservare `.openai/hosting.json` per aggiornare lo stesso progetto.
- Per la prova locale, `.dev.vars` (ignorato) può contenere `SALCHECK_OWNER_EMAIL="seedy@sites.test"`, identità fittizia del mock Sites. Migrazioni applicate solo all'archivio locale.


### Accesso Direzionale
Le cinque email abilitate in `lib/access.mjs` entrano dallo stesso modulo email. Il ruolo director legge tutte le sedi, dichiarazioni, riscontri e storico; non può importare CSV, recuperare metadati, salvare dichiarazioni, chiudere impegni o scaricare il backup gestionale. Controlli applicati nel servizio e nell’interfaccia. Il proprietario ha autorizzato la sola email, senza verifica: conoscendo una delle email direzionali è possibile impersonare quel ruolo.
