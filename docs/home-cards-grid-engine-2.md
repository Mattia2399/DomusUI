# Card Home = card Stanze su Grid Engine 2.0 — specifica tecnica

Stato: proposta definitiva per l'integrazione, 29/10/2026.
Fonti: `docs/design-reference/HomeCardsLab.dc.html` (lab Luce e Clima),
`docs/design-reference/RoomsPage.dc.html`, i componenti condivisi di
`src/components/devices/` (su `main`) e il motore di `feature/grid-engine-2`
(`bdf1adf`). Le misure in pixel di questa pagina sono state prese sulla Home
reale di `bdf1adf` (Demo, Chromium) a 26 larghezze di schermo.

Obiettivo: le stesse card di Stanze anche nella Home, con un solo Grid
Engine 2.0. Questa specifica non tocca il solver, la persistenza né il
funzionamento del pannello laterale.

## 0. Termini e regole di base

- **Metriche v2** (già in `gridMetrics.ts`, `GRID_V2_METRICS`): riga 36 px,
  spazio verticale 10 px, spazio orizzontale 16 px, padding attuali
  (`GRID_ENGINE_CONTAINER_PADDING`: orizzontale 0, in XS 2 px).
  Altezza di *n* righe = `36n + 10(n − 1)`: **2 = 82 px, 3 = 128, 4 = 174, 6 = 266**.
- **Formato** = classe di larghezza × righe, come in `DeviceCardFormat`
  (`DeviceCardShell.tsx`): `U×2 U×3 U×4 W×2 W×3 W×4 W×6 X×4`.
  - **U**: una card stretta (lab: "Piccola", "Media", "Alta");
  - **W**: due U più lo spazio tra loro ("Larga", "Larga media", "Grande", "Extra alta");
  - **X**: quattro U più tre spazi ("Extra larga").
- **Il breakpoint si decide sulla larghezza della griglia, non dello
  schermo** (`resolveActiveBreakpoint(runtimeGridWidth)` in `GridCanvas`). Il
  pannello laterale destro, sempre presente da 768 px di schermo, toglie
  340-475 px fino a 1920 px di schermo (misurato: 340 a 768, 441 a 1440, 474 a
  1920). Un tablet in verticale cade quindi in **XS**, e un portatile da
  1440 px in **MD**.
- La card riceve il **formato** come prop e riempie il box che le dà la
  griglia; non misura nulla e non conosce le colonne (come oggi in Stanze).
  Il motore traduce le dimensioni strutturali (w, h) in formato con le regole
  dei §1 e §3.

## 1. Matrice U/W/X

### 1.1 Colonne per breakpoint

| Breakpoint (larghezza griglia) | Colonne | **U** | **W** | **X** | U per riga |
|---|---|---|---|---|---|
| 2XL (≥ 1536) | 12 | **2** | **4** | **8** | 6 |
| XL (1280-1535) | 12 | **2** | **4** | **8** | 6 |
| LG (1024-1279) | 8 | **2** | **4** | **8** | 4 |
| MD (768-1023) | 6 | **2** | **4** | **6** ¹ | 3 |
| SM (640-767) | 4 | **1** | **2** | **4** | 4 |
| XS (< 640) | 2 | **1** | **2** | **2** ² | 2 |

1. In MD X = 6 colonne (tutta la griglia), cioè 1,5 W: la composizione resta quella di X.
2. In XS X coincide con W: un X×4 si disegna come **W×4** (§3.2).

Larghezza in colonne: W = 2U e X = 4U, poi limitato alle colonne disponibili.
La larghezza in px di *n* colonne è `n·c + (n − 1)·16`, dove `c` è la
larghezza di una colonna: `c = (L − 2·padding − 16·(colonne − 1)) / colonne`.

### 1.2 Pixel risultanti

Intervalli calcolati sugli estremi del breakpoint (2XL fino a una griglia di
2000 px; XS da 297 px, cioè uno schermo da 320):

| Breakpoint | Colonna | U | W | X |
|---|---|---|---|---|
| 2XL | 113-152 | 243-320 | 501-656 | 1019-1328 |
| XL | 92-113 | 200-242 | 416-501 | 848-1018 |
| LG | 114-146 | 244-308 | 504-632 | 1024-1279 |
| MD | 115-157 | 245-330 | 507-677 | 768-1023 |
| SM | 148-180 | 148-180 | 312-376 | 640-767 |
| XS | 138-310 | 138-310 | 293-635 | = W |

Misure reali (schermo → griglia → U / W / X):

| Schermo | Griglia | Breakpoint | U | W | X |
|---|---|---|---|---|---|
| 360 telefono | 335 | XS | 158 | 331 | 331 |
| 390 telefono | 364 | XS | 172 | 360 | 360 |
| 430 telefono | 402 | XS | 191 | 398 | 398 |
| 820 tablet | 388 | XS | 184 | 384 | 384 |
| 1024 tablet orizz. | 563 | XS | 272 | 559 | 559 |
| 1180 | 671 | SM | 156 | 328 | 671 |
| 1280 | 753 | SM | 176 | 368 | 753 |
| 1366 | 815 | MD | 261 | 538 | 815 |
| 1440 | 867 | MD | 278 | 573 | 867 |
| 1680 | 1062 | LG | 254 | 523 | 1062 |
| 1920 | 1302 | XL | 204 | 423 | 863 |
| 2560 | 1634 | 2XL | 259 | 534 | 1084 |

Scelta: U deve stare tra circa 145 e 330 px. Il minimo è dato dal contenuto
della riga a 2 righe (§5); in Stanze la tile va da 168 px in su. In MD, LG,
XL e 2XL una colonna sola (92-157 px) non basta, quindi U = 2 colonne. In SM
e XS U = 1 colonna.

### 1.3 Snapping (da integrare nel motore)

- **Larghezza**: solo U, W o X in colonne del breakpoint. La tabella 1.1 è
  la fonte, da tenere in una sola costante (`GRID_V2_WIDTH_CLASS_COLS`). Se una
  larghezza salvata cade tra due classi, si arrotonda alla più vicina; a
  parità vince la più larga. Il risultato si limita ai formati del tipo di
  card (§2).
- **Posizione x**: multipli di U (colonne pari dove U = 2), così le card U
  restano allineate fra loro. Fa eccezione X in MD, che occupa tutta la riga.
- **Altezza**: solo le righe dei formati del tipo (2, 3, 4, 6). Il resize
  verticale scatta su questi valori e non su ogni riga.
- Le **sezioni** (§4) hanno regole proprie e non usano la classe U/W/X.

## 2. Formati per tipo di card

✔ = supportato; **D** = predefinito (tutti i breakpoint, in classi U/W/X).
"↑" indica la crescita a runtime da accesa (§6).

| Tipo Home (`WidgetKind`) | Componente | U×2 | U×3 | U×4 | W×2 | W×3 | W×4 | W×6 | X×4 |
|---|---|---|---|---|---|---|---|---|---|
| `light` colore o temperatura | `LightCard` | **D** (↑U×3) | ✔ | ✔ | ✔ (↑W×3) | ✔ | ✔ | ✔ | ✔ |
| `light` solo dimmer | `LightCard` | **D** (↑U×3) | ✔ | – | ✔ (↑W×3) | ✔ | – | – | – |
| `light` on/off | `LightCard` | **D** | – | – | ✔ | – | – | – | – |
| `switch` (presa, interruttore, virtuale) | `DeviceCard` | **D** | – | – | ✔ | – | – | – | – |
| `fan` | `DeviceCard` | **D** | ✔ | – | ✔ | ✔ | – | – | – |
| `humidifier` | `DeviceCard` | **D** | ✔ | – | ✔ | ✔ | – | – | – |
| `cover` con posizione | `DeviceCard` | ✔ | **D** | – | ✔ | ✔ | – | – | – |
| `cover` senza posizione | `DeviceCard` | **D** | – | – | ✔ | – | – | – | – |
| `climate` | `ClimateCard` (da estendere) | ✔ | ✔ | ✔ | ✔ | ✔ | **D** | ✔ | ✔ |
| `sensor` numerico | `SensorCard` (da estendere) | ✔ | **D** | ✔ | ✔ | ✔ | – | – | – |
| `sensor` fumo o binario | `SensorCard` | **D** | – | – | ✔ | – | – | – | – |
| `lock` | `SecurityCard` (lock) | **D** | – | ✔ | ✔ | – | – | – | – |
| `camera` | `SecurityCard` (camera) | ✔ | – | – | – | ✔ | **D** | – | ✔ |
| `media` | `MediaCard` (da estendere) | ✔ | – | – | – | **D** | ✔ | – | ✔ |
| `alarm` | `AlarmCard` nuovo, su `DeviceCardShell` | ✔ | – | – | **D** | ✔ | – | – | – |
| `vacuum` | `VacuumCard` nuovo, su `DeviceCardShell` | ✔ | – | – | **D** | ✔ | – | – | – |
| `calendar` | `CalendarCard` attuale, ridisegnato | ✔ | – | – | – | ✔ | **D** | – | ✔ |
| `members` | `MembersCard` attuale, ridisegnato | ✔ | – | – | **D** | ✔ | – | – | – |

Note:
- Il tipo di luce (colore, temperatura, dimmer, on/off) si legge dall'entità.
  Un formato non supportato da quell'entità si riduce al più grande supportato
  che entra nel box (§3.2). Una luce on/off non cresce mai.
- `fan`, `humidifier` e `cover` mostrano la barra di livello da 3 righe in su
  e, in W×2, accanto al nome (oggi in `DeviceCard`).
- Per alarm, vacuum, calendar e members non c'è una card di Stanze. Il lab non
  le disegna, quindi qui ne fisso solo formati e contenuti (§7.3). Il disegno
  visivo va fatto prima di implementarle.

## 3. Dimensioni strutturali → varianti

### 3.1 Preset del builder (`CardLayoutVariant`)

I tre preset sostituiscono le dimensioni di `resolveVariantTarget` con formati:

| Tipo | mini | standard | expanded |
|---|---|---|---|
| light colore/temperatura | U×2 | U×3 (fissa) | W×4 |
| light solo dimmer | U×2 | U×3 (fissa) | W×3 |
| light on/off | U×2 | W×2 | W×2 |
| switch | U×2 | W×2 | W×2 |
| fan, humidifier | U×2 | U×3 | W×3 |
| cover con posizione | U×2 | U×3 | W×3 |
| climate | U×2 | W×4 | W×6 (X×4 se la griglia ha X > W e non è in uno Stack) |
| sensor numerico | U×2 | U×3 | W×3 |
| lock | U×2 | W×2 | U×4 |
| camera | U×2 | W×4 | X×4 (W×4 dove X = W) |
| media | U×2 | W×3 | W×4 |
| alarm, vacuum, members | U×2 | W×2 | W×3 |
| calendar | U×2 | W×4 | X×4 (W×4 dove X = W) |

Due preset uguali (per esempio switch standard ed expanded) si mostrano una
volta sola nel builder.

### 3.2 Da (w, h) al formato

1. **Classe**: X se `w ≥ X(bp)` e `X(bp) > W(bp)`; altrimenti W se
   `w ≥ W(bp)`; altrimenti U. Nelle griglie degli Stack le colonne sono quelle
   della griglia principale (§4), quindi vale la stessa tabella.
2. **Righe**: il valore più grande tra quelli supportati dal tipo per quella
   classe che sia ≤ h. Se nessuno è ≤ h, il più piccolo supportato (il motore
   non dovrebbe mai produrre questo caso).
3. **Ripiego**: se la classe non ha formati per il tipo (per esempio una presa
   in X), si scende alla classe inferiore con le stesse regole. X×4 diventa
   W×4 dove X = W; un formato W in un box U diventa U.
4. La card occupa **sempre tutto il box**: se il formato scelto è più piccolo
   del box (righe intermedie come 5), il contenuto del formato si allinea in
   alto e lo spazio in più resta vuoto. Il contenuto non si deforma.

### 3.3 Compatibilità `WidgetDisplayVariant`

Per `onDisplayMetricsChange` e per chi legge ancora la variante legacy:
U×2 e W×2 → `compact`; U×3, U×4 e W×3 → `standard`; W×4, W×6 e X×4 → `full`.
`mini` non è più prodotto dalle card nuove: il formato più piccolo è U×2.

## 4. Stack e sezioni speciali

### 4.1 Stack

| Stack | Colonne interne | Classe delle card | Altezze | Luci accese |
|---|---|---|---|---|
| `stack-grid` | la larghezza della sezione nella griglia principale (`canvasLinkedCols`), con la stessa larghezza di colonna | matrice §1 invariata; X limitato alla larghezza dello Stack | formati del tipo | crescono (§6), spingono solo le card sotto nello Stack |
| `stack-vertical` | 1 | data dalla larghezza in px dello Stack, con le soglie della griglia principale: ≥ X(bp) → X, ≥ W(bp) → W, altrimenti U | formati del tipo, una card sotto l'altra | crescono e spingono in basso le card dello Stack |
| `stack-horizontal` | 1 riga che scorre | sempre **U** (larghezza attuale 170-320 px) | tutte le card prendono le righe dello Stack (2, 3 o 4) | **non crescono**: l'altezza è quella della riga |

- Lo Stack in modalità auto (`gridStackWidthMode`) continua a calcolare la
  larghezza dal contenuto; con le classi U/W/X la larghezza usata è un
  multiplo di U.
- In uno Stack i preset expanded di climate e camera restano W (tabella 3.1),
  come oggi con `isInsideStack`.

### 4.2 Sezioni speciali

Altezze in righe v2; larghezze in colonne.

| Sezione | Larghezza | Righe | Contenuto |
|---|---|---|---|
| `greeting` | tutta la griglia | 3 (128 px) | saluto, riga di stato; con il meteo "chip" la riga di previsioni a destra da MD in su, sotto in XS e SM (in XS e SM 4 righe = 174 px se il meteo c'è) |
| `weather` (card) | W | 3 (W×3); 4 con le previsioni orarie | condizione, temperatura, previsioni |
| `scenes` | X (2XL, XL, LG: 8; MD 6; SM 4; XS 2) | 2 (82 px) | `SceneCard` di Stanze (pillole da 64 px, centrate in verticale), striscia che scorre di lato |

Le sezioni non usano la classe U/W/X per il loro contenuto. L'altezza delle
scene è fissa (2 righe): la pillola da 64 px sta nei 82 px con 9 px sopra e
sotto.

## 5. Dimensioni minime dei contenuti e overflow

Misure dalle card di Stanze: padding 14 px, icona 44 px, spazio 12 px, nome
15 px, stato 13 px, tinte 28 px con spazio 10, anello serratura 58 px (grande
136).

| Formato o contenuto | Minimo necessario | Problema | Soluzione |
|---|---|---|---|
| Riga U×2 (icona, nome, stato) | larghezza 144 px | in XS su schermi da 320 U = 138: il nome ha circa 54 px | ammesso: nome e stato su una riga con ellissi; nessun overflow, solo troncamento. Schermi < 340 px non sono un obiettivo di design |
| Luce U×4: 4 tinte sopra lo slider | larghezza 170 px (4·28 + 3·10 + 28) | **overflow** in SM (U 148-180) e in XS fino a 430 px (U 138-191) | container query sulla card: sotto 170 px tinte da 24 px con spazio 8 (148 px); sotto 148 px 3 tinte |
| Luce W×3: slider e tinte affiancati | W ≥ 293 | slider ≥ 107 px | nessun problema |
| Luce X×4 in XS | – | X = W | si disegna W×4 (§3.2) |
| Sensore U×3 (128 px) | in Stanze la card è alta **140 px** (nome, valore, linea, nota) | **overflow verticale di ~10 px** | in U×3 la riga "nota" si nasconde (resta in U×4 e W×3). Stanze passa da 140 a 128 px, così le card sono le stesse |
| Clima W×6: 4 pillole modalità | larghezza 308 px | in XS su schermi da 320 W = 293 | sotto 308 px pillole con sola icona (container query) |
| Clima W×4: temperatura grande con − e + | larghezza circa 250 px | nessun problema (W ≥ 293) | – |
| Clima U×3 e U×4 con − e + | larghezza circa 150 px | in XS da 320 U = 138: − e + non entrano accanto al valore | sotto 150 px − e + vanno sotto il valore (U×4) oppure si nascondono (U×3: resta il valore, il pannello fa il resto) |
| Serratura U×4: anello grande | altezza 136 + nome 20 + 8 + 28 = 192 > 174 | **overflow di 18 px** | in U×4 anello da 116 px (116 + 20 + 8 + 28 = 172) |
| Serratura U×2: anello piccolo | altezza 58 + 2·12 = 82 | esatto | padding verticale 12 px in questo formato |
| Media W×3 | altezza 28 + 20 + 16 + 8 + 44 = 116 | nessun problema | – |
| `DeviceCard` W×2 con livello a destra | W ≥ 293 → livello circa 100 px | nessun problema | – |
| Testo grande del sistema (accessibilità) | – | le righe sono fisse | la card non cresce mai per il testo: ellissi su una riga per nome e stato; valori grandi con `font-size` in `clamp()` rispetto al container |
| Stack orizzontale | card 170-320 px | coerente con U | – |

Regola generale: le card usano `container-type: size` sul proprio box
(modello `LockCard.css`). Le soglie in px di questa tabella vanno nelle
container query, non in JavaScript.

## 6. Luci: spenta 82 px, accesa 128 px

- **Struttura salvata = altezza da spenta**: U×2 o W×2 (2 righe, 82 px). È
  già in `GRID_LIGHT_RUNTIME_METRICS_BY_VERSION.v2 = { hOff: 2, hOn: 3 }`.
- **Da accesa**, se la crescita è attiva e la luce è dimmerabile, il motore
  applica un `RUNTIME_RESIZE` a 3 righe (128 px): U×2 → U×3 e W×2 → W×3. La
  larghezza non cambia. Si spostano solo le card sotto nelle stesse colonne
  (come nel lab: "scendono solo le card sotto"). Allo spegnimento torna a 2
  righe. Il layout salvato non cambia mai.
- **Contenuto**: a 82 px icona, nome e stato ("Spenta", "60% · calda"); a
  128 px in più lo slider di luminosità (U×3) oppure slider e tinte affiancati
  (W×3).
- **Quando non cresce**:
  - luce on/off (U×3 sarebbe vuoto);
  - struttura salvata con 3 o più righe (la card è già alta: "Fissa");
  - interruttore "Cresce/Fissa" su Fissa (lab; è `autoExpand` in
    `widgetLayoutOverrides`; predefinito Cresce);
  - in uno Stack orizzontale;
  - luce non disponibile.
- **In modifica** si vede e si sposta la struttura salvata (82 px), senza
  crescita, così l'utente modifica quello che viene salvato. Fuori dalla
  modifica la crescita torna attiva.
- **Animazione**: altezza in 280 ms (come le tile di Stanze); nessuna
  animazione con `prefers-reduced-motion`. Durante la crescita la card non
  cambia composizione a metà: passa a U×3 quando il box ha raggiunto 128 px.
- **Più luci che si accendono insieme** (scena): un solo passaggio del
  solver per lotto di cambi di stato, non uno per luce, per evitare salti a
  cascata.

## 7. Componenti visivi definitivi

### 7.1 Principio

`CardRenderer` (Home) conserva **tutte** le sue props e callback attuali.
Con le metriche v2 rende la card condivisa di `src/components/devices/cards/`:
1. costruisce il modello con i costruttori già usati da Stanze
   (`toLightModel`, `toDeviceModel`, `toClimateModel`, `toSensorModel`,
   `toSecurityModel`, `toMediaModel`) a partire da `widget` e `liveEntity`;
2. passa il **formato** calcolato dal motore (§3.2);
3. traduce le azioni della card nelle callback esistenti (§7.2).

Con le metriche legacy `CardRenderer` continua a rendere le card attuali, così
la Home salvata resta identica finché l'utente non passa a v2 (§8).

Selezione, modifica e nascosto passano come in Stanze (`editing`,
`selected`, `onSelect`; `onClick` di `CardRenderer` diventa `onSelect` in
modifica e `onOpenPanel` fuori).

### 7.2 Azioni → callback esistenti

| Azione della card | Callback Home |
|---|---|
| Luce `turn_on` / `turn_off` | `onSwitchToggle(widget)` (come oggi per l'icona) |
| Luce `brightness {pct}` | `onLightBrightnessChange(widget, pct)` (0-100, la Home usa già `brightness_pct`) |
| Luce `hue {hue}` | `onLightColorChange(widget, [hue, 100])` |
| Luce `kelvin`, `mode` | **nuova** callback opzionale `onLightColorTempChange(widget, kelvin)`; `mode` = temperatura → kelvin attuale, colore → hue attuale |
| Device `turn_on` / `turn_off` | `onSwitchToggle`, `onFanToggle` o `onHumidifierToggle` secondo il tipo |
| `fan_pct`, `fan_preset`, `fan_oscillate`, `fan_direction` | `onFanPercentageChange`, `onFanPresetChange`, `onFanOscillationChange`, `onFanDirectionChange` |
| `cover_open`, `cover_close`, `cover_stop`, `cover_position` | `onCoverOpen`, `onCoverClose`, `onCoverStop`, `onCoverPositionChange` |
| `humidity`, modalità umidificatore | `onHumidifierTargetHumidityChange`, `onHumidifierModeChange` |
| Clima `turn_on` / `turn_off`, `mode`, `target`, `range`, `step`, `fan`, `swing`, `preset` | `onClimatePowerToggle`, `onClimateModeChange`, `onClimateTargetTempChange` (anche per `step`: target ± passo), `onClimateTargetRangeChange`, `onClimateFanModeChange`, `onClimateSwingModeChange`, `onClimatePresetModeChange` |
| Serratura: primo giro / secondo giro | `onLockToggle`, `onLockOpen` |
| Media: play/pausa, precedente, successivo, posizione, volume, sorgente | `onMediaToggle`, `onMediaPrevious`, `onMediaNext`, `onMediaSeek`, **nuova** opzionale `onMediaVolumeChange(widget, volume)`, `onMediaSelectSource` |
| Allarme: inserisci / disinserisci | `onAlarmArm`, `onAlarmDisarm` |
| Aspirapolvere: avvia/pausa, stop, base | `onVacuumStartPause`, `onVacuumStop`, `onVacuumReturnToBase` |
| Sensore, telecamera, membri: apertura | `onClick` / `onMembersOpenPanel` |

Le uniche aggiunte sono due callback **opzionali**: senza, kelvin e volume
restano nel pannello.

### 7.3 Componenti da completare (ordine proposto)

1. **`LightCard`, `DeviceCard`**: già in tutti i formati. Restano le
   container query del §5 (tinte in U×4).
2. **`ClimateCard`**: da `size: 'large' | 'small'` agli 8 formati del lab:
   - `small` U×2 (stato);
   - `mid` U×3 e `tall` U×4 (valore grande, − e + se c'è la regolazione);
   - `wide` W×2 (riga);
   - `widemid` W×3;
   - `big` W×4 (valore 42 px, didascalia, − e +, piede);
   - `xtall` W×6 (valore 58 px e pillole modalità);
   - `xwide` X×4 (modalità nella colonna laterale).
   `size` resta come alias (`large` = W×4, `small` = U×2) per Stanze.
3. **`SensorCard`**: prop `format` con U×2, U×3 e U×4 (§5) e W×2, W×3 (valore
   a sinistra, linea a destra); in Stanze altezza da 140 a 128.
4. **`SecurityCard`** (serratura, telecamera): prop `format`; serratura U×2,
   W×2, U×4 (anello da 116); telecamera U×2 (riga "Dal vivo"), W×3, W×4 e X×4
   (immagine a tutto box, `object-fit: cover`).
5. **`MediaCard`**: prop `format`; U×2 = tile semplice di oggi (anche quando
   suona: titolo e play), W×3 = copertina sfocata, titolo e comandi, W×4 =
   anche posizione e volume, X×4 = copertina a sinistra.
6. **Da disegnare prima di implementare** (nessun riferimento nel lab), sulla
   cornice `DeviceCardShell` e i token `--dv-*`:
   - **AlarmCard**: U×2 scudo e stato; W×2 con il pulsante Inserisci/Disinserisci; W×3 con le modalità;
   - **VacuumCard**: U×2; W×2 con stato e batteria; W×3 con avvia, base e stop;
   - **CalendarCard** e **MembersCard**: le attuali con i token e la cornice delle card di Stanze;
   - **meteo** e **saluto**.

### 7.4 Pannello laterale

Il pannello laterale della Home resta com'è: si apre e si chiude allo stesso
modo, con la stessa larghezza e la stessa logica di `ContextSidebar` e
`RightSidebarManager`. Cambia solo il contenuto, che diventa il pannello di
Stanze (`LightPanel`, `ClimatePanel`, `SensorPanel`, `SecurityPanel`,
`MediaPlayer`, `DevicePanel`) con `PanelHost presentation="side"`, già
previsto e non ancora usato. Le funzioni oggi presenti solo nel pannello Home
e assenti in quello di Stanze vanno elencate prima di sostituire il contenuto,
per non perderle.

## 8. Passaggio esplicito da legacy a v2

La Home salvata resta `legacy` (48/16) finché l'utente non sceglie di passare
alla nuova disposizione (`GridMetricsVersion` `'legacy' | 'v2'`, versione
distinta da `layoutEngine`). Il passaggio, per ogni breakpoint salvato:

1. **Larghezza**: le colonne non cambiano tra legacy e v2. `w` si arrotonda
   alla classe U/W/X più vicina (§1.3). Se in quella classe il tipo non ha un
   formato alto almeno quanto il punto 2, si sale alla classe più larga
   (quando le colonne lo permettono), così una card non diventa mai molto più
   piccola di prima; altrimenti si resta nella classe con il formato più alto.
2. **Altezza**: dall'altezza in px legacy (`48h + 16(h − 1)`) alle righe v2
   supportate più vicine; a parità la più alta.
   - legacy 1 (48 px) → 2 righe (82);
   - legacy 2 (112) → 3 (128);
   - legacy 3 (176) → 4 (174);
   - legacy 4 (240) → 6 (266), se il tipo lo supporta, altrimenti 4;
   - legacy 5 e 6 → 6.
   Le luci: `hOff` legacy 1 → 2, `hOn` legacy 2 → 3.
3. **Posizioni**: si conserva l'ordine di lettura (y, poi x). `x` scatta al
   multiplo di U più vicino, poi un solo passaggio `NORMALIZE` del solver per
   breakpoint.
4. **Sezioni**: greeting 3 righe; weather W×3; scenes X × 2 righe; gli Stack
   tengono la larghezza in colonne e ricalcolano l'altezza dal contenuto.
5. Il risultato si mostra in anteprima e si conferma, come le altre modifiche
   del layout. Si deve poter tornare a `legacy` finché non si salva.

Esempi con i default legacy in XL:

| Card legacy | Classe e righe | Formato v2 |
|---|---|---|
| luce 2 × (1 spenta, 2 accesa) | U, 2 → 3 | U×2 (↑U×3) |
| clima 3×3 | 3 colonne: a metà tra U e W → W; 4 righe | W×4 |
| sensore 2×3 | U, 4 righe | U×4 |
| serratura 2×3 | U, 4 righe | U×4 |
| media 2×3 | U, 4 righe; in U il media ha solo U×2 → si sale a W | W×4 |
| telecamera 4×3 | W, 4 righe | W×4 |
| presa 2×1 | U, 2 righe | U×2 |

## 9. Divisione del lavoro e prerequisiti

- **Prerequisito**: `feature/grid-engine-2` è indietro di 121 commit rispetto
  a `main`. Le card condivise (`src/components/devices/`), il registro delle
  traduzioni dei dispositivi e i pannelli sono solo su `main`. Prima
  dell'integrazione va portato `main` nel branch del motore.
- **Codex (motore)**: versione delle metriche nel layout salvato, tabella
  U/W/X (§1.1), snapping (§1.3), formato da (w, h) (§3.2), crescita delle luci
  (§6), passaggio legacy → v2 (§8). Nessuna modifica a solver e persistenza
  oltre a questo.
- **Card e pannelli**: §5, §7.2, §7.3 punti 1-5, poi 6 dopo il disegno; il
  contenuto del pannello laterale (§7.4).

## 10. Punti aperti

1. **MD con il pannello laterale**: su un portatile da 1366-1536 px la griglia
   è in MD e le card U sono larghe 261-297 px, 3 per riga. È la conseguenza
   del pannello sempre aperto. Va bene così, o il pannello si chiude da solo
   in MD quando non c'è una card selezionata?
2. **Tablet in verticale = XS**: con il pannello aperto un iPad da 820 px ha
   la griglia di un telefono (2 colonne). Stessa domanda.
3. **Disegno di alarm, vacuum, calendar, members, meteo e saluto** (§7.3.6):
   servono le tavole, come il lab per Luce e Clima.
4. **"Cresce/Fissa"** per ogni luce: predefinito Cresce, come nel lab.
