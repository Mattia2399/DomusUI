# Screensaver

Dopo un periodo senza interazioni Domus mostra l'ora (e, se si vuole, la
data) a tutto schermo; al primo tocco torna esattamente dove si era.

| Dimensione | Valore |
| --- | --- |
| Scope | **DEVICE**: ogni browser ha il suo; il tablet del soggiorno, quello della cucina e il PC possono essere diversi |
| Owner | **CORE** (esperienza del dispositivo) |
| Posizione | Impostazioni › Questo dispositivo › Screensaver (`/settings/device/screensaver`) |
| Esecuzione | Nel browser, nell'app Domus |
| Persistenza | `localStorage` di questo browser, chiave `domusui.screensaver.v1` |
| Backend | Nessuno: niente Store, comandi WebSocket, automazioni o servizi Home Assistant |

Non va nel Profilo, non è una impostazione della casa e non si sincronizza tra
dispositivi. Non usa il `client_id` di Domus.

## Cosa non è

È un livello sopra Domus, non il sistema operativo:

- non spegne lo schermo, non cambia la luminosità, non blocca Android o iOS;
- non usa la Fullscreen API (copre l'area di Domus con un overlay, anche dentro
  il pannello di Home Assistant e in PWA);
- non usa la Screen Wake Lock API: **non garantisce** che il tablet tenga lo
  schermo acceso. Se il sistema spegne il display, lo screensaver non lo
  impedisce. Se ne occuperà la futura modalità Kiosk / Wall Tablet.

È indipendente da [Alimentazione e ricarica](device-power-management.md):
funziona senza sensore batteria e senza presa smart, anche su un PC, e non
mostra dati di alimentazione.

## Preferenze

```json
{ "version": 1, "enabled": false, "timeoutMinutes": 5, "mode": "minimal", "showDate": true }
```

- Predefinito: **disattivato**, 5 minuti, Minimal, con la data.
- Tempi ammessi: 1, 2, 5, 10, 15, 30 minuti.
- Modalità: `minimal`, `ambient`.
- Documento illeggibile, non oggetto o di un'altra versione → valori
  predefiniti, quindi spento. Un solo campo non valido torna al suo valore
  predefinito; `enabled` è vero solo se vale esattamente `true`. I campi
  sconosciuti sono ignorati.
- Come le altre preferenze di Questo dispositivo, ogni modifica vale subito e
  viene salvata subito. Se il browser non conserva dati locali la scelta vale
  finché la pagina resta aperta e la pagina lo dice. Una modifica fatta in
  un'altra scheda dello stesso browser arriva con l'evento `storage`.

## Architettura

```
MainBoard
 └─ DomusScreensaver              (runtime, nel bundle iniziale, piccolo)
     ├─ startIdleController       (un timer, timestamp di attività)
     ├─ ScreensaverSurface        (portal su document.body, z-index 600)
     │   └─ ScreensaverDisplay    (chunk a parte: orologio, data, burn-in)
     └─ onScreensaverPreviewRequest
Impostazioni › Screensaver        (chunk a parte, solo aprendo la pagina)
```

- `screensaverPreferences.ts`: lettura, validazione, salvataggio e una copia
  condivisa (`useSyncExternalStore`) per pagina e runtime.
- `idleController.ts`: puro, senza React.
- `DomusScreensaver.tsx`: montato una sola volta, vale per qualunque pagina
  (`/home`, `/settings`, `/consumi`, `/appgallery/...`).
- `ScreensaverDisplay.tsx`: caricato in anticipo appena lo screensaver è
  attivo (e all'anteprima), così non compare in ritardo.

## Rilevamento dell'inattività

Contano solo le azioni della persona, ascoltate una volta sola sulla finestra
(in cattura, passive): `pointerdown`, `keydown`, `wheel`, `touchstart`,
`focusin`, `pointermove` e la navigazione interna (il cambio di route
reimposta il conto alla rovescia).

- Un'attività salva solo un timestamp: nessun `setState`. `pointermove` è
  annotato al massimo ogni 500 ms.
- Un solo timer controlla il timestamp quando il tempo potrebbe essere
  scaduto; se c'è stata attività si riprogramma per il tempo che manca.
- **Non** contano: cambi di stato di Home Assistant, messaggi WebSocket,
  refresh, timer, toast.
- Un campo con il focus ma senza digitazione non blocca lo screensaver.
- Un cambio delle preferenze (tempo, modalità, data, attivazione) fa
  ripartire il conto da quel momento: un tempo più breve non usa il vecchio
  inizio.

### Scheda nascosta, finestra

- `visibilitychange` → `hidden`: il timer si ferma, nulla si attiva in
  background.
- `visible`: il conto riparte da zero. Tornando dopo 30 minuti su un'altra
  scheda lo screensaver non compare subito.
- `focus` della finestra: nuovo inizio, come il ritorno alla scheda. `blur`
  non fa nulla (un PC con la dashboard su un secondo monitor continua a
  contare).

## Risveglio

Escono dallo screensaver: tocco, click, tasto (Esc compreso, ma non è l'unico
modo), rotella e un movimento reale del mouse (almeno 24 px; un tavolo urtato
non lo sveglia).

### Il primo tocco non arriva alla pagina

Il primo gesto serve solo a svegliare Domus: non preme pulsanti, non accende
luci, non apre card, non naviga.

- Mentre lo screensaver è visibile, ogni gesto (puntatore, tocco, mouse,
  click, rotella, tasti) viene preso sulla finestra in fase di cattura, cioè
  prima di chiunque altro, e fermato (`stopImmediatePropagation`,
  `preventDefault`). Nessun elemento della pagina lo sente: né un pulsante,
  né una modale aperta che si chiuderebbe con un tocco esterno o con Esc.
- Resta montato (trasparente) finché il gesto non è finito: rilascio del dito
  o del tasto + 60 ms, al massimo 800 ms.
- Dopo un tocco, il `click` che il browser può ancora mandare nel punto del
  dito viene scartato per 400 ms.
- Test: `DomusScreensaver.test.tsx` («keeps the first tap…», «leaves an
  open dialog below open…») e `tests/device-screensaver.spec.cjs` (E, con un
  touchscreen vero e con il mouse). Verificati a rovescio: una versione che
  toglie l'overlay al `pointerdown` fa fallire l'E2E (il tocco apre la pagina
  sotto), una che ferma i gesti solo con i gestori React fa fallire il test
  della modale (i suoi listener sul documento sentono il risveglio).

### Pagina, focus, accessibilità

- La route non cambia e la pagina resta montata: moduli, scroll, app e
  modali aperte si ritrovano come prima.
- Mentre è attivo, `#root` è `inert`: la pagina sotto non si raggiunge con
  Tab né con un lettore di schermo. L'overlay è un `dialog` modale con il
  focus.
- Alla chiusura `inert` torna come prima (solo se lo aveva messo lo
  screensaver) e il focus torna all'elemento di prima, se esiste ancora.
- I toast restano sotto lo screensaver e non lo svegliano.
- Disattivare lo screensaver mentre è visibile lo chiude subito.

## Modalità

- **Minimal**: ora grande su nero vero, data discreta, nient'altro. Pensata
  per OLED e notte.
- **Ambient**: l'ora sullo sfondo Domus di questo dispositivo (le stesse
  classi `dashboard-background-*`, nessuna seconda configurazione), attenuato
  per la leggibilità; tema chiaro o scuro come la dashboard. Lo sfondo Neutro,
  che non ha un'immagine, riceve una luce morbida per non essere uno schermo
  piatto.

In basso, attenuati: «Tocca per tornare» (sparisce dopo 6 secondi) e il
marchio «Domus».

## Ora e data

- `Intl.DateTimeFormat` con la lingua di Domus: 24 ore in italiano e
  francese, 12 ore con AM/PM in inglese (AM/PM più piccolo, a parte). Non
  esiste oggi una preferenza 12/24 h globale di Domus.
- Niente secondi: l'orologio si aggiorna al cambio del minuto, con un timer
  per minuto.
- Data facoltativa, localizzata, con l'iniziale maiuscola («Lunedì 19
  ottobre», «Lundi 19 octobre», «Monday, October 19»).

## Protezione burn-in

Ora, data e marchio si spostano di pochi pixel ogni 3 minuti lungo una
sequenza fissa (centro, +X, +Y, −X, −Y, diagonali), mai in modo continuo e
mai fuori dall'area sicura (`env(safe-area-inset-*)`). Nessun valore casuale:
la sequenza è sempre la stessa e i test la verificano.

## Movimento ridotto

Con `prefers-reduced-motion`: nessuna dissolvenza in entrata o uscita,
nessuno scorrimento; il burn-in cambia posizione di colpo, sempre ogni 3
minuti.

## Anteprima

«Avvia anteprima» mostra subito lo screensaver con le impostazioni correnti,
anche se è spento. Un'anteprima non salva nulla, non cambia il tempo e non
tocca il conto alla rovescia; qualunque interazione la chiude.

## Prestazioni

Da spento: nessun listener di attività e nessun timer (resta solo l'evento
`storage` che segue le preferenze). Da acceso e invisibile: i listener passivi
della finestra e un solo timer. Nessun
`requestAnimationFrame` continuo (uno solo all'apertura per la dissolvenza),
nessun timer al secondo. Tutto viene rimosso allo smontaggio, alla
disattivazione e con l'HMR.

## Futuro (non implementato)

Stato della casa, meteo, entità scelte, foto, orari giorno/notte,
impostazione predefinita della casa con eccezioni per dispositivo, contenuti
per profilo, integrazione Kiosk, Wake Lock, luminosità fisica, coordinamento
con Alimentazione e ricarica, riassunti di Domus Intelligence.
