# Performance Budget V2

`npm run build:budget` (in CI dopo `npm run build`) controlla il peso di Domus UI
per **superficie**: avvio, Home, ogni route e ogni funzione caricata su
richiesta, in byte raw e gzip, con limiti versionati in
`scripts/performance-budget.config.mjs`. Sostituisce il controllo V1, che
misurava soprattutto il totale e singoli file riconosciuti dal nome.

## Cosa si misura

- **Bundle**: i file JavaScript e CSS di `dist/assets`, cioè ciò che il browser
  esegue e che la release HACS distribuisce. Immagini, stili mappa, font e
  `compat-check.js` sono riportati a parte e non entrano nel budget. Le source
  map non vengono generate. Il sito di presentazione (`npm run build:site`,
  `dist-site/`) è una build separata e non fa parte del totale.
- **Grafo**: durante la build il plugin `scripts/bundle-graph-plugin.mjs` scrive
  `build/bundle-graph.json` (fuori da `dist`, nessun file distribuito cambia):
  per ogni chunk il modulo sorgente, gli import statici e dinamici e il CSS
  associato, come il manifest di Vite, più la dimensione di ogni modulo. Le
  superfici sono definite per id sorgente (`src/pages/Home.tsx`), mai per nome
  di file con hash; il controllo fallisce se il grafo non corrisponde a `dist`.
- **Raw**: byte su disco, il costo di download non compresso, parsing e
  compilazione. **Gzip**: compressione zlib al livello predefinito, vicina a ciò
  che viaggia in rete. Sono controllati entrambi: un aumento di codice ripetitivo
  pesa poco in gzip ma resta da analizzare ed eseguire.

## Cold, incrementale, su richiesta

- **Freddo (cache vuota)**: tutti i file JS e CSS necessari per mostrare una
  superficie partendo da zero, superfici da cui dipende incluse. Si seguono solo
  gli import statici (ciò che il browser deve scaricare prima di eseguire); ogni
  file condiviso conta una volta.
- **Incrementale**: ciò che una superficie aggiunge a quella da cui si parte
  (`requires`), cioè la differenza tra le due chiusure. Per una route la base è
  Home: è il costo reale di aprire Energia con Home già caricata.
- **Su richiesta**: gli import dinamici che una superficie può caricare dopo
  un'azione (aprire il wizard, la mappa, il catalogo card). Non entrano mai nel
  percorso critico della superficie: hanno un budget proprio, misurato sulla
  superficie da cui si aprono.
- Il modello è deterministico e non simula la cache reale dell'utente: niente
  tempi di rete o cache del browser come limite. Una verifica una tantum con
  Playwright sulla build di produzione ha confermato che i file richiesti dal
  browser coincidono con le chiusure calcolate (Home 13 su 13; Energia 13 su 13,
  più il CSS globale già in cache richiesto di nuovo dal preload di Vite).

Il **totale distribuito** comprende tutto il codice lazy e non misura il tempo
di avvio: una funzione caricata solo quando serve aumenta il totale senza
toccare l'avvio. Per questo avvio, Home e route hanno limiti propri e stretti,
e il totale ha più margine: una funzione lazy molto grande (per esempio un
futuro Domus 3D) deve rispettare il proprio budget, il limite per singolo file e
il totale, ma non fa fallire Home.

## Budget

Baseline: build A2.0 (`16a7226`). KB = 1000 byte.

| Superficie | Metrica | Baseline raw / gzip | Warning | Limite (hard) |
| --- | --- | --- | --- | --- |
| Boot (entry + CSS globale) | freddo | 1.154,5 / 252,3 | 1.200 / 265 | 1.250 / 275 |
| Home (shell di tutte le route) | freddo | 2.437,6 / 615,7 | 2.550 / 645 | 2.650 / 670 |
| Onboarding | + boot | 89,4 / 28,1 | 105 / 33 | 120 / 38 |
| Consumi · Energia | + Home | 528,7 / 162,2 | 580 / 180 | 650 / 200 |
| Stanze | + Home | 266,4 / 78,8 | 300 / 90 | 330 / 100 |
| Sicurezza | + Home | 123,4 / 41,4 | 140 / 48 | 160 / 55 |
| App Gallery · Irrigazione · Locale Tecnico | + Home | 234,0 / 65,0 | 260 / 72 | 290 / 80 |
| Impostazioni | + Home | 443,7 / 134,2 | 490 / 148 | 540 / 165 |
| Automazioni | + Home | 7,1 / 3,1 | 20 / 8 | 30 / 12 |
| Profilo | + Home | 36,3 / 11,6 | 45 / 15 | 55 / 18 |
| Energy · Setup Wizard | + Consumi | 105,7 / 33,6 | 130 / 40 | 150 / 46 |
| Energy · Impostazioni | + Consumi | 71,4 / 22,9 | 90 / 28 | 100 / 32 |
| Builder · catalogo card | + Home | 44,5 / 16,0 | 55 / 20 | 65 / 24 |
| Sidebar destra | + Home | 245,4 / 62,6 | 280 / 72 | 320 / 82 |
| Sidebar contesto | + Home | 697,0 / 206,1 | 760 / 225 | 840 / 250 |
| Mappa membri (MapLibre, worker incluso) | + sidebar contesto | 1.180,9 / 315,8 | 1.250 / 335 | 1.350 / 360 |
| Singolo file JS | raw | 985,8 (Home) | 1.050 | 1.100 |
| Singolo file CSS | raw | 406,8 (globale) | 450 | 500 |
| Totale JS + CSS | raw / gzip | 5.500,0 / 1.460,8 | 5.800 / 1.550 | 6.200 / 1.650 |
| Codice fuori dalle superfici | raw | 66,1 | 150 | — |
| Cicli tra chunk statici | numero | 0 | — | 0 (sempre bloccante) |

Motivazioni:

- **Boot e Home**: margine piccolo (circa +4% warning, +8% limite) perché ogni
  byte ritarda la prima schermata. Home mantiene la stessa severità del
  percorso critico V1 (JS 2,1 MB / 600 KB per 1,90 / 0,54), ora con il CSS.
- **Route**: margine moderato (circa +10% / +20%) sul costo aggiunto a Home.
  Automazioni, quasi vuota, ha una soglia minima assoluta invece di una
  percentuale.
- **Funzioni su richiesta**: margine maggiore (circa +15–20% / +30–40%), perché
  sono amministrative o rare e non toccano l'avvio.
- **Singolo file**: il vecchio limite di 2,9 MB per file non proteggeva nulla.
  Il limite JS era quello V1 dell'entry (900 KB); è salito a 1,1 MB con la
  correzione della build di produzione, che riporta le card della dashboard
  nel chunk Home (985,8 KB): il chunk separato `dashboard-widgets` formava un
  ciclo con Home e la Home di produzione non si caricava. Il costo reale di
  Home resta controllato dal suo percorso critico, invariato.
- **Cicli tra chunk**: un import statico circolare tra chunk fa sempre fallire
  il controllo. Il browser esegue prima le dipendenze di un chunk: in un ciclo
  un chunk può leggere valori di un altro non ancora inizializzati
  (`Cannot access … before initialization`), un errore che il server di
  sviluppo non mostra.
- **Totale**: l'audit mostra che dei 5,50 MB solo 2,44 MB sono il percorso di
  Home, e che la crescita recente (Energy A1.x) è tutta lazy. Il totale guarda
  quindi la deriva complessiva: warning a +5%, limite catastrofico a +13%.
  Sostituisce il vecchio 5,52 MB, che non distingueva il codice lazy.
- Piccoli pannelli amministrativi (gestione impostazioni, editor consumi,
  configurazione guidata) sono riportati senza budget; il codice non raggiunto
  da nessuna superficie ha un warning, per dare una superficie propria a una
  funzione che cresce.

Un limite superato (**FAIL**) blocca la CI; un **WARN** la lascia passare con un
avviso. Restano sempre bloccanti avvio, Home, route, funzioni con budget,
singolo file, totale e cicli tra chunk.

## Smoke test della build di produzione

`npm run test:smoke:production` (in CI dopo la build) serve i file di `dist/`
con `vite preview` (`playwright.production.config.cjs`, test
`tests/*.smoke.cjs`) e apre Home, `/consumi` e `/consumi/energia` con la
Content Security Policy di produzione, simulando Home Assistant sulla stessa
origine. Fallisce su qualunque errore di pagina, chunk non caricato,
schermata "Contenuto non caricato" o radice vuota. La suite E2E completa
resta sul server di sviluppo, che non esegue la build distribuita.

## Aggiornare un budget

**Un budget può essere aumentato soltanto con una motivazione documentata.**
Le soglie non seguono mai la build: non esiste alcun `baseline = build + X`.
Per cambiarne una:

1. misura con `npm run build && npm run build:budget` e individua la superficie
   che cresce e il perché (dipendenza, funzione, dati);
2. verifica che la crescita sia nella superficie giusta: codice di una funzione
   lazy non deve entrare in Home o nell'avvio;
3. modifica il numero in `scripts/performance-budget.config.mjs` con un
   commento che riporti nuova baseline, motivazione e margine, e aggiorna questa
   tabella nello stesso commit.

Una nuova route o funzione su richiesta si aggiunge come superficie, con il
modulo sorgente da cui si carica e la superficie di partenza.

## Audit A2.0

Riepilogo delle misure su cui si basano i limiti (dettaglio nel report della
fase):

- 81 chunk JS (4.880,5 KB raw / 1.375,1 KB gzip) e 4 file CSS (619,6 / 85,7).
  Nessun modulo duplicato in più chunk; React e le librerie UI sono presenti una
  volta sola.
- Dipendenze pesanti: MapLibre 1,09 MB raw / 302 KB gzip, solo nella mappa
  membri; recharts circa 283 KB / 87 KB in Consumi, Impostazioni e sidebar
  contesto (chunk condiviso `CartesianChart`, 275 KB); react-dom circa 323 KB e
  motion-dom circa 121 KB all'avvio e in Home.
- Asset statici: circa 3,96 MB, di cui 2,84 MB sono i cinque PNG di ripiego
  della casa Energy (le copie AVIF e WebP pesano 8–22 KB).
