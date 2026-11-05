# Inventario dei componenti di DomusUI

Stato al 4 novembre 2026, branch `feat/fondamenta-condivise`, creato da `main` (711d1ad, lo stesso commit di `feat/pannelli-comuni`). I conteggi vengono da ricerche nel codice e sono indicativi: contano i file che importano il componente, test esclusi.

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

Per ogni doppione, in quale prompt verrà unificato. "Da assegnare" vuol dire che i prompt 2, 3 e 4 non toccano quel punto: resterà doppione finché non si decide.

| Funzione | Versione condivisa | Scritte a mano altrove | Dove si unifica |
|---|---|---|---|
| Barra orizzontale | `GlassSlider` | `LevelBar` e `BrightnessBar` (`.dv-slider`, h 46/40) | **Prompt 1**, identiche al pixel |
| | | `.dv-hslider` (h 28) in `DevicePanel`, `ClimatePanel`, `LightPanel`; input propri in `CameraPanel` | Prompt 2 |
| | | Input proprio in `MediaCard` | Prompt 2 (fase media: la card perde la barra del volume) |
| | | `CardValueSlider`, `MicroSlider` | Prompt 3 (micro widget) |
| Slider verticale | `GlassVerticalSlider` | `.dv-vslider` riscritto 4 volte: `LightPanel`, `DevicePanel` (`VerticalSlider`, più la tapparella), `ClimatePanel` | Prompt 2 |
| Interruttore | `GlassSwitch` | `.dv-size-switch` in `DeviceCard`. Stessa misura, stile diverso | Da assegnare (card) |
| Segmentato | `GlassSegmented` | `role="radiogroup"` a mano in `ClimatePanel`, `MediaPlayer` | Prompt 2 |
| | | `ClimateCard`, `AlarmCard` | Da assegnare (card) |
| | | `SectionPage`, `RoomManageSheets`, `MediaSheets`, `EnergyModuleEditor`, `SetupHomeSteps` | Da assegnare (pagine) |
| Pillole | `GlassChips` | `.dv-option` (h 40, 5 file) | Prompt 2 |
| | | `.dv-pill` (h 36, 8 file), `rooms-pill` in Stanze | Da assegnare (card e Stanze) |
| − e + | `GlassStepper` | `.dv-step` e `dv-pn-steps` nei pannelli | Prompt 2 |
| | | `MicroStep` | Prompt 3 |
| | | `.dv-step` e `.dv-size-round` nelle card; irrigazione | Da assegnare |
| Riga con interruttore | `GlassToggleRow` | `dv-card flex items-center gap-3` in `DevicePanel` e `ClimatePanel` | Prompt 2 |
| | | Righe proprie nelle impostazioni | Da assegnare |
| Scorciatoia e bottone rotondo | `GlassShortcut`, `GlassButton` | `PanelShortcut`, `.dv-round` | Prompt 2 |
| | | `.dv-size-round`, `.dv-icon-button` nelle card | Da assegnare |
| Pallini colore | `GlassSwatches` | `SwatchRow` nel pannello luce | Prompt 2 |
| | | `SwatchRow` nella card estesa | Da assegnare (card) |
| Tessere | `GlassTiles` | `.dv-climate-mode` nel pannello clima | Prompt 2 |
| | | `.dv-pn-mode` in `AlarmPanel` | Dopo la sicurezza: l'allarme è fuori dal prompt 2 |
| Conferma | `GlassConfirm` | `ProtectedOffDialog`, presa protetta | Prompt 2 |
| | | `AlarmCard`, `AlarmPanel` | Dopo la sicurezza |
| | | `SetupMosaic`, `SettingsRoomsManager`, `EnergyPlantSettings`, … | Da assegnare |
| Pannello intero | `panels/shell/` | `panels/PanelShell.tsx` e `PanelHeader` di oggi | Prompt 2: il vecchio si cancella |
| | | `settings/*Controls.tsx` (13 file, circa 7.200 righe) | Tolti col prompt 2. Quando la Home non legge un'entità mostra `settings/UnavailablePanel.tsx` |

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

**Decisione:** valgono le misure della nota. Sono nei token, ma si applicano solo ai componenti nuovi o spostati in questo passo: nulla cambia aspetto per l'utente prima del prompt 2.

## 4. Le primitive della Fase 2

Come erano prima del prompt 1. Lo stato finale è al punto 8.

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

## 5. Decisioni prese

1. **Nomi.** Si creano `GlassSegmented` e `GlassSwitch`. `GlassSegmentSelect` e `GlassToggle` restano come alias fino al prompt 2.
2. **`PanelShell`.** Quello nuovo sta in `panels/shell/` e non è collegato a nulla. Il vecchio si cancella nel prompt 2.
3. **Maniglia del disco colore.** Resta bianca, come dice la nota e come nell'app.
4. **Doppioni.** In questo passo si spostano solo quelli identici al pixel, `LevelBar` e `BrightnessBar`. Gli altri seguono la tabella del punto 2.
5. **Riferimenti.** `docs/design/` è in Git su questo branch.

## 6. Correzioni al prompt, accettate

- **Forma del pannello.** La decide la prop `surface` (`sheet`, `column`, `dialog`). La larghezza decide solo se una o due colonne.
- **Misure.** Intestazione e fila ferme, protagonista che prende lo spazio e versione grande che lo riempie si controllano con Playwright: `tests/panel-navigation.spec.cjs`. In Vitest resta il resto.
- **Lint.** `npm run lint` coincide con `npm run check` (`tsc --noEmit`). Per ora non si aggiunge un linter.

**Da chiarire nel prompt 2.** La Fase 1 del prompt 2 chiede il disco colore con "bordo netto, maniglia piena del colore, nome del colore sotto". La nota, il punto 3 qui sopra e l'app dicono maniglia bianca e bordo sfumato. Prima del prompt 2 va corretto il testo, o va presa un'altra decisione.

## 7. Da sapere per il prompt 2: il peso

Le fondamenta non pesano finché nessuno le usa, ma nel prompt 2 i pannelli le caricheranno. Oggi il margine è poco:

| Gruppo | Oggi | Limite |
|---|---|---|
| Stanze · pannelli | 45,0 KB compressi | 46 |
| Stanze | 320,4 KB | 330 |
| JS più grande della Home | 1.092,7 KB | 1.100 |

**Decisione:** i limiti non si alzano. Nel prompt 2 si toglie il codice vecchio mentre si aggiunge il nuovo.

## 8. Stato dopo il prompt 1

**Token:** `src/theme/glassTokens.css`, caricato una volta sola da `main.tsx`. I valori che richiamano i token dell'app sono dichiarati di nuovo su ogni tema, perché una variabile CSS che ne richiama un'altra viene calcolata dove è dichiarata. Per lo stesso motivo la tinta del pannello è scritta in `panelShell.css`, dove arriva il colore del dispositivo.

**Primitive in `src/components/ui/`**

| Primitiva | Com'è andata |
|---|---|
| `GlassSegmented`, `GlassSwitch` | Spostate dai vecchi file. `GlassSegmentSelect` e `GlassToggle` sono alias |
| `GlassSlider` | Nuova variante `bar`; le varianti di oggi sono intatte |
| `GlassButton` | Nuove varianti `filled`, `soft`, `destructive`, `text`; nuove misure `lg`, `icon-40/48/56` |
| `GlassColorPicker` | Aggiunti `pending` ed `error`; maniglia bianca |
| `GlassChips`, `GlassVerticalSlider`, `GlassStepper`, `GlassToggleRow`, `GlassShortcut`, `GlassConfirm`, `GlassColorTemperature`, `GlassSwatches`, `GlassTiles` | Nuove |

**Scheletro in `src/components/devices/panels/shell/` (versione del prompt 2b):** `PanelShell`, `PanelHeader` su una riga con l'azione a sinistra, `PanelHero` con la pillola di ritorno, `PanelNavBar` con `usePanelNav`, `PanelPage`, `PanelGroups` con la riga Altro, `PanelStates`. Posto, aspetto e ordine dei controlli stanno in `PANEL_CONTROLS` e si leggono solo da `arrangeControls` (`panels/registry.ts`). `PanelControlZone` e `PanelFooter` non esistono più. Non è collegato a nulla. Portale, fuoco e trascinamento del foglio restano a chi lo apre (oggi `PanelSheet`): `PanelShell` ne riceve la maniglia.

**Doppioni eliminati:** `LevelBar` e `BrightnessBar` ora stanno su `GlassSlider`, e `BrightnessBar` usa `LevelBar`. Gli altri restano come dal punto 2.

**Pagina di prova:** `/dev/componenti`, solo in sviluppo, fuori dai pacchetti di produzione.

**Misure controllate con Playwright:** `tests/panel-shell-measures.spec.cjs`.

**Peso dopo il prompt 1**

| Gruppo | Oggi | Limite |
|---|---|---|
| Onboarding | 119,9 KB | 120 |
| Stanze · pannelli | 45,2 KB compressi | 46 |
| Stanze | 320,1 KB | 330 |
| JS più grande della Home | 1.094,9 KB | 1.100 |

Il gruppo Onboarding è il più stretto: carica `GlassButton`, quindi quel file e `glassControl.ts` devono restare piccoli.

**Non fatto in questo passo**
- Nella galleria `GlassSlider` ha anche i puntini dei passi (NUM-03), `GlassColorPicker` il nome del colore (ADV-01) e `GlassSwatches` il salvataggio dei colori: il "+" c'è, ma salvare tocca a chi lo usa.
- La fila ha al massimo 8 scorciatoie, oppure 7 e Altro. Altro con un controllo solo non esiste: quel controllo sale nella fila.

**Versioni grandi (prompt 2b).** Ogni aspetto che può stare al centro riempie lo spazio del protagonista:

| Aspetto | Versione grande | Componente |
|---|---|---|
| Tessere | Tessere alte che si dividono l'altezza, con spiegazione e spunta | `GlassTiles size="hero"` |
| Elenco | Righe alte 72 che scorrono da sole; anche a scelta multipla, con un pulsante sotto | `GlassChoiceRows size="hero"` |
| Righe | Righe da leggere, con sezioni, che scorrono da sole | `GlassValueRows size="hero"` |
| Livelli | Slider verticale a scatti, con Automatica sotto | `GlassVerticalSlider ticks` |
| Slider | Slider verticale 148 x 300 con la linea "ora" | `GlassVerticalSlider current` |
| Bianchi | Slider verticale sfumato, con Calda, Neutra, Fredda | `GlassVerticalSlider gradient` |
| Colore | Disco grande e 6 colori rapidi | `GlassColorPicker size="hero"` |
| Timer | Anello grande e 5 pillole | `GlassRing` |
| Grafico | Il grafico prende tutto, con il periodo sopra | scheda del sensore |
| Immagine | La mappa riempie il protagonista senza deformarsi | `.panel-vacuum-map` |
| Comando direzionale | Croce grande, con Casa al centro se l'entità la espone | `CameraPtzJoystick size="hero"` |

## 9. Prompt 3, Fase 0: micro widget e pezzi a parte

Stato al 5 novembre 2026, branch `feat/controlli-collegati`, creato da `feat/pannelli-navigazione` (767b044). I pesi dei pezzi nuovi sono stime, calcolate su componenti simili già esistenti (`GlassTiles` 4,6 KB e 1,6 gzip, `GlassStepper` 4,4 e 1,5, `GlassRing` 1,5 e 0,7).

### Dove sono disegnati oggi

I micro widget non stanno sulle card. Si disegnano in due posti:

- il blocco sotto il pannello della Home, in `src/components/settings/ContextSidebar.tsx:484`, per qualsiasi tipo di dispositivo;
- l'anteprima dell'editor, in `src/components/dashboard/RightSidebarManager.tsx:1085`.

Nelle Stanze non compaiono. I componenti sono in `src/components/widgets/micro/`.

### Micro widget e aspetti della galleria

| Micro widget | File | Aspetto della galleria | Azione o versione grande |
|---|---|---|---|
| `value_pill` | `ValuePill.tsx` | IND-02 Value Pill | Grande: IND-01 Value Display |
| `status_glow` | `StatusGlow.tsx` | IND-05 Status Glow | Grande: lo stesso a tutto spazio |
| `micro_toggle` | `MicroToggle.tsx` | BOO-01 Standard Toggle | Azione |
| `mini_ring` | `MiniRing.tsx` | IND-08 Mini Ring | Grande: IND-06 Circular Gauge |
| `micro_button` con `switch` (predefinito) | `MicroButton.tsx` | BOO-03 Icon Toggle | Azione |
| `micro_button` con `push` | `MicroButton.tsx` | ACT-01 Push Button | Azione |
| `micro_button` con `push` e pressione mantenuta | `MicroButton.tsx` | Nessuno | Azione, da aggiungere |
| `micro_button` con `page` | `MicroButton.tsx` | Nessuno (il più vicino è ACT-03 Text Button) | Azione, da aggiungere |
| `micro_slider` | `MicroSlider.tsx` | NUM-01 Horizontal Slider | Grande: NUM-02 Vertical Slider |
| `micro_step` | `MicroStep.tsx` | NUM-04 Numeric Stepper | Grande: valore grande con − e + |
| `micro_superchart` | `MicroSuperChart.tsx` (recharts) | CH-02, CH-03 o CH-04, secondo il tipo | Grande: il grafico a tutto spazio |

### Opzioni di oggi

| Opzione | Valori | Corrisponde a |
|---|---|---|
| `label` | testo | `name` |
| `buttonMode` | `switch` (predefinito), `push`, `page` | L'aspetto: BOO-03, ACT-01, pulsante pagina |
| `buttonHoldWhilePressed` | sì o no, solo con `push` | Nessun aspetto: accende alla pressione e spegne al rilascio. ACT-05 è un'altra cosa: conferma dopo 1,2 s |
| `buttonPagePath` | percorso, predefinito `/home`, solo con `page` | Una prop nuova: il `RelatedControl` non ha un campo per le opzioni |
| `sliderSendOnRelease` | predefinito sì | `commit="release"`; con no `commit="live"` e l'attesa di 2,2 s di oggi |
| `superChartType` | `line` (predefinito), `area`, `bar` | L'aspetto: CH-02, CH-03, CH-04 |

### Galleria e libreria

| Famiglia | Schede | Esistono già | Da fare |
|---|---|---|---|
| A · Selezione | 7 | SEL-01 `GlassDropdown`, SEL-02 e 03 `GlassSegmented`, SEL-04, 05 e 06 `GlassChoiceRows` | SEL-07 Frecce |
| B · Numeri | 10 | NUM-01, 03, 06 `GlassSlider`, NUM-02 e 08 `GlassVerticalSlider`, NUM-04 `GlassStepper` | NUM-05 Campo, NUM-07 Livelli, NUM-09 Intervallo, NUM-10 Anello |
| C · Interruttori | 7 | BOO-01 `GlassToggleRow`, BOO-02 `GlassSwitch`, BOO-03 `GlassShortcut`, BOO-05 `GlassSegmented` | BOO-04 Casella, BOO-06 Riquadro, BOO-07 Riga con spia |
| D · Azioni | 9 | ACT-01, 02, 03 `GlassButton`, ACT-06 `GlassConfirm` | ACT-04 Gruppo, ACT-05 Tieni premuto, ACT-07 Avanzamento, ACT-08 Esito, ACT-09 Pillola |
| E · Testo e date | 8 | Nessuna | Tutte |
| F · Indicatori | 17 | IND-06 su `GlassRing` | Le altre 16 |
| G · Grafici | 8 | Nessuna come componente | Tutti, in SVG |
| H · Avanzati | 11 | ADV-01 `GlassColorPicker`, ADV-02 `GlassColorTemperature`, ADV-03 `GlassSwatches`, ADV-05 `CameraPtzJoystick`, ADV-07 timer dei pannelli, ADV-09 e 11 `GlassTiles` | ADV-04 Joystick, ADV-06 Curva, ADV-08 Conto alla rovescia, ADV-10 Velocità ventola |

### Piano dei pezzi a parte

| Pezzo | Cosa contiene | Stima | Quando si scarica |
|---|---|---|---|
| Pacchetto principale | I segnaposto dei collegati, letti dalla configurazione | +0,5 KB, +0,2 gzip | Sempre |
| `controlli-collegati` | Registro, `RelatedControlView`, conversione dei micro widget, elenco dei caricatori | 6 KB, 2 gzip | Card con collegati o micro widget |
| `controlli-valori` | A, B e C nuovi: 8 componenti | 20 KB, 7 gzip | Un collegato usa uno di questi aspetti |
| `controlli-azioni` | D nuovi: 5 componenti | 12 KB, 4 gzip | Idem |
| `controlli-indicatori` | F: 16 componenti | 25 KB, 7 gzip | Idem |
| `controlli-grafici` | G: 8 grafici SVG, senza recharts | 15 KB, 5 gzip | Idem |
| `controlli-testo` | E: 8 componenti | 20 KB, 6 gzip | Idem |
| `controlli-avanzati` | H nuovi: 4 componenti | 12 KB, 4 gzip | Idem |
