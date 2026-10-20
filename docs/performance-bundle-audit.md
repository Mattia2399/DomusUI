# Audit del bundle e dei budget (PERF.1)

Audit del bundle frontend e del Performance Budget prima di nuove funzioni.
Nessuna funzione nuova, nessuna soglia aumentata. Branch
`feature/perf-bundle-audit`, base `c7e1a7d` (Settings Scopes, Alimentazione e
ricarica, Screensaver, Kiosk). KB = 1000 byte; gzip a livello zlib predefinito,
come il budget.

## Metodologia

- Build pulita (`dist/` e `build/bundle-graph.json` rimossi) prima di ogni
  misura; baseline rifatta sul commit base in un worktree separato, con gli
  stessi script, e identica a quella misurata sul branch.
- Fonte unica: il grafo di build (`build/bundle-graph.json`, scritto dal plugin
  `bundle-graph-plugin.mjs`): per ogni chunk sorgente d'ingresso, import
  statici e dinamici, CSS e moduli con la loro lunghezza renderizzata.
- Nuovo strumento interno, senza dipendenze: `npm run build:budget:map`
  (`scripts/bundle-chunk-map.mjs`, logica in
  `scripts/performance-budget/chunk-map.mjs`). Per ogni file: dimensioni,
  tipo (entry, dinamico, condiviso, CSS), chi lo importa staticamente o lo
  carica dopo, quali superfici lo raggiungono (le stesse chiusure del budget),
  area di sorgente prevalente. I chunk si riconoscono dal sorgente, mai
  dall'hash.
- Owner dei moduli per prefisso di percorso (POWER, SCREENSAVER, KIOSK,
  ENERGY, IRRIGATION, I18N, SETTINGS, HOME, CORE, `vendor:<pacchetto>`). Le
  dimensioni per owner sono lunghezze renderizzate prima della minificazione:
  servono a confrontare le proporzioni, non a sommare byte.

## Cosa misura davvero il budget

Dal codice (`scripts/performance-budget/metrics.mjs`, `report.mjs`), non dai
nomi:

| Voce | Definizione |
| --- | --- |
| **Boot** | Chiusura statica fredda di `index.html` + catalogo `virtual:domus-i18n/fr` (il più grande, caso peggiore): entry, CSS globale, catalogo. |
| **Home** | Chiusura statica fredda di `src/pages/Home.tsx` più quella di Boot (il chunk Home è il facade di `MainBoard`). |
| **Impostazioni, Profilo, Consumi…** | Route: ciò che la chiusura del loro sorgente aggiunge a Home (metrica incrementale). |
| **Funzioni su richiesta** | Ciò che aggiungono alla superficie da cui partono (`requires`). |
| **Chiusura** | Chunk raggiunti seguendo solo gli **import statici**, più i loro CSS. Gli import dinamici non si seguono mai: si caricano dopo. |
| **Totale** | Ogni file JS e CSS di `dist/assets`, **contato una volta**. Non è la somma delle superfici. |
| **Fuori dalle superfici** | Totale meno l'unione delle chiusure di tutte le superfici: chunk dinamici che nessuna superficie configurata raggiunge. Solo warning (150 KB). |

- Un file condiviso conta in ogni chiusura che lo raggiunge e una sola volta
  in un'unione: la somma delle superfici **non** è il Totale (Home, per
  esempio, è dentro quasi tutte le chiusure fredde).
- Aggiungere una superficie non cambia il Totale: sposta file dall'insieme
  "fuori" a una chiusura. Nuovo test: `never loses or adds bytes`.
- Cicli tra chunk statici: sempre FAIL.

Il budget del sito (`scripts/check-site-budget.mjs`) è separato: misura il
bundle `dist-site/` del sito di presentazione (con le demo), non la
dashboard.

## Baseline (`c7e1a7d`)

| Superficie | Raw KB | Gzip KB | Stato |
| --- | ---: | ---: | --- |
| Boot (freddo) | 930,1 | 205,3 | OK |
| Home (freddo) | 2.267,5 | 586,7 | OK |
| Onboarding (+boot) | 93,1 | 28,8 | OK |
| Consumi · Energia (+home) | 668,8 | 203,5 | **FAIL** (preesistente) |
| Impostazioni (+home) | 494,1 | 150,9 | WARN |
| Profilo (+home) | 36,5 | 13,2 | OK |
| Totale JS + CSS | 6.017,5 | 1.624,0 | WARN (98,4% gzip) |
| Fuori dalle superfici | 171,1 (15 file) | 55,8 | WARN |
| Sito (tutto il JS) | 1.290,5 | 357,9 | oltre budget (preesistente) |

Chunk: 91 JS (2 entry, 40 dinamici, 49 condivisi) + 4 CSS; 31 oltre 20 KB, 17
oltre 50 KB, 14 oltre 100 KB, 33 sotto 2 KB (combinazioni di icone
condivise). **Nessun modulo duplicato** in più chunk.

### Chunk map: i più grandi

#### Top 20 baseline per raw

| # | File (sorgente) | Tipo | Raw KB | Gzip KB | Owner | Prima superficie |
|---|---|---|---:|---:|---|---|
| 1 | `Home (src/components/dashboard/MainBoard.tsx)` | dynamic | 1043.2 | 304.9 | HOME | Home |
| 2 | `src/components/settings/maplibreRuntime.ts` | dynamic | 556.8 | 145.3 | vendor:maplibre-gl | members-map |
| 3 | `maplibre-gl-shared (node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs)` | shared | 514.9 | 150.7 | vendor:maplibre-gl | members-map |
| 4 | `CSS · index.html` | css | 415.3 | 56.7 | CSS | Boot |
| 5 | `index.html` | entry | 307.5 | 98.0 | vendor:react-dom | Boot |
| 6 | `Consumi (src/i18n/consumptionCopy.ts)` | dynamic | 306.3 | 89.3 | ENERGY | consumi, energy-wizard, energy-settings |
| 7 | `CartesianChart (node_modules/recharts/es6/state/selectors/axisSelectors.js…)` | shared | 274.5 | 86.2 | vendor:recharts | consumi, settings, energy-wizard, … |
| 8 | `ContextSidebar (src/components/settings/CameraControls.tsx)` | dynamic | 225.7 | 56.0 | SETTINGS | context-sidebar, members-map |
| 9 | `virtual:domus-i18n/fr` | dynamic | 207.3 | 50.5 | I18N | Boot |
| 10 | `virtual:domus-i18n/it` | dynamic | 197.1 | 48.8 | I18N | locale-it |
| 11 | `virtual:domus-i18n/en` | dynamic | 186.1 | 45.4 | I18N | locale-en |
| 12 | `src/pages/AppGallery.jsx` | dynamic | 178.0 | 44.5 | CORE | appgallery |
| 13 | `SettingsDashboard (src/pages/SettingsDashboard.tsx)` | dynamic | 164.3 | 41.8 | SETTINGS | settings |
| 14 | `src/pages/RoomsDashboard.tsx` | dynamic | 161.7 | 43.2 | CORE | rooms |
| 15 | `src/components/dashboard/RightSidebarManager.tsx` | dynamic | 152.1 | 33.2 | HOME | right-sidebar |
| 16 | `CSS · Home (src/components/dashboard/MainBoard.tsx)` | css | 121.1 | 18.4 | CSS | Home |
| 17 | `use-text-value (node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs)` | shared | 86.1 | 31.2 | vendor:@headlessui/react | Home |
| 18 | `CSS · src/components/settings/MembersLocationMap.tsx` | css | 83.0 | 10.5 | CSS | members-map |
| 19 | `EnergyTariffFields (src/pages/consumi/energy/EnergyGuidedDevice.tsx)` | shared | 63.8 | 19.8 | ENERGY | energy-wizard, energy-settings |
| 20 | `oauthState (src/hooks/useHaPanelBridgeConnection.ts)` | shared | 57.3 | 17.4 | CORE | Home |

#### Top 20 baseline per gzip

| # | File (sorgente) | Tipo | Raw KB | Gzip KB | Owner | Prima superficie |
|---|---|---|---:|---:|---|---|
| 1 | `Home (src/components/dashboard/MainBoard.tsx)` | dynamic | 1043.2 | 304.9 | HOME | Home |
| 2 | `maplibre-gl-shared (node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs)` | shared | 514.9 | 150.7 | vendor:maplibre-gl | members-map |
| 3 | `src/components/settings/maplibreRuntime.ts` | dynamic | 556.8 | 145.3 | vendor:maplibre-gl | members-map |
| 4 | `index.html` | entry | 307.5 | 98.0 | vendor:react-dom | Boot |
| 5 | `Consumi (src/i18n/consumptionCopy.ts)` | dynamic | 306.3 | 89.3 | ENERGY | consumi, energy-wizard, energy-settings |
| 6 | `CartesianChart (node_modules/recharts/es6/state/selectors/axisSelectors.js…)` | shared | 274.5 | 86.2 | vendor:recharts | consumi, settings, energy-wizard, … |
| 7 | `CSS · index.html` | css | 415.3 | 56.7 | CSS | Boot |
| 8 | `ContextSidebar (src/components/settings/CameraControls.tsx)` | dynamic | 225.7 | 56.0 | SETTINGS | context-sidebar, members-map |
| 9 | `virtual:domus-i18n/fr` | dynamic | 207.3 | 50.5 | I18N | Boot |
| 10 | `virtual:domus-i18n/it` | dynamic | 197.1 | 48.8 | I18N | locale-it |
| 11 | `virtual:domus-i18n/en` | dynamic | 186.1 | 45.4 | I18N | locale-en |
| 12 | `src/pages/AppGallery.jsx` | dynamic | 178.0 | 44.5 | CORE | appgallery |
| 13 | `src/pages/RoomsDashboard.tsx` | dynamic | 161.7 | 43.2 | CORE | rooms |
| 14 | `SettingsDashboard (src/pages/SettingsDashboard.tsx)` | dynamic | 164.3 | 41.8 | SETTINGS | settings |
| 15 | `src/components/dashboard/RightSidebarManager.tsx` | dynamic | 152.1 | 33.2 | HOME | right-sidebar |
| 16 | `use-text-value (node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs)` | shared | 86.1 | 31.2 | vendor:@headlessui/react | Home |
| 17 | `EnergyTariffFields (src/pages/consumi/energy/EnergyGuidedDevice.tsx)` | shared | 63.8 | 19.8 | ENERGY | energy-wizard, energy-settings |
| 18 | `CSS · Home (src/components/dashboard/MainBoard.tsx)` | css | 121.1 | 18.4 | CSS | Home |
| 19 | `oauthState (src/hooks/useHaPanelBridgeConnection.ts)` | shared | 57.3 | 17.4 | CORE | Home |
| 20 | `src/pages/consumi/energy/EnergySetupWizard.tsx` | dynamic | 45.3 | 14.7 | ENERGY | energy-wizard |

## Fuori dalle superfici

#### Baseline (171,1 KB in 15 file)

| File (sorgente) | Raw KB | Gzip KB | Owner | Quando si carica |
|---|---:|---:|---|---|
| `src/components/settings/DevicePowerSettings.tsx` | 32.8 | 10.9 | POWER | su richiesta da SettingsDashboard (src/pages/SettingsDashboard.tsx) |
| `src/components/settings/SettingsHouseAccessSection.tsx` | 26.1 | 7.4 | SETTINGS | su richiesta da src/components/settings/SettingsManagementPanel.tsx |
| `src/components/people/PersonRecipientPicker.tsx` | 20.7 | 6.8 | CORE | su richiesta da SettingsDashboard (src/pages/SettingsDashboard.tsx) |
| `src/components/settings/profileDevices/PersonalDevicesView.tsx` | 18.5 | 5.3 | SETTINGS | su richiesta da ModernProfilePage (src/components/settings/ModernProfilePage.tsx) |
| `src/components/onboarding/OnboardingOrganizer.tsx` | 14.9 | 4.5 | CORE | su richiesta da src/components/onboarding/OnboardingExperience.tsx |
| `src/components/settings/SettingsDataBackupSection.tsx` | 12.2 | 3.4 | SETTINGS | su richiesta da src/components/settings/SettingsManagementPanel.tsx |
| `src/components/settings/KioskSettings.tsx` | 11.1 | 4.1 | KIOSK | su richiesta da SettingsDashboard (src/pages/SettingsDashboard.tsx) |
| `src/components/settings/ScreensaverSettings.tsx` | 8.5 | 3.3 | SCREENSAVER | su richiesta da SettingsDashboard (src/pages/SettingsDashboard.tsx) |
| `src/components/settings/SettingsHomeAssistantSection.tsx` | 6.4 | 2.1 | SETTINGS | su richiesta da src/components/settings/SettingsManagementPanel.tsx |
| `src/components/settings/DevicePreferencesSettings.tsx` | 4.6 | 1.5 | SETTINGS | su richiesta da SettingsDashboard (src/pages/SettingsDashboard.tsx), SettingsDashboard (src/pages/SettingsDashboard.tsx) |
| `src/components/screensaver/ScreensaverDisplay.tsx` | 4.3 | 1.8 | SCREENSAVER | su richiesta da Home (src/components/dashboard/MainBoard.tsx) |
| `src/components/kiosk/KioskRuntime.tsx` | 3.8 | 1.7 | KIOSK | su richiesta da Home (src/components/dashboard/MainBoard.tsx) |
| `src/components/onboarding/StarterLayoutChoiceModal.tsx` | 3.8 | 1.5 | CORE | su richiesta da Home (src/components/dashboard/MainBoard.tsx) |
| `kioskLaunch (src/components/kiosk/kioskDisplay.ts)` | 1.9 | 0.8 | KIOSK | con src/components/kiosk/KioskRuntime.tsx, src/components/settings/KioskSettings.tsx |
| `src/components/dashboard/DashboardRecoveryModal.tsx` | 1.6 | 0.8 | HOME | su richiesta da Home (src/components/dashboard/MainBoard.tsx) |

Non erano "nuovi chunk lazy" in generale: 65,0 KB erano le tre funzioni di
Questo dispositivo senza superficie (Alimentazione 32,8; Screensaver 8,5 +
4,3; Kiosk 11,1 + 3,8 + 1,9), il resto sezioni profonde preesistenti delle
Impostazioni e del Profilo (67,8), il selettore di destinatari (20,7) e
l'organizzatore dell'onboarding con le sue modali (20,3).

#### Finale (109,8 KB in 10 file)

| File (sorgente) | Raw KB | Gzip KB | Quando si carica |
| --- | ---: | ---: | --- |
| `SettingsHouseAccessSection.tsx` | 26,1 | 7,4 | da Gestione impostazioni |
| `PersonRecipientPicker.tsx` | 20,7 | 6,8 | da Impostazioni (Raccolta rifiuti) |
| `profileDevices/PersonalDevicesView.tsx` | 18,5 | 5,3 | da Profilo › I miei dispositivi |
| `OnboardingOrganizer.tsx` | 14,9 | 4,5 | dall'onboarding |
| `SettingsDataBackupSection.tsx` | 12,2 | 3,4 | da Gestione impostazioni |
| `SettingsHomeAssistantSection.tsx` | 6,4 | 2,1 | da Gestione impostazioni |
| `DevicePreferencesSettings.tsx` | 4,6 | 1,5 | da Impostazioni › Aspetto, Lingua |
| `StarterLayoutChoiceModal.tsx` | 3,8 | 1,5 | da Home (scelta layout iniziale) |
| `DashboardRecoveryModal.tsx` | 1,6 | 0,8 | da Home (ripristino) |
| `SettingsMiniSparkline.tsx` | 1,1 | 0,6 | da Impostazioni › Sistema (andamento CPU) |

Restano sezioni piccole e realmente secondarie; nessuna funzione intera.

## Le funzioni di Questo dispositivo

| Funzione | Nella Home (sempre) | Su richiesta | Superficie (+Impostazioni) raw / gzip |
| --- | --- | --- | --- |
| **Alimentazione** | niente | pagina con client e testi 32,8 KB + selettore entità condiviso 45,3 KB | 78,2 / 25,6 |
| **Screensaver** | conto alla rovescia, preferenze, anteprima | pagina 8,5 KB, overlay + grafica 6,9 KB | 15,6 / 6,2 |
| **Kiosk** | gate, preferenze, sessione | pagina 11,1 KB, pannello 3,8 KB, schermo intero e Wake Lock 1,9 KB | 17,4 / 7,1 |

- **Alimentazione** è backend: nel frontend globale non c'è nulla. La pagina
  carica anche `GlassCombobox` con il virtualizzatore delle liste
  (`@tanstack/virtual-core`), condiviso con App Gallery e la sidebar destra
  ma non con le Impostazioni: è il suo costo reale, ora visibile.
- **Screensaver**: dopo PERF.1 nella Home resta solo ciò che deve sempre
  girare (idle controller, preferenze, anteprima: ~6 KB renderizzati); la
  superficie del risveglio (primo tocco trattenuto, `inert`, focus) e la
  grafica sono un chunk unico caricato in anticipo appena lo screensaver è
  attivo.
- **Kiosk**: il gate + runtime lazy di DVC.4 funziona nel grafo: con Kiosk
  spento il pannello non si carica (chunk `KioskRuntime` raggiunto solo
  dinamicamente); in Home restano gate, preferenze e sessione (~5,6 KB
  renderizzati).

## Risultati dell'audit

- **Duplicazioni**: nessun modulo in più chunk; React, le librerie UI e le
  icone sono presenti una volta.
- **Import eager**:
  - `haLive.ts` intero nel Boot, perché `setupJourney` e `dashboardRuntime` ne
    usavano solo `loadHaLiveConfig` e `HASS_TOKENS_KEY`: Rollup mette il modulo
    nel chunk d'ingresso con tutto ciò che usano anche i chunk lazy.
    **Corretto** (ottimizzazione 1).
  - `recharts` (287 KB) nelle Impostazioni per una sola sparkline della CPU
    nella pagina Sistema. **Corretto** (ottimizzazione 3).
  - `onboardingTranslations.ts` (34 KB) e i componenti dell'onboarding nel
    Boot, perché `ExperienceGate` importa `useDeviceAppearance` da
    `OnboardingGlass.tsx`. Correzione provata (Boot −39,8 / −11,6 KB) e
    **ritirata**: i byte passano all'onboarding, che supera il suo limite
    (134 su 120 KB). Richiede una decisione sul budget (vedi PERF.2).
    **Ripreso in PERF.2** con una variante conforme (Boot −27,5 / −7,8 KB):
    [Onboarding fuori dal Boot](performance-onboarding-boot.md).
- **Barrel**: nessun `index.ts`/`index.tsx` nel sorgente.
- **Icone**: solo import nominativi da `lucide-react`; nessun namespace import
  o set intero.
- **Registri**: `settingsScopes.ts` e `applicationRoutes.ts` contengono solo
  metadati (un test lo verifica per il primo); nessuna pagina importata.
- **Import dinamici**: nessun avviso di Vite "importato sia staticamente sia
  dinamicamente"; ogni `import()` crea davvero un chunk.
- **CSS**: 4 regole globali per l'anello d'uscita del Kiosk (~0,4 KB); il
  resto delle funzioni usa classi Tailwind, generate nel CSS globale come
  tutto il progetto. Nessuna regola inutilizzata trovata.
- **MainBoard**: aggiunte recenti leggere (gate Kiosk, runtime Screensaver,
  elenco pagine iniziali). Il chunk Home pesa 1.040 KB, dominato da
  MainBoard (427 KB renderizzati), GridCanvas, StackGrid e motion-dom: non
  toccati (Grid Engine).
- **Chunk piccoli**: 34 file sotto 2 KB, quasi tutti combinazioni di icone
  condivise. Costo in richieste più che in byte; nessun `manualChunks`
  (vedi `vite.config.ts`: un chunk di card separato creò in passato un ciclo
  e rompeva la Home di produzione).
- **i18n**: le chiavi globali di Questo dispositivo pesano ~1,5 KB per
  catalogo; le uniche spostabili (`kiosk.exit.*`, `screensaver.label`,
  `screensaver.wakeHint`, usate ora solo da chunk lazy) valgono ~0,5 KB sul
  Boot: lasciate dove sono (micro-ottimizzazione).
- **Robustezza**: `ScreensaverDisplay` e `KioskRuntime` erano lazy dentro un
  `Suspense` senza error boundary: un chunk non caricato avrebbe raggiunto il
  boundary radice e fatto cadere l'app. Corretto (ottimizzazione 4).

## Ottimizzazioni applicate

| # | Cosa | Prima → dopo (raw / gzip KB) | Delta |
| --- | --- | --- | --- |
| 1 | Connessione salvata di HA in `haLiveConfig.ts` (riesportata da `haLive`) | Boot 930,1 / 205,3 → 915,5 / 200,6 | **−14,6 / −4,7** |
| 2 | Superficie dello Screensaver (risveglio + grafica) in un chunk lazy, precaricato quando è attivo | Home 2.267,5 / 586,7 → 2.264,8 / 585,7 | **−2,7 / −1,0** |
| 3 | Sparkline CPU di Sistema in un componente lazy | Impostazioni 494,1 / 150,9 → 206,4 / 60,0 | **−287,7 / −90,9** |
| 4 | Error boundary silenzioso sui lazy di runtime (Screensaver, Kiosk, sparkline) | robustezza | un chunk che non si carica non fa più cadere l'app |

Effetto collaterale dell'1: **Onboarding 93,1 / 28,8 → 107,6 / 33,4** (WARN,
sotto il limite di 120 / 38). Il primo avvio a freddo resta uguale
(1.023,2 → 1.023,1 KB): i byte servono solo all'onboarding e ora pesano lì.

## Riclassificazione (accounting)

Tre superfici nuove, con budget (+20% warning, +35% limite, come le altre
funzioni su richiesta), misurate come costo aggiunto alle Impostazioni:
`device-power`, `screensaver`, `kiosk`. È il modello previsto dal config
("un warning chiede di dare una superficie propria a una funzione che
cresce"): poche superfici, una per funzione, non una per file.

- Fuori dalle superfici **171,1 → 109,8 KB**:
  - **−65,0 KB riclassificati** (le tre funzioni, ora con budget);
  - **+2,6 KB** portati dall'ottimizzazione 2 (overlay, poi riassorbito dalla
    superficie Screensaver) e **+1,1 KB** dall'ottimizzazione 3 (sparkline);
  - **nessuna riduzione reale** di byte in questa voce: le riduzioni vere
    sono sui percorsi Boot, Home e Impostazioni.
- Totale **6.017,5 / 1.624,0 → 6.017,5 / 1.624,3 KB**: invariato (+0,3 KB
  gzip per un chunk in più). Le superfici nuove non tolgono byte al Totale.

## Finale

| Superficie | Baseline | Finale | Delta |
| --- | --- | --- | --- |
| Boot | 930,1 / 205,3 | 915,5 / 200,6 | −14,6 / −4,7 |
| Home | 2.267,5 / 586,7 | 2.264,6 / 585,6 | −2,9 / −1,1 |
| Impostazioni | 494,1 / 150,9 (WARN) | 206,4 / 60,0 (OK) | −287,7 / −90,9 |
| Profilo | 36,5 / 13,2 | 36,5 / 13,1 | 0 / −0,1 |
| Onboarding | 93,1 / 28,8 | 107,6 / 33,4 (WARN) | +14,5 / +4,6 |
| Consumi · Energia | 668,8 / 203,5 (FAIL) | 668,8 / 203,5 (FAIL) | 0 |
| Alimentazione · Screensaver · Kiosk | — | 78,2 / 25,6 · 15,6 / 6,2 · 17,4 / 7,1 | nuove |
| Totale | 6.017,5 / 1.624,0 | 6.017,5 / 1.624,3 | 0 / +0,3 |
| Fuori dalle superfici | 171,1 (WARN) | 109,8 (OK) | −61,3 (riclassificazione) |
| Sito | 1.290,5 / 357,9 | 1.290,5 / 357,9 | 0 |

Chunk finali: 92 JS (41 dinamici, uno in più per la sparkline) + 4 CSS. Due
build pulite consecutive danno report e chunk map identici, hash a parte.

## Debiti rimasti

- **Consumi · Energia (FAIL, preesistente)**: 668,8 KB, di cui `recharts`
  ~320 KB (chunk `CartesianChart` 274,5 + `BarChart` 45,9), il codice Energy
  306,3 e `tailwind-merge` 26,3. Non toccato (mini-app autonoma).
  **Risolto in PERF.E1** (281,3 / 86,7 KB): Recharts entra solo con i
  dettagli Acqua e Gas ([Bundle di Consumi · Energia](performance-energy-bundle.md)).
- **Totale al 98,4% gzip**: dominato da MapLibre (1,07 MB, solo mappa
  membri), Home (1,04 MB), recharts, i tre cataloghi (~590 KB).
- **Onboarding nel Boot** (34 KB di testi più i componenti): vedi PERF.2.
- **Sito oltre budget (preesistente)**: demo e catalogo; non condivide il
  codice toccato qui. **Risolto in PERF.S1** (1.083,4 / 307,4 KB): il sito non
  pubblica più il catalogo francese ([budget del sito](performance-site-budget.md)).

## Proposte per PERF.2 (non applicate)

1. **Testi dell'onboarding fuori dal Boot**: un modulo `deviceAppearance` per
   `ExperienceGate` toglie 39,8 / 11,6 KB dall'avvio di ogni utente. Serve
   ribilanciare il budget dell'onboarding (oggi calibrato con quei testi nel
   Boot): decisione esplicita, perché è un cambio di soglia.
2. **Energy**: caricare i grafici dopo il primo disegno della pagina, o una
   libreria più leggera per i grafici semplici; da progettare dentro la
   mini-app.
3. **Catalogo i18n**: valutare il caricamento per sezione delle chiavi delle
   pagine lazy (oggi ~200 KB per lingua all'avvio).
