# Onboarding fuori dal Boot (PERF.2)

Toglie dal percorso d'avvio l'interfaccia e i testi della configurazione
iniziale, senza cambiare cosa si vede e senza alzare soglie. Branch
`feature/perf-onboarding-boot`, base `a3c2cd0`
([audit PERF.1](performance-bundle-audit.md), che aveva individuato il
problema e ritirato una prima correzione). KB = 1000 byte; gzip a livello zlib
predefinito, come il [budget](performance-budget.md).

## Metodologia

- Build pulita (`dist/` e `build/` rimossi) prima di ogni misura; stessi
  script di PERF.1 (`npm run build:budget`, `npm run build:budget:map`).
- Le superfici seguono il grafo di build: un file conta nella superficie che
  lo carica davvero. Nessuna attribuzione di comodo, nessun `manualChunks`.
- Ordine: misura, separazione del gate, testi lazy, nuova misura.

## Baseline (`a3c2cd0`)

| Superficie | Raw KB | Gzip KB | Stato |
| --- | ---: | ---: | --- |
| Boot | 915,5 | 200,6 | OK |
| Home (freddo) | 2.264,6 | 585,6 | OK |
| Onboarding (+boot) | 107,6 | 33,4 | WARN (limite 120 / 38) |
| Totale JS + CSS | 6.017,5 | 1.624,3 | WARN |
| Fuori dalle superfici | 109,8 (10 file) | | OK |

Cosa dell'onboarding stava nel Boot, cioè era scaricato da chiunque apra Domus:

- `src/i18n/onboardingTranslations.ts` con i testi della configurazione nelle
  tre lingue (~34 KB renderizzati), anche per chi la casa l'ha già
  configurata;
- `OnboardingGlass.tsx` (cornici e pulsanti delle schermate di
  configurazione, ~6,6 KB), trascinato nel Boot da un solo import del gate:
  `useDeviceAppearance`.

Il gate (`ExperienceGate.tsx`) caricava già `OnboardingExperience` con
`React.lazy`; decide da `readSetupJourney` (fase diversa da `done`) e da
`/setup?reconnect=1`. Nessun barrel coinvolto.

## Cosa cambia

1. **Gate separato.** `useDeviceAppearance` vive in
   `src/components/onboarding/deviceAppearance.ts`; `OnboardingGlass` lo
   riesporta. Il gate importa solo quello: le schermate di configurazione
   escono dal Boot.
2. **Testi per lingua.** I testi della configurazione sono un modulo per
   lingua (`src/i18n/onboarding/{it,en,fr}.ts`, ognuno completo: niente più
   fallback per spread). `onboardingTranslations.ts` resta piccolo e contiene
   solo il caricatore:
   - `loadOnboardingTranslations(locale)` carica una lingua una volta e
     permette di riprovare dopo un errore;
   - `useOnboardingTranslations()` nelle schermate (`OnboardingExperience`,
     `DemoLockedRoute`): sospende solo se non c'è
     ancora nessuna lingua, e dopo un cambio di lingua lascia i testi
     precedenti finché arrivano i nuovi;
   - `translateOnboarding` è invariata per chi la chiama.
3. **Avvio.** `main.tsx` chiede i testi della lingua iniziale insieme al
   catalogo, in parallelo e senza attenderli: il primo disegno non aspetta
   nulla in più.
4. **Budget.** Il Boot conta il catalogo e i testi della configurazione della
   lingua più grande (`src/i18n/onboarding/fr.ts`), cioè esattamente ciò che
   l'avvio scarica nel caso peggiore. `Lingua · Italiano` / `Lingua · English`
   contano catalogo e testi della loro lingua. Nuova superficie informativa
   `Onboarding · Organizzazione`, l'ultimo passo, caricato quando ci si
   arriva: prima era fra il codice fuori dalle superfici.

## Varianti valutate

| Variante | Boot raw / gzip | Onboarding raw / gzip | Esito |
| --- | ---: | ---: | --- |
| A. Testi solo per chi configura (caricati dal gate) | 876,6 / 189,1 | **127,5 / 40,5** | Supera 120 / 38: non committata |
| **B. Testi della lingua iniziale all'avvio (scelta)** | **888,0 / 192,8** | **116,2 / 36,8** | Conforme (WARN, già WARN in baseline) |

La variante A è la più leggera per chi ha già configurato la casa, ma i testi
servono al primo disegno della configurazione, quindi appartengono
all'Onboarding: misurata onestamente (116,2 / 36,8 più i 11,3 / 3,7 KB dei
testi francesi) supera il limite. Contarli altrove sarebbe un trucco
contabile. Riduzioni reali cercate prima di ritirarla:

- **Bridge del pannello** (chunk condiviso con Home, 71,8 / 22,0 KB):
  `useHaPanelBridgeConnection` importa i parser di configurazione, cronologia
  revisioni, reset e app (~30 KB renderizzati), ma li usa per **validare** i
  messaggi diretti al pannello Home Assistant prima di inviarli. Renderli
  lazy cambierebbe un controllo di sicurezza sincrono: scartato.
- **Testi dell'organizzatore** con il suo chunk: −2,3 KB, insufficiente da solo.
- **Dividere i passi dell'onboarding** in chunk: i byte restano
  dell'Onboarding, quindi nessun guadagno onesto.

Per arrivare alla variante A serve una decisione: un limite Onboarding di
circa 128 / 41 KB, oppure una riprogettazione delle validazioni del bridge.
Nessuna delle due è in questo lavoro.

## Risultato (variante B)

| Superficie | Prima | Dopo | Differenza |
| --- | ---: | ---: | ---: |
| Boot | 915,5 / 200,6 | 888,0 / 192,8 | **−27,5 / −7,8** |
| Home (freddo, include Boot) | 2.264,6 / 585,6 | 2.238,2 / 578,3 | −26,4 / −7,3 |
| Onboarding (+boot) | 107,6 / 33,4 | 116,2 / 36,8 | +8,6 / +3,4 (WARN, entro 120 / 38) |
| Configurazione guidata HA (info) | 12,9 / 4,6 | 20,4 / 7,6 | +7,5 / +3,0 |
| Lingua · Italiano (info) | 197,1 / 48,8 | 207,7 / 52,4 | + testi it |
| Lingua · English (info) | 186,1 / 45,4 | 196,3 / 48,7 | + testi en |
| Totale JS + CSS | 6.017,5 / 1.624,3 | 6.020,7 / 1.627,2 | +3,2 / +2,9 |
| Fuori dalle superfici | 109,8 (10 file) | 95,1 (9 file) | organizzatore attribuito |

- Chi apre una casa già configurata scarica 27,5 KB in meno all'avvio (i
  testi di una sola lingua invece di tre, niente schermate di
  configurazione) e non chiede mai il chunk della configurazione.
- Onboarding e configurazione guidata crescono perché `OnboardingGlass` non
  arriva più gratis dal Boot: ora è un chunk condiviso fra le due, pagato da
  chi lo usa.
- Il totale cresce di 3,2 KB: tre moduli di testi separati invece di uno.
- Due build pulite consecutive danno gli stessi numeri.

## Comportamento

- **Caricamento**: finché schermata e testi non ci sono, resta lo stato di
  caricamento esistente del gate («Preparazione dashboard…»). Verificato a
  390×844, 820×1180, 1440×960, chiaro e scuro.
- **Errore**: se il chunk della configurazione o i suoi testi non si
  caricano, appare la schermata esistente «Contenuto non caricato» con
  «Ricarica Domus UI». Il percorso di configurazione salvato non cambia, non
  si apre la Home, nessuna configurazione è data per completata.
- **OAuth**: il ritorno da Home Assistant è gestito dentro
  `OnboardingExperience`, che parte solo dopo il caricamento. Se il
  caricamento fallisce, codice e stato restano dove sono e la ricarica
  completa l'accesso; nessun token viene salvato prima.
- **Nessun prefetch** della configurazione per le case già configurate.

## Test

- `scripts/performance-budget/performanceBudget.test.mjs`: testi della lingua
  iniziale nel Boot, spostamento fra Boot e Onboarding senza perdere byte
  (totale invariato), testi non attribuiti segnalati come fuori dalle
  superfici.
- `src/i18n/onboardingTranslations.test.ts`: una lingua alla volta, una sola
  richiesta, lingua precedente fino all'arrivo della nuova, stesse chiavi e
  segnaposto nelle tre lingue.
- `src/components/onboarding/ExperienceGate.lazyLoading.test.tsx`: casa
  configurata senza configurazione, stato di caricamento, ripresa al passo
  raggiunto, errore dei testi e del chunk senza completamento.
- `src/components/onboarding/experienceGateLazyBoundary.test.ts`: il gate non
  importa le schermate, i testi non sono importati staticamente, l'avvio non
  li attende.
- `tests/onboarding-cold-start.smoke.cjs` (build di produzione): avvio di una
  casa configurata senza il chunk della configurazione e con i soli testi
  della sua lingua, nuova casa, ripresa, errore dei testi e del chunk con
  ricarica funzionante.
