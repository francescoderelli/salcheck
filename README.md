# SALCheck — controllo SAL per sede

## Accesso per email e storico settimanale

La nuova implementazione è descritta in [v5/README.md](v5/README.md): il RA dichiara la propria email, vede le sedi associate al CSV e salva il SAL da caricare; ogni nuovo CSV aggiunge un riscontro allo storico. Il responsabile usa un accesso gestione separato. L'interfaccia statica è in `email/`, ma serve ancora collegare un servizio condiviso per rendere attivi i salvataggi da computer diversi. L'email è un'identità dichiarata, non verificata. Nel repository non vengono conservati dati aziendali.

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

## Secondo controllo: fatturazione non riconciliata ma già incassata

È disponibile la sezione **SAL su incassi parziali / sconti**. Individua le righe in cui:
- il fatturato non coincide con il 100% del venduto sotto alcuno dei cinque regimi compatibili;
- il totale fatturato (netto a pagare) è già stato incassato integralmente;
- almeno uno dei regimi 100%, 106%, 110%, 118%, 122% implica un imponibile fatturato superiore al prodotto registrato.
  
Per ogni regime compatibile con venduto e fatturato, la base stimata è `Fatturato netto / coefficiente` e il possibile SAL è `max(0, imponibile stimato - Prodotto)`. Poiché il solo export non identifica il regime IVA effettivo, la tabella riporta il **minimo e il massimo**, il dettaglio dei singoli coefficienti e un foglio Excel dedicato. La presenza di acconti, fatture parziali o sconti richiede comunque verifica prima di registrare ricavi. Il nuovo controllo rimane separato dal report originario delle pratiche completamente fatturate/incassate.

**Esempio:** venduto €50.000, prodotto €25.000, fatturato netto/incassato €35.000 → SAL teorico da €3.688,52 (coefficiente 122%) a €10.000 (coefficiente 100%).
