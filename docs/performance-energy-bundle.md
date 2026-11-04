# Bundle di Consumi · Energia (PERF.E1)

Riporta la superficie Consumi · Energia sotto il suo budget senza alzare
soglie, senza cambiare UX, libreria grafica o architettura della mini-app
Energy. Branch `feature/perf-energy-bundle`, base `8288c1c` (PERF.2, che
contiene PERF.1, Kiosk, Screensaver e Alimentazione). KB = 1000 byte; gzip a
livello zlib predefinito, come il [budget](performance-budget.md). Metodo e
strumenti di [PERF.1](performance-bundle-audit.md).

## Baseline (`8288c1c`, build pulita)

| Superficie | Raw KB | Gzip KB | Stato |
| --- | ---: | ---: | --- |
| Boot | 888,0 | 192,8 | OK |
| Home (freddo) | 2.238,2 | 578,3 | OK |
| **Consumi · Energia** (+Home) | **668,8** | **203,5** | **FAIL** (limite 650 / 200) |
| Impostazioni (+Home) | 206,9 | 60,3 | OK |
| Totale JS + CSS | 6.020,7 | 1.627,2 | WARN |
| Fuori dalle superfici | 95,1 (9 file) | | OK |
| File JS + CSS in `dist/assets` | 102 | | |

Il budget falliva anche in gzip, non solo in raw.

Cosa aggiungeva Consumi a Home (12 file, tutti JS, nessun CSS proprio: lo
stile è nel CSS globale del Boot):

| File | Tipo | Raw | Gzip | Contenuto |
| --- | --- | ---: | ---: | --- |
| Consumi (`consumptionCopy.ts`) | dinamico | 306,4 | 89,4 | pagina, Energy, testi; **Recharts 127 KB renderizzati**, es-toolkit 29,7 |
| CartesianChart | condiviso | 274,5 | 86,2 | **Recharts**, @reduxjs/toolkit, immer, decimal.js-light, d3-scale, d3-time-format |
| BarChart | condiviso | 45,9 | 12,9 | **Recharts** (Line, Bar, Rectangle, Sector), d3-shape |
| tailwind-merge | condiviso | 26,3 | 8,2 | |
| `energyCoreClient.ts` | dinamico | 10,2 | 3,5 | client Energy Core |
| NestedPageHeader e 6 icone | condivisi | 5,8 | 3,4 | |

Su richiesta, già lazy: Setup Wizard (110,6 / 35,6) e Impostazioni Energy
(75,7 / 24,7).

## Audit di Recharts

Recharts 3.8.1, nessun cambio di versione. Importatori in tutto il sorgente:

| File | Componenti | Quando si vede | Prima | Dopo |
| --- | --- | --- | --- | --- |
| `src/pages/consumi/AcquaDetail.tsx` | BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer | dettaglio Acqua (anteprima) | **statico in Consumi** | via `consumptionCharts.tsx`, lazy |
| `src/pages/consumi/GasDetail.tsx` | LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer | dettaglio Gas (anteprima) | **statico in Consumi** | via `consumptionCharts.tsx`, lazy |
| `src/components/settings/SettingsMiniSparkline.tsx` | AreaChart, Area, ResponsiveContainer | Impostazioni › Sistema | lazy (PERF.1) | invariato |
| `src/components/widgets/micro/MicroSuperChart.tsx` | Area/Bar/Line Chart | card micro grafico | lazy | invariato |

Cause dell'ingresso eager in Consumi:

- `Consumi.tsx` importava staticamente `AcquaDetail` e `GasDetail`: tutto
  Recharts (~387,5 KB raw / 116,8 gzip con le dipendenze) entrava al primo
  ingresso, anche se l'overview e il dettaglio Energia non hanno grafici
  Recharts.
- Il tree shaking funziona sui componenti (Pie, CartesianAxis, Tooltip nel
  chunk Consumi), ma il nucleo condiviso (store Redux, selettori, scale d3,
  decimal.js-light) entra con qualsiasi grafico cartesiano: è il chunk
  CartesianChart da 274,5 KB.

Cosa **non** era una causa (verificato):

- **Grafici Energy**: `EnergyHistoryChart` e la casa animata sono SVG propri,
  senza Recharts.
- **Barrel**: nessun `index.ts`/`index.tsx` in `src/pages/consumi`.
- **Formatter e modelli**: `shared.tsx` (scaffold, `ChartCard`,
  `PremiumTooltip`), `energyModel.ts` ed `energyHistoryModel.ts` non importano
  Recharts.
- **Dati**: fetch e store (`useEnergyCore`, `useEnergyHistory`,
  `energyCoreClient`) non dipendono dai grafici.
- **CSS**: nessun CSS proprio di Recharts.

Primo paint per tipo di grafico:

- Nessun grafico Recharts nell'overview di Consumi né nel dettaglio Energia.
- I grafici esistono solo in dettagli aperti da un tocco o da un link:
  barre e torta in Acqua, linea in Gas.
- Nessun grafico nel setup o nella configurazione.

## Soluzione

- **`src/pages/consumi/consumptionCharts.tsx`**: i tre grafici (barre e torta
  Acqua, linea Gas), con il JSX spostato invariato. È l'unico modulo di
  Consumi che importa Recharts.
- **`src/pages/consumi/LazyConsumptionChart.tsx`**: confine piccolo
  (`React.lazy` + `Suspense` + `LazyLoadErrorBoundary` di PERF.1).
- **Acqua e Gas** restano eager e immediati: intestazione, visual animato,
  avviso, titoli delle card, legenda e centro della torta. Solo l'area
  interna del grafico aspetta.
- **Placeholder**: riempie l'area che `ChartCard` riserva già (h-48 / sm:h-56;
  la torta h-44), con `role="status"`, etichetta localizzata e pulsazione solo
  senza riduzione del movimento. Nessun salto di layout: le altezze delle
  card sono misurate uguali prima e dopo l'arrivo del grafico.
- **Errore**: resta dentro la card («Grafico non caricato») con «Ricarica
  Domus UI», come le altre schermate su richiesta. Titolo, visual, avviso e
  ritorno a Consumi restano. Un «Riprova» locale è stato provato e scartato:
  Chromium ricorda un import fallito e non lo richiede più, quindi solo la
  ricarica recupera davvero (anche dopo un aggiornamento con nuovi hash).
- **Navigazione**: uscire da un dettaglio non aspetta il grafico. Una prima
  versione con `use()` di React teneva fermo il cambio di pagina finché il
  chunk non arrivava; `React.lazy` no. Un test lo verifica.
- Nessun `manualChunks`, nessuna nuova dipendenza, nessun preload globale.
  Il backend Energy non è toccato.

## Budget

Nuova superficie informativa **Consumi · Grafici Acqua e Gas**
(`src/pages/consumi/consumptionCharts.tsx`, sopra Consumi): grafici e
libreria restano misurati e attribuiti a Consumi, non finiscono fuori dalle
superfici. Senza limite proprio: nessuna soglia nuova o alzata in questo
lavoro (vedi Debiti).

## Risultato

| Superficie | Prima | Dopo | Differenza |
| --- | ---: | ---: | ---: |
| **Consumi · Energia** | 668,8 / 203,5 FAIL | **281,3 / 86,7** OK | **−387,5 / −116,8** |
| Consumi · Grafici Acqua e Gas (info) | — | 389,6 / 117,8 | nuova |
| Energy · Setup Wizard | 110,6 / 35,6 | 110,5 / 35,6 | ≈ |
| Energy · Impostazioni | 75,7 / 24,7 | 75,6 / 24,7 | ≈ |
| Boot | 888,0 / 192,8 | 888,0 / 192,8 | 0 |
| Home | 2.238,2 / 578,3 | 2.238,2 / 578,3 | 0 |
| Impostazioni | 206,9 / 60,3 | 206,9 / 60,3 | 0 |
| Sidebar contesto | 709,1 / 210,2 | 709,0 / 210,2 | ≈ |
| Totale JS + CSS | 6.020,7 / 1.627,2 | 6.022,5 / 1.628,2 | +1,8 / +1,0 |
| Fuori dalle superfici | 95,1 (9 file) | 95,1 (9 file) | 0 |
| File JS + CSS | 102 | 103 | +1 |

Margine di Consumi: 368,7 KB raw (43,3% del limite) e 113,3 KB gzip.

Contabilità:

- **Tolto dal percorso iniziale di Consumi**: 387,5 KB raw / 116,8 gzip.
- **Ancora di Consumi ma lazy**: 389,6 / 117,8 KB, caricati solo aprendo
  Acqua o Gas. Sono i byte tolti più ~2 KB di overhead del chunk e del confine.
- **Byte eliminati davvero**: nessuno. Il totale sale di 1,8 KB.

Il budget passa per la prima volta senza FAIL (resta il WARN del totale, già
presente). Due build pulite consecutive danno output e budget identici.

## Verifiche

- **Aspetto**: 12 card con grafico (Gas, barre e torta Acqua) a 390×844 chiaro
  IT, 1440×960 scuro IT, 1440×960 chiaro FR, 820×1180 scuro EN, confrontate
  con la build base: screenshot **identici byte per byte**.
- **ResponsiveContainer**: dopo il mount lazy i grafici misurano sempre più di
  100×100 px (es. 324×192 a 390, 1074×224 a 1180×820, 509×224 a 1440); nessuno
  scroll orizzontale. Controllati 390×844, 820×1180, 1180×820 e 1440×960,
  chiaro e scuro.
- **Tooltip**: compare con il mouse a 1180×820 e 1440×960 e con il tocco a
  390×844 e 820×1180.
- **Lingue**: tick e testi localizzati (lun / Mon / lun.).
- **Navigazione**: Home → Consumi → Energia senza codice dei grafici; Gas lo
  carica; indietro e avanti ridisegnano il grafico; Acqua riusa il codice
  senza nuove richieste.

## Debiti e note

- Il grafico arriva circa 120 KB gzip dopo l'apertura di Acqua o Gas: si vede
  il placeholder per il tempo del download. Un preload all'intenzione (hover
  o pressione della card) è possibile, non incluso.
- Superficie dei grafici senza limite. Proposta da approvare, regola PERF.1 per
  le funzioni su richiesta: warning ~470 KB / 141 KB, limite ~525 KB / 159 KB.
- `SettingsMiniSparkline` (1,1 KB, PERF.1) è ancora fuori dalle superfici;
  Recharts che carica è attribuito solo alla Sidebar contesto.
- Il tooltip delle barre Acqua mostra la chiave del dato («litri») anche in
  inglese e francese: comportamento già presente, invariato.
- Nota per PERF.2: `useOnboardingTranslations` usa `use()`. Lo stesso blocco
  degli aggiornamenti visto qui può valere mentre i testi della configurazione
  sono in caricamento; lì la finestra è breve (i testi partono all'avvio) e lo
  schermo è già di caricamento. Da verificare.
