# DomusUI · regole di design obbligatorie

**Leggi questo file prima di creare o modificare una pagina, una card, un pannello o un componente.** Vale per ogni agente (Codex, Claude) e per ogni persona.

Il problema che risolve: senza un riferimento, chi scrive codice inventa un aspetto nuovo. In DomusUI **non si inventa il design**: si riproduce un disegno approvato con i componenti e i token che esistono già.

## 1. Da dove viene il design

Lo stile dell’app è quello di **Stanze, dei pannelli dei dispositivi e delle mini app ridisegnate** (Irrigazione, Sicurezza, Casa, Impostazioni): aspetto Apple, vetro, titoli grandi, liste raggruppate.

Se due fonti non sono d’accordo, vale quella più in alto in questo elenco:

1. Le istruzioni del committente nel prompt.
2. Questo file.
3. `docs/design/app/REGOLE-app.md`: navigazione, livelli, intestazioni e pagina Casa.
4. Le note dei singoli disegni, cioè `docs/design/pannelli/NOTA-regole-pannelli.md` e `docs/design/irrigazione/approved-design.md`.
5. I prototipi HTML elencati sotto. Sono la specifica di misure, colori, testi e stati.
6. Il codice esistente, **solo** se compare tra i modelli buoni della sezione 3.

### Riferimenti attuali

| Cosa costruisci | Riferimento da aprire |
|---|---|
| Struttura dell’app: barra di navigazione, livelli, intestazione, pagina Casa | `docs/design/app/REGOLE-app.md`, `docs/design/app/casa.html` |
| Funzione Sicurezza | `docs/design/app/sicurezza.html` |
| Funzione Irrigazione: pagine, primo avvio, card Home e robot | `docs/design/irrigazione/irrigazione-prototipo.html`, `approved-design.md` |
| Impostazioni, Profilo, Barra di navigazione | `docs/design/app/impostazioni.html` |
| Stanze | `docs/design-reference/RoomsPage.dc.html` |
| Pannelli dei dispositivi | `docs/design/pannelli/NOTA-regole-pannelli.md`, `PanelLab.dc.html`, `PanelNav.dc.html`, `PanelGroupsLab.dc.html`, `MediaPlayer.dc.html`, `WeatherPanel.dc.html` |
| Controlli condivisi (slider, pillole, interruttori…) | `docs/design/controlli/galleria-controlli.html` |
| Uso e modifica della Dashboard (ex Home) | `docs/design/modifica/pannello-uso-e-modifica.html` |
| Card della Dashboard (ex Home) | `docs/design-reference/HomeCardsLab.dc.html`, `CoreCards.dc.html`, `sensori/SensorCards.dc.html` |
| Primo avvio dell’app | `docs/design-reference/SetupWizard.dc.html` |

I prototipi si aprono nel browser. In alto c’è una barra di prova per schermo, tema e stati: provali **tutti**, non solo lo stato predefinito. **L’HTML non si copia**: si ricostruisce con React, Tailwind, i token e i componenti `Glass*`.

**Se per quello che devi costruire non esiste un riferimento, fermati e chiedilo.** Non disegnare qualcosa di nuovo per conto tuo.

## 2. Procedura obbligatoria

1. **Prima di scrivere codice:**
   - indica il riferimento che userai, con file e schermata o stato;
   - indica quali componenti `Glass*` e quali token riusi;
   - indica cosa manca e va creato.
2. **Costruisci** partendo dai componenti condivisi. Se ne serve uno nuovo, va in `src/components/ui/` come primitiva riusabile, non dentro la pagina.
3. **Confronta con il riferimento:**
   - fai screenshot con Playwright a **390 × 844** (telefono) e a **1280 × 800** (desktop), in chiaro e in scuro;
   - fai gli stessi screenshot del prototipo;
   - mettili affiancati e guardali davvero.
4. **Nel resoconto finale** scrivi una tabella "riferimento → differenze rimaste e perché". "Uguale al prototipo" va dimostrato con gli screenshot, non dichiarato.

## 3. Codice che NON è un modello

Queste parti sono di prima del ridisegno. **Non copiarne struttura, classi, colori o misure**, anche se stai lavorando lì vicino:

- `src/pages/AppGallery.jsx`
- `src/pages/SecurityDashboard.jsx`
- `src/pages/SettingsDashboard.tsx`
- `src/pages/Consumi.tsx` e `src/pages/consumi/`
- `src/pages/AutomationsBuilder.jsx` e `src/pages/automations/`
- `src/pages/climate/`
- le card vecchie in `src/components/widgets/` con il loro CSS (`CoverCard.css`, `LockCard.css`, `HaMediaCard.css`, …)
- le pagine di prova: `DevicesLab`, `GridTestView`, `SensorFamilyLab`, `src/pages/dev/`

I modelli buoni nel codice sono pochi:

- `src/pages/rooms/` (Stanze);
- `src/components/devices/panels/shell/` (pannelli);
- `src/components/ui/Glass*` e `src/theme/glassTokens.css`;
- le parti di Irrigazione costruite dal prototipo approvato.

## 4. Materiali, colori, testo

- **Sfondo:** luci colorate molto sfocate sul fondo della pagina. Card e liste in vetro (`liquid-glass-*`, `backdrop-filter`) con bordo chiaro sottile e ombra morbida. Niente vetro dentro il vetro.
- **Colori:** solo token. Testi, superfici, bordi e stati usano `--ui-*`; controlli e pannelli usano `glassTokens.css`. Nel `.tsx`/`.jsx` nuovo non si scrivono esadecimali, `bg-white/*`, `bg-black/*`, `text-white` o grigi crudi. Fanno eccezione foto, video e selettori di colore.
- **Colore dell’app:** blu (`--ui-accent`), con il viola nelle luci.
- **Colore delle funzioni:** ogni funzione ha il suo colore e lo usa per le luci di sfondo, le icone e il comando principale:

  | Funzione | Colore |
  |---|---|
  | Sicurezza | verde |
  | Clima | arancio |
  | Energia | giallo |
  | Irrigazione | smeraldo (`#0E9F6E` in chiaro, `#34D399` in scuro) |
  | Rifiuti | verde |

  Il colore della funzione si definisce **una volta** come token locale della funzione.
- **Colori riservati:** rosso per errore e allarme, arancio per attenzione, viola per pioggia.
- **Font:** solo quelli di sistema (`--ui-font-system`, `--ui-font-display`). Nessun font incluso nel pacchetto, nessun font da Google o da altri siti.
- **Testo:**

  | Elemento | Dimensione e peso |
  |---|---|
  | Titolo di pagina | 30 px, 700, interlinea stretta |
  | Titolo di sezione | 22 px, 700 |
  | Righe | 15–17 px, 600 |
  | Testo secondario | 13–15 px, 500, `--ui-text-secondary` |

- **Comandi:**
  - pillola nera (bianca nel tema scuro) per la scelta attiva;
  - interruttori verdi;
  - segmentati con fondo bianco sulla scelta;
  - bersagli di tocco di almeno 44 px.
- **Raggi:**

  | Elemento | Raggio |
  |---|---|
  | Card grandi | 24–32 px |
  | Righe e gruppi | 22–24 px |
  | Icone quadrate | 10–13 px |

## 5. Struttura delle pagine

- **Intestazione:** una sola riga con il pulsante rotondo in vetro ‹ (solo se si torna indietro), il titolo e gli strumenti a destra (ingranaggio, puntina, azione). Sotto, se serve, una riga piccola di dettaglio. Il ‹ è l’unico controllo per tornare indietro.
- **Livelli:** al massimo due.
  - La sotto-pagina sul telefono copre la pagina; su tablet e desktop si apre nella colonna a destra.
  - Un terzo livello e le azioni rapide sono **fogli**.
- **Navigazione:** una sola barra, quella dell’app. Le funzioni non hanno barre proprie. Dettagli in `REGOLE-app.md` §3. Finché la nuova barra non è stata portata, resta la shell attuale.
- **Liste:** righe raggruppate in un unico blocco di vetro, con separatori interni e icona quadrata colorata a sinistra. Il valore a destra si mostra solo se dice qualcosa.
- **Larghezze:** si usano container query, non la larghezza della finestra.
- **Pagina di una funzione:** in alto lo stato e il comando principale, poi le sezioni in anteprima con "Tutte ›". Le impostazioni si aprono dall’ingranaggio.

## 6. Contenuto

- **Mostra solo quello che l’entità espone davvero.** Nessun controllo finto, disabilitato o con dati inventati.
- I testi sono semplici, per un utente base, e passano dall’i18n.
- La stessa card fa le stesse cose in tutte le pagine.

## 7. Cosa non si tocca senza ok

- Non toccare, se non dopo aver mostrato il diff minimo e ricevuto l’ok:
  - `DashboardGrid.tsx`, `GridCanvas.tsx`, `MainBoard.tsx`, `StackGrid.tsx`;
  - `RightSidebarManager.tsx`, `dashboardBreakpointConfig.ts`, `adaptiveCardSizing.ts`;
  - solver, contratti e persistenza del Grid Engine.
- Grid Engine 2.0 usa 12/12/8/6/4/2 colonne. Non cambiare il modello a colonne e non migrare in automatico le coordinate salvate.
- Il funzionamento attuale della Dashboard (ex Home) non cambia. Nei testi visibili la pagina si chiama "Dashboard", la route resta `/home`.
- Un componente vive in un solo posto. Se esiste già un componente `Glass*`, lo estendi; non ne fai una copia locale.
- I limiti di peso dei pacchetti restano quelli di `scripts/performance-budget.config.mjs`.
- Lavora su un branch per ogni compito e fai un commit per fase. Push e PR solo se richiesti.
