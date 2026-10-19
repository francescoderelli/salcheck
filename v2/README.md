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

## Filtro macroarea
Il filtro **Macroarea** offre sempre `Tutte le macroaree`, `Nord`, `Centro`, `Sud`, `N/A` e `Non indicata`, oltre a eventuali codifiche aggiuntive presenti nell'export. `N/A` (valore esplicito) e `Non indicata` (campo vuoto o non presente) sono mantenute come categorie distinte. Filtra i record economici per macroarea e, in combinazione con sede, rete e anno di delibera, aggiorna il cruscotto, la classifica sedi, i dettagli ed entrambi gli export. L'indicazione in alto delle macroaree presenti nel CSV rimane sempre riferita **all'intero file**, non cambia con i filtri. Le sedi selezionate restano memorizzate quando si cambia filtro: una sede di altra macroarea potrebbe momentaneamente non contribuire al totale.

## Simulazione del regime SAL su incassi parziali

Nel tab **SAL incassi parziali** ogni commessa presenta un menu `Regime da simulare` con le sole ipotesi compatibili calcolate dal motore (100%, 106%, 110%, 118%, 122% secondo il fatturato/incassato). Le opzioni mostrano in anteprima il corrispondente SAL teorico. Se non è stato scelto un regime, la riga mostra l'intervallo minimo–massimo; dopo la selezione mostra **solo il regime scelto e il suo SAL simulato**. È possibile tornare a `Da simulare (intervallo)` per annullare la scelta. Questo non cambia il regime reale di fatturazione, che deve essere confermato.

La selezione aggiorna in tempo reale i totali SAL per sede e per l'intero perimetro. I valori delle pratiche senza regime scelto contribuiscono come intervallo; quelli con regime scelto contribuiscono con il singolo importo. Quando non rimangono incertezze, il KPI mostra un importo unico. `Acconto` e `Da escludere` continuano a sottrarre la pratica dal totale e dalla somma simulata; se un regime scelto produce SAL pari a zero, il contributo è zero ma la pratica resta visibile nel tab per poter rivedere la decisione. Nell'Excel sono aggiunte `Regime simulato`, `SAL simulato €` e gli importi conteggiati dopo simulazione, mentre le ipotesi originarie restano nei dati di audit.

Il regime scelto viene mantenuto nel browser tramite `localStorage`, associato a rete, sede, codice pratica e quattro importi economici. I dati non vengono caricati su server; le scelte non sono condivise automaticamente tra colleghi.

## Nomi leggibili per IVA fattura
L'interfaccia ora usa **IVA fattura** anziché Regime e traduce le sigle del motore senza modificarne i calcoli: 100% = Reverse charge / split payment; 106% = IVA 10% e ritenuta 4%; 110% = IVA 10%; 118% = IVA 22% e ritenuta 4%; 122% = IVA 22%. La stessa terminologia appare nei menu, nel filtro, nel dettaglio e nelle esportazioni. I coefficienti sottostanti rimangono invariati, e le scelte già salvate nel browser restano valide. La moltiplicazione 100% non identifica univocamente il reverse charge (può indicare anche split payment o altre fatture senza IVA addebitata): verificare sempre la fattura prima di confermare.

## Imponibile fattura nel dettaglio pratiche
Tutte le schede del **Dettaglio pratiche** mostrano una colonna ordinabile **Imponibile fattura** subito dopo **IVA fattura**. Se il fatturato è riconciliato con un coefficiente, l'imponibile è derivato direttamente dal fatturato netto a pagare e dall'aliquota/ritenuta corrispondente. Per fatture con più componenti IVA riconciliate, il motore somma gli imponibili delle singole righe. Per commesse con simulazioni manuali, usa la base della **IVA fattura scelta**, ricalcolando la colonna in tempo reale. Se le ipotesi IVA sono multiple e non è stata fatta una scelta, mostra un intervallo minimo–massimo; se non sono possibili deduzioni attendibili mostra `—`, senza inventare un numero certo. La stessa colonna appare in `Tutte`, anche dopo la scelta nella scheda parziale.

L'Excel e il CSV includono `Imponibile fattura calcolato €` soltanto quando il valore è unico, `Imponibile fattura minimo €`, `Imponibile fattura massimo €` e `Criterio imponibile` per chiarire quando si tratta di simulazioni, riconciliazioni o intervalli teorici. I valori non dimostrano, di per sé, l'effettiva esecuzione dei lavori.

## Bonifico parlante: ritenuta bancaria 11%
Il motore prova anche una riconciliazione **alternativa** dell'incassato per bonifici parlanti, oltre all'incasso ordinario. A partire dal lordo fatturato/bonificato (che può avere IVA 10% oppure 22%), la banca **scorpora convenzionalmente il 22%** (lordo / 1,22), poi calcola **l'11%** sulla base convenzionale e lo trattiene. L'incasso bancario netto atteso è `fatturato - arrotonda_centesimi((fatturato / 1,22) × 0,11)`. La ritenuta viene quindi calcolata sul lordo del bonifico depurato del 22% convenzionale, **non sulla base imponibile della fattura**. Ad esempio: venduto €10.000, fattura con IVA10% €11.000, base convenzionale €9.016,39, ritenuta €991,80, incasso bancario atteso €10.008,20. La ritenuta del 11% si applica ai bonifici parlanti dal 1 marzo 2024; non si assume che tutte le pratiche storiche siano soggette ad essa.

Se `IncassatoTotale€` coincide entro la tolleranza di incasso con questo importo, il motore lo classifica come **compatibile con bonifico parlante 11%**, calcola `cashOk=true` e lo tratta come saldato ai fini SAL **solo se** anche la fatturazione è riconciliata. La casistica compare nel dettaglio sotto l'incassato, nei KPI delle fatturate/incassate e nei report CSV/XLSX, con ritenuta teorica e importo atteso. L'etichetta `compatibile` è voluta: il confronto matematico non dimostra il tipo di bonifico; bisogna verificare distinta, causale e ritenuta bancaria. Il motore ora tenta anche la ritenuta **storica dell'8%** per commesse con **DataDelibera antecedente al 1° marzo 2024**, ma questa data è solo un limite temporale indicativo: la ritenuta applicabile dipende dalla data dell'accredito del bonifico e deve essere verificata. Per le commesse più vecchie rimane possibile il match all'11%, perché il pagamento può essere successivo al 1° marzo 2024. Non vengono invece ricondotte automaticamente all'8% le pratiche deliberate dopo il 29 febbraio 2024. Il motore non tenta di attribuire trattenute sui bonifici **parzialmente saldati** o su più trasferimenti con arrotondamenti separati: in questi casi serve controllo manuale. Il venduto e l'IVA/imponibile della fattura rimangono invariati.

## Verifica storica 8% e 11% sul file nazionale
Il secondo controllo del motore calcola la base convenzionale `round(fatturato lordo / 1,22, 2)` e la ritenuta `round(base × aliquota, 2)`, quindi confronta `IncassatoTotale€` con `FatturatoTotale€ - ritenuta`, tolleranza ordinaria predefinita 0,02 €. Le aliquote sono **8% fino al 29 febbraio 2024** e **11% dal 1° marzo 2024**, secondo la data dell'accredito bancario, non la data di delibera. Non vengono assegnate etichette automatiche dove due aliquote sono entrambe compatibili con importi molto piccoli. Nel CSV nazionale `STATI_Pratiche_creat_1792148224072.csv` sono state individuate 0 corrispondenze all'8% e 4 all'11% sulla totalità di 114.802 commesse con venduto positivo; si tratta di un controllo storico su un singolo export, non di un dato statico da mostrare nel cruscotto.
