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
