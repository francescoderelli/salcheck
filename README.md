# SALCheck — controllo SAL per sede

Sito statico per l'analisi delle pratiche fatturate e incassate con SAL potenzialmente da caricare. Carica un solo export Excel `STATI_Pratiche_creat_*.xlsx` di una sede alla volta: tutto viene elaborato nel browser, senza archiviare il file.

## Regole
- Venduto confrontato con Fatturato netto a pagare mediante coefficienti 100%, 106%, 110%, 118%, 122% (tolleranza iniziale €1).
- Una pratica è incassata se Fatturato e Incassato coincidono entro €0,02.
- SAL potenziale = Venduto meno Prodotto lordo, rilevato se maggiore di €1.
- Soggetto e stato pratica NON sono criteri di esclusione.
- I risultati sono casi da verificare: incasso integrale non dimostra l'esecuzione dei lavori; il 100% non identifica univocamente il regime fiscale.

## Pubblicazione
Apri GitHub → Settings → Pages → Build and deployment → **Deploy from a branch** → Branch `main`, cartella `/(root)` → Save. Poi apri https://francescoderelli.github.io/salcheck/.

Non caricare dati aziendali nel repository. Excel letti esclusivamente nel browser; la libreria SheetJS viene caricata dal suo CDN ufficiale.

## Test di coerenza
- Brescia: 721 righe; 20 pratiche con SAL residuo per €49.461,47.
- Verona: 760 righe; 24 pratiche con SAL residuo per €14.075,37.

Report gestionale, non certificazione contabile.