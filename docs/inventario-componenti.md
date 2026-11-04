# Inventario dei componenti di DomusUI

Stato al 4 novembre 2026, branch `feat/fondamenta-condivise`, creato da `feat/pannelli-comuni` (711d1ad). I conteggi vengono da ricerche nel codice e sono indicativi: contano i file che importano il componente, test esclusi.

Punto di partenza: `npm run check` verde, `vitest run` con **3104 test passati su 371 file**.

## 1. Componenti che esistono già

### In `src/components/ui/`

| Componente | Cosa fa | File che lo usano | Props principali |
|---|---|---|---|
| `GlassSegmentSelect` | Segmentato con tastiera; solo variante neutra | 33 (`settings/*Controls`, pannelli, irrigazione, `RightSidebarManager`) | `options`, `value`, `onChange`, `ariaLabel`, `scrollable`, `disabled`, `renderOption`, `minOptionWidth` |
| `GlassToggle` | Interruttore 51 × 31 (compatto 48 × 28), toni verde, blu, accento | 26 | `checked`, `onChange`, `label`, `disabled`, `busy`, `size`, `tone` |
| `GlassModal` | Dialogo con portale e fuoco | 27 | `isOpen`, `onClose`, `title`, `size`, `variant`, `footer`, … |
| `GlassDropdown` | Menu a discesa | 14 | `options`, `selected`, `onChange`, `size`, `disabled` |
| `GlassSlider` | Barra orizzontale con pallino, h 40 o 28; `overlay` è solo l'input | 13 (5 con `overlay`) | `variant`, `tone`, `fillStyle`, attributi di `<input>` |
| `GlassBottomSheet` | Foglio dal basso generico | 12 | `isOpen`, `onClose`, `title`, `position`, `footer` |
| `GlassButton` | Bottone sopra la classe `glass-button` | 6 | `variant` (default, primary, danger, ghost), `size` (sm, md, icon) |
| `DeferredGlassLoader` / `GlassLoader` | Caricamento | 6 / 5 | `label`, `delayMs`, `size` |
| `GlassSearchFilterBar` | Ricerca e filtri | 5 | `query`, `filters`, `onReset` |
| `NestedPageHeader` | Intestazione di pagina annidata | 5 | `title`, `onBack`, `trailing` |
| `GlassCombobox` | Scelta con ricerca | 4 | `value`, `options`, `onChange` |
| `GlassConfirmDialog` | Conferma **in un dialogo** | 2 (`ProtectedOffDialog`, `RoomsPage`) | `isOpen`, `onConfirm`, `title`, `confirmTone`, `busy` |
| `DashboardSidePanel`, `IconBadge`, `WeekDayStrip` | Pannello laterale, icona, giorni | 2 ciascuno | |
| `FeatureAvailabilityPage` | Pagina "non disponibile" | 1 | |
| `GlassColorPicker` | Disco colore (ADV-01) | 1 (`LightPanel`) | `value`, `onChange`, `label`, `valueText`, `disabled`, `className` |

### Fuori da `ui/`

| Componente | Dove | Cosa fa |
|---|---|---|
| `ScrollingName` | `devices/cards/` | Nome su una riga che scorre se non entra. Usato solo da `LightCard` |
| `PanelShell`, `PanelHeader`, `PanelShortcut`, `PanelHero`, `usePanelSections` | `devices/panels/PanelShell.tsx` | Lo scheletro dei pannelli di oggi, usato da 12 file |
| `PanelSheet`, `PanelHost` | `devices/panels/` | Foglio da bordo a bordo; host foglio, dialogo o lato per Stanze |
| `usePanelLiveState`, `PanelLiveGate` | `devices/panels/` | I tre stati comuni: non disponibile, dati vecchi, comando in attesa |
| `CardFrame`, `CardHead`, `CardIcon`, `DeviceCardShell` | `devices/cards/` | Cornice e parti delle card |
| `LevelBar`, `BrightnessBar` | `devices/cards/` | La barra delle card (`.dv-slider`) |
| `SwatchRow`, `LightKindSegment` | `devices/cards/LightControls.tsx` | Pallini colore; segmentato Bianco e Colore |
| `MicroToggle`, `MicroSlider`, `MicroStep`, `MicroButton`, `MiniRing`, `StatusGlow`, `ValuePill`, `MicroSuperChart` | `widgets/micro/` | I micro widget, da censire nel prompt 3 |
| `CardValueSlider` | `widgets/` | Slider dei valori nelle card vecchie, sopra `GlassSlider` |

## 2. Doppioni

| Funzione | Versione condivisa | Scritte a mano altrove |
|---|---|---|
| Barra orizzontale | `GlassSlider` | `LevelBar` e `BrightnessBar` (`.dv-slider`, h 46/40); `.dv-hslider` (h 28) in `DevicePanel`, `ClimatePanel`, `LightPanel`; input propri in `MediaCard`, `CameraPanel` |
| Slider verticale | Nessuna | `.dv-vslider` riscritto 4 volte: `LightPanel`, `DevicePanel` (`VerticalSlider`, più la tapparella), `ClimatePanel` |
| Interruttore | `GlassToggle` | `.dv-size-switch` in `DeviceCard`. Stessa misura, stile diverso |
| Segmentato | `GlassSegmentSelect` | `role="radiogroup"` a mano in 11 file: `ClimateCard`, `AlarmCard`, `ClimatePanel`, `MediaPlayer`, `SectionPage`, `RoomManageSheets`, `MediaSheets`, `EnergyModuleEditor`, `SetupHomeSteps`, … |
| Pillole | Nessuna | `.dv-option` (h 40, 5 file) e `.dv-pill` (h 36, 8 file); `rooms-pill` in Stanze |
| − e + | Nessuna | `.dv-step` (46), `.dv-size-round` (40), `MicroStep`, `dv-pn-steps`, più `settings/ClimateControls`, `HumidifierControls`, irrigazione. **Nessuno ripete tenendo premuto** |
| Riga con interruttore | Nessuna | `dv-card flex items-center gap-3` ripetuta in `DevicePanel` e `ClimatePanel`; righe proprie nelle impostazioni |
| Scorciatoia e bottone rotondo | `PanelShortcut` (solo pannelli) | `.dv-round`, `.dv-size-round`, `.dv-icon-button` |
| Pallini colore | `SwatchRow` | Selezioni colore proprie in `settings/LightControls` |
| Tessere | Nessuna | `.dv-climate-mode` e `.dv-pn-mode` (h 64); griglie in `settings/LightControls`, `CoverControls`, `VacuumControls` |
| Conferma | `GlassConfirmDialog` | Stati propri in `AlarmCard`, `AlarmPanel`, `SetupMosaic`, `SettingsRoomsManager`, `EnergyPlantSettings`, … |
| Pannello intero | `PanelShell` e pannelli nuovi | `settings/*Controls.tsx` (13 file, circa 7.200 righe): vecchio contenuto, usato ancora quando la Home non trova un pannello nuovo |

## 3. Token di oggi

**Dove sono definiti**

| File | Variabili | Contenuto |
|---|---|---|
| `src/assets/index.css` | 273 | Token dell'app `--ui-*`, per tema: testi, superfici, accento, stati (`--ui-success`, `--ui-warning`, `--ui-danger`, `--ui-info`) |
| `devices/theme/tokens.css` | 78 | Token dei dispositivi `--dv-*`, per tema. Solo colori |
| `devices/theme/devices.css` | 83 | Toni per famiglia (`.dv-tone-*`, `.dv-cl-*`) |
| `pages/rooms/rooms.css` | 21 | Variabili proprie di Stanze |
| `widgets/*.css` | da 12 a 43 per file | Card vecchie: `CoverCard`, `LockCard`, `SensorCard`, `HaMediaCard`, … |
| `tailwind.config.js` | | Colori `apple.*`, ombre e font. Nessuna scala di raggi o spazi |

**Cosa manca**
- **Non esistono token di misura:** né raggi, né spaziature, né tipografia, né altezze dei controlli.
- **Colori semantici:** ci sono "a posto", "attenzione", "errore" e "informazione", non "spento". Oggi "spento" è `--dv-icon-off` e `--dv-slider-fill-off`.
- **Colore del dispositivo:** ha cinque nomi diversi, `--dv-light-rgb`, `--dv-tone` con `--dv-tone-rgb`/`-ink`/`-glow`, `--cl-solid` con `--cl-rgb`, `--dv-pn-tint`. Il prompt chiede un solo `--device-accent`.

**Valori scritti a mano** (tutto `src`, conteggio delle occorrenze)

| Cosa | Quanti |
|---|---|
| Colori esadecimali in `.tsx` e `.jsx` | 385 |
| `rounded-[…]` | 378 |
| `text-[…px]` | 734 |
| `border-radius` numerici nei CSS | 352 |

Non li tocco tutti: come da prompt, sostituisco solo quelli dei componenti su cui lavoro. Questa tabella resta come elenco del resto.

**Misure di oggi rispetto a quelle chieste**

| Cosa | Oggi | Prompt e nota |
|---|---|---|
| Pillole | 40 (`.dv-option`), 36 (`.dv-pill`) | 44, 38 nel dialogo |
| Barra `.dv-slider` | 46/40, raggio 16 | Uguale |
| Barra `.dv-hslider` nei pannelli | 28, raggio 14 | 46, raggio 16 |
| Barra `GlassSlider` | 40, tonda, con pallino | 46, raggio 16, senza pallino |
| Interruttore compatto | 48 × 28 | 42 × 26 (BOO-02) |
| Tessere | 64 (56 nei fogli) | 60 (ADV-11) |
| Foglio, zone, zona controlli, fondo, slider protagonista | Già come da nota | Uguale |

## 4. Le primitive della Fase 2

| Primitiva | Stato | Cosa farei | Rischio per l'aspetto di oggi |
|---|---|---|---|
| `GlassSegmented` | Esiste come `GlassSegmentSelect` | Estendere: icona e testo, solo icona, colore del dispositivo, `pending`, `error` | Nullo se il default resta uguale |
| `GlassChips` | Da creare | Nuova, sostituirà `.dv-option` nel prompt 2 | Nullo |
| `GlassSlider` | Esiste, diversa | Nuova variante `bar` (46, senza pallino, passi, valore dentro, invio al rilascio). Le varianti di oggi restano | Nullo se è una variante |
| `GlassVerticalSlider` | Da creare | Unifica i 4 `.dv-vslider` nel prompt 2 | Nullo |
| `GlassStepper` | Da creare | Con ripetizione, che oggi non esiste | Nullo |
| `GlassSwitch` | Esiste come `GlassToggle` | Stesso componente con il nome nuovo, più la misura 42 × 26 | Nullo se la misura compatta di oggi resta |
| `GlassToggleRow` | Da creare | Riga da 52 con icona, titolo e spiegazione | Nullo |
| `GlassShortcut` | Esiste come `PanelShortcut` | Spostarla in `ui/`, con il colore del dispositivo | Nullo |
| `GlassButton` | Esiste | Estendere: morbida, testo, solo icona 40/48/56, altezza 48 | Nullo con varianti nuove |
| `GlassConfirm` | Da creare | In linea. `GlassConfirmDialog` resta per i casi in dialogo | Nullo |
| `GlassColorPicker` | Esiste | Aggiungere `pending` ed `error`. Vedi la decisione 3 | Nullo |
| `GlassColorTemperature` | Da creare | Oggi ci sono solo i 4 pallini dei bianchi | Nullo |
| `GlassSwatches` | Esiste come `SwatchRow` | Spostarla in `ui/` senza il modello della luce | Nullo |
| `GlassTiles` | Da creare | 4 per riga, 60 alte | Nullo |

## 5. Punti da decidere prima della Fase 1

1. **Nomi `GlassSegmented` e `GlassSwitch`.** Quelli di oggi hanno 33 e 26 file che li usano. Propongo di creare i nomi nuovi e lasciare i vecchi come alias, così non cambia nessun file che li usa. Gli alias si tolgono dopo il prompt 2.
2. **`PanelShell` nuovo accanto al vecchio.** Quello di oggi serve 12 file, e il prompt vieta di cambiare l'aspetto dei pannelli. Propongo di costruire il nuovo in `panels/shell/` senza collegarlo a nulla: il vecchio si cancella nel prompt 2. Per poco tempo ci saranno due scheletri.
3. **Maniglia del disco colore.** La nota dice bianca, la galleria (ADV-01) "piena del colore scelto". Il prompt dice che vale la nota, quindi resta **bianca**. Le misure fisse della galleria (160, 200, 248) diventano esempi, perché il componente prende la larghezza che gli si dà.
4. **Spostare i doppioni adesso o dopo.** Il prompt chiede sia di spostarli sia di non cambiare l'aspetto. Molti non possono fare entrambe le cose: passare da `.dv-hslider` a 28 alla barra da 46 cambia il pannello. Propongo di spostare ora solo ciò che resta identico al pixel (`LevelBar` e `BrightnessBar`) e il resto nel prompt 2, con l'elenco qui sopra.
5. **Riferimenti di design.** `docs/design/` esiste solo nella cartella principale, fuori da Git. Propongo di aggiungerla con un commit su questo branch, perché servirà anche ai prompt 2, 3 e 4.

## 6. Cose da correggere nel prompt

- **La forma non si può dedurre solo dalla larghezza.** Foglio e colonna sono entrambi larghi fino a 520 px. Il prompt infatti passa anche la superficie: la forma la decide la prop `surface`, e la larghezza decide solo la disposizione in una o due colonne. Il test "sceglie la forma dalla larghezza" lo adatterei così.
- **Vitest non misura le altezze.** L'ambiente di test non calcola layout né container query, quindi "la zona resta 148" e "il protagonista non cambia altezza" non si provano lì. Con Vitest controllo struttura e classi, le misure vere le controllo con Playwright, come fa già `tests/light-panel-reach.spec.cjs`.
- **`npm run lint` è uguale a `npm run check`.** Sono entrambi `tsc --noEmit`: nel progetto non c'è un vero lint.
- **Pagina di prova.** Esiste già un precedente, `/devices-lab`, solo in sviluppo: `/dev/componenti` può seguirlo e resta fuori dai pacchetti di produzione.

## 7. Da sapere per il prompt 2: il peso

Le fondamenta non pesano finché nessuno le usa, ma nel prompt 2 i pannelli le caricheranno. Oggi il margine è poco:

| Gruppo | Oggi | Limite |
|---|---|---|
| Stanze · pannelli | 45,0 KB compressi | 46 |
| Stanze | 320,4 KB | 330 |
| JS più grande della Home | 1.092,7 KB | 1.100 |

I limiti non si alzano, quindi il prompt 2 dovrà togliere il codice vecchio mentre aggiunge il nuovo, oppure caricare i pannelli solo all'apertura.
