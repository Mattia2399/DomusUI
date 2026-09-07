# Domus UI roadmap

Aggiornata: 2026-08-31

## Obiettivo

Portare Domus UI da beta avanzata a prodotto distribuibile e vendibile, mantenendo la qualita visiva attuale ma rendendo affidabili sicurezza, connessione Home Assistant, griglia responsive, persistenza e flussi di comando.

La regola fino alla chiusura dei gate P0 e': non aggiungere nuove famiglie di card. Prima consolidiamo quelle gia presenti e l'esperienza completa di `/home`.

## Baseline del 14 luglio 2026

### Punti di forza gia disponibili

- dieci famiglie di dispositivi principali piu Members;
- card responsive con varianti determinate anche dallo spazio reale in pixel;
- pannelli contestuali dedicati e controlli basati sulle capability Home Assistant;
- componenti condivisi Glass per modal, dropdown, toggle, slider e segmented control;
- griglie separate per breakpoint, drag and drop, stack e auto-sizing;
- modal con focus trap, Escape e ripristino del focus;
- backup, restore e sync che rimuovono token, passkey, PIN e codici widget;
- bridge per l'esecuzione dentro Home Assistant senza token manuale nell'iframe;
- TypeScript pulito e quattro test E2E della griglia verdi.

### Stato verificato

| Controllo | Stato iniziale |
| --- | --- |
| `npm run check` | Passa |
| `npm run test:e2e` | 4 test su 4 passano |
| `npm run test:unit` | 151 test passano, 3 falliscono |
| `npm run audit:release` | Nessuna vulnerabilita moderate/high; 1 low su esbuild dev server Windows |
| Build corrente | bundle principale circa 2,58 MB; MapLibre circa 1,06 MB; CSS circa 588 KB |
| Worktree prima del freeze | 43 file modificati e 31 file non tracciati |

I tre test unitari rossi riguardano:

- due aspettative Alarm non aggiornate dopo la migrazione del selettore a `radiogroup`;
- la duplicazione del comando accessibile `Passa al controllo colore` nella card Light.

## Principi di prodotto

1. Uno stato simulato non deve mai sembrare un dato reale.
2. Un comando deve sempre comunicare invio, attesa, conferma, errore o rollback.
3. Home Assistant resta l'autorita finale per identita, permessi e servizi.
4. L'autenticazione locale del dispositivo e una conferma rapida, non una barriera server-side.
5. Ogni esperienza deve funzionare con mouse, touch e tastiera.
6. Una card non deve tagliare contenuto in nessun breakpoint o larghezza reale.
7. Ogni nuova funzione deve avere test proporzionati al rischio.

## Checkpoint esecutivo del 30 luglio 2026

### Stato sintetico

| Blocco | Stato | Cosa manca |
| --- | --- | --- |
| P1 - Freeze iniziale | Completato e riconfermato | Il checkpoint verificato `d6daded` raccoglie sicurezza, onboarding, temi e refactoring dashboard successivi alla baseline. |
| P2 - Release gate | Verde senza eccezioni | Node 24.18 verificato; TypeScript, 524 test, build, budget, audit senza vulnerabilita e 42 E2E passano. |
| P3 - Sicurezza | Implementazione tecnica completata | Backup/restore tra browser isolati coperto da E2E; chiudere le prove manuali rinviate su impianto reale e checklist beta. |
| P4 - Affidabilita comandi | Completato per lo scope beta disponibile | Restano i collaudi hardware reali di Climate avanzato, Cover e Vacuum. |
| P5 - Editor e griglia | Completato per lo scope beta | Le tre varianti pubbliche, persistenza, cronologia e collaudo geometrico finale sono verdi; le ulteriori migrazioni container-owned restano sospese e non bloccano la beta. |
| P6 - Architettura e performance | In corso avanzato | Route secondarie, Profilo, Builder, pannelli contestuali e overlay rari sono caricati su richiesta; la separazione Profilo/Impostazioni e completata e il pannello ibrido e stato eliminato. Restano gli orchestratori della griglia e i warning di budget complessivo/CSS. |
| P7 - Accessibilita e design system | Completato per la baseline beta | Lingua e metadati, focus, target touch primari, reduced motion, contrasto semantico, annunci live e modifica canvas/stack da tastiera sono coperti; la riduzione ulteriore del CSS arbitrario prosegue come manutenzione del design system. |
| P8 - Domus UI | In corso | P8.1 Centro Attenzione e P8.2 inventario Dispositivi health-aware implementati; aggiunto il blocco P8.3 di rifinitura navigazione, notifiche ed Edit Mode prima della prossima release. |
| P9 - Distribuzione | In corso finale | Integrazione e pacchetto HACS, workflow release, README, licenza e centro feedback completati; restano il collaudo finale HACS e i materiali commerciali definitivi. |

### Gate tecnico verificato

- `npm run check`: superato;
- test unitari: `612/612` su 152 file;
- test E2E Playwright: `50/50`;
- build di produzione: superata;
- budget bundle: superato con warning su CSS e dimensione complessiva;
- `MainBoard.tsx`: 408.101 byte e 11.020 righe, rispetto ai 554.089 byte e 15.043 righe iniziali;
- il warning Babel oltre 500 KB sul sorgente e eliminato;
- i primi tre code splitting P6 riducono `Home` da circa 1,86 MB / 505 KB gzip a 499 KB / 146 KB gzip; Builder e pannelli contestuali formano un chunk separato da circa 363 KB / 85 KB gzip, mentre guida, autenticazione rapida e recupero dashboard sono chunk indipendenti caricati al bisogno. Restano MapLibre circa 1,06 MB, entry JS circa 0,91 MB e CSS globale circa 0,57 MB prima della compressione.
- runtime minimo fissato e verificato a Node 22.22.0 nel progetto e nella CI;
- React e React DOM aggiornati a 19.2.8;
- React Router aggiornato a 8.3.0, `react-router-dom` rimosso e import dichiarativi migrati a `react-router`;
- [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) risolto: la whitelist temporanea e la relativa scadenza sono state eliminate;
- `npm audit` non segnala vulnerabilita e qualsiasi futura advisory `moderate`, `high` o `critical` blocca il release gate senza eccezioni;
- il contratto automatico continua a vietare API Router Data, Framework e RSC.
- le route applicative sono definite da un registry centrale immutabile: configurazioni salvate, callback e navigazione accettano soltanto destinazioni note;
- il Builder non consente piu di modificare il percorso; nome, icona, ordine e visibilita restano personalizzabili;
- path esterni, pericolosi, duplicati o sconosciuti vengono eliminati, mentre i preset legacy vengono migrati sui percorsi canonici.

### Percorso critico verso la beta vendibile

1. Completato: checkpoint Git verificato della migrazione Node, React e React Router 8 (`c24bbd2`).
2. Completato: route applicative immutabili in configurazione, migrazione, persistenza e callback di navigazione.
3. Completato: il setup iframe/panel salta solo la connessione manuale e mantiene conferma casa, analisi, layout e organizzazione.
4. In corso: documentazione, pacchetto `0.1.0-beta.5`, backup/restore tra browser isolati e collaudo panel reale completati; restano le prove P3 hardware rinviate e la preparazione commerciale.
5. Completato per la beta: Greeting e meteo rifiniti; il centro notifiche completo e rinviato post-beta e i feedback essenziali useranno snackbar globali.
6. Proseguire P6 con riduzione degli orchestratori e lazy loading delle funzioni secondarie.
7. Completato: matrice finale P5 anti-clipping su XS, SM, MD, XL e 2XL, Builder aperto, testi lunghi e zoom equivalenti.
8. Completato il 2026-08-06: P8.3 ha uniformato sidebar desktop/mobile, notifiche ed esperienza Edit Mode/catalogo.
9. Preparare una prima distribuzione controllata; Calendar, Mappa e Liste restano successive alla stabilizzazione beta.

## Roadmap operativa

### P1 - Freeze e checkpoint

Stato: completato il 2026-07-14 con il checkpoint iniziale del branch `release/beta-0.1`.

Obiettivo: creare una base recuperabile prima della fase di stabilizzazione.

Azioni:

- salvare questa roadmap nel repository;
- creare il branch `release/beta-0.1`;
- registrare in un singolo commit lo stato completo del lavoro corrente;
- non correggere nel commit di freeze i tre test gia noti: il checkpoint deve rappresentare fedelmente la baseline;
- verificare che il worktree sia pulito dopo il commit.

Done quando:

- il branch di release esiste;
- il commit checkpoint contiene file modificati, file nuovi e roadmap;
- `git status` non mostra modifiche residue.

### P2 - Release gate completamente verde

Priorita: P0, blocca la beta.

Stato: completato il 2026-07-14.

Azioni:

- rimuovere il controllo duplicato della modalita colore nella Light;
- aggiornare i test Alarm al contratto accessibile `radiogroup`/`radio`;
- portare `check`, unit, E2E, build e audit release a verde;
- aggiungere questi comandi alla CI;
- correggere o aggiornare la dipendenza esbuild segnalata;
- introdurre un budget di bundle con warning e limite bloccante.

Done quando:

- zero test falliti;
- zero errori TypeScript;
- zero vulnerabilita moderate/high non accettate in modo esplicito, limitato e temporaneo;
- build riproducibile dalla CI.

Risultato verificato:

- `npm run release:gate` passa localmente in un'unica esecuzione;
- 38 file di unit test e 154 test su 154 passano;
- 4 scenari E2E Playwright su 4 passano;
- audit npm: 0 vulnerabilita;
- build Vite completata e controllata da un budget con warning e soglia bloccante;
- workflow GitHub Actions aggiunto per TypeScript, unit, build, budget, audit ed E2E;
- peso corrente: JS principale 2,58 MB, MapLibre 1,06 MB, CSS 0,59 MB. I warning restano tracciati per il lavoro di code splitting del P6.

### P3 - Sicurezza e permessi

Priorita: P0, blocca la beta commerciale.

Stato: implementazione tecnica completata. Gate riconfermato il 2026-07-22 con `301/301` test unitari e build superata. Il fail-closed ora reagisce anche agli eventi reali della WebSocket: perdita connessione, autenticazione revocata e disconnessione volontaria sono stati separati. L'identita HA viene inoltre rivalidata ogni 15 secondi e al ritorno sulla pagina, per intercettare cambi ruolo che non chiudono la WebSocket. Admin non Owner e utente limitato sono stati verificati su HA reale; `/rooms` nasconde anche gli ingressi amministrativi all'utente limitato, oltre a proteggere callback e persistenza. Il flusso Alarm confronta anche il PIN HA configurato prima dell'invio e attende l'esito del servizio prima di chiudere la conferma. Le istanze della Conferma dispositivo sincronizzano ora immediatamente enrollment e rimozione nella stessa pagina, senza condividere la credential migrata tra utenti HA. La verifica WebAuthn dispone inoltre di un timeout applicativo e viene abortita se il prompt nativo resta pendente, consentendo il fallback al tastierino anche attraverso i re-render del pannello. I comandi Lock sensibili non recuperano piu silenziosamente il PIN salvato: un codice configurato forza il gate condiviso per sblocco e apertura. Batteria e connessione Lock restano informazioni del solo pannello contestuale e vengono rilevate automaticamente dagli attributi o dalle entita diagnostiche dello stesso dispositivo HA. Una famiglia di entita Lock diagnostiche isolate copre tutti gli stati visuali anche senza hardware compatibile. Restano obbligatorie le prove manuali rinviate che richiedono un impianto sicuro prima di dichiarare P3 chiuso per la beta commerciale.

Aggiornamento `/security` del 3 agosto 2026: la pagina riusa ora lo stesso contratto Alarm di card e pannello contestuale. Le modalita derivano dalle feature HA, la conferma dispositivo precede il PIN quando configurata, il codice combinato resta locale e soltanto il PIN HA raggiunge il servizio. Offline il flusso e fail-closed; nessuno stato finale viene simulato nel client. SOS e disponibile solo con feature `TRIGGER`, richiede una conferma esplicita e attraversa lo stesso gate. Le griglie reattive sono validate automaticamente da 320 a 1024 px.

Azioni:

- consentire edit mode, reset, restore e configurazione sensibile solo ai ruoli autorizzati;
- usare l'utente e i permessi Home Assistant come autorita finale;
- rendere il panel bridge il metodo di installazione consigliato;
- mantenere OAuth come metodo principale per l'app esterna e il token manuale come fallback esplicito;
- documentare che WebAuthn locale conferma la presenza dell'utente ma non sostituisce una verifica server-side;
- non salvare PIN/codici per impostazione predefinita oppure marcarli chiaramente come segreti locali non protetti da un vault;
- aggiungere Content Security Policy e rivedere ogni URL o contenuto dinamico;
- spostare un eventuale rate limit realmente protettivo e l'audit immutabile sul lato HA/backend;
- completare la checklist manuale Alarm, Lock e pagina Security;
- aggiungere test per tentativi errati, refresh, timeout, annullamento biometrico e permessi insufficienti.

Done quando:

- un utente non autorizzato non puo entrare in edit mode o alterare configurazioni;
- nessun dato sensibile entra in backup, sync, log o messaggi UI;
- Alarm e Lock sono testati con utente admin e utente limitato;
- la documentazione non presenta la dashboard come sistema di sicurezza certificato.

### P4 - Verita dei dati e affidabilita dei comandi

Priorita: P0.

Stato: completato per lo scope beta disponibile. Gate automatico riconfermato il 2026-07-22 con `307/307` test unitari, `28/28` scenari Playwright, type-check e build di produzione superati. Il collaudo HA reale ha verificato Light, Switch, Media Player e perdita fisica della connessione; Climate avanzato, Cover e Vacuum restano nella matrice hardware rinviata per assenza di entita reali compatibili. La macchina a stati condivisa `connected / reconnecting / offline / reauth_required / disconnected_by_user` dispone di watchdog WebSocket e panel bridge, ultimo snapshot conservato come dato non aggiornato, UI di recupero distinta e blocco centrale dei comandi quando la connessione reale non e affidabile. `useDeviceCommandCoordinator` gestisce `sending / awaiting_confirmation / confirmed / error / rollback`, timeout, perdita connessione e sostituzione sicura dei comandi concorrenti. Il coordinatore copre Light, Switch, Climate, Cover, Alarm, Lock, Media Player e Vacuum. Le regolazioni continue separano l'anteprima locale dal valore confermato; i comandi momentanei senza stato osservabile, come flash, cambio traccia, locate e PTZ, vengono confermati esplicitamente dalla risposta del servizio. Media e Vacuum espongono un feedback di attesa discreto. Gli script scena mantengono il proprio osservatore di esecuzione, mentre i servizi scena usano gia la risposta esplicita del servizio.

Audit dati Demo/Reale completato il 2026-08-28: fixture iniziali e catalogo Demo sono centralizzati e non vengono caricati nel runtime reale; una casa senza layout o registri HA resta vuota, Rooms non inventa stanze, vecchie card `mock` vengono migrate alla sorgente `ha` e i fallback locali di Climate, Alarm, Light, Camera, Cover e Vacuum sono confinati alla Demo esplicita. Security marca i soli eventi dimostrativi e Consumi dichiara chiaramente le parti ancora in anteprima. L'affidabilita autonoma di Irrigazione resta assegnata al blocco post-beta `Domus Core Irrigation` con backend autorevole.

Azioni:

- separare esplicitamente modalita Demo e modalita Reale;
- non iniettare mock automaticamente quando una connessione reale cade;
- mostrare ultimo aggiornamento, stato stale, offline e unavailable in modo distinto;
- aggiungere heartbeat/watchdog alla connessione WebSocket e al panel bridge;
- creare un `DeviceCommandCoordinator` condiviso;
- standardizzare il flusso `idle -> sending -> awaiting confirmation -> confirmed/error/rollback`;
- impedire comandi quando il dato o la connessione non sono affidabili;
- applicare timeout, conferma tramite nuovo stato HA e rollback coerenti a tutte le card.

Done quando:

- nessun mock puo essere confuso con un'entita reale;
- la perdita della connessione viene rilevata e mostrata;
- ogni comando ha feedback e risultato verificabile;
- i timeout non lasciano una card in uno stato visivo falso.

### P5 - Editor, griglia e persistenza

Priorita: P0/P1.

Stato: completato per lo scope beta il 2026-07-28. I primi tre blocchi di persistenza ed editor sono stati completati e collaudati manualmente tra il 2026-07-22 e il 2026-07-23. Il salvataggio restituisce un esito esplicito, mostra `Salvataggio`, `Salvato` o l'errore specifico e impedisce l'uscita dall'editor quando la scrittura finale fallisce. La baseline di recupero viene creata entrando in Edit Mode, eliminata dopo un'uscita regolare e proposta tramite dialog dopo una sessione interrotta; snapshot Demo e Reale sono separati ed esclusi da backup e sync. La cronologia transazionale fino a 50 operazioni copre drag, resize, aggiunta, rimozione, configurazione e override responsive di card e sezioni. Gli aggiornamenti live HA non entrano nella cronologia, le regolazioni continue vengono accorpate e sono disponibili pulsanti accessibili e scorciatoie `Ctrl/Cmd+Z`, `Ctrl+Y` e `Ctrl/Cmd+Shift+Z`. Canvas e stack ricevono una revisione autorevole dopo undo/redo, evitando che la cache runtime della griglia rimandi l'aggiornamento visivo fino al refresh. Il quarto blocco introduce anteprime reali misurate senza trasformazioni CSS: su desktop sono disponibili `Auto`, `Desktop`, `Tablet`, `Verticale` e `Mobile`; su tablet soltanto `Auto`, MD, SM e XS; su smartphone il selettore non viene mostrato e si modifica direttamente il layout effettivo. Il breakpoint visualizzato e sempre lo stesso configurato dal Builder e modificato tramite drag. Su desktop anteprima, Undo, Redo e stato di salvataggio condividono un'unica barra inferiore; su tablet e smartphone la cronologia resta in alto per evitare compressioni.

Il collaudo geometrico finale copre XS, SM, MD, XL e 2XL, apertura reale del Builder, testi lunghi, stack a piu righe, cambio della larghezza interna senza resize della finestra e larghezze equivalenti allo zoom browser 80%, 100%, 125% e 150%. Il nuovo test attende la stabilizzazione asincrona del reflow e fallisce se card o sezioni restano fuori dal canvas. Gli `8/8` E2E dedicati a griglia e stack e il gate complessivo con `432/432` test unitari su 110 file e `32/32` E2E risultano verdi. Le ulteriori migrazioni a container query restano intenzionalmente in pausa e saranno riprese dopo la prima beta.

Il quinto blocco del registry e stato completato il 2026-07-23 per tutte le famiglie: `Sensor`, `Light`, `Switch`, `Climate`, `Alarm`, `Lock`, `Cover`, `Camera`, `Media`, `Vacuum` e `Members`. Opzioni e target del Builder, span predefiniti per breakpoint, risoluzione della variante a griglia e in pixel, hysteresis Sensor, auto-espansione Light e identita dello skeleton provengono dal card capability registry. Switch mantiene le composizioni responsive di Light senza ereditarne l'espansione automatica; Climate e Alarm mappano la nuova variante Mini sulla loro composizione compatta sicura; Lock e Cover mantengono i target stretti specifici per mobile; Camera, Media e Vacuum preservano lo spazio aggiuntivo richiesto da preview, controlli e mappe. Il registry e ora esaustivo: aggiungere una nuova `WidgetKind` senza capability genera un errore TypeScript. Il resolver legacy e i fallback runtime sono stati rimossi; le API specifiche usate dalle card restano soltanto come wrapper compatibili verso la stessa fonte. Type-check, suite unitaria completa e build di produzione risultano superati.

La seconda fase e iniziata il 27 luglio 2026: ogni capability espone ora esattamente tre varianti semantiche `mini`, `standard` ed `expanded`, utilizzate dal Builder per etichette, target e stato attivo. Le precedenti composizioni `compact` e `full` restano temporaneamente densita interne: `compact` viene assorbita dalla variante pubblica appropriata in base alla famiglia, mentre `full` corrisponde a `expanded`. Gli skeleton ricevono ancora la composizione interna effettiva, per mostrare cio che la card renderizzera davvero. Il formato quotidiano resta proporzionato: Light e Switch mantengono 2x1, Lock 2x2 e Cover mobile 1x2; l'espansione automatica Light continua a funzionare. Il contratto automatico impedisce a una capability di esporre un insieme diverso dalle tre varianti previste. Type-check, `396/396` test unitari, build, budget, audit policy e `29/29` E2E risultano verdi.

Il primo passo della migrazione container-owned e stato completato il 27 luglio 2026 sulla card Sensor. La vista rende sempre gli stessi slot e non riceve piu una variante visuale da React: composizione, elementi visibili e orientamento dipendono esclusivamente dalla dimensione effettiva del container. Il resolver in pixel resta temporaneamente soltanto per comunicare le metriche al Builder. Un contratto automatico verifica le cinque soglie orizzontali e verticali, la presenza del size container e l'assenza del vecchio attributo `data-sensor-variant`. I quattro test duplicati delle varianti JS sono stati sostituiti da questo contratto architetturale; per questo il conteggio passa a `395/395` test su 99 file senza ridurre la copertura. Type-check, build, budget, audit policy e `29/29` E2E risultano verdi.

Anche Light e ora container-owned: React non le assegna piu `compact`, `standard` o `full` per modificarne l'aspetto. Le cinque soglie della dimensione reale governano composizione, controlli, dettagli, spaziatura e curvatura della superficie. Stato acceso/spento, modalita luminosita/RGB e disponibilita dei dettagli restano attributi funzionali indipendenti dalla geometria. L'auto-espansione non viene rimossa: il registry continua a decidere lo span spento/acceso, mentre la card decide autonomamente cosa mostrare nello spazio ricevuto. La selezione e la curvatura adattiva sono state spostate sulla superficie discendente, evitando di tentare di ridisegnare il query container stesso. Lo stesso adeguamento e stato applicato a Sensor. Il nuovo contratto automatico porta il gate a `397/397` test unitari su 100 file; build, budget, audit policy e `29/29` E2E sono verdi.

Switch completa il primo gruppo container-owned. Tutti i prefissi visuali `data-switch-variant` sono stati eliminati: le soglie reali controllano disposizione, stato compatto, consumo, dimensione dell'icona e curvatura. La cascata ripristina esplicitamente gli elementi Standard quando la card supera le soglie compatte, evitando eredita visuali indesiderate. Stato acceso/spento, pending e disponibilita dei consumi restano attributi funzionali. Il registry conferma che Switch condivide i target geometrici di Light senza ereditarne l'auto-espansione. Il contratto automatico porta il gate a `399/399` test unitari su 101 file; build, budget, audit policy e `29/29` E2E sono verdi.

Post-beta: Greeting e `GreetingWeatherCard` restano nella coda della migrazione container-owned. Il titolo deve continuare a usare la scala globale `dashboard-page-title`, identica tra Home, Rooms, Security e le altre route: l'altezza della sezione non deve ridurne la dimensione. Le container query governeranno invece composizione interna, numero di righe del riepilogo, spaziatura e passaggio del meteo tra chip e card previsioni in base allo spazio effettivo. La migrazione dovra rimuovere le decisioni visuali basate su `useCardSize`, sulla prop `compact` e sulla media query viewport `min-[996px]` dalla composizione Greeting, mantenendo React responsabile soltanto dei dati e delle capability.

Prossimo gruppo dopo la pausa: Climate e Alarm, che richiedono una migrazione piu prudente per overlay, controlli modali e requisiti minimi di sicurezza. Solo dopo il collaudo anti-clipping di tutte le famiglie le etichette legacy `compact/full` potranno essere rimosse anche dai resolver interni e dagli skeleton.

Azioni:

- eliminare clipping con inspector aperto su 2XL, XL, MD, SM e XS;
- aggiungere preview viewport `Auto`, `Desktop`, `Tablet`, `Mobile` senza cambiare accidentalmente il breakpoint modificato;
- testare zoom browser 80%, 100%, 125% e 150%;
- unificare il resolver delle varianti card e applicare hysteresis a tutte le famiglie;
- centralizzare constraint, span minimi e composizioni in un card capability registry;
- aggiungere undo/redo per spostamenti, resize, aggiunta, rimozione e modifica configurazione;
- mostrare `Salvataggio`, `Salvato` ed eventuale errore di storage;
- evitare che `localStorage` fallisca silenziosamente;
- introdurre snapshot di recupero e gestione dei conflitti tra layout locali/sincronizzati.
- aggiungere un contratto automatico che vieti il ritorno di resolver visuali JS e test geometrici per XS, SM, MD, XL, Builder aperto e testi lunghi.

Post-beta:

- migrare Greeting e Greeting+Meteo a container query CSS, mantenendo invariata la scala globale del titolo;
- definire soglie per Greeting sola e unificata che controllino riepilogo, overflow, spaziatura e presentazione meteo senza dipendere dal viewport.

Done quando:

- nessuna card o stack viene tagliata;
- apertura/chiusura del builder non modifica il layout inaspettatamente;
- ogni operazione distruttiva e annullabile o confermata;
- un errore di persistenza e visibile all'utente.

La composizione Greeting basata esclusivamente sul proprio container e un criterio post-beta e non blocca questo gate.

### P6 - Architettura e performance

Priorita: P1.

Avanzamento 27 luglio 2026:

- avviato il refactoring incrementale di `MainBoard` senza modificare il contratto UI;
- estratti navigazione e risoluzione route in `mainBoardNavigation`;
- estratti modello camera/PTZ/timeline/device context in `mainBoardCameraModel`;
- estratti metadati e cronologia sensor in `mainBoardSensorModel`;
- estratte utility pure condivise e mock Climate;
- estratti capability, normalizzazione color mode e payload HA Light in `mainBoardLightModel`;
- introdotto `useLightSwitchPendingController` per timer optimistic, riconciliazione delle conferme HA, scadenza e reset alla disconnessione;
- introdotto `useLightSwitchCommands` per toggle, luminosita con debounce, colore, temperatura colore, bianco, effetti, flash, rollback e fallback Demo;
- introdotto `useClimateCoverPendingController` per stato ottimistico, riconciliazione ritardata Climate, posizione/lamelle Cover, timeout e reset offline;
- introdotto `useClimateCoverCommandTransport` per accorpare i comandi continui Climate e uniformare invio, conferma e rollback dei comandi Cover;
- estratti modello, capability, payload e controller dei comandi Vacuum in `mainBoardVacuumModel` e `useVacuumCommands`;
- estratti modello e controller dei comandi Media in `mainBoardMediaModel` e `useMediaCommands`;
- `MainBoard.tsx` ridotto da 554.089 byte / 15.043 righe a 400.423 byte / 10.876 righe;
- eliminato l'avviso Babel di deottimizzazione del file oltre 500 KB;
- audit manuale delle estrazioni recenti completato: Media e Vacuum preservano coordinamento, conferme HA, fallback Demo e cleanup dei timer; nessuna regressione nell'ordine degli hook;
- corretta l'unica regressione rilevata in `SettingsDashboard`, sostituendo una superficie bianca hard-coded con il token semantico del tema;
- type-check, `396/396` test unitari, build, budget bundle, audit policy e `29/29` E2E verdi;
- React Router 8.3.0 e attivo in modalita SPA dichiarativa; l'eccezione RSC e stata rimossa e l'audit non contiene whitelist;
- resta aperto il warning Rollup sui chunk oltre 500 KB: il passo successivo e separare controller dei comandi, layout/persistenza e introdurre lazy loading reale.

Avanzamento 28 luglio 2026:

- introdotti confini `React.lazy` locali per Consumi, Automazioni, App Gallery, Rooms, Security, Settings e relativo editor Consumi;
- `ProfilePanel` non entra piu nel grafo iniziale della Home e viene importato soltanto quando il profilo e realmente aperto;
- ogni workspace secondario usa una propria `Suspense` locale con `GlassLoader`, evitando di sostituire l'intera dashboard durante il caricamento;
- il chunk Home scende da circa 1,86 MB a 1,33 MB raw e da circa 505 KB a 370 KB gzip;
- le route estratte producono chunk indipendenti compresi tra circa 38 KB e 133 KB raw; Profilo produce un chunk di circa 66 KB raw;
- aggiunto un contratto automatico che impedisce il ritorno degli import statici in `MainBoard`;
- aggiunto uno smoke E2E che apre su richiesta Rooms, Security, Consumi, Automazioni, App Gallery, Settings e Profilo mantenendo la shell della dashboard;
- completato il secondo confine lazy: `RightSidebarManager` viene importato soltanto entrando in Edit Mode o aprendo il pannello contestuale di una card;
- un placeholder leggero mantiene identiche larghezza e geometria della sidebar desktop prima del primo utilizzo; su mobile il caricamento mostra soltanto il loader senza contenitore;
- Builder e pannelli contestuali producono un chunk autonomo di circa 363 KB raw / 85 KB gzip, mentre il chunk Home scende ulteriormente a circa 546 KB raw / 161 KB gzip;
- completato il terzo confine lazy per guida iniziale, autenticazione rapida Alarm/Lock e recupero dashboard, ora distribuiti in chunk autonomi da circa 12,2 KB, 9,5 KB e 1,9 KB raw;
- il modale di autenticazione conserva il montaggio dopo il primo utilizzo, cosi la chiusura animata e lo stato del fallback PIN non vengono interrotti dal code splitting;
- introdotto `DeferredGlassLoader`: le attese inferiori a 200 ms restano visivamente silenziose, mentre i fallback sensibili bloccano subito l'interazione senza mostrare prematuramente spinner o scrim;
- desktop, mobile e tastiera precaricano workspace e Profilo su hover, primo tocco o focus; Edit Mode e pannelli contestuali vengono anticipati appena l'utente manifesta l'intenzione o seleziona una card;
- il chunk Home resta sotto la soglia Rollup dei 500 KB a circa 499 KB raw / 146 KB gzip; il miglioramento cumulativo rispetto alla baseline e di circa il 73% raw e il 71% gzip;
- aggiunti test del placeholder, contratto lazy e collaudo E2E di Edit Mode e pannelli contestuali;
- esteso il contratto lazy agli overlay rari e confermati gli smoke test della guida su desktop e mobile;
- release gate verde con `449/449` test unitari su 116 file, build, budget, audit e `35/35` E2E.

Avanzamento 29 luglio 2026:

- completata la nuova architettura informativa di Profilo e Impostazioni: preferenze personali e del dispositivo restano nel Profilo, mentre casa, accessi, connessione e dati condivisi appartengono alle Impostazioni;
- introdotta una dashboard Settings a riquadri responsive, con anteprime contestuali e una sezione Casa priva di riepiloghi duplicati;
- aggiunto il catalogo Entita con ricerca, filtri per dominio, disponibilita e stanza, conteggi e paginazione;
- introdotti componenti condivisi `GlassSearchFilterBar`, `GlassBottomSheet` e `NestedPageHeader`, riutilizzati dalle esperienze nidificate;
- uniformato l'header delle pagine secondarie con ritorno, titolo e descrizione sulla stessa riga e transizione progressiva durante lo scroll;
- la bottom bar mobile viene ora nascosta su tutte le route nidificate, anche quando la navigazione e gestita internamente da iframe o panel Home Assistant;
- avviata la separazione del pannello amministrativo legacy: la Connessione Home Assistant e ora una feature autonoma con stato locale limitato a draft/visibilita del token ed errore OAuth;
- URL, token, persistenza, stato connessione e azioni restano controllati dall'orchestratore e continuano a usare le policy centralizzate esistenti;
- la feature Connessione viene caricata soltanto quando viene aperta la relativa sezione Settings e produce un chunk dedicato di circa 5,7 KB raw / 2,1 KB gzip;
- aggiunti test per connessione manuale, token ricordato non reinserito in chiaro, panel bridge e fallimento OAuth, oltre a un contratto che preserva il confine lazy;
- completata anche l'estrazione di Dati e backup: capability e gate sensibile vengono ricontrollati dentro la feature prima di download, restore e reset, senza affidarsi alla sola visibilita dei pulsanti;
- restore mantiene la conferma locale prima di leggere il file, mentre il reset richiede ancora la frase `RESET`; errori e stato busy restano confinati nel modulo;
- la feature Dati e backup produce un chunk dedicato di circa 7,6 KB raw / 2,6 KB gzip e il chunk amministrativo legacy scende a circa 61,8 KB raw / 19,1 KB gzip;
- `ProfilePanel.tsx` scende ulteriormente a circa 92,7 KB e 2.247 righe, rispetto ai circa 124 KB e 2.871 righe precedenti al refactoring;
- test dedicati verificano fail-closed per utenti limitati, download controllato, conferma restore e frase `RESET`; TypeScript, build e bundle budget restano verdi;
- completata l'estrazione di Casa e accessi con sottoviste autonome per membri, accessi temporanei e condivisione della configurazione;
- normalizzazione membri e contratto JSON role-scoped sono stati spostati in un modello puro coperto da test; import/export ricontrollano `edit_dashboard` dentro la feature;
- auditando il vecchio flusso ospiti e emerso che QR, nonce e scadenza erano soltanto parametri URL senza verifica o revoca server: il generatore e il parser `guest=1` sono stati rimossi e la beta mostra esplicitamente la funzione come non ancora disponibile;
- gli accessi temporanei verranno riattivati soltanto con credenziali verificabili e revocabili da Home Assistant o da un backend dedicato;
- `ProfilePanel.tsx` scende a circa 40,7 KB e 971 righe; il relativo chunk scende a circa 26 KB raw / 7,5 KB gzip, mentre Casa e accessi produce un chunk dedicato di circa 13,1 KB raw / 4,5 KB gzip;
- CSS di produzione ridotto di circa 3 KB grazie alla rimozione delle dipendenze visuali non piu necessarie nel pannello legacy;
- test dedicati coprono deduplicazione membri, ruoli, payload di condivisione, fail-closed, sottoviste e assenza di accessi ospite simulati; TypeScript, build e budget restano verdi;
- eliminato definitivamente il contenitore ibrido `ProfilePanel`: Profilo personale usa `ModernProfilePage`, mentre le sole funzioni amministrative usano `SettingsManagementPanel`;
- creati registry, shell, navigazione e tipi separati per Profilo e Impostazioni, rimuovendo dipendenze e naming ambigui;
- il nuovo contenitore Settings misura circa 8,8 KB e 287 righe, rispetto ai circa 40,7 KB e 971 righe dell'ultimo pannello legacy;
- il chunk amministrativo scende da circa 26 KB raw / 7,5 KB gzip a circa 11,6 KB raw / 3,7 KB gzip; Casa/accessi, Connessione e Dati/backup restano chunk indipendenti caricati solo quando servono;
- rimossa dalla beta anche la dipendenza QR non utilizzata: la funzione tornera nel post-beta soltanto con credenziali verificabili, revoca e scadenza server-side;
- collaudo conclusivo: TypeScript, build, budget e audit verdi; `494/494` test unitari passano e tutti i `36` scenari E2E risultano validati.

#### Refactoring pagina Profilo

Stato: completato il 29 luglio 2026. Profilo personale e amministrazione della casa non condividono piu un contenitore ibrido.

Motivazione: `ProfilePanel.tsx` concentrava circa 124 KB e 2.871 righe, sei sezioni (`Tema`, `Spostamenti`, `Membri`, `Sicurezza`, `Home Assistant`, `Configurazione`), navigazione responsive, gestione account, permessi, passkey, connessione, sincronizzazione, backup e reset. Il comportamento era funzionale, ma la concentrazione aumentava il rischio di regressioni e caricava codice non necessario quando veniva aperta una sola sezione.

Risultato:

- introdotto un registry autorevole per sezioni ammesse, default, copy e icone delle modalita Profilo/Impostazioni;
- estratte `ProfilePanelShell` e `ProfileSectionNavigation`, riducendo `ProfilePanel.tsx` a circa 113 KB e 2.644 righe;
- separata definitivamente l'identita e le preferenze locali dalla configurazione condivisa della casa: il Profilo non contiene piu membri, token, backup o reset;
- introdotta `ModernProfilePage`, una route fullscreen responsive con identita, ruolo, casa associata, dispositivi personali, presenza, cronologia, sicurezza e preferenze visive del browser corrente;
- mantenuta la conferma dispositivo nel Profilo perche legata all'utente e al browser, preservando WebAuthn, audit e autorita finale Home Assistant;
- mantenuto nel Profilo il selettore inline `Sistema / Chiaro / Scuro`; i temi colorati sono disponibili tramite una riga che apre una pagina nidificata dedicata;
- le preferenze visive continuano a usare lo storage locale del dispositivo e non modificano la configurazione condivisa della casa;
- aggiunte in Impostazioni le destinazioni `Casa e accessi`, `Connessioni` e `Dati e backup`;
- spostata l'apertura della gestione membri dalla card Membri a `Impostazioni > Casa e accessi`;
- riutilizzato temporaneamente il pannello amministrativo esistente come dettaglio delle Impostazioni, evitando duplicazioni e perdita di funzioni;
- eliminato il fallback avatar remoto dalla nuova pagina personale, sostituito da iniziali locali;
- preservati i gate esistenti per permessi, passkey, connessione, backup, restore e reset;
- aggiunti test unitari della pagina personale ed E2E per Profilo desktop/mobile e disponibilita delle funzioni amministrative nelle Impostazioni;
- il Profilo personale produce un chunk dedicato di circa 17,3 KB raw / 5 KB gzip; il pannello amministrativo da circa 67,6 KB viene caricato soltanto aprendo un dettaglio delle Impostazioni;
- collaudo completato con `453/453` test unitari, build e budget verdi; la suite E2E completa resta verde su `36/36` scenari e il delta finale Profilo/temi e lazy loading e stato rieseguito su `4/4` scenari mirati.

Intervento conclusivo completato:

- rimosso il vecchio `ProfilePanel` e sostituito con `SettingsManagementPanel`, dedicato esclusivamente a Casa e accessi, Home Assistant e Dati/backup;
- estratti `SettingsManagementShell`, `SettingsSectionNavigation` e `settingsManagementRegistry`, senza sezioni personali o modalita ibride;
- spostati i tipi della cronologia personale in `profileModels`, evitando che Profilo dipenda dal bundle Settings;
- mantenuti i controlli di capability e i gate sensibili dentro le singole feature, non soltanto nella navigazione;
- mantenuto il Profilo come route personale fullscreen su ogni viewport e il list-detail soltanto per le Impostazioni complesse;
- mantenuto il caricamento differito indipendente per Casa/accessi, Connessione e Dati/backup;
- aggiunti contratti automatici per i confini lazy, registry fail-closed, navigazione, deep-link, viewport, permessi e azioni sensibili;
- rinviato il QR ospiti al post-beta con un requisito esplicito di autorizzazione server-side verificabile e revocabile.

Done quando:

- il vecchio `ProfilePanel` non esiste piu come contenitore ibrido ed e sostituito da moduli Settings con responsabilita singola;
- aprire Profilo non carica sezioni pesanti non visitate;
- mobile, tablet e desktop condividono gli stessi dati e le stesse policy senza markup divergente;
- connessione, passkey, backup, restore e reset mantengono i gate di sicurezza esistenti;
- Profilo e Impostazioni non espongono voci duplicate.

Azioni:

- estrarre progressivamente da `MainBoard` navigazione, connessione, comandi, sicurezza, persistenza e timeline;
- creare provider o controller separati per ogni responsabilita;
- creare adapter per tipo di dispositivo e un registry unico card/capability/layout/skeleton;
- dividere `GridCanvas`, `StackGrid` e `RightSidebarManager` in feature piu piccole;
- mantenere Profilo e Impostazioni in feature separate e impedire il ritorno di contenitori amministrativi ibridi;
- spostare Rooms, Security, Consumption, Automations, App Gallery, MapLibre e pannelli secondari dietro lazy loading;
- caricare cronologie e registry solo quando richiesti;
- misurare render, memoria e fluidita durante drag e aggiornamenti HA frequenti.

Done quando:

- la Home iniziale non carica funzioni secondarie;
- nessun componente orchestratore concentra migliaia di righe e decine di responsabilita;
- la navigazione e il drag restano fluidi su tablet di fascia media;
- il bundle rientra nel budget deciso.

### P7 - Accessibilita e design system

Priorita: P1.

Stato: baseline beta completata il 2026-07-30 e audit multipagina Light/Dark completato il 2026-08-03. Il documento dichiara lingua italiana, schema colore adattivo e colori browser coerenti con Light/Dark. `MotionConfig` e il fallback CSS rispettano globalmente `prefers-reduced-motion`; focus visibile, skip link, focus iniziale delle pagine nidificate e ritorno del focus sono uniformati. Modali, notifiche e drawer mobili mantengono il focus nel contenitore attivo e rendono inerti i controlli chiusi. I comandi principali mobili e le primitive condivise raggiungono il target touch da 44 px dove lo spazio lo consente. Rooms, Security, Consumi, Automazioni, App Library, Impostazioni e Profilo condividono ora il chrome semantico; anche le rispettive pagine nidificate vengono verificate automaticamente nei due temi e nei limiti del viewport mobile. Le visualizzazioni tecniche immersive mantengono superfici scure esplicite, indipendenti dal tema, per preservare il contrasto dei propri dati. Il gate completo del 2026-08-03 ha superato type-check, audit dipendenze, build, budget, `541/541` test unitari e `46/46` scenari Playwright.

Il Builder e ora utilizzabile anche senza trascinamento: frecce per spostare e `Maiuscole + frecce` per ridimensionare card e sezioni nel canvas e negli stack, con annuncio live di posizione, dimensione o limite raggiunto. Salvataggio, notifiche e feedback di editing espongono regioni `status`/`alert`. Un contratto automatico verifica lingua, metadati, reduced motion, skip link e supporto tastiera; un audit numerico blocca regressioni sotto WCAG AA per testo primario, secondario e terziario sui canvas Light/Dark. Il collaudo Playwright dedicato copre nomi accessibili, focus, target touch, drawer/notifiche, editing da tastiera e riduzione del movimento.

Azioni:

- [x] impostare correttamente lingua e metadati documento;
- [x] garantire target touch da almeno 44 px sui flussi primari;
- [x] completare focus visibile, focus order e ritorno del focus;
- [x] aggiungere keyboard reorder e resize nel builder;
- [x] annunciare a screen reader salvataggio, spostamento e risultato dei comandi;
- [x] estendere `prefers-reduced-motion` a tutta la dashboard;
- [x] verificare contrasto dei token testuali sui temi Light e Dark;
- [x] uniformare route principali e nidificate a superfici, testi e bordi semantici, con test Playwright dedicato;
- [x] consolidare i token semantici globali usati dai componenti condivisi;
- [x] riutilizzare primitive comuni per modali, bottom sheet, ricerca/filtri, header nidificati, pulsanti e stati di caricamento.

Done quando:

- i flussi principali sono utilizzabili senza mouse;
- non esistono nomi accessibili duplicati o controlli senza etichetta;
- i temi superano l'audit contrasto concordato;
- le card condividono lo stesso linguaggio visivo senza duplicazioni CSS evitabili.

#### P7.1 - Internazionalizzazione dell'interfaccia

Priorita: P1 per la crescita internazionale successiva alla prima beta pubblica.

Stato: infrastruttura e prima migrazione avviate il 2 settembre 2026. Le lingue supportate sono italiano, inglese e francese. Al primo accesso Domus UI usa la lingua comunicata da Home Assistant e, se non disponibile o non supportata, quella del browser; l'italiano resta il fallback finale. Il Profilo espone soltanto le lingue disponibili e una scelta esplicita viene salvata esclusivamente sul dispositivo corrente. Non esiste una voce `Auto`: l'automatismo opera solo finche l'utente non effettua una scelta manuale.

Regole:

- mantenere chiavi tipizzate e cataloghi completi per `it`, `en` e `fr`;
- non tradurre nomi di entita, stanze, persone, scene e altri contenuti forniti dall'utente o da Home Assistant;
- formattare numeri, date, orari e unita con `Intl` usando la lingua attiva;
- applicare subito il cambio lingua senza refresh;
- mantenere roadmap tecnica, checklist interne, note di audit e commenti operativi in italiano;
- non salvare la preferenza linguistica nel layout condiviso della casa o nei backup della dashboard.

Migrazione UI:

- [x] provider centrale, rilevamento HA/browser, persistenza locale e attributo `lang` dinamico;
- [x] selettore Profilo con Italiano, English e Français;
- [x] Profilo e shell di navigazione principale;
- [x] onboarding, setup, organizzazione e riconnessione;
- [ ] Home, card, Builder e pannelli contestuali;
- [x] Rooms;
- [ ] Security, Consumi e App Gallery;
- [ ] Impostazioni, supporto, notifiche e stati di errore;
- [ ] audit automatico delle stringhe UI residue e collaudo visuale nei tre cataloghi.

Checkpoint beta essenziale (2026-09-02): oltre al primo accesso sono tradotti nelle tre lingue il saluto dinamico della Home, il centro notifiche, la barra Undo/Redo, gli stati di salvataggio, le azioni principali dell'Edit Mode e il dialogo francese dell'integrazione Home Assistant. Le voci incomplete sopra restano aperte fino alla migrazione delle card e delle route avanzate.

Scope minimo della prima release multilingua: `/home`, `/rooms` e `/settings` devono essere complete end-to-end, incluse pagine nidificate, pannelli, popup, stati vuoti ed errori. Le route non ancora supportate non devono mostrare interfacce miste: quando la lingua attiva non è l'italiano useranno una pagina localizzata "disponibile prossimamente" finché la relativa migrazione non sarà conclusa.

Done quando:

- nessuna route pubblica mescola lingue diverse;
- tutte le chiavi esistono nei tre cataloghi e il type-check impedisce cataloghi incompleti;
- selezione esplicita, lingua HA, fallback browser e fallback italiano sono coperti da test;
- i testi lunghi inglesi e francesi non introducono clipping nei breakpoint supportati.

### P8 - Livello Domus UI

Priorita: P1 dopo la stabilizzazione.

Stato: in corso dal 2026-07-30. Il primo blocco `P8.1 - Centro Attenzione` è implementato come funzione di sistema esterna alla griglia configurabile. La fascia compatta appare soltanto in presenza di elementi e non modifica il layout durante l’Edit Mode; su mobile apre un bottom sheet, mentre da desktop condivide con le notifiche lo stesso pannello laterale glass flottante, senza ridimensionare il canvas.

Il motore tipizzato analizza soltanto gli stati realmente ricevuti da Home Assistant e considera perdite, fumo, gas, monossido, problemi di sicurezza, allarmi, serrature sbloccate o inceppate, aperture prolungate, connettività, batterie basse ed entità configurate ma assenti/non disponibili. Entità nascoste o disabilitate vengono escluse. I mock non possono generare avvisi reali: la Demo usa un set isolato, esplicitamente marcato come simulazione. Le azioni `Controlla` aprono la card correlata oppure, per problemi diagnostici, il dispositivo interessato senza inviare servizi HA. Gli avvisi non critici possono essere rimandati per un’ora, alla sera o al giorno successivo, oppure ignorati finché Home Assistant non segnala un nuovo stato; gli eventi critici restano sempre visibili. La pagina nidificata `Impostazioni > Avvisi e attenzione`, protetta dalle capability amministrative, contiene soltanto preferenze, categorie, soglie ed elementi nascosti; Demo e casa reale usano storage separati.

`P8.2 - Dispositivi` è integrato dentro `Impostazioni > Casa`, evitando un ulteriore riquadro principale e una quarta copia delle stesse informazioni. Un modello condiviso raggruppa Entity Registry e Device Registry, risolve batteria, connettività, segnale, aggiornamenti, disponibilità, stanza, card collegate e ultimo aggiornamento dati. La UI espone inventario filtrabile, riepilogo compatto e dettaglio nidificato per dispositivo. Non viene inventato un punteggio percentuale di salute e `last_updated` è presentato come ultimo aggiornamento dati, non come ultimo contatto fisico. Il Centro Attenzione riutilizza lo stesso modello per batteria e connettività; gli aggiornamenti vengono soltanto segnalati nel dettaglio dispositivo e restano installabili esclusivamente dal Centro Aggiornamenti di Sistema.

#### P8.3 - Rifinitura shell, notifiche ed editor

Priorita: P1 prima della prossima distribuzione controllata.

Stato: completato il 2026-08-06 per lo scope beta. La navigazione usa ora un unico modello canonico per route, icone e stato attivo su sidebar desktop, drawer, bottom bar e installazione panel/iframe. Il profilo usa un avatar condiviso con fallback deterministico e lo stato Home Assistant non dipende piu da immagini remote casuali. Il centro notifiche esistente e diventato un unico pannello responsive con filtri, conteggi, lettura esplicita, stati vuoti e righe compatte accessibili; l'apertura non marca piu automaticamente ogni elemento come letto. La persistenza tipizzata e l'integrazione selettiva delle notifiche Home Assistant restano nel blocco post-beta dedicato.

L'Edit Mode espone Catalogo, cronologia, stato del salvataggio e uscita in una barra coerente con il breakpoint. Su desktop il Catalogo entra nella barra di anteprima; su mobile i controlli condividono un'unica toolbar touch-friendly. Eliminato il grande pulsante flottante duplicato dal canvas. Il catalogo riutilizza la ricerca condivisa, supporta il caso search-only e usa superfici e colori semantici. Builder, toolbar e catalogo continuano a rispettare capability, bozza transazionale e sincronizzazione Home Assistant.

Collaudo: `npm run release:gate` verde il 2026-08-06, inclusi type-check, suite unit completa, build, budget, audit dipendenze e `50/50` scenari Playwright. Rimangono warning non bloccanti gia tracciati in P6 per il peso del CSS e del bundle complessivo.

1. **Sidebar sinistra e navigazione mobile**
   - uniformare gerarchia, spaziature, stato attivo, indicatori e comportamento tra desktop, tablet, smartphone e panel iframe;
   - verificare safe area, target touch, drawer, bottom bar, label, tooltip e transizioni senza duplicare la configurazione delle route;
   - mantenere il chrome responsive e coerente con i temi Light/Dark e con le superfici glass condivise.
2. **Notifiche e feedback operativi**
   - sistemare presentazione, priorita, deduplicazione, stato letto e azioni delle notifiche gia disponibili;
   - distinguere chiaramente snackbar effimeri, Centro Attenzione, notifiche persistenti e dialog di sicurezza;
   - unificare l'esperienza responsive e impedire che messaggi ripetuti, mock o tecnici disturbino la Home.
3. **Edit Mode, barra strumenti e catalogo**
   - riorganizzare la toolbar per rendere evidenti salvataggio, annullamento/ripristino, anteprima breakpoint, catalogo e uscita;
   - ottimizzare il catalogo per desktop e mobile, inclusi ricerca, filtri, destinazione canvas/stack, stati vuoti e conferme;
   - verificare che pannello Builder, catalogo e barra non comprimano o coprano il canvas e che restino coerenti con permessi, bozze e sincronizzazione HA.

Done quando:

- la navigazione comunica sempre route e stato attivi su ogni installazione e breakpoint;
- notifiche e feedback hanno un'unica gerarchia comprensibile e non ridondante;
- l'intero flusso Edit Mode, dall'apertura al salvataggio finale, e chiaro e utilizzabile con touch, mouse e tastiera.

Funzioni:

1. `Home Summary` adattivo con stato generale, meteo e azioni rilevanti.
2. `Centro Attenzione` per porte aperte, perdite, batterie basse, offline, sicurezza e anomalie di consumo.
3. Timeline unificata della casa con filtri per stanza, persona e dispositivo.
4. Undo rapido delle azioni recenti e delle scene.
5. [x] Inventario `Dispositivi` health-aware con batteria, connessione, disponibilità, firmware e problemi di configurazione, senza duplicare Entità, Centro Attenzione o Sistema.
6. Layout personali e pubblicazione controllata per casa, ruolo, utente e profilo dispositivo, inclusi tablet a muro e modalita ospite.
7. Ricerca globale e command palette condivisa con l'assistente vocale.
8. Azioni contestuali `Crea automazione da qui` nei pannelli dispositivo.
9. Suggerimenti contestuali basati su ora, presenza e stato, mantenendo privacy e controllo locale.
10. Collegamento di nuovi dispositivi e condivisione di template tramite QR sicuri, distinti dagli accessi ospite.
11. Cronologia versioni della configurazione con anteprima, confronto e rollback amministrativo.

Done quando:

- la Home non e solo una griglia di controlli, ma comunica priorita e stato della casa;
- le informazioni importanti emergono senza aprire singole card;
- personalizzazione e suggerimenti restano spiegabili e disattivabili.

### P9 - Distribuzione e supporto commerciale

Priorita: P1/P2.

#### Gate identita e presentazione pubblica

Stato: nome pubblico scelto il 31 agosto 2026; asset locali conformi alla policy Home Assistant 2026.3. La submission centralizzata e stata chiusa perché non e più richiesta per le custom integration.

Architettura del marchio:

- **Domus UI**: prodotto pubblico attuale, dashboard e builder per Home Assistant;
- **Domus Core**: nome riservato al futuro motore server-side per scheduler, watchdog, automazioni e servizi autorevoli;
- **Domus OS**: nome riservato a un eventuale ecosistema autonomo futuro e non utilizzabile finché il prodotto non costituisce realmente una piattaforma operativa completa.

- [x] nome pubblico definitivo: **Domus UI**, aderente al ruolo di interfaccia e builder senza presentare il prodotto come un sistema operativo;
- mantenere inizialmente `domusos` come dominio tecnico Home Assistant e namespace di storage, anche se cambia il nome visuale, per non interrompere installazioni, aggiornamenti e configurazioni esistenti;
- [x] completate icone PNG 256/512 px nel pacchetto; la [submission di verifica](https://github.com/home-assistant/brands/pull/11076) ha confermato che da Home Assistant 2026.3 le custom integration forniscono direttamente i propri asset;
- [x] aggiornati nome, descrizione e topic GitHub usati dalla scheda HACS;
- [x] completato README con hero, screenshot responsive, badge, matrice funzionale e limiti della beta;
- eseguire un controllo visuale finale Light/Dark sulle route principali a 390, 820, 1180 e 1920 px;
- non lasciare controlli interattivi senza un comportamento reale: rimuoverli oppure marcarli chiaramente come `Prossimamente`.

Stato: la diagnostica per il supporto è ora scaricabile esplicitamente da `Impostazioni > Avanzate`. Il report contiene esclusivamente versione applicativa, modalità runtime, stato connessione, viewport e conteggi aggregati di registri, domini, widget e Device Health. Non legge il localStorage e non include URL Home Assistant, token, PIN, credential WebAuthn, identificativi, nomi, stanze, coordinate o valori delle entità. Il 25 agosto 2026 sono stati aggiunti integrazione HACS con Config Flow, pacchetto `domusos.zip`, validazione dedicata e workflow di pubblicazione GitHub Release. Il panel bridge manuale resta solo un percorso legacy interno.

Per la prima beta il Costruttore Automazioni resta esplicitamente in anteprima: la route mostra uno stato `Prossimamente` coerente con Light/Dark, mentre il workspace incompleto non viene montato e non effettua letture o salvataggi. L'implementazione esistente resta dietro un unico release flag e verrà riattivata dopo la sua ristrutturazione.

Azioni:

- [x] integrazione HACS con registrazione automatica di panel e frontend;
- [x] pacchetto release ZIP e checksum riproducibili;
- [x] README GitHub con screenshot, matrice di disponibilità e installazione;
- [ ] collaudo installazione, aggiornamento e rollback HACS su HA reale;
- app ufficiale come secondo canale futuro;
- landing page, tabella metodi di installazione e pagina Security & Privacy;
- changelog, versionamento, procedura di aggiornamento e rollback;
- [x] centro Supporto e feedback nativo, Issue Form guidato, Discussions e segnalazione privata di sicurezza;
- [x] diagnostica esportabile senza segreti, nomi o stati della casa;
- matrice pubblica di card, capability e limitazioni supportate.

Done quando:

- un utente nuovo puo installare, collegare HA, creare una dashboard e aggiornare il prodotto seguendo la documentazione;
- il supporto puo ricevere una diagnostica utile senza dati sensibili;
- promesse commerciali e compatibilita reale coincidono.

### Blocco pre-beta - Persistenza autorevole Home Assistant tra dispositivi

Stato: promosso a requisito bloccante pre-beta il 4 agosto 2026. Completati il
documento condiviso versionato, il contratto `DashboardConfigurationRepository`,
l'adapter `frontend/*_system_data`, la cache locale non autorevole e il
collegamento load/autosave della `/home`. Il layout reale viene marcato come
salvato soltanto dopo la rilettura di conferma da Home Assistant; Demo resta
isolata. Restano migrazione guidata, configurazione condivisa di Security/Rooms,
conflitti interattivi e collaudo multidispositivo.

Aggiornamento 25 agosto 2026: il `Reset totale` non si limita piu al browser.
Con conferma sensibile e frase `RESET`, elimina prima la cronologia delle
revisioni e poi il documento condiviso nello storage Home Assistant, verifica
entrambi tramite rilettura e soltanto dopo pulisce cache, preferenze e segreti
locali. Durante l'operazione una schermata bloccante comunica l'avanzamento; se
Home Assistant non conferma la cancellazione, i dati locali restano intatti e
l'utente riceve un errore esplicito.

Aggiornamento 25 agosto 2026: il reset pubblica inoltre un tombstone condiviso
prima di eliminare layout e cronologia. Ogni altro client controlla insieme il
documento e questo marcatore sia all'avvio sia nel polling: se la configurazione
e vuota per un reset intenzionale, scarta cache, recovery, bozza e segreti delle
vecchie card e torna al benvenuto senza ripubblicare il layout obsoleto. Token
Home Assistant, passkey del dispositivo, tema e preferenze personali degli
altri client restano locali e non vengono cancellati. Il tombstone viene chiuso
e verificato sul server, quindi rimosso in modo best-effort soltanto dopo una
nuova configurazione confermata.

La configurazione corrente contiene gia sezioni, card e layout distinti `2xl / xl / lg / md / sm / xs`, ma viene salvata nel `localStorage` del singolo browser. La preview Mobile del Builder modifica correttamente `sm/xs`; la sincronizzazione automatica verso un telefono diverso arrivera tramite un aggiornamento successivo.

Intervento:

- completato: `DashboardConfigurationRepository` con Home Assistant come
  autorita e `localStorage` usato soltanto come cache/ripristino;
- salvare sul server un documento versionato contenente struttura condivisa, layout root e stack per tutti i breakpoint e override delle card;
- modificare dalla preview desktop soltanto il ramo responsive selezionato, senza creare una dashboard mobile separata;
- sul dispositivo reale scegliere automaticamente `2xl/xl/lg/md/sm/xs` dalla larghezza effettiva del canvas;
- usare identita e permessi Home Assistant, revisione, controllo conflitti e aggiornamenti atomici;
- usare il layout locale come cache/offline e mantenere Demo separata;
- escludere sempre token, PIN, passkey e codici widget;
- usare in beta lo storage frontend nativo di Home Assistant, protetto da
  identita Admin/Owner e allowlist del panel bridge; valutare una custom
  integration HACS soltanto per funzioni server avanzate future;
- mostrare una migrazione esplicita quando esiste soltanto il vecchio layout
  locale, senza trasferimenti o sovrascritture silenziose.

Done quando:

- un layout `xs/sm` modificato da desktop viene caricato automaticamente dallo smartphone dello stesso server HA;
- panel, Companion App e client esterno producono la stessa composizione per utente, layout e revisione;
- conflitti, offline e permessi insufficienti non causano perdita silenziosa delle modifiche;
- la sincronizzazione non contiene segreti locali.

### Aggiornamento post-beta - Pubblicazione, destinatari e condivisione configurazione

Stato: prime due fasi implementate il 5 agosto 2026. La cronologia conserva la
versione corrente e le quattro precedenti in uno store Home Assistant separato,
sanitizzato e validato anche dal panel bridge. Ogni salvataggio mette al sicuro
la revisione precedente; il rollback crea una nuova revisione crescente e non
sovrascrive la storia. La pagina `Impostazioni > Dati e backup > Versioni del
layout` mostra autore, data, origine e riepilogo strutturale delle modifiche. La
seconda fase mantiene per la beta l'ambito unico `Casa`: gli altri client
controllano la revisione su focus, ritorno in primo piano, ripresa della pagina,
ritorno online e ogni 120 secondi, anche sui browser mobile che sospendono i timer
in background. Una revisione remota viene applicata direttamente e senza refresh
fuori dall'Edit Mode; durante una bozza resta sospesa, compare nella barra
dell'editor e blocca qualsiasi salvataggio obsoleto. L'utente puo continuare a
modificare oppure scartare esplicitamente la bozza e applicare la nuova versione,
senza attivare il recupero di emergenza. Ogni pubblicazione include un
identificativo client opaco: il client che salva riconosce e registra la propria
revisione senza mostrarla come aggiornamento remoto, mentre lo stesso utente su
un altro dispositivo continua a riceverla normalmente. La verifica successiva
alla scrittura confronta anche
contenuto, autore e timestamp, quindi una revisione concorrente con lo stesso
numero non viene considerata confermata. La pubblicazione per destinatari, i
profili dispositivo e la condivisione tramite QR restano nelle fasi successive
di questo blocco.

#### Modello di pubblicazione

L'Edit Mode resta una sessione privata dell'editor: drag, resize, configurazioni
e bozze non devono essere visibili agli altri client. Soltanto `Salva ed esci`
crea una nuova revisione pubblicata e atomica.

Ogni revisione dovra dichiarare un ambito esplicito:

- `Casa`: configurazione condivisa con tutti gli utenti HA autorizzati a vedere
  la dashboard;
- `Ruolo o gruppo`: variante destinata, ad esempio, ad amministratori, membri o
  ospiti, soltanto quando esistera un'autorita server-side in grado di applicare
  realmente il filtro;
- `Utenti selezionati`: override nominali sopra il layout della casa;
- `Profilo dispositivo`: tablet a muro, desktop, telefono o postazione dedicata,
  senza confondere il profilo dispositivo con i breakpoint responsive;
- `Solo io su questo dispositivo`: preferenza locale esplicita, non presentata
  come configurazione condivisa e sempre ripristinabile.

Per la prima implementazione post-beta, l'ambito `Casa` resta il default. Le
preferenze personali vengono applicate come livello separato sopra la base
condivisa; non devono duplicare l'intero documento se basta memorizzare un
override. Chi non rientra nei destinatari continua a vedere l'ultima revisione
autorizzata, senza ricevere una dashboard vuota o parzialmente filtrata.

La pubblicazione dovra includere:

- riepilogo delle modifiche e destinatari prima del salvataggio;
- aggiornamento realtime degli altri client dopo la conferma server, con avviso
  discreto e senza interrompere un comando dispositivo in corso;
- possibilita di applicare subito la nuova revisione oppure rimandarla mentre
  l'utente sta interagendo;
- cronologia delle revisioni con autore, data, ambito, descrizione facoltativa,
  confronto strutturale e rollback;
- gestione esplicita del conflitto se due amministratori modificano la stessa
  revisione;
- audit privo di stati entita, PIN, token, passkey e altri segreti.

#### QR per collegare un dispositivo

Il QR di associazione non conterra il layout, token Home Assistant o credenziali.
Conterra soltanto un identificatore opaco, monouso e con scadenza breve che
permette al nuovo client di individuare la casa e iniziare il normale flusso di
autenticazione Home Assistant. Dopo l'accesso, il server verifica identita e
permessi e restituisce la revisione autorizzata per quel profilo.

Il flusso consigliato e:

1. da un client amministratore scegliere `Collega un dispositivo`;
2. scegliere il profilo proposto, ad esempio personale o tablet a muro;
3. generare un QR monouso valido pochi minuti;
4. scansionare dal nuovo dispositivo e autenticarsi con Home Assistant;
5. mostrare casa, profilo e permessi ottenuti prima della conferma finale;
6. revocare automaticamente il codice dopo uso, scadenza o annullamento.

#### QR per condividere un template

La condivisione tra case diverse sara un flusso separato e facoltativo. Il QR
puntera a un pacchetto temporaneo sanitizzato contenente soltanto struttura,
stili, tipi di card e layout responsive. Entity ID, device ID, nomi privati,
stanze, coordinate, URL, stati live e segreti non saranno inclusi. Il destinatario
vedra un'anteprima e usera un wizard per associare le proprie entita prima di
importare il template.

Il QR non e adatto a contenere direttamente l'intera configurazione: i documenti
possono superarne facilmente la capacita e diventerebbero leggibili da chiunque
fotografi il codice. Il payload dovra quindi vivere temporaneamente su Home
Assistant o su un servizio dedicato con cifratura, scadenza, revoca e download
monouso.

Funzioni collegate da valutare nello stesso blocco:

- template ufficiali e template personali versionati;
- anteprima e diff prima di importare o pubblicare;
- mapping assistito delle entita per dominio, device class, stanza e capability;
- profilo `tablet a muro` con controlli e route limitati;
- duplicazione di una configurazione come nuova variante senza alterare
  l'originale;
- link di handoff temporaneo per continuare la configurazione su un altro
  dispositivo;
- esportazione manuale firmata come alternativa offline al QR;
- rollback rapido all'ultima revisione stabile.

Done quando:

- una bozza non e mai visibile agli altri utenti prima della pubblicazione;
- ogni client riceve esclusivamente una revisione compresa nel proprio ambito;
- la revoca di un utente o dispositivo impedisce nuovi aggiornamenti senza
  cancellare le revisioni degli altri destinatari;
- nessun QR contiene segreti o dati identificativi della casa in chiaro;
- QR scaduti, revocati, riutilizzati o alterati vengono rifiutati;
- import e pubblicazione mostrano sempre anteprima, destinatari e conseguenze;
- test multiutente e multidispositivo coprono pubblicazione, conflitti, revoca,
  ripristino e perdita di connessione.

### Aggiornamento post-beta - Accessi ospite tramite QR verificato

Stato: pianificato dopo la prima beta pubblica; il vecchio QR basato su soli
parametri URL e stato rimosso perché non offriva un'autorizzazione reale.

Il QR conterrà esclusivamente un collegamento opaco e temporaneo. Non dovrà
mai includere token Home Assistant, PIN, ruoli, permessi o altri segreti
interpretabili dal client.

Intervento futuro:

- creazione consentita soltanto a Owner/Admin e protetta dalla conferma locale
  per le configurazioni sensibili;
- credenziale firmata o sessione server-side monouso, verificata da Home
  Assistant o da un backend dedicato;
- scadenza controllata server-side, revoca immediata, rotazione e impossibilità
  di estendere la validità modificando l'URL;
- ambito esplicito per casa, utente ospite, route, entità e servizi consentiti,
  mantenendo Home Assistant come autorità finale dei permessi;
- HTTPS obbligatorio fuori dalla LAN e nessun segreto in URL, cronologia,
  referrer, log, backup o sincronizzazione;
- rate limit e audit lato server per creazione, utilizzo, rifiuto e revoca;
- schermate chiare per QR scaduto, revocato, già utilizzato, offline o non
  riconosciuto, senza rivelare il motivo tecnico del rifiuto.

Done quando:

- un QR contraffatto, scaduto, riutilizzato o revocato non permette alcun
  accesso;
- copiare o alterare i parametri del link non amplia durata o permessi;
- ogni comando ospite viene nuovamente autorizzato dal server;
- la revoca è immediata e verificabile nell'audit;
- test automatici ed E2E coprono creazione, uso, scadenza, revoca, replay,
  offline e permessi insufficienti.

### Aggiornamento post-beta prioritario - Domus Core Irrigation

Stato: pianificato come primo intervento strutturale dopo la beta pubblica.
La UI Irrigazione, la configurazione condivisa, il calendario, i consumi e i
comandi supervisionati sono disponibili nella beta. La programmazione autonoma
non viene ancora presentata come motore affidabile per utilizzo non presidiato:
le automazioni generate e i timer del browser verranno sostituiti da un'unica
autorita residente nell'integrazione HACS Domus UI.

Architettura prevista:

- aggiungere un `IrrigationManager` Python all'integrazione HACS gia installata,
  senza richiedere componenti, add-on o configurazioni YAML aggiuntive;
- conservare zone, programmi, soglie, stato pausa e sessioni attive nello
  storage versionato di Home Assistant, lasciando il browser come sola cache;
- pianificare i cicli nel processo Home Assistant e ricostruirli dopo ogni
  riavvio, gestendo fuso orario e cambio ora;
- eseguire apertura e chiusura attraverso i servizi ufficiali `valve` e
  `switch`, verificando lo stato restituito dal dispositivo;
- applicare un watchdog server-side e un limite massimo autorevole a ogni
  sessione manuale o programmata;
- in caso di riavvio, sessione incoerente o stato non verificabile, chiudere le
  valvole configurate e segnalare l'anomalia;
- rendere pioggia, disponibilita sensori, umidita terreno e temperatura
  condizioni fail-closed configurabili, controllate subito prima dell'avvio e
  durante il ciclo;
- impedire sovrapposizioni non consentite e predisporre il supporto a pompa
  principale, ritardi idraulici e politica una/piu zone simultanee;
- registrare azioni HA `domusos.start_irrigation_zone`,
  `domusos.stop_irrigation_zone`, `domusos.stop_all_irrigation`,
  `domusos.pause_irrigation` e `domusos.resume_irrigation`;
- esporre comandi WebSocket tipizzati per configurazione, stato live, timer,
  cronologia e sottoscrizione push della UI;
- applicare nel backend i permessi Owner/Admin per la configurazione e i
  permessi HA effettivi per ogni comando;
- migrare i programmi correnti e rilevare le vecchie automazioni
  `automation.irrigation_*`, impedendo l'esecuzione contemporanea dei due
  motori;
- aggiungere diagnostica, Repairs e test per riavvio HA, browser chiuso,
  sensori offline, timeout, pioggia durante il ciclo e valvole senza conferma.

Done quando:

- nessun timer operativo dipende da una pagina browser aperta;
- chiudere Domus UI o riavviare Home Assistant non puo lasciare una valvola
  aperta senza watchdog;
- programmazione, pausa globale e arresto di emergenza sono autorevoli e
  condivisi tra tutti i dispositivi;
- configurazione e stato vengono confermati dal backend e aggiornati in push;
- vecchie automazioni e nuovo scheduler non possono comandare insieme la
  stessa zona;
- la matrice di collaudo hardware e i test automatici di sicurezza risultano
  verdi prima di dichiarare affidabile l'uso non presidiato.

### Aggiornamento post-beta - Domus Core Security

Stato: pianificato dopo la prima beta pubblica; non blocca il rilascio iniziale.

La beta continua a usare le entita `alarm_control_panel` e i permessi di Home
Assistant come autorita effettiva. Domus UI non viene presentato come un
sistema di allarme autonomo o certificato e non dipende da Alarmo o da altre
integrazioni non ufficiali per offrire le funzioni attuali.

L'evoluzione futura prevede un motore locale sempre attivo, posseduto e
manutenuto dal progetto, distribuito insieme al frontend in una sola
installazione Domus UI. Non sara implementato nel solo browser e non
richiedera all'utente di installare separatamente una custom integration.

Intervento futuro:

- creare un `Domus Core` persistente per modalita, zone, ritardi,
  esclusioni temporanee, stato di allarme e ripristino dopo riavvio;
- ricevere da Home Assistant stati ed eventi di sensori, serrature, sirene e
  altri dispositivi, mantenendo nel Core la macchina a stati e le decisioni;
- distribuire frontend, Core, storage e connettore HA in una singola Home
  Assistant App per HA OS/Supervised e in un singolo container per HA
  Container;
- usare Ingress, identita HA e privilegi minimi, senza token manuali nella
  configurazione consigliata;
- gestire perdita di connessione con uno stato degradato esplicito e
  riconciliazione completa al ripristino, senza simulare una casa protetta;
- conservare PIN e segreti soltanto lato Core con hashing, rate limit, audit e
  sessioni sensibili; non inserirli in layout, browser storage, backup o log;
- verificare riavvii, timeout, eventi duplicati o fuori ordine, sensori non
  disponibili, revoca dei permessi ed esclusioni temporanee;
- sottoporre il motore a threat model, test di sicurezza e revisione esterna
  prima di presentarlo come funzione di protezione reale.

Limite dichiarato: finche i dispositivi vengono letti attraverso Home
Assistant, il motore e indipendente nella logica ma HA resta il trasporto degli
eventi. L'indipendenza completa richiederebbe in futuro accesso diretto ai
protocolli hardware e non rientra nella prima implementazione.

Done quando:

- il motore continua a funzionare senza una pagina browser aperta e recupera
  deterministicamente lo stato dopo un riavvio;
- l'utente installa un solo prodotto Domus UI senza YAML o componenti
  separati;
- nessun comando o segreto sensibile dipende dal frontend come autorita;
- disconnessioni, errori e dati mancanti non producono falsi stati di
  protezione;
- documentazione, test e audit descrivono esattamente garanzie e limiti del
  sistema.

### Backlog aggiuntivo - Card, onboarding e navigazione

Registrato il 23 luglio 2026.

#### Nuove entita e card

- **Calendar:** studiare il dominio Home Assistant `calendar`, eventi, calendari multipli, fusi orari, ricorrenze, eventi giornalieri, permessi e servizi supportati; progettare una `CalendarCard` responsive e il relativo pannello contestuale senza duplicare le funzioni gia disponibili in HA.
- **Mappa:** definire prima il funzionamento e le fonti dati della card (persone, device tracker, zone, casa ed eventuali percorsi); stabilire privacy, aggiornamento live, comportamento offline, fallback, clustering e caricamento lazy di MapLibre prima di realizzare la `MapCard`.
- **Lista spesa e liste:** valutare una card basata sulle entita HA `todo` per lista della spesa, promemoria e liste condivise; prevedere lettura, aggiunta, completamento, riordino e gestione chiara dei permessi, evitando uno storage locale parallelo quando HA puo restare l'autorita.

Queste tre card entrano dopo la stabilizzazione della beta e richiedono registry capability, mock espliciti, skeleton fedeli, varianti responsive, pannello contestuale, gestione pending/rollback e test automatici.

#### Setup wizard con installazione iframe/panel

Stato: completato il 27 luglio 2026.

Problema: quando l'app viene caricata da iframe o panel bridge, l'identita e il token possono essere riconosciuti automaticamente e il setup wizard viene saltato, mostrando direttamente la guida della Home.

Comportamento richiesto:

- l'autenticazione automatica deve saltare soltanto il passaggio manuale di connessione, non l'intero setup;
- mostrare una schermata dedicata, ad esempio: `Abbiamo trovato una casa su questo server`;
- indicare in modo chiaro account, server e riepilogo iniziale disponibili, senza mostrare token o altri segreti;
- consentire di confermare la casa rilevata oppure cambiare connessione;
- dopo la conferma verificare prima lo storage condiviso: una casa nuova prosegue con analisi, scelta layout e organizzazione, mentre una casa Domus UI esistente usa il percorso rapido;
- mostrare la guida della Home soltanto dopo il completamento effettivo del setup;
- distinguere primo accesso, riconnessione e installazione gia configurata, senza riaprire passaggi non pertinenti.

Risultato:

- rimosso il completamento automatico basato sulla sola presenza dentro un iframe;
- aggiunta la fase dedicata `Abbiamo trovato la tua casa`, con server, entita e stanze rilevate dal bridge;
- il metodo di connessione `panel` o `direct` viene mantenuto durante scan, layout, organizzazione e refresh;
- un token gia visibile nell'iframe non basta piu a saltare il primo setup;
- una dashboard reale gia configurata continua invece ad aprirsi senza replay dell'onboarding;
- il bridge alimenta direttamente analisi e organizzazione senza richiedere un token manuale;
- resta sempre disponibile la scelta esplicita per configurare un altro server;
- un test E2E in iframe copre rilevamento, conferma, analisi e arrivo alla scelta del layout.

Aggiornamento 26 agosto 2026: anche un client con origine nuova, ad esempio
`localhost` durante lo sviluppo, interroga ora la configurazione condivisa subito
dopo l'autenticazione. Se trova un documento Domus UI valido mostra revisione,
data, sezioni e card, quindi permette di ereditare direttamente la casa senza
ripetere layout e organizzazione. Una risposta assente avvia il setup completo;
una risposta non verificabile o non valida blocca invece il percorso per evitare
la sostituzione accidentale di dati esistenti.

Priorita: P1 prima della distribuzione del panel bridge.

#### Scelta del layout al termine della guida iniziale

Stato: pianificato il 27 luglio 2026.

Al termine della guida della Home mostrare una scelta conclusiva, semplice e non ambigua:

- `Mantieni questa dashboard`: conserva le card e le sezioni utilizzate durante la dimostrazione guidata;
- `Parti da un canvas vuoto`: salva intenzionalmente un layout privo di card e sezioni, senza far scattare nuovamente il template iniziale al refresh;
- presentare una preview sintetica delle due alternative e indicare che entrambe potranno essere modificate successivamente;
- mantenere separati layout Demo e layout della casa reale;
- non trasferire automaticamente card mock dalla Demo alla casa reale;
- creare una copia di recupero prima di sostituire un layout eventualmente già modificato;
- registrare la scelta una sola volta, ma rendere disponibile nelle impostazioni un comando esplicito per ripristinare il template iniziale;
- coprire mantenimento, canvas vuoto, refresh, cambio route e riapertura dell’app con test automatici.

Nota tecnica: il loader attuale interpreta `sezioni vuote + widget vuoti` come assenza di configurazione e ripristina `INITIAL_SECTIONS`/`INITIAL_WIDGETS`. Prima di offrire il canvas vuoto bisogna quindi introdurre un template scelto esplicitamente o un marcatore persistente che distingua `vuoto intenzionale` da `storage mancante/corrotto`.

#### Template dimostrativo iniziale

Stato: da rifinire prima della beta pubblica.

- separare il contenuto dimostrativo dai tipi del dominio, spostando `INITIAL_WIDGETS` e `INITIAL_SECTIONS` in un modulo dedicato e versionato, ad esempio `starterDashboardTemplate.ts`;
- definire in quel modulo card, entità mock, testi, sezioni e coordinate del mockup ufficiale;
- salvare layout espliciti almeno per `xl`, `md`, `sm` e `xs`, evitando che la prima impressione dipenda esclusivamente dal reflow automatico;
- usare soltanto entità mock dichiarate e impedire loro di produrre chiamate Home Assistant;
- mantenere il template sufficientemente ricco da mostrare Sensor, Light, Climate, Camera e sicurezza, ma senza riempire il canvas con controlli ripetitivi;
- verificare il mockup guida su desktop, tablet e mobile con screenshot E2E;
- fare in modo che le future modifiche al template valgano solo per nuove installazioni o dopo un ripristino esplicito, senza sovrascrivere dashboard esistenti.

Mockup guida approvato:

- fascia superiore con Greeting e sintesi meteo;
- sezione Scene immediatamente sotto, breve e orizzontale;
- prima riga dispositivi desktop: Climate `3x3`, Camera `4x3`, Sensor `2x3`, Lock `3x3`;
- seconda riga desktop: Alarm `3x3`, Media `4x3`, Cover `3x3`, con uno slot finale `2x2` riservato alla Light aggiunta durante la guida;
- eventuale spazio residuo sotto la Light utilizzabile soltanto da un controllo realmente utile, senza aggiungere una card riempitiva;
- nessuna Light già presente prima del relativo passaggio guidato, per evitare duplicazioni;
- ordine tablet/mobile: Greeting, Scene, Climate, Camera, Sensor + Lock, Alarm, Media, Cover e infine Light;
- su `xs` le card principali occupano tutta la larghezza quando i controlli lo richiedono, mentre Sensor e Lock possono condividere una riga se il loro contratto pixel-safe lo consente;
- il punto di inserimento della Light deve essere deterministico per ogni breakpoint e non affidato soltanto al primo spazio libero calcolato al momento.

Comportamento dei dati:

- in Demo il mockup usa esclusivamente entità mock e mantiene sempre visibile l’indicatore Demo;
- nella guida successiva al collegamento reale il mockup è una preview transitoria e non deve presentare dati simulati come stati Home Assistant;
- scegliendo `Mantieni questa dashboard`, la struttura viene copiata nel layout reale e ogni slot viene associato automaticamente soltanto quando esiste una corrispondenza Home Assistant compatibile e non ambigua;
- gli slot senza una corrispondenza sicura diventano card da configurare chiaramente indicate, senza inviare comandi e senza mostrare valori mock;
- scegliendo `Parti da un canvas vuoto`, nessuna card o entità della preview viene trasferita.

Priorita: P1 per l’esperienza di primo accesso e la presentazione commerciale.

#### Greeting e meteo

Stato: contenuti, tipografia e pannello di configurazione Greeting rifiniti il 28 luglio 2026. La migrazione container query di Greeting/GreetingWeather e intenzionalmente post-beta.

- rivedere la `GreetingCard` per separare saluto, riepilogo casa, suggerimenti e informazioni meteo, eliminando contenuti ridondanti;
- rivedere la sezione meteo e valutare una `WeatherCard` autonoma, lasciando nella Greeting soltanto una sintesi contestuale;
- uniformare entrambe al registry delle card, alle tre future varianti `mini / standard / expanded`, agli skeleton e alle container query;
- rendere Greeting container-owned senza alterare la scala condivisa del titolo: le query del contenitore devono controllare soltanto composizione, riepilogo e presentazione del meteo;

Priorita: completato per lo scope beta; container query e composizioni avanzate seguiranno la prima pubblicazione.

Risultato Greeting e meteo:

- la Greeting mostra un riepilogo stabile e aggregato della casa, senza ripetere temperatura, pioggia, Wi-Fi o valori delle singole card;
- rimossa la rotazione pseudo-casuale dei sottotitoli;
- i fallback meteo mock sono ammessi esclusivamente nella Demo e nei mockup espliciti;
- una dashboard reale senza entita `weather.*` mostra `Meteo non configurato`;
- se Home Assistant non restituisce previsioni, card e pannello mostrano `Previsioni non disponibili` senza inventare giorni, temperature o probabilita di pioggia;
- aggiunti test dedicati alla separazione Demo/Reale, alla Greeting e agli stati meteo non disponibili.

#### Pannello contestuale Meteo - moduli ambientali evoluti

Stato: pianificato post-beta. Il riferimento visuale ricevuto il 28 agosto 2026 introduce una composizione modulare di card ambientali compatte, da reinterpretare con il design system Domus UI e non da replicare come immagine statica.

Moduli previsti:

- andamento orario della temperatura, con curva, ore e valori allineati senza spostamenti di layout;
- umidita con livello visivo morbido e classificazione testuale accessibile;
- pressione atmosferica con indicatore semicircolare e valore in `hPa`;
- indice UV con fascia cromatica, posizione corrente e livello di rischio espresso anche tramite testo;
- vento con bussola, direzione cardinale, velocita e unita configurata da Home Assistant;
- alba e tramonto con arco solare, orari locali e posizione del sole coerente con l'ora corrente.

Regole di implementazione:

- usare esclusivamente dati reali disponibili da `weather.*`, dalle entita `sensor.*` correlate e da `sun.sun`; ogni modulo non supportato viene nascosto o mostra uno stato non configurato esplicito, senza valori inventati;
- consentire nel pannello di configurazione l'associazione automatica tramite Device/Entity Registry e la selezione manuale delle sole sorgenti mancanti;
- mantenere una gerarchia responsive: temperatura e arco solare possono occupare tutta la larghezza, mentre i moduli quadrati si dispongono in una griglia adattiva;
- usare container query per densita, tipografia e quantita di dettagli, evitando varianti dipendenti soltanto dal breakpoint della viewport;
- rispettare tema, contrasto, `prefers-reduced-motion`, unita HA, localizzazione e formati orari dell'utente;
- rendere grafici e indicatori comprensibili anche senza colore tramite etichette, valori e descrizioni accessibili;
- condividere modello dati e componenti con una futura `WeatherCard` autonoma, evitando duplicazioni con Greeting e pannello contestuale;
- aggiungere skeleton fedeli, stati loading/stale/offline, test Demo/Reale e test per capability parziali.

Priorita: P1 post-beta, dopo la stabilizzazione della prima distribuzione pubblica.

#### Centro notifiche post-beta

Stato: rinviato dopo la prima beta; non blocca la distribuzione iniziale.

Per la beta:

- usare un componente snackbar globale per conferme, warning ed errori operativi effimeri;
- mantenere i messaggi brevi, deduplicati e con durata coerente, consentendo la chiusura manuale;
- usare dialog espliciti, non snackbar, per sicurezza, autenticazione, perdita di dati e azioni distruttive;
- non presentare notifiche mock o fallback come eventi reali Home Assistant;
- non salvare token, PIN, payload sensibili o diagnostica completa nei messaggi.

Post-beta:

- sostituire l'attuale raccolta in memoria con un modello tipizzato per origine, severita, entita, azione e stato letto;
- unificare desktop e mobile in un solo centro notifiche responsive;
- integrare in modo selettivo le notifiche persistenti Home Assistant, evitando di trasformare ogni cambio di stato in una notifica;
- aggiungere gerarchia, raggruppamento temporale, deduplicazione, filtri, azioni contestuali e collegamento alla card o route di origine;
- aggiungere persistenza locale controllata, accessibilita completa e test dedicati.

#### Route non modificabili

Stato: completato il 27 luglio 2026.

- rimuovere dalla UI e dalla configurazione la possibilita di modificare path e route applicative;
- mantenere le route di sistema definite dal prodotto e validate da un registry centrale;
- consentire la personalizzazione di titolo, icona, visibilita e ordine delle voci soltanto dove previsto, senza cambiare il percorso;
- ignorare e migrare in sicurezza eventuali route personalizzate gia salvate;
- proteggere anche callback, import, restore e persistenza: nascondere il controllo non e sufficiente;
- aggiungere test per path pericolosi, duplicati, esterni o non riconosciuti.

Risultato:

- introdotto il registry centrale delle sei destinazioni applicative;
- il caricamento da storage ripristina sempre il path canonico e migra i preset legacy;
- voci sconosciute e duplicate vengono eliminate prima di entrare nello stato React o nella persistenza;
- la callback di navigazione rifiuta destinazioni non registrate anche se invocata direttamente;
- il Builder mostra la destinazione come dato di sistema non modificabile;
- nome, icona, ordine e visibilita restano separati dal percorso;
- test automatici coprono URL esterni, schemi pericolosi, duplicati, route sconosciute, migrazione e tentativi di modifica diretta.

Priorita: P1 prima della beta commerciale.

Done quando:

- iframe e panel bridge completano il setup senza richiedere nuovamente il token e senza saltare analisi/layout/organizzazione;
- al termine della guida l’utente puo conservare il template mostrato oppure iniziare da un canvas intenzionalmente vuoto;
- il mockup iniziale ha un template versionato, responsive e separato dal layout reale già salvato;
- Greeting e meteo hanno responsabilita chiare; i feedback beta essenziali usano snackbar e il centro notifiche completo resta esplicitamente post-beta;
- nessuna configurazione utente puo modificare o introdurre route applicative;
- Calendar, Mappa e Liste dispongono di una specifica tecnica approvata prima dell'implementazione.

## Gate della beta vendibile

La beta puo essere distribuita a pagamento quando sono soddisfatti tutti questi punti:

- P2, P3 e P4 completati;
- nessun test rosso;
- nessuna vulnerabilita high/critical e nessuna moderate non accettata esplicitamente;
- Alarm e Lock verificati manualmente e automaticamente;
- modalita Demo inequivocabile;
- nessun clipping noto nei breakpoint supportati;
- backup e restore verificati su almeno due browser/dispositivi;
- installazione e aggiornamento documentati;
- disclaimer chiaro: il prodotto non e un sistema di sicurezza certificato.

## Ordine di esecuzione

1. Freeze e checkpoint.
2. Pipeline completamente verde.
3. Sicurezza e permessi.
4. Verita dei dati e command coordinator.
5. Editor, griglia e persistenza.
6. Architettura, performance e accessibilita.
7. Correzione onboarding iframe/panel, route non modificabili e rifinitura Greeting/meteo; snackbar essenziali nella beta e centro notifiche completo post-beta.
8. Funzioni Domus UI.
9. Distribuzione e crescita commerciale.
10. Calendar, Mappa e Liste dopo la specifica tecnica e la stabilizzazione beta.
