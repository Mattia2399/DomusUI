# Domus Access Control — frontend (P2.4)

L'interfaccia di Domus mostra a ogni account ciò che il suo profilo Domus
consente, letto dal backend. **È esperienza d'uso, non sicurezza.** DevTools,
`localStorage`, un bundle modificato o un URL scritto a mano possono sempre
cambiare ciò che il browser mostra. Decidono il backend Domus, in P2.5, e Home
Assistant per le sue azioni.

Collegati: [architettura](access-control-architecture.md),
[capability](access-control-capabilities.md),
[autorizzazione](access-control-authorization.md),
[shadow](access-control-shadow.md),
[threat model](access-control-threat-model.md).

## Fonte

L'unica fonte è `domusos/access/get_self`, chiesto sulla connessione
dell'account:

```text
{ principal: { user_id, is_admin, is_owner },
  access: { role, assigned, grants, capabilities, state, revision } }
```

- La richiesta contiene solo `type`: il backend ricava l'account dalla
  connessione.
- La risposta viene controllata campo per campo (`parseAccessSelf`).
  - Un ruolo o uno stato sconosciuti, una capability che non è una lista o una
    revisione non valida danno un errore, mai un profilo.
  - Un nome di capability sconosciuto viene scartato.
  - Una risposta per un `user_id` diverso dall'account mostrato viene
    rifiutata.
- Ruolo, permessi e capability non vengono mai da:
  - `localStorage`;
  - la persona;
  - il nome o l'email;
  - il dispositivo;
  - `is_admin` usato come scorciatoia.
- **Trasporto.** Nel pannello di HA il bridge inoltra solo
  `domusos/access/get_self` (capability `access_v1`). `reset_policy` e la
  diagnostica shadow restano fuori. Fuori dal pannello (OAuth) la richiesta va
  sulla WebSocket dell'account, come ogni altro comando.

## Moduli

| Modulo | Contenuto |
| --- | --- |
| `src/security/accessControl.ts` | Registro delle 35 capability (uguale a `access/models.py`, contratto), ruoli, stati, `parseAccessSelf`, snapshot, `can`, profilo demo, mappa delle capability legacy |
| `src/hooks/useAccessProfile.ts` | Legge il profilo una volta per account e connessione |
| `src/security/AccessControlProvider.tsx` | Contesto, `useAccessControl`, `useCan` |
| `src/navigation/routeAccess.ts` | La tabella delle route: capability o esenzione motivata, guardia, filtro della navigazione |
| `src/security/entityControlAccess.ts` | Quale capability serve per comandare un'entità (serrature, allarme, ingressi motorizzati) |
| `src/components/access/AccessScreens.tsx` | «Non disponibile», errore, indisponibilità, avviso di policy non affidabile, card nascosta |

## Stati

| Stato | Quando | Cosa concede |
| --- | --- | --- |
| `loading` | Nessun profilo ancora per questo account e questa connessione (anche da disconnessi) | nulla |
| `ready` | Profilo di una policy affidabile | le sue capability |
| `locked` | Policy non affidabile: ruolo `locked` | solo le capability del pavimento sicuro |
| `error` | Risposta non leggibile, rete, profilo di un altro account | nulla |
| `unavailable` | HA senza Access Control di Domus: `unknown_command`, `access_unavailable`, bridge che non lo inoltra | nulla |

`can(capability)`:
- è sincrono e cerca in un `Set`, quindi O(1);
- è `false` per un nome sconosciuto e in ogni stato tranne `ready` e `locked`.

Il contesto senza provider non concede nulla.

## Ciclo di vita

- **Identità.** Il profilo appartiene all'oggetto identità di
  `useHaIdentityRevalidation`.
  - Quell'oggetto resta lo stesso finché nulla cambia.
  - Diventa `null` alla disconnessione.
  - È un oggetto nuovo per un altro account, per una riconnessione o per un
    flag admin cambiato in HA.
  - Quando cambia, il vecchio profilo smette di valere **nello stesso
    render**: non si vedono mai, nemmeno per un istante, i permessi
    dell'account precedente.
- **Nessun polling.** Si richiede al cambio di identità, alla riconnessione e
  con `refresh()`. Non c'è un timer.
- **`refresh()`.** Il profilo attuale resta finché il nuovo non lo sostituisce
  in un solo passo. Servirà a Persone e accessi dopo un cambio di ruolo. Oggi
  lo usa «Riprova».
- **Nessuna persistenza.** Solo memoria: un reload chiede di nuovo.
- **`revision` e `state`.** Sono conservati per diagnosi e per un futuro
  aggiornamento. Non sono un token di sicurezza e il frontend non reinterpreta
  lo store.
- **Demo.** Ha un profilo proprio (`DEMO_ACCESS`), senza HA: mostra tutto
  tranne «Torna in Home Assistant». Le azioni amministrative restano limitate
  da `DEMO_CAPABILITIES`, come prima.

## Home Assistant non collegato

- Senza connessione Domus non sa quale account sta usando: nessun profilo,
  nessuna capability.
- Al posto di un controllo senza fine, le pagine protette mostrano «Home
  Assistant non collegato». La riconnessione resta nel banner di recupero già
  esistente.
- Contano come non collegato gli stati definitivi `offline`,
  `reauth_required`, `error` e `disconnected_by_user`, oppure un
  `disconnected` che dura più di 1,5 secondi. All'avvio Domus passa per un
  istante da `disconnected` prima di riconnettersi da sola: in quell'istante
  mostra ancora «Verifica dell'account…».
- Prima di P2.4 ogni pagina mostrava da sola il proprio «non collegato» e
  Impostazioni elencava tutto. Ora no: è una scelta fail-closed, **confermata
  per V1 in P2.4.1** (Q13). Restano raggiungibili riprova, riconnessione ed
  Esci.

## Avvio senza flash

- Finché il profilo non c'è, ogni pagina protetta mostra «Verifica
  dell'account…» dentro la shell di Domus.
- La navigazione non ha voci che richiedono capability.
- «Torna in Home Assistant» non c'è.
- Un e2e verifica, con una risposta in ritardo di 4 secondi, che un member non
  veda mai la pagina Alimentazione, la navigazione o il ritorno a HA.

## Route

Le regole sono in `ROUTE_ACCESS_RULES`, una sola tabella letta dalla guardia,
dalla navigazione e dall'elenco di Impostazioni. Vale la regola più specifica.

| Route | Capability |
| --- | --- |
| `/`, `/home/*` | `dashboard.view` |
| `/rooms/*` | `rooms.view` |
| `/security/*` | `security.view` |
| `/automations/*` | `automations.view` |
| `/consumi/*` | `energy.view` |
| `/appgallery`, `/appgallery/technical`, `/appgallery/pool` | `dashboard.view` (anteprime senza dati) |
| `/appgallery/irrigation/*` | `irrigation.view` |
| `/appgallery/irrigation/settings`, `/zones/manage` | `irrigation.manage` |
| `/settings/profile/*` | `profile.manage` |
| `/settings/dashboard`, `/settings/data/history`, `/settings/attention` | `dashboard.edit` |
| `/settings/floors` | `house.manage` |
| `/settings/access/*` | `people.view` |
| `/settings/access/roles` (P2.4.1) | `access.manage` |
| `/settings/safety`, `/settings/security` | `security.manage` |
| `/settings/home/waste-collection` | `waste.manage` |
| `/settings/connections`, `/settings/devices/*`, `/settings/entities/*` | `system.manage` |
| `/settings/system/*` | `system.view` |
| `/settings/data` | `backup.export` |
| `/settings/device/appearance`, `/language`, `/screensaver`, `/kiosk` | `device.manage` |
| `/settings/device/power` | `device_power.manage` |
| `/settings/advanced` | `developer.use` |

Esenzioni, ciascuna con il suo motivo nella tabella:

| Route | Motivo |
| --- | --- |
| `/setup` | onboarding e riconnessione, prima di conoscere l'account |
| `/settings`, `/settings/home`, `/settings/device` | elenchi: mostrano solo le voci concesse; la scheda dell'account c'è sempre |

Un indirizzo che nessuna regola nomina cade sulla pagina che lo mostra: Home,
oppure l'elenco di Impostazioni. Un contratto impone che ogni indirizzo scritto
nel codice abbia una regola esplicita.

`/settings/attention` resta `dashboard.edit`, come oggi (pagina
dell'amministratore). La tabella P2.1 proponeva `device.manage`: è da decidere.

### Guardia

`resolveRouteAccessState(route, access)` dà uno di cinque esiti:

| Esito | Cosa mostra |
| --- | --- |
| `open` | la pagina |
| `checking` | «Verifica dell'account…» |
| `offline` | «Home Assistant non collegato»: senza connessione non c'è un account, quindi nessuna pagina protetta |
| `denied` | «Non disponibile per il tuo account», con «Vai alla Home» se la Home è concessa |
| `error` | «Autorizzazioni non disponibili» con «Riprova» |
| `unavailable` | «Domus non è pronta» con «Riprova» |

- La guardia si ricalcola a ogni profilo: una capability che sparisce sostituisce
  subito la pagina aperta.
- Non c'è un redirect silenzioso.
- La shell di Domus resta, con la navigazione verso ciò che è disponibile.
- La pagina ha un titolo `h1` e una sezione etichettata.
- Nessun termine tecnico: niente 403, ACL o nomi di capability.

## Navigazione

- `resolveDashboardNavigationEntries`, comune a barra laterale, barra inferiore
  e drawer, tiene solo le pagine che l'account può aprire.
- Le voci non concesse sono nascoste, non disabilitate.
- Mentre il profilo carica non c'è nessuna voce che richieda una capability.
- Impostazioni resta sempre, perché mostra solo ciò che è concesso.
- Il Kiosk nasconde la navigazione per conto suo: le due cose convivono (e2e
  con `wall_panel` in Kiosk).
- Il Kiosk apre la sua pagina iniziale solo quando conosce le pagine concesse
  all'account (o quando HA non è collegato). Prima lo faceva all'avvio, quando
  non c'erano ancora, e ripiegava sulla Home.
- **App Gallery.** Un'app che l'account non può aprire non viene mostrata. È la
  scelta V1: una scheda bloccata inviterebbe a toccare qualcosa che non si apre.

## Impostazioni

L'elenco viene dalla stessa tabella (`selectVisibleSettingsEntries(section,
canOpen)`). Non esistono più `capability` né `administratorsOnly` propri delle
voci.

| Account | Casa | Sistema | Questo dispositivo |
| --- | --- | --- | --- |
| admin | Dashboard, Piani e stanze, Persone e accessi, Sicurezza, Raccolta rifiuti | Connessioni, Dispositivi, Entità, Sistema, Dati | Aspetto, Lingua, Screensaver, Kiosk, Alimentazione, Centro attenzione, Avanzate |
| member | Persone e accessi | Sistema | Aspetto, Lingua, Screensaver, Kiosk |
| restricted, wall_panel, locked | — | — | — |

Restano sempre la scheda dell'account, **Esci** (P2.4.1, Q12) e, con
`profile.manage`, il Profilo e «I miei dispositivi». In Persone e accessi la
voce «Ruoli e permessi» compare solo con `access.manage`
([Persone e accessi](access-control-people-access.md)).
`profile.manage` (il proprio profilo) non va confuso con `people.manage`
(creare persone e collegare account).

Lo scope (Casa, Sistema, Questo dispositivo) dice dove vive un'impostazione,
non chi può cambiarla: `device.manage` resta una preferenza del browser, non
un'identità.

## Azioni e card

Regola:
- un'azione che l'account non deve usare va nascosta;
- un'informazione utile resta visibile, senza il suo comando;
- un'azione autorizzata ma non disponibile ora (entità offline, in corso) resta
  disabilitata.

| Superficie | Senza la capability |
| --- | --- |
| Card allarme, pannello di dettaglio, scudo della pagina Sicurezza, SOS | stato visibile; niente arma, disarma, modalità (`security.control`) |
| Card serratura, pannello di dettaglio | stato e storico; anello inattivo, niente comandi (`access.control`) |
| Tapparella con classe `gate`, `garage`, `door` (card e dettaglio) | posizione visibile; niente comandi (`access.control`) |
| Card allarme e telecamera sulla Home | sostituite da «Non disponibile» senza dati (`security.view`) |
| Irrigazione: avvio, pausa, stop, zone | nascosti (`irrigation.control`) |
| Irrigazione: configurazione | `irrigation.manage` (prima era `edit_dashboard`) |
| Energy: wizard e impostazioni | `energy.manage`, tramite l'adattatore legacy |
| Alimentazione | `device_power.manage` (prima un controllo `isAdmin`) |

Rete di sicurezza, solo per l'esperienza d'uso:
- `callHaService` non invia un comando a una serratura, all'allarme o a un
  ingresso motorizzato se l'account non ha la capability;
- le funzioni di comando dell'Irrigazione fanno lo stesso.

Non è un limite di sicurezza: lo stesso comando mandato a HA da un'altra parte
passa, e decide HA (D6).

Luci, clima, tapparelle comuni, media: `devices.control` è in tutti i ruoli, quindi
nessuna regressione e nessuna granularità nuova.

## «Torna in Home Assistant» (`ha_frontend.open`)

- È visibile solo con `can('ha_frontend.open')`, cioè per admin; member,
  restricted e wall_panel non lo vedono.
- È nascosto anche mentre il profilo carica, in errore o in `unavailable`.
- È una comodità dell'interfaccia: Domus non può impedire di aprire Home
  Assistant dal suo indirizzo, e non ci prova.

Punti del frontend che portano a Home Assistant o fuori da Domus:

| Punto | Dove | Trattamento |
| --- | --- | --- |
| «Torna in Home Assistant» | barra laterale desktop | `ha_frontend.open` |
| «Torna in Home Assistant» | drawer mobile | `ha_frontend.open` |
| «Apri pagina» del dispositivo (`configuration_url`) | Impostazioni › Dispositivi | la pagina del dispositivo stesso; la sezione è già `system.manage` |
| Riconnessione OAuth (`/setup?reconnect=1`), login OAuth | Connessioni, onboarding | è l'autenticazione: non va mai bloccata |
| Note di rilascio, GitHub, documentazione | Aggiornamenti, Supporto, card meteo | link esterni, non HA |

## Migrazione dei controlli legacy

- `DashboardCapability` resta come nome per gli schermi che lo usano, ma la
  decisione è di Access Control (`LEGACY_CAPABILITY_MAP`). Non ci sono due
  sistemi concorrenti.
  - `edit_dashboard` → `dashboard.edit`
  - `manage_rooms` → `house.manage`
  - `manage_security_config` → `security.manage`
  - `download_backup` → `backup.export`
  - `restore_backup` → `backup.restore`
  - `reset_dashboard` → `dashboard.reset`
  - `developer_mode` → `developer.use`
  - `restart_home_assistant` → `ha.restart`
  - `manage_energy` → `energy.manage`
- Il controllo che prima era `isOwner || isAdmin` ora è la capability del
  profilo. Un admin HA `locked` non ottiene le funzioni di amministratore.
- **`SensitiveActionGate` e `useDeviceAuth`** restano una conferma (passkey e
  codice locale), non un permesso. Il gate chiede la capability legacy,
  quindi oggi Access Control, e poi la conferma.
- **Restano, documentati:**
  - `isOwner`/`isAdmin` per leggere l'elenco utenti di HA (`config/auth/list` è
    un'API admin di HA: è un fatto di HA, non una capability Domus);
  - le etichette di ruolo HA mostrate nel profilo e nei membri;
  - `canManageHa` dell'onboarding, che gira prima dell'identità;
  - il report di diagnostica.
- Da P2.4.1 ruoli e grant si scrivono da Ruoli e permessi
  ([Persone e accessi](access-control-people-access.md)); dopo un cambio del
  proprio account il profilo si ricarica con `refresh()`, gli altri account lo
  vedono alla prossima lettura di `get_self` (ricaricamento o riconnessione).

## Impatto sugli account (prima dell'enforcement)

Rispetto a prima di P2.4, con la matrice approvata e senza grant:

**member**
- Perde «Torna in Home Assistant».
- Serrature, cancelli, garage e porte motorizzate: niente comandi, finché non
  riceve il grant `access.control`.
- Allarme: niente arma, disarma, modalità o SOS su card, dettaglio e pagina
  Sicurezza, finché non riceve il grant `security.control`.
- In Impostazioni perde Piani e stanze, Raccolta rifiuti, Connessioni,
  Dispositivi ed Entità, che prima vedeva in sola lettura.
- **Logout.** Fuori dal pannello di HA, su desktop, il logout era in
  Connessioni. **Risolto in P2.4.1** (Q12): Esci è in Impostazioni per ogni
  account.

**restricted**
- Niente Sicurezza, Automazioni, Consumi.
- Sulla Home le card allarme e telecamera mostrano «Non disponibile».
- Niente Sistema né preferenze del dispositivo.

**wall_panel**
- Niente Profilo, Automazioni, Sistema, né preferenze del dispositivo.
- Per cambiare la configurazione del Kiosk del pannello serve un admin.

**admin**
- Invariato.

**admin locked**
- Solo Home, Stanze e Profilo, con l'avviso; niente funzioni di amministratore.

**member locked**
- Solo Home, Stanze e Profilo, con l'avviso.

Per questo, prima dell'enforcement (P2.5), serviva una UI minima per assegnare
ruoli e grant: è arrivata in P2.4.1
([Persone e accessi](access-control-people-access.md)).

## Test

| File | Cosa |
| --- | --- |
| `src/security/accessControl.test.ts` | Registro, ruoli, stati e tabella admin uguali al backend e al fake e2e; parsing campo per campo; account diverso; nomi sconosciuti scartati; errori; matrice `can` per ruolo; admin locked; grant; fail closed; demo; costo |
| `src/hooks/useAccessProfile.test.tsx` | loading → ready; nessuna richiesta senza account; locked; errore, `unavailable`; account diverso; cambio di account nello stesso render; riconnessione; nessuna richiesta ripetuta; refresh atomico; risposta tardiva ignorata; demo; richiesta con solo `type` |
| `src/navigation/routeAccess.test.ts` | Contratto: ogni indirizzo del codice ha una regola; esenzioni esatte e motivate; pagine dell'app protette; navigazione e Impostazioni dalla stessa tabella; matrice per ruolo; guardia; admin locked |
| `src/security/dashboardAccess.test.ts` | Capability legacy decise dal profilo; admin locked; profilo di un altro account; fail closed; demo |
| `src/components/access/AccessScreens.test.tsx` | Titolo, sezione, azioni, nessun termine tecnico, lingue; avviso locked; card allarme nascosta senza `security.view` |
| card e pannelli (`AlarmCard`, `CoverCard`, `LockControls`, `SecurityDashboard`) | stato senza comandi per member, comandi con il grant |
| navigazione (`LeftSidebar`, `BottomBarNav`, `MobileSidebarDrawer`) | restricted coerente su desktop e mobile; niente durante il caricamento |
| `src/services/panelDistributionContract.test.ts`, `src/security/accessAuthority.test.ts` | Bridge: `get_self` con solo `type`; da P2.4.1 anche i comandi di Persone e accessi e `reset_policy`, a chiavi esatte; mai la diagnostica; nessuno storage; nessun polling; nessun controllo sul ruolo |
| e2e esistenti | Ogni HA finto risponde a `get_self` come il backend (`tests/support/accessSelf.cjs`). Le suite che aprivano pagine senza HA ora si collegano a un HA finto (`tests/support/fakeHomeAssistant.cjs`) o verificano l'avviso «non collegato». Il test del member in Impostazioni segue la nuova matrice |
| `tests/access-control.spec.cjs` (e2e) | admin, member, restricted, member locked e admin locked sull'app vera; URL diretto; avvio lento; errore e `unavailable`; telefono 390×844; `wall_panel` in Kiosk 820×1180 |
