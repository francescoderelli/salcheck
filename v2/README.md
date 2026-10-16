# SALCheck V2 — Rete Italia (anteprima)

Versione sperimentale sul branch `feature/v2-spa-nazionale`. **La V1 rimane inalterata** su `release/v1-sede-singola-2026-10-16` e su `main/index.html`.

## Utilizzo
1. Aprire `https://francescoderelli.github.io/salcheck/v2/`.
2. Caricare un CSV Stati pratiche contenente `CountryRete`, `Sede`, `CodiceCommessa`, `Venduto€`, `ProdottoLordo€`, `FatturatoTotale€`, `IncassatoTotale€`.
3. L'opzione iniziale **Scegli la sede** non preseleziona nulla: il report rimane vuoto finché l'utente seleziona dal menu una sede diretta o franchising. Il menu mostra soltanto le sedi compatibili con il filtro rete.
4. Passare a **Tutte le sedi** per il consolidato completo. Filtrare per rete e categoria ed esportare Excel riepilogativo oppure CSV filtrato.
5. Il filtro **Anno delibera** si popola da `DataDelibera`. Il CSV originale a 26 colonne non contiene alcuna data di ultimo SAL, pertanto non utilizziamo né `DataCreazionePratica` né l'anno del codice commessa. Le pratiche senza data di delibera restano visibili su `Tutti gli anni` (non sono attribuite arbitrariamente). Il filtro opera su sede, rete, cruscotto, dettaglio ed Excel `Riepilogo anni`.

## Calcolo
- Il **Preventivato** non entra mai nei calcoli.
- Tutte le righe della medesima commessa nella stessa sede/rete vengono aggregate, mantenendo traccia del numero di righe e segnalando duplicazioni economiche.
- Per la fatturazione integrale il fatturato netto deve coincidere con Venduto moltiplicato per 1,00; 1,06; 1,10; 1,18; o 1,22 (tolleranza predefinita €1). Commesse a componenti separate con IVA mista sono riconosciute anche quando ogni componente è riconciliabile individualmente.
- La pratica deve anche risultare incassata integralmente (tolleranza €0,02).
- **SAL fatture complete**: Venduto − Prodotto lordo superiore a €1.
- **SAL su incassi parziali/sconti**: fatturato inferiore a quello atteso ma completamente incassato; per ogni coefficiente IVA teorico compatibile, base = Fatturato netto / coefficiente, e SAL teorico = max(0, base − Prodotto lordo). Il report mostra un intervallo.
- Stato pratica e cliente/richiedente rimangono informativi e non influenzano la selezione.

## Dimensione e privacy
La lettura CSV avviene a blocchi con Papa Parse usando un Web Worker; i dati non vengono inviati al server. L'export Excel è generato localmente da SheetJS. Non caricare i CSV aziendali su GitHub.

## Prima verifica riproducibile
Sull'export `STATI_Pratiche_creat_1792136302893.csv` (154.883 righe), caricare il file, scegliere una singola sede nel menu, verificare i due controlli SAL e poi selezionare **Tutte le sedi** per il riepilogo complessivo. La vecchia selezione automatica delle 10 sedi è stata rimossa per evitare di presentare dati non richiesti. L'analisi economica è invariata.

**Importante:** il CSV di riferimento contiene solo `macroarea=NORD`; non equivale a un export nazionale completo.

## Deploy
Il branch sperimentale resta separato. Per rendere la V2 accessibile senza sostituire la V1, gli stessi file `v2/index.html`, `v2/style.css`, `v2/engine.js`, `v2/app.js` vengono copiati manualmente nella cartella `/v2` di `main`. Le modifiche future sul branch non aggiornano la pagina di anteprima finché non vengono sincronizzate.

## Revisione manuale e totali dinamici

Il menu `Verifica` nel dettaglio delle pratiche comprende quattro stati:
- **Da verificare**: la pratica partecipa normalmente ai SAL potenziali;
- **Lavoro eseguito**: resta nel SAL potenziale, perché la lavorazione risulta da verificare/caricare;
- **Acconto**: viene sottratta dal SAL potenziale finché non è comprovata l'esecuzione;
- **Da escludere**: viene sottratta dal SAL potenziale, per esempio per errori dell'export Albert o SAL già registrati.

Il cambio di stato aggiorna immediatamente KPI, totali per sede, totali per anno e fogli di riepilogo Excel. **Non modifica** Venduto, Prodotto, Fatturato o Incassato e **non elimina la commessa** dal dettaglio: rimane visibile, evidenziata e auditabile. L'export contiene sia il SAL teorico originale sia il SAL conteggiato dopo le esclusioni; è presente anche il foglio `Escluse e acconti`.

Le decisioni sono persistite esclusivamente nel `localStorage` del browser per combinazione di sede, codice pratica e quattro importi economici. Se gli importi cambiano su un export successivo, un'esclusione precedente non viene riapplicata automaticamente. Non esiste sincronizzazione fra browser, account o colleghi: per condividere le verifiche usare il report Excel.

## Ordinamento e intestazioni

Le colonne monetarie del **Dettaglio pratiche** (Venduto, Prodotto, Fatturato netto a pagare, Incassato e SAL residuo; nei casi parziali SAL minimo e SAL massimo) sono ordinate facendo clic sull'intestazione: primo clic crescente, secondo decrescente. Sono ordinate tramite il valore numerico, non la stringa formattata. La **Classifica sedi** supporta lo stesso comportamento su pratiche vendute, SAL fatture complete, SAL teorico massimo delle fatturazioni parziali e anomalie. L'ordinamento vale per tutte le pratiche filtrate, non soltanto per la pagina mostrata.

La colonna visuale **Righe** è stata rimossa dal dettaglio pratiche per lasciare spazio ai valori economici. Le verifiche sulle righe duplicate restano operative nel motore e l'export audit continua a riportarne il numero. L'intestazione economica è ora **Fatturato netto a pagare**, coerentemente con il significato del dato esportato da Albert.

## Ricerca e selezione multipla delle sedi

La modalità **Scegli le sedi** apre un selettore con campo di ricerca per codice sede e caselle di spunta. L'utente può cercare una sede, selezionarla, continuare a cercarne altre e rimuovere singole sedi tramite le etichette mostrate sotto il campo. Le selezioni possono comprendere **dirette e franchising** contemporaneamente. Il riepilogo, il dettaglio delle commesse, i totali SAL revisionati e tutti i fogli dell'Excel includono soltanto le sedi selezionate (e gli eventuali filtri rete/anno).

La modalità **Tutte le sedi** continua a mostrare tutto l'archivio filtrato per tipologia rete e anno. Passando da una modalità all'altra, le sedi scelte rimangono selezionate fino al nuovo caricamento del CSV o alla pressione di **Azzera selezione**. Le impostazioni delle sedi scelte non sono condivise fra utenti.

## Perimetro del CSV

SALCheck visualizza sempre, sopra i filtri e anche con nessuna sede selezionata, le **macroaree presenti nelle righe dell'export** e il relativo numero di righe, ad esempio `NORD (154.883 righe)`. Il motore ricava le informazioni direttamente dalla colonna `macroarea` di ogni riga CSV, comprese quelle prive di venduto; in caso di dati mancanti segnala `Non indicata`, o il campo assente se la colonna non esiste. La presenza di tutte o più macroaree **non garantisce** che l'export sia completo: per un confronto col dashboard nazionale occorre mantenere gli stessi filtri di estrazione e la stessa definizione di venduto. L'indicazione si aggiorna a ogni nuovo caricamento, non ai filtri delle sedi.
