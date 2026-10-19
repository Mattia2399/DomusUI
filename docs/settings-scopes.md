# Scope delle impostazioni: Profilo, Casa, Dispositivo

Ogni impostazione di Domus UI appartiene a **uno solo** di tre scope. È una
regola di progetto: una nuova impostazione dichiara il suo scope prima di
avere una posizione nell'interfaccia.

Profilo e Impostazioni sono **una sola pagina**, come le Impostazioni di
iPhone: in cima c'è la persona (la card account apre il Profilo, e «I miei
dispositivi» è subito sotto), poi le sezioni Casa, Sistema e Questo
dispositivo. Avatar e ingranaggio aprono entrambi `/settings`; nella barra
mobile la voce Impostazioni mostra la foto della persona. La pagina non ha
titolo visibile né badge di connessione (lo stato è il pallino sulla foto):
su telefono e tablet foto e nome, scorrendo, passano in una barra in alto.

| Scope | Significa | Dove si trova, se è del core Domus |
| --- | --- | --- |
| **PROFILE** | «Riguarda me» | Impostazioni › card account (Profilo, `/settings/profile`) |
| **HOUSE** | «Riguarda questa casa» | Impostazioni › Casa e Impostazioni › Sistema |
| **DEVICE** | «Riguarda questo dispositivo» | Impostazioni › Questo dispositivo |

## Scope ≠ owner ≠ posizione

Ogni configurazione ha tre dimensioni indipendenti:

| Dimensione | Domanda | Valori |
| --- | --- | --- |
| **Scope** | A chi appartiene questo valore? | `PROFILE`, `HOUSE`, `DEVICE` (solo questi tre) |
| **Owner / dominio** | Quale modulo ne è responsabile? | `CORE` (Domus), `WASTE`, `DEVICE_POWER`, `ENERGY`, `IRRIGATION`, altre app future |
| **Posizione** | Dove la modifica l'utente? | Profilo, una sezione di Impostazioni, oppure dentro un'app |

| Configurazione | Scope | Owner | Posizione |
| --- | --- | --- | --- |
| Tema e sfondo | DEVICE | CORE | Impostazioni › Questo dispositivo |
| Lingua | DEVICE | CORE | Impostazioni › Questo dispositivo |
| Alimentazione e ricarica | DEVICE | DEVICE_POWER (integrazione DomusOS) | Impostazioni › Questo dispositivo |
| Connessione Home Assistant | HOUSE | CORE | Impostazioni › Sistema |
| Dashboard condivisa | HOUSE | CORE | Impostazioni › Casa |
| Raccolta rifiuti | HOUSE | WASTE | Impostazioni › Casa (non ha un'app propria) |
| Energia | HOUSE | ENERGY | dentro Energia (Consumi › Energia) |
| Irrigazione | HOUSE | IRRIGATION | dentro Irrigazione (App Gallery › Irrigazione › Impostazioni) |
| Pannello d'avvio | PROFILE | CORE | Profilo |
| Screensaver | DEVICE | CORE (esperienza del dispositivo) | Impostazioni › Questo dispositivo |

**Una configurazione HOUSE non appartiene automaticamente a Impostazioni ›
Casa.** HOUSE dice soltanto che il valore riguarda tutta la casa. La posizione
dipende dall'owner:

- **owner CORE** → la pagina Impostazioni, nella sezione del suo scope;
- **owner = un'app con pagina propria** (backend, Store, navigazione e
  configurazione propri) → dentro l'app, qualunque sia lo scope.

La pagina Impostazioni raccoglie la configurazione del core Domus: non è un
catalogo delle funzioni e non è una seconda App Gallery. Le app si
raggiungono dal loro punto d'ingresso (Consumi, App Gallery) e la loro
configurazione resta lì. ENERGY e IRRIGATION sono owner, non scope.

Un modulo con backend e Store propri ma **senza una pagina propria** usa la
pagina Impostazioni come unica superficie di configurazione: è il caso della
Raccolta rifiuti. Se un giorno diventasse un'app, la sua configurazione si
sposterebbe dentro l'app.

## Come si classifica

1. Cambiando utente l'impostazione deve cambiare, e deve seguire quella
   persona su ogni dispositivo → **PROFILE**.
2. Appartiene all'installazione ed è la stessa per tutte le persone e tutti i
   dispositivi → **HOUSE**.
3. Aprendo Domus da un altro browser, tablet o PC può legittimamente essere
   diversa → **DEVICE**.

Si classifica in base a **dove il valore è salvato davvero**, non a dove
sembrerebbe giusto che fosse. Se le due cose non coincidono, la differenza è
un debito da documentare (vedi sotto), non un motivo per spostare i dati.

### Sistema non è un quarto scope

«Sistema» è un gruppo della pagina Impostazioni che raccoglie le impostazioni
HOUSE di connessione e manutenzione (connessione Home Assistant, dispositivi,
entità, stato del server, dati e backup). I dati restano della casa: non esiste
uno scope `system`, né uno Store dedicato.

```
HOUSE
├── Casa      (Impostazioni › Casa)
└── Sistema   (Impostazioni › Sistema)
```

### DEVICE non è un dispositivo personale

- Un **dispositivo personale** (Profilo › I miei dispositivi) è un dispositivo
  Home Assistant della persona, per esempio un telefono con la Companion App,
  usato per le notifiche. È un dato PROFILE.
- Uno **scope DEVICE** riguarda il client che sta mostrando Domus: un browser
  desktop, un tablet a muro, un kiosk, anche senza Companion App.

I due concetti sono indipendenti e non devono dipendere l'uno dall'altro.

## Interfaccia ≠ dati

Spostare una voce in un'altra sezione cambia **dove la si trova**, mai **dove
è salvata**. Nessuna riorganizzazione migra uno Store o una chiave locale: la
migrazione dei dati è una decisione separata, con il suo piano di
compatibilità.

## Mappa attuale

Il modello dichiarativo è `src/components/settings/settingsScopes.ts`:

- `SETTINGS_ENTRIES`: le voci della pagina Impostazioni, ognuna con scope,
  owner (`core`, oppure `waste`), sezione, route, autorità e permesso;
- `APP_OWNED_SETTINGS`: la configurazione HOUSE delle app (Energia,
  Irrigazione), con la route dentro l'app; non compare mai nella pagina;
- `PROFILE_ENTRIES`: il Profilo.

La pagina Impostazioni costruisce i gruppi da `SETTINGS_ENTRIES`; i test in
`settingsScopes.test.ts` ne bloccano classificazioni e confini.

Autorità di salvataggio usate nella tabella:

- **Casa condivisa HA**: documento `premium-home.shared-house.v1` nei dati di
  sistema del frontend Home Assistant (layout, presentazione sicurezza e stanze).
- **Store integrazione**: Store `domusos.*` dell'integrazione Domus.
- **Registri HA**: piani, aree, persone, dispositivi, entità di Home Assistant.
- **Dati utente HA**: dati frontend dell'utente Home Assistant collegato.
- **Runtime HA**: stato e servizi live; Domus non salva nulla.
- **Browser**: `localStorage` di questo browser.

### Profilo — PROFILE

Si apre dalla card account in cima a Impostazioni (`/settings/profile`).

| Voce | Route | Autorità | Note |
| --- | --- | --- | --- |
| Informazioni personali | `/settings/profile/personal` | Registri HA | Nome, email e ruolo letti da Home Assistant |
| Attività e spostamenti | `/settings/profile/activity` | Runtime HA | Presenza della propria Person, sola lettura |
| I miei dispositivi | `/settings/profile/devices` | Store integrazione `domusos.profiles.v1` | Comprende le notifiche personali; raggiungibile anche dalla riga sotto la card account |
| Schermata iniziale | — (in pagina) | Dati utente HA (`core.defaultPanel`) | Visibile solo con Home Assistant collegato |
| Accesso e sicurezza | `/settings/profile/security` | Browser | Conferma con passkey: è della persona ma, per natura (WebAuthn), resta su questo dispositivo |
| Supporto e feedback | `/support` | — | Aiuto, non un'impostazione |

### Impostazioni › Casa — HOUSE

| Voce | Owner | Route | Autorità | Visibile con |
| --- | --- | --- | --- | --- |
| Dashboard | CORE | `/settings/dashboard` | Casa condivisa HA | `edit_dashboard` |
| Piani e stanze | CORE | `/settings/floors` | Registri HA | tutti (modifiche con `manage_rooms`) |
| Persone e accessi | CORE | `/settings/access` | Registri HA | `manage_rooms` |
| Sicurezza | CORE | `/settings/safety` | Casa condivisa HA (sezione `security`) e codici locali delle card | `manage_security_config` |
| Raccolta rifiuti | WASTE | `/settings/home/waste-collection` | Store `domusos.waste_collection.v1` | tutti (modifiche con `manage_rooms`) |

Sicurezza è del core: sceglie allarme, sensori e telecamere del Centro
sicurezza nel documento della casa, senza backend né Store propri.

### Configurazione HOUSE dentro le app

| Configurazione | Owner | Dove si modifica | Autorità | Permesso |
| --- | --- | --- | --- | --- |
| Energia | ENERGY | Consumi › Energia (impostazioni nella pagina) | Store `domusos.energy.v2` | `manage_energy` |
| Irrigazione | IRRIGATION | App Gallery › Irrigazione › Impostazioni (`/appgallery/irrigation/settings`) | Store `domusos.irrigation.v1` | `edit_dashboard` |

Sono HOUSE ma non compaiono in Impostazioni: la loro configurazione resta
l'unica autorità, dentro l'app.

### Impostazioni › Sistema — HOUSE

| Voce | Route | Autorità | Visibile con |
| --- | --- | --- | --- |
| Connessioni | `/settings/connections` | Browser (vedi debiti) | tutti |
| Dispositivi | `/settings/devices` | Registri HA | tutti |
| Entità | `/settings/entities` | Registri HA | tutti |
| Sistema | `/settings/system` | Runtime HA | tutti (azioni con i permessi esistenti) |
| Dati e backup | `/settings/data` | Casa condivisa HA | `download_backup` |

### Impostazioni › Questo dispositivo — DEVICE

| Voce | Route | Chiavi del browser | Visibile con |
| --- | --- | --- | --- |
| Aspetto (tema e sfondo) | `/settings/device/appearance` | `ha.dashboard.theme`, `ha.dashboard.background` | tutti |
| Lingua | `/settings/device/language` | `domusui.language.v1` | tutti |
| Screensaver | `/settings/device/screensaver` | `domusui.screensaver.v1` | tutti |
| Alimentazione e ricarica | `/settings/device/power` | `domusui.client_id.v1` (solo il riferimento del dispositivo); la configurazione è nello Store `domusos.device_power.v1` | amministratori HA |
| Avvisi e attenzione | `/settings/attention` | `ha.dashboard.homeAttention.v1` | `edit_dashboard` |
| Avanzate e supporto | `/settings/advanced` | `ha.dashboard.developerMode.v2`, `ha.dashboard.cardSizingEngine` | `developer_mode` |

`/settings/device` apre la pagina Impostazioni sul gruppo Questo dispositivo.

Alimentazione e ricarica è DEVICE ma non è salvata nel browser: il
dispositivo ha solo un riferimento casuale e la configurazione, eseguita da
Home Assistant, è nell'integrazione. Vedi
[gestione alimentazione](device-power-management.md).

### Preferenze locali non mostrate in Impostazioni

Sono DEVICE di fatto e oggi si cambiano dove si usano:

| Preferenza | Chiave | Dove si cambia |
| --- | --- | --- |
| Destinazioni della sidebar (etichetta, icona, rimozione) | `ha.dashboard.sidebarPaths` | Sidebar in modalità modifica |
| Scheda rapida della sidebar | `ha.dashboard.sidebar.quickCard.v1` | Sidebar |
| Microfono e conversazione dell'assistente | `ha.dashboard.assistant.*` | Pannello preferiti |
| Stanza attiva | `ha.dashboard.rooms.activeRoomId.v1` | Stanze |
| Avviso Consumi chiuso | `ha.dashboard.consumi.noticeDismissed.v1` | Consumi |
| Codici locali delle card | `ha.dashboard.secrets.widgetCodes.v2` | Card allarme e serratura |

## Debiti noti

- **Avvisi e attenzione**: la pagina la presenta come configurazione condivisa
  e la riserva agli amministratori, ma i valori sono nel browser. Per questo è
  in Questo dispositivo. Diventerà HOUSE solo spostandola nel documento della
  casa, con una migrazione dedicata.
- **Connessioni**: in un browser autonomo indirizzo e token di Home Assistant
  sono salvati nel browser; dentro Home Assistant la connessione arriva dal
  pannello. Resta in Sistema perché descrive l'installazione.
- **Accesso e sicurezza**: la passkey non può seguire la persona su un altro
  dispositivo; resta nel Profilo perché è la conferma della persona.
- **Raccolta rifiuti**: è un modulo con backend e Store propri ospitato in
  Impostazioni perché non ha una pagina propria. Se diventerà un'app, la sua
  configurazione andrà dentro l'app.

## Compatibilità degli indirizzi

| Indirizzo precedente | Ora |
| --- | --- |
| `/profile` | `/settings` (la persona è in cima) |
| `/profile/personal`, `/activity`, `/devices`, `/security` | `/settings/profile/…` (stessa pagina) |
| altri `/profile/…` | `/settings/profile` |
| `/profile/themes` | `/settings/device/appearance` |
| `/profile/language` | `/settings/device/language` |
| `/settings/home` | pagina Impostazioni (invariato) |
| `/settings/security` | `/settings/safety` (invariato) |

Il reindirizzo sostituisce la voce della cronologia (`replace`): Indietro non
riporta all'indirizzo vecchio e non può nascere un ciclo. Le altre route non
cambiano.

## Aggiungere un'impostazione

1. Scegli lo scope con le tre domande sopra, guardando dove il valore sarà
   salvato.
2. Scegli l'owner: se la configurazione appartiene a un'app con pagina
   propria, resta dentro l'app (elencala in `APP_OWNED_SETTINGS`) e non va in
   Impostazioni.
3. Per il core, aggiungi la voce a `SETTINGS_ENTRIES` (o al Profilo) con
   route, autorità e, se serve, una `capability` esistente: non si inventano
   permessi.
4. Aggiungi testo e descrizione in it, en e fr e l'aspetto della card in
   `SettingsDashboard`.
5. Non mostrare voci non implementate né segnaposto «In arrivo».

## Futuro

Queste funzioni **non sono implementate**; lo scope indica solo dove
andranno.

- **PROFILE**
  - Sincronizzazione delle preferenze (lingua, tema, preferiti) sul profilo.
  - Dashboard preferita della persona.
- **HOUSE**
  - Domus Access Control (ruoli Admin, Member, Viewer, Guest, permessi per
    route e controlli): sostituirà le `capability` attuali delle voci.
  - Configurazione di Domus Intelligence.
- **DEVICE**
  - Screensaver: stato della casa, foto, orari giorno/notte, impostazione
    predefinita della casa con eccezioni per dispositivo.
  - Strategie di ricarica a orari o intelligenti (oggi solo soglie).
  - Modalità kiosk.
  - Dashboard predefinita per questo dispositivo.
