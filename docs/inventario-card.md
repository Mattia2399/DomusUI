# Inventario delle card

## Builder

Com'è oggi la modalità modifica della Home, sul branch `feat/builder-home` partito da `f432774`. I riferimenti sono ai file e ai simboli, perché i numeri di riga cambiano.

### Come funziona la modalità modifica

**Entrare e uscire.** `MainBoard.tsx` tiene `isEditMode`. `requestToggleEditMode` apre sempre una conferma (`editConfirm`: `enter`, `exit` o `refresh`), e `confirmEditAction` la esegue. Non esiste un pulsante "Fine" diretto: l'uscita passa dalla conferma, che offre di salvare.

**Dove si disegna.**

| Parte | File |
|---|---|
| Barra di undo, redo e stato del salvataggio | `DashboardEditToolbar.tsx`, `DashboardSaveIndicator.tsx` |
| Scelta dello schermo e pulsante Catalogo | `DashboardViewportPreviewBar.tsx` (`viewportPreviewMode`) |
| Griglia | `GridCanvas.tsx` |
| Livello sopra ogni card (tocco, trascinamento, ingranaggio, ridimensionamento) | `GridEngineEditorInteractionLayer`, dentro `GridCanvas.tsx` |
| Gesti | `gridEngine2/useGridGesture.ts` |
| Foglio delle proprietà | `RightSidebarManager.tsx`: colonna a destra su desktop, foglio dal basso su telefono |
| Catalogo | `DashboardCatalogModal.tsx`, aperto da `GridCanvas.tsx` |

**I gesti su Grid Engine 2.0.** Con il mouse si trascina subito. Sul touch un tocco seleziona, una pressione di 400 ms solleva la card, e i settings si aprono solo dal pulsante sulla card selezionata (`compactEditSheet` in `MainBoard.tsx`). Le card sotto il livello sono inerti, quindi un tocco non le comanda.

**Cosa si salva.** L'istantanea `authoritativeDashboardLayout`:

| Campo | Contenuto | Vale per |
|---|---|---|
| `sections`, `widgets` | sezioni e card: dispositivo, nome, opzioni, `layout` canonico | tutti gli schermi |
| `responsiveLayouts.root[breakpoint]` | posizione e misura | quel breakpoint |
| `widgetLayoutOverrides[id][breakpoint]` | misura della singola card, per le luci anche `hOff`, `hOn`, `autoExpand` | quel breakpoint |
| `widgetTypeLayoutOverrides[kind][breakpoint]` | misura per tipo di card | quel breakpoint |
| `layoutEngine`, `gridMetricsVersion` | motore e metriche della griglia | tutti gli schermi |

**Quando e dove.** La modifica è transazionale: la bozza resta in memoria e si scrive una volta sola, con `saveDashboardLayoutNow`. Il salvataggio automatico è spento (`enabled: false`, `autoSaveEnabled: false`).

- **Demo:** `localStorage`, chiave `ha.dashboard.demo.builder.layout.v1` (`useDashboardLayoutPersistence`).
- **Home Assistant:** `frontend/set_system_data`, documento condiviso della casa con revisione, controllo dei conflitti e archivio delle revisioni (`useHaDashboardLayoutPersistence`, `haDashboardConfigurationRepository`).
- **Ricarica della pagina:** la bozza non salvata resta in `sessionStorage` (`saveDashboardEditDraft`).
- **Controlli prima di salvare:** `validateGridEngine2DashboardForSave` e `describeLegacyStackChange`, che blocca ogni modifica agli Stack sospesi.

**Per quale schermo.** Il layout è per breakpoint, non per dispositivo: `2xl` e `xl` hanno 12 colonne, `lg` 8, `md` 6, `sm` 4, `xs` 2 (`GRID_ENGINE_COLS` in `DashboardGrid.tsx`). Il breakpoint dipende dalla larghezza della griglia e non da quella della finestra.

La scelta dello schermo esiste già, con cinque modalità: `auto`, `desktop` (xl), `tablet` (md), `compact` (sm) e `mobile` (390 px). È un'anteprima a larghezza imposta: la modifica si salva sul breakpoint che quella larghezza produce. Su `xs` la barra di anteprima non si mostra.

### Come si cambia la misura

1. **Dal pannello:** `RightSidebarManager.tsx`, scheda Layout. Su v2 le opzioni Mini, Standard ed Espansa vengono da `resolveGridV2PresetFormat`, che oggi dà sempre U×2, U×4 e W×4, e `gridV2FormatSpan` le converte in colonne e righe. Il risultato va in `onUpdateWidgetLayoutOverride(id, breakpoint, override)`.
2. **Dalla griglia:** la linea curva nell'angolo avvia `onResizePointerDown`. `snapGridEngine2Resize` aggancia a una misura ammessa, e `commitGridEngine2EditorPreview` scrive il risultato sul breakpoint attivo.
3. **Per i Mini delle luci:** `createLightLayoutOverride` scrive anche `hOff`, `hOn` e `autoExpand`.

**La crescita delle luci esiste già.** Con `autoExpand` attivo, la griglia calcola l'altezza dallo stato (`gridEngineRuntimeOverrides.ts`, `GridCanvas.tsx`). Su v2 passa da 2 a 3 righe (`resolveGridLightRuntimeMetrics`: `hOff: 2`, `hOn: 3`), senza cambiare le coordinate salvate.

**Le misure vecchie.** Una card con una misura fuori dalle tre resta così nel layout salvato. Oggi `resolveGridV2BoxFormat` la disegna con la misura ammessa più vicina, e nulla la segnala all'utente.

### Come si aggiunge una card

`DashboardCatalogModal.tsx` ha le schede `cards` e `sections` e la ricerca. Le voci vengono da `WIDGET_CATALOG` e `SECTION_CATALOG` in `types/dashboardModels.ts`.

La conferma chiama `onAddWidget(kind, destination)` o `onAddSection(kind)`, cioè `addWidget` e `addSection` in `MainBoard.tsx`. Il catalogo sceglie solo il **tipo** di card: la card nasce con id `<tipo>.custom_<n>`, e il dispositivo si sceglie dopo, nel pannello. Il catalogo non riceve gli stati di Home Assistant, quindi oggi non può proporre i dispositivi.

Non esiste una funzione "Duplica". Non esistono nemmeno "Sposta su" e "Sposta giù": sul touch si sposta solo trascinando.

### Dove sono annulla, ripeti e il salvataggio

- **Annulla e ripeti:** `useDashboardEditorHistory`, usato in `MainBoard.tsx`. Lavora su un'istantanea di sezioni, card, override, layout, motore e metriche. I comandi passano come prop a `DashboardEditToolbar`.
- **Stato del salvataggio:** `dashboardLayoutSaveStatus` in `MainBoard.tsx` (per esempio `dirty` e `saving`), mostrato da `DashboardSaveIndicator`.
- **Salvataggio:** `saveDashboardLayoutNow` in `MainBoard.tsx`, avviato dall'uscita dalla modifica.
- **Conflitti:** `pendingRemoteUpdate` e `isDashboardConflictOpen` in `MainBoard.tsx`.

**Dove sono montati:** su telefono nella barra in alto, su desktop nella barra di anteprima in basso. In entrambi i casi il montaggio è in `MainBoard.tsx`.

### Cosa non esiste ancora

`resolveDeviceKind`, `isKindImplemented` e `growWhenOn` non esistono. `DeviceKind` esiste in `devices/model/device.ts`, ma comprende solo `outlet`, `switch`, `virtual`, `fan`, `cover` e `humidifier`. Esiste `resolveSensorFamily` (`devices/model/sensorFamily.ts`).

## Pannelli

Come sono oggi i pannelli di Stanze e il dettaglio che apre la Home, sul branch `feat/pannelli-comuni`. I riferimenti sono ai file e ai simboli, perché i numeri di riga cambiano.

### I pannelli di Stanze

I 10 pannelli sono fatti da 7 componenti. Sei stanno già in `src/components/devices/panels/`, accanto a `model` e `cards`. La telecamera sta in `src/components/camera/`.

| Pannello | Componente | Card che lo apre | Cosa contiene |
|---|---|---|---|
| Luce | `panels/LightPanel.tsx` | `LightCard` | cursore verticale della luminosità, Bianco/Colore, bianchi e tinte |
| Clima | `panels/ClimatePanel.tsx` | `ClimateCard` | obiettivo o intervallo con la temperatura della stanza, modalità, ventola, profilo, oscillazione |
| Interruttore e presa | `panels/DevicePanel.tsx` (`PlugBody`) | `DeviceCard` | accensione, consumi e tariffa, timer di spegnimento |
| Ventilatore | `panels/DevicePanel.tsx` (`FanBody`) | `DeviceCard` | velocità, modalità, oscillazione, direzione, timer |
| Tapparella | `panels/DevicePanel.tsx` (`CoverBody`) | `DeviceCard` | apertura, inclinazione, comandi |
| Umidificatore | `panels/DevicePanel.tsx` (`HumidifierBody`) | `DeviceCard` | obiettivo e modalità, timer |
| Serratura | `panels/SecurityPanel.tsx` | `SecurityCard` | i due anelli grandi, cosa fanno, ultimi cambiamenti |
| Sensore sì/no | `panels/SecurityPanel.tsx` | `SecurityCard` | stato e da quando, striscia del giorno, ultimi cambiamenti |
| Sensore | `panels/SensorPanel.tsx` | `SensorCard` | valore, consiglio, storico 6 ore / 24 ore / 7 giorni con la fascia ideale, minimo, massimo, media, scala, batteria |
| Media | `panels/MediaPlayer.tsx` | `MediaCard` | a tutta pagina: copertina, posizione, comandi, volume, sorgenti, gruppi, modalità audio |
| Telecamera | `camera/CameraViewer.tsx` | `SecurityCard` | visore con più telecamere; non passa da `PanelHost` |

Il prompt conta 10 pannelli con l'umidificatore insieme ai dispositivi; qui ha una riga sua perché ha un corpo suo.

Il sensore sì/no di Stanze copre solo i tipi di `securityKindOf` (contatto, movimento, vibrazione, perdita). `SensorPanel` copre solo i 6 tipi di `sensorKindOf` e il fumo. Le famiglie di `resolveSensorFamily` esistono solo nelle card della Home.

### Come Stanze apre e chiude i pannelli

- **Stato:** `RoomsPage.tsx` tiene `panel` (`{ kind, id }`), più `cameraOpenId` per la telecamera. Ogni tipo ha il suo `PanelHost`, e la scelta è scritta nel JSX della pagina: non esiste una funzione unica.
- **Apertura:** ogni card chiama `setPanel`. Il contenuto si carica su richiesta dentro `Deferred`.
- **Chiusura:** `setPanel(null)`, dal pulsante del pannello o da `onClose` del contenitore.
- **Telefono** (fino a 760 px, `usePhoneLayout`): `PanelHost` con `presentation="sheet"`, cioè `GlassBottomSheet`.
- **Desktop:** `presentation="dialog"`, cioè `GlassModal` **al centro della pagina**, con la dashboard coperta.
- **Colonna laterale:** `presentation="side"` esiste già in `PanelHost` (384 px, a destra), ma non la usa nessuno.
- **Colore:** `tintRgb` e `softTint` tingono il pannello con il colore della luce o del dispositivo.

### Cosa apre oggi la Home

Una card chiama `onWidgetClick`, cioè `handleWidgetClick` in `MainBoard.tsx`, che seleziona la card e chiama `openLiveControls`. Questa riempie `activeDevice`. `RightSidebarManager.tsx` mostra `ContextSidebar.tsx`, che sceglie il contenuto con un `if` per ogni tipo.

| Card | Contenuto aperto | Oltre ad aprire |
|---|---|---|
| Luce | voce `light` del registro | **accende o spegne la luce** (`toggleLightEntity`) |
| Clima | voce `climate` | |
| Interruttore e presa | voce `plug` | |
| Ventilatore | voce `fan` | |
| Umidificatore | voce `humidifier` | |
| Tapparella | voce `cover` | |
| Serratura | `SecurityPanel` dentro `PanelFrame` | |
| Telecamera | voce `camera` | |
| Media | `panels/MediaPlayer.tsx` | |
| Sensore | voce `sensor` | carica lo storico |
| Sensore sì/no | voce `sensor` | |
| Allarme | `AlarmPanel` dentro `PanelFrame` | |
| Robot | voce `vacuum` | |
| Calendario | voce `calendar` | |
| Membri | voce `members` | |
| Saluto con meteo, Meteo | voce `weather` (`onWeatherClick`) | |
| Scene | nessun dettaglio: la scena parte | |

**Sul telefono (`xs`).** In `GridCanvas.tsx` un tocco breve commuta luce e interruttore e, per le altre card, non chiama `onWidgetClick`. Il dettaglio si apre con la pressione lunga (`handleWidgetLongPress`), che non commuta niente.

**Dove si apre.** Sopra il breakpoint `md` (768 px) è nella colonna di destra, larga fino a 384 px (`DASHBOARD_SIDEBAR_WIDTH_CLASS`), con la dashboard visibile accanto. Sotto è un foglio dal basso (`device-context-surface`), con il suo trascinamento dentro `RightSidebarManager.tsx`.

### Differenze fra Home e Stanze

| | Stanze | Home |
|---|---|---|
| Contenuto | `devices/panels/*` | `devices/panels/*`, gli stessi; se l'entità non si legge, `settings/UnavailablePanel.tsx` |
| Desktop | finestra al centro | colonna di destra |
| Soglia del telefono | 760 px | 768 px (`md`) |
| Scelta del pannello | `roomsParts.ts` e registro | `homePanelRoute.ts` e registro |
| Intestazione | `panels/shell/PanelHeader` | la stessa |
| Da dove vengono i dati | modelli (`toLightModel`…) da `states` | `activeDevice`, oggetti di stato e `actions` preparati da `MainBoard.tsx` |
| Comandi | hook (`useLightCommands`…) e `onCallApi` | solo le voci di `actions` |
| Storico del sensore | 6 ore, 24 ore, 7 giorni (`useSensorHistory`) | ultime 24 ore (`sensorHistoryByEntity`) |
| Solo qui | timer, consumi della presa | allarme, robot, calendario, membri, meteo, micro-widget |
| Tocco sulla luce | apre e basta; si commuta dall'icona | commuta e apre; su `xs` commuta soltanto |

### Cosa non esiste o non arriva ai pannelli

- `resolveDeviceKind` non esiste. `DeviceKind` copre solo `outlet`, `switch`, `virtual`, `fan`, `cover`, `humidifier`.
- `ContextSidebar` non riceve `callApi` né una funzione generica per chiamare i servizi: ha `haStates`, gli oggetti di stato e `actions`. Tutto gli arriva da `RightSidebarManager.tsx` e `MainBoard.tsx`.
- Esistono già, ma solo nei loro punti: statistiche del Recorder (`devices/model/plugEnergy.ts`, Energia), API calendario (`services/calendarClient.ts`), rifiuti (`services/wasteCollectionClient.ts`), logbook (`MainBoard.tsx`).
