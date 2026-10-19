# Modalità Kiosk

Trasforma Domus in un pannello dedicato per un tablet a parete o un PC usato
solo come dashboard: niente navigazione di Domus, pagina iniziale fissa,
schermo intero e schermo sempre acceso quando il browser lo consente.

| Dimensione | Valore |
| --- | --- |
| Scope | **DEVICE**: tablet del soggiorno in Kiosk, PC personale no, stesso utente |
| Owner | **CORE** (esperienza del dispositivo) |
| Posizione | Impostazioni › Questo dispositivo › Modalità Kiosk (`/settings/device/kiosk`) |
| Esecuzione | Nel browser, nell'app Domus |
| Persistenza | `localStorage` di questo browser, chiave `domusui.kiosk.v1` |
| Backend | Nessuno |

Funziona con l'installazione attuale: pannello di Home Assistant (HACS), Domus
autonoma nel browser e app installata (PWA). Non servono app Android o iOS,
modifiche al sistema operativo, fork o patch del frontend di Home Assistant.

## Kiosk non è sicurezza

Kiosk è una funzione di esperienza. Nascondere barra laterale, menu,
Impostazioni e Profilo **non impedisce** a una persona di raggiungerli: chi
esce da Kiosk (gesto o tastiera) ritrova tutto. Kiosk non protegge backend,
entità, servizi, pagine o configurazioni. I permessi restano quelli di Home
Assistant e, in futuro, di Domus Access Control. La pagina di impostazioni lo
dice esplicitamente.

## Cosa controlla

Solo Domus. Non tocca Android, iOS, Windows, la barra del browser, il frontend
di Home Assistant fuori da Domus, la barra di sistema, il tasto Home, i gesti
di sistema o il tasto di accensione. Non usa `parent.document`, non cerca
elementi di Home Assistant, non entra in Shadow DOM e non aggiunge CSS contro
Home Assistant (un test di contratto lo verifica sui sorgenti del runtime).

## Preferenze

```json
{ "version": 1, "enabled": false, "hideNavigation": true, "startRoute": "/home", "preferFullscreen": true, "keepScreenAwake": true }
```

- Predefinito: **spento**. Nessun dispositivo entra in Kiosk da solo.
- Documento illeggibile, non oggetto o di un'altra versione → valori
  predefiniti, quindi spento; `enabled` è vero solo se vale esattamente
  `true`. Un campo non valido torna al suo valore predefinito, i campi
  sconosciuti sono ignorati.
- Salvataggio immediato, come le altre preferenze di Questo dispositivo, e
  sincronizzazione tra schede con l'evento `storage`
  (`devicePreferenceStore`, lo stesso dello Screensaver).
- Si sincronizza **solo la preferenza**: schermo intero e Wake Lock
  appartengono alla singola scheda e non vengono mai salvati né condivisi.

## Pagina iniziale

Si sceglie da un elenco, mai scrivendo un indirizzo: le pagine principali del
registro `APPLICATION_ROUTE_REGISTRY` (Home, Stanze, Sicurezza, Consumi, App
Gallery) che compaiono nella navigazione della persona. Mai Impostazioni,
Profilo, Automazioni (non ancora disponibili), pagine di test o tecniche.
Una pagina salvata che non è più raggiungibile apre Home.

## Attivare e avviare

Il toggle salva soltanto la scelta. Il pannello parte con **Avvia modalità
pannello**, da un tocco reale, perché i browser accettano lo schermo intero
solo da un gesto:

1. Kiosk diventa attivo in questa scheda e la navigazione sparisce;
2. si apre la pagina iniziale;
3. Domus chiede lo schermo intero (se scelto);
4. Domus chiede di tenere lo schermo acceso (se scelto).

Dopo un riavvio di Domus o un reload, su un dispositivo con Kiosk attivo il
pannello riparte da solo: navigazione nascosta, pagina iniziale una sola
volta all'avvio, Wake Lock richiesto di nuovo. Lo schermo intero **non** viene
richiesto senza un gesto. L'indirizzo di ritorno dall'accesso a Home
Assistant (`ha_oauth_callback`, `code` + `state`) non viene mai sostituito,
quindi non nascono cicli di reindirizzamento.

Kiosk nasconde la navigazione ma **non la blocca**: dalla Home si apre una
stanza, un'app o un dettaglio come sempre. Una vera restrizione delle pagine
richiede Access Control.

## Navigazione nascosta

Con «Nascondi navigazione» attivo spariscono solo gli elementi di navigazione
di Domus:

- barra laterale (desktop e tablet orizzontale);
- barra in alto su telefono e tablet verticale (menu laterale e notifiche) e
  il suo menu;
- barra in basso su telefono.

Il contenuto si allarga: nessuna colonna vuota al posto della barra laterale,
nessuno spazio lasciato per la barra in alto. Sul telefono il contenuto della
dashboard rispetta l'area sicura in alto. Modali, pannelli di contesto, menu
e toast restano come sempre.

## Uscire

Deve esserci sempre un modo, e non deve scattare per caso.

- **Tocco**: tenere premuto per 3 secondi il piccolo punto nell'angolo in
  basso a sinistra (dentro l'area sicura). Un anello si riempie mentre si
  tiene; con il movimento ridotto non c'è animazione. Un tocco breve, uno
  scorrimento o un dito che si sposta di più di 12 px non fanno nulla.
- **Tastiera**: `Ctrl+Alt+K`, oppure Invio/Spazio sul punto quando ha il
  focus (ha un nome accessibile). Nessun'altra scorciatoia viene presa: Esc,
  F5, Tab, Backspace restano del browser.
- Compare «Uscire dalla modalità Kiosk?» con **Annulla** ed **Esci**, e
  **Torna a schermo intero** quando lo schermo intero è stato lasciato.
- **Esci** spegne Kiosk su questo dispositivo, riporta la navigazione,
  rilascia il Wake Lock ed esce dallo schermo intero se lo aveva chiesto
  Domus. La pagina resta quella; Alimentazione e ricarica e Screensaver non
  cambiano.

La pressione prolungata serve solo a evitare uscite accidentali: non è un
blocco, non usa PIN né password.

Spegnere Kiosk da Impostazioni o da un'altra scheda ha lo stesso effetto,
senza ricaricare.

## Schermo intero

- Solo `document.fullscreenEnabled`, `requestFullscreen()`,
  `exitFullscreen()`, `fullscreenchange`; nessun prefisso, nessun controllo
  dello user agent.
- Viene chiesto per l'intero documento di Domus. Nel pannello di Home
  Assistant Domus vive nel proprio iframe: il bridge di Domus gli concede
  `allow="fullscreen; screen-wake-lock"`, quindi a tutto schermo va Domus, mai
  elementi di Home Assistant.
- Rifiutato o non disponibile (iOS, browser incorporati): Kiosk funziona lo
  stesso e lo stato lo dice («Il browser ha rifiutato lo schermo intero»,
  «Non supportato dal browser»).
- Uscita dallo schermo intero con Esc o un gesto del browser: Kiosk resta
  attivo e non lo richiede da solo; dal dialogo d'uscita si può tornare a
  schermo intero.
- App installata: «Già a schermo intero».
- L'orientamento non viene bloccato.

## Schermo sempre attivo (Screen Wake Lock)

- `navigator.wakeLock.request('screen')` solo se esiste.
- Chiesto quando Kiosk è attivo, l'opzione è accesa e la pagina è visibile.
- Il browser può rilasciarlo in ogni momento (pagina nascosta, risparmio
  energetico): stato «Rilasciato», nuova richiesta **una sola volta** quando
  la pagina torna visibile. Un rifiuto è uno stato («Il browser non lo
  consente ora»), mai un ciclo di tentativi.
- Rilasciato all'uscita da Kiosk, alla disattivazione dell'opzione e allo
  smontaggio.
- Non garantisce nulla oltre a quello che il browser concede: non controlla
  la luminosità né lo spegnimento fisico del display.

## Screensaver

Kiosk non ha un timer di inattività, un overlay o una protezione burn-in
propri: l'inattività resta dello [Screensaver](device-screensaver.md).

```
Kiosk attivo + Wake Lock → il display resta acceso
nessuna attività         → Screensaver
tocco                    → stessa pagina, Kiosk ancora attivo
```

Con lo Screensaver spento, il Wake Lock tiene semplicemente acceso lo schermo
finché il browser lo consente. Mentre lo Screensaver è visibile, Esc e
`Ctrl+Alt+K` lo svegliano soltanto: non aprono l'uscita da Kiosk.

## Prestazioni

```
MainBoard
 └─ DomusKiosk         (nella dashboard: stato, pagina iniziale, avvio)
     └─ KioskRuntime   (chunk a parte, solo con Kiosk attivo: schermo intero,
                        Wake Lock, angolo e dialogo d'uscita, Ctrl+Alt+K)
Impostazioni › Modalità Kiosk  (chunk a parte, solo aprendo la pagina)
```

- Nella dashboard resta solo ciò che serve a sapere se il pannello è attivo e
  a nascondere la navigazione; il resto si carica su un dispositivo con Kiosk
  acceso, in anticipo appena lo si attiva.
- Lo schermo intero lo chiede il pulsante «Avvia modalità pannello» nello
  stesso tocco (`startKioskPanel`), quindi non dipende dal caricamento del
  runtime.
- Nessun listener di attività e nessun timer continuo: solo
  `fullscreenchange`, `visibilitychange` (Wake Lock) e un `keydown` per la
  scorciatoia, mentre Kiosk è attivo.

## Futuro (non implementato)

Luminosità fisica, kiosk a livello di sistema operativo, Android Lock Task,
MDM, app nativa Domus, avvio automatico all'accensione, elenchi di pagine
consentite, integrazione con Access Control, profili giorno/notte, stato di
Alimentazione e ricarica nel pannello, gestione remota dei pannelli,
impostazioni predefinite della casa, gestione di una flotta di dispositivi.
