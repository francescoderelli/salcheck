# SALCheck V2 — Rete Italia (anteprima)

Versione sperimentale sul branch `feature/v2-spa-nazionale`. **La V1 rimane inalterata** su `release/v1-sede-singola-2026-10-16` e su `main/index.html`.

## Utilizzo
1. Aprire `https://francescoderelli.github.io/salcheck/v2/`.
2. Caricare un CSV Stati pratiche contenente `CountryRete`, `Sede`, `CodiceCommessa`, `Venduto€`, `ProdottoLordo€`, `FatturatoTotale€`, `IncassatoTotale€`.
3. La modalità iniziale sceglie 5 sedi dirette e 5 franchising con più righe vendute nel CSV. Le sedi del test sono modificabili e si può selezionare l'intero export.
4. Filtrare per rete, per sede e per categoria. Esportare Excel riepilogativo oppure CSV filtrato.

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
Sull'export `STATI_Pratiche_creat_1792136302893.csv` (154.883 righe), la selezione automatica di 10 sedi include 5 dirette e 5 franchising, circa 12.805 commesse vendute aggregate. Stima indipendente: 236 pratiche con SAL su fatture complete per €128.376,51; 198 pratiche con SAL su incassi parziali/sconti, intervallo teorico complessivo da €110.447,00 a €201.829,79. Questi importi sono da confrontare col risultato del browser e possono richiedere piccoli aggiustamenti per arrotondamenti.

**Importante:** il CSV di riferimento contiene solo `macroarea=NORD`; non equivale a un export nazionale completo.

## Deploy
Il branch sperimentale resta separato. Per rendere la V2 accessibile senza sostituire la V1, gli stessi file `v2/index.html`, `v2/style.css`, `v2/engine.js`, `v2/app.js` vengono copiati manualmente nella cartella `/v2` di `main`. Le modifiche future sul branch non aggiornano la pagina di anteprima finché non vengono sincronizzate.
