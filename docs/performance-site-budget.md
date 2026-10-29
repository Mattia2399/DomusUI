# Budget del sito di presentazione (PERF.S1)

Riporta il sito pubblico (`npm run build:site`, `dist-site/`) sotto il suo
budget senza alzare soglie e senza cambiare nulla di ciò che si vede. Branch
`feature/perf-site-budget`, base `ee7acdc` (PERF.E1). KB = 1000 byte; gzip a
livello zlib predefinito, come `scripts/check-site-budget.mjs`. Contesto:
[sito di presentazione](presentation-site.md), [audit PERF.1](performance-bundle-audit.md).

## Cosa misura il budget

`site:budget` controlla quattro gruppi. Quello in FAIL, «All JS, including
demos», somma **tutti** i file JS di `dist-site/assets`, compresi quelli
caricati su richiesta. Rendere lazy qualcosa non cambia quel numero: servono
byte che spariscono davvero dalla build.

## Baseline (`ee7acdc`, build pulita)

| Gruppo | Raw KB | Gzip KB | Limite raw / gzip | Stato |
| --- | ---: | ---: | ---: | --- |
| JS iniziale | 465,0 | 149,1 | 500 / 160 | OK |
| CSS iniziale | 177,9 | 30,4 | 190 / 33 | OK |
| **Tutto il JS** | **1.290,5** | **357,9** | **1.200 / 330** | **FAIL** (raw e gzip) |
| Tutto il CSS | 299,0 | 48,7 | 320 / 53 | OK |

5 file JS (2 CSS, 9 asset immagine e font):

| Chunk | Raw KB | Tipo | Importato da | Perché si carica |
| --- | ---: | --- | --- | --- |
| `main` | 465,0 | iniziale | `index.html`, `en/index.html` | pagina, sezioni, React, framer-motion |
| `DemoCardRuntime` | 235,0 | su richiesta | `DemoCard.tsx` | vere card Domus nelle demo, montate quando entrano in vista |
| `fr` | 207,3 | su richiesta | `I18nProvider.tsx` | **catalogo francese dell'app: mai caricato dal sito** |
| `it` | 197,1 | su richiesta | `I18nProvider.tsx` | catalogo dell'app per le card in italiano |
| `en` | 186,1 | su richiesta | `I18nProvider.tsx` | catalogo dell'app per le card in inglese |

Maggiori contributori (lunghezze renderizzate prima della minificazione):

| Modulo / area | KB | Chunk |
| --- | ---: | --- |
| react-dom | 561,3 | main |
| card Domus (`src/components/widgets`) | 362,7 | DemoCardRuntime |
| motion-dom | 292,3 | main |
| catalogo `fr` | 202,9 | fr |
| catalogo `it` | 196,2 | it |
| catalogo `en` | 185,8 | en |
| sezioni e testi del sito (`src/components/site`) | 150,1 | main |
| framer-motion | 133,2 | main |
| `useDashboardState` | 44,9 | main |
| lucide-react | 41,5 + 21,7 | DemoCardRuntime, main |
| react | 20,3 | main |
| scheduler | 11,5 | main |
| `sensorValue` | 8,2 | DemoCardRuntime |
| motion-utils | 7,3 | main |
| `I18nProvider` | 5,6 | main |

## Audit

- **Lingue**: il sito ha due pagine, italiano (`/`) ed inglese (`/en/`).
  `SiteLocale` è `'it' | 'en'` e le card demo passano sempre quella lingua a
  `I18nProvider` come `forcedLocale`. Il catalogo francese è pubblicato solo
  perché `I18nProvider` elenca i tre caricatori: nessuna pagina lo richiede.
- **Codice dell'app**: nessun Recharts, MainBoard, Impostazioni, Energy,
  Kiosk, Screensaver, Alimentazione, Onboarding o runtime Home Assistant. Le
  card demo sono vere card Domus per scelta e restano su richiesta.
  `useDashboardState` (44,9 KB nel chunk iniziale) serve allo stato della casa
  demo.
- **Barrel**: nessun barrel che trascini codice in più.
- **Icone**: solo import nominativi da `lucide-react`.
- **Animazioni**: framer-motion e motion-dom servono a quasi tutte le
  sezioni. Restano invariati.
- **Asset**: immagini e font non contano nel budget JS; nessun import JS di
  immagini da segnalare.
- **Sotto la piega**: le card demo sono già montate solo quando entrano in
  vista. Non serve altro lazy, e non cambierebbe il totale misurato.

## Modifica

`scripts/i18n-catalog-plugin.ts` accetta le lingue che una build può mostrare
(`locales`, predefinite: tutte). Per una lingua esclusa il modulo virtuale
rimanda al catalogo di fallback (`en`, lo stesso di `I18nProvider`) invece di
contenere un catalogo proprio. `vite.site.config.ts` passa
`locales: ['it', 'en']`. App, test e Vitest usano il valore predefinito:
l'app resta identica.

Nota: dopo la modifica Rollup chiama il chunk del catalogo inglese `fr-…js`,
perché le voci `en` e `fr` puntano allo stesso modulo. Il contenuto è il
catalogo inglese, caricato dalla pagina `/en/`.

## Risultato

| Gruppo | Prima | Dopo | Differenza |
| --- | ---: | ---: | ---: |
| **Tutto il JS** | 1.290,5 / 357,9 FAIL | **1.083,4 / 307,4** OK | **−207,1 / −50,5** |
| JS iniziale | 465,0 / 149,1 | 465,0 / 149,1 | +0,03 raw |
| CSS iniziale | 177,9 / 30,4 | 177,9 / 30,4 | 0 |
| Tutto il CSS | 299,0 / 48,7 | 299,0 / 48,7 | 0 |
| File JS | 5 | 4 | −1 |

- Margine: 116,6 KB raw (90,3% del limite) e 22,6 KB gzip.
- Byte **eliminati davvero**: 207,1 KB raw, cioè il catalogo francese.
- Byte resi lazy o riclassificati: nessuno.
- App: `dist/` identica byte per byte a PERF.E1, budget dell'app identico.

## Verifiche

- Pagine IT ed EN a 390×844, 820×1180, 1180×820 e 1440×960, confrontate con la
  build base: stesso H1, `lang`, titolo, descrizione, altezza della pagina,
  numero di card montate e nessun overflow orizzontale. Testo visibile e
  titoli identici: a 390×844 IT il sito ha già due varianti di testo legate ai
  tempi di caricamento, e la nuova build ne produce una delle due.
- Uno screenshot a pagina intera non è un confronto valido: anche la base
  cambia da un caricamento all'altro (orologi e contenuti dal vivo).
  Controllo a occhio di hero e card in inglese: identici.
- La pagina inglese carica il catalogo inglese, quella italiana l'italiano.
- Nessuna stringa `recharts` nei file del sito.

## Debiti

- Il JS iniziale (465 KB, 93% del limite) è dominato da react-dom e da
  framer-motion; non è toccato qui.
- Le card demo usano l'intero catalogo dell'app della loro lingua (~190 KB) per
  poche stringhe: un catalogo ridotto per il sito sarebbe un secondo sistema
  di testi, quindi non è stato fatto.
