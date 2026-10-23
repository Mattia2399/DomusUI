# Domus Access Control — architettura (P2.0)

Progetto di Domus Access Control. Descrive cosa esiste oggi, cosa Domus può
davvero garantire e come costruirlo. Il fondamento (registro, ruoli, store,
`get_self`, recupero) è implementato da P2.1 senza alcun enforcement:
[fondamento](access-control-foundation.md). Base `f5eb98d` (`main`, con Power,
Screensaver, Kiosk e il ciclo performance), branch
`feature/access-control-architecture`.

Documenti collegati:

- [threat model](access-control-threat-model.md);
- [Persone e accessi](access-control-people-access.md) (P2.4.1);
- [enforcement](access-control-enforcement.md) (design P2.5A, Q10);
- [pannello a parete condiviso](shared-wall-panel-identity.md) (P2.5D.1.1A);
- [capability, route e azioni](access-control-capabilities.md);
- [sicurezza e privacy](security-and-privacy.md);
- [bridge del pannello](home-assistant-panel-bridge.md);
- [Profile Core](profile-core.md);
- [scope delle Impostazioni](settings-scopes.md);
- [Domus Core](domus-core-architecture.md).

I fatti su Home Assistant sono verificati sul sorgente di HA 2026.2 (lo stesso
dei test Python del repository), non presunti.

## 1. Il punto da cui partire

Domus parla con Home Assistant in due modi diversi, e l'Access Control vale in
modo diverso nei due casi.

**Comandi nativi di Home Assistant**, chiamati dal browser con la sessione
dell'utente: `call_service` (luci, clima, serrature, allarme…), registri di
piani, aree, entità e dispositivi, `person/*`, `frontend/set_system_data`
(configurazione condivisa della casa) e REST `/api/config/automation`.

- Il backend Domus **non è nel percorso**. Nel pannello il bridge li inoltra con
  la connessione HA del parent; fuori dal pannello il browser usa il token
  dell'utente.
- Chi ha una sessione HA può chiamarli da solo, dagli strumenti del browser o da
  qualunque client.

**Comandi del backend Domus** (`domusos/*`): Energy, Irrigazione, Profile,
Alimentazione, Raccolta rifiuti, e i servizi `domusos.*_irrigation*`.

- Li esegue l'integrazione con `connection.user` (o `call.context.user_id`).
- Qui Domus decide davvero.

Conseguenza, che va detta chiaramente anche nella UI:

> **Per le azioni native di Home Assistant l'unica autorità di sicurezza è Home
> Assistant.** Domus può non offrire un'azione, ma non può impedire a un utente
> di eseguirla con la propria sessione HA se HA gliela concede. Domus Access
> Control è una barriera di sicurezza per i **comandi del backend Domus** e per i
> dati che solo Domus custodisce. Per tutto il resto è una regola della casa:
> utile e rispettata dall'interfaccia, ma aggirabile da chi usa direttamente
> Home Assistant.

Home Assistant ha permessi nativi grossolani:

- tre gruppi di sistema: `system-admin`, `system-users`, `system-read-only`;
- `system-users` ha `{entities: True}`, cioè controllo di **tutte** le entità;
- `system-read-only` può solo leggere;
- molti comandi richiedono l'amministratore: registri, `person/create|update|delete`,
  `frontend/set_system_data`, configurazione automazioni, servizi registrati come
  admin (riavvio, reload).

Per bloccare davvero un account resta lo strumento di HA: un utente di sola
lettura, o un account dedicato a un pannello.

## 2. Glossario

| Termine | Significato |
| --- | --- |
| **HA User** | Account di Home Assistant (`user.id`). Identità autenticata. È il principal di sicurezza. |
| **Person** | `person.*` con id interno stabile. Identità domestica: presenza, profilo, notifiche, foto. Può avere un `user_id` o nessuno. |
| **Device** | Il browser o tablet. Porta preferenze locali (aspetto, lingua, screensaver, kiosk) e una policy di Alimentazione. Non è un'identità. |
| **Capability** | Ciò che un utente può fare in Domus, per dominio (`energy.view`, `security.control`). Non è un pulsante. |
| **Role** | Preset nominato di capability (`admin`, `member`…). |
| **Assignment** | `user_id → role`. |
| **Policy store** | Il documento backend che contiene gli assignment. |
| **Comando nativo HA** | Comando WebSocket o REST di Home Assistant chiamato dal browser. |
| **Comando Domus** | Comando `domusos/*` o servizio `domusos.*` dell'integrazione. |

Attenzione al nome: `core/capabilities.py` usa già «capability» per le capacità
dei dispositivi (`CapabilityState`, es. luminosità). Le capability di accesso
avranno un registro chiuso e un tipo distinto (`AccessCapability`), e nei
documenti si chiamano «capability di accesso». I due insiemi non si mescolano.

## 3. Cosa esiste oggi

### Identità

| Percorso | Dettaglio |
| --- | --- |
| Pannello HA | L'iframe chiede `auth/current_user` attraverso il bridge, che lo inoltra con la connessione HA del parent. Il bridge non accetta identità o ruoli dal payload ([bridge](home-assistant-panel-bridge.md)). |
| Browser autonomo | OAuth di HA (`haLive.ts`, `security/oauthState.ts`), poi `auth/current_user` sulla WebSocket dell'utente. |
| Frontend | `useHaIdentityRevalidation` rilegge `auth/current_user` ogni 15 s e al ritorno sulla pagina; `parseHaCurrentUser` produce `{id, isOwner, isAdmin, isActive, isSystem}`. |
| Backend | `connection.user` sui comandi WebSocket; `call.context.user_id` → `hass.auth.async_get_user` sui servizi (Irrigazione). `user is None` è una chiamata interna (scheduler). |
| Account | `profile/identity.py`: `require_household_account` rifiuta account di sistema e disattivati; la persona si risolve per id interno, mai per nome. |

Percorso reale: login HA → sessione WebSocket (parent o token) → `connection.user`
lato HA → `user.id`. Il frontend riceve `auth/current_user` solo per presentarlo.

### Controlli già presenti

**Frontend** (solo UX):

- `src/security/dashboardAccess.tsx`: `DashboardCapability` con 9 voci
  (`edit_dashboard`, `manage_rooms`, `manage_security_config`, `download_backup`,
  `restore_backup`, `reset_dashboard`, `developer_mode`, `restart_home_assistant`,
  `manage_energy`). La regola è unica: Owner o Admin HA → tutto, altrimenti
  niente. In demo vale un insieme a parte. Con identità in risoluzione si nega.
- `MainBoard.callHaApi` blocca i tipi di `ADMINISTRATIVE_API_TYPES` e il riavvio
  di HA quando manca `manage_rooms` / `restart_home_assistant`. Guardia lato
  client: HA o Domus ripetono il controllo.
- `SensitiveActionGate` + `useDeviceAuth`: passkey WebAuthn **locale** e frase di
  conferma per azioni sensibili. È una conferma di sicurezza UX, non
  un'autorizzazione: nessuna verifica lato server.
- `settingsScopes.ts`: le voci delle Impostazioni si nascondono per `capability`
  o `administratorsOnly`.
- Energy, Stanze, Sicurezza, Onboarding: `canManage` derivato dall'admin HA.

**Backend Domus** (sicurezza vera):

- `websocket_api.require_admin` su Energy profile/discover/save, Irrigazione
  save/prepare_legacy_removal, Raccolta rifiuti save/test, Profile
  list_recipients, tutti i comandi di Alimentazione.
- Controlli nei manager: Alimentazione (`_require_ready`), Irrigazione
  (`_can_read` / `_assert_control` con `user.permissions.check_entity` di HA,
  configurazione solo admin), Raccolta rifiuti (`is_admin`).
- Profile: ogni comando risolve l'utente da `connection.user`, mai dal payload.

**Senza controllo oltre l'autenticazione HA**: `domusos/energy/get_state`,
`get_history`, `irrigation/get_config|get_state|subscribe` (filtrati per
permesso di lettura HA), `waste_collection/get_config|preview`.

**Route**: nessun controllo d'accesso per route oggi, tranne le restrizioni
della demo (`isDemoRouteAllowed`). Il pannello Domus è registrato con
`require_admin: False`, quindi ogni utente HA lo vede.

### Persone e accessi

La destinazione esiste già: `/settings/access`, «Persone e accessi», con
sottoviste membri, ospiti e condivisione.

- **Membri**: elenco membri (`config/auth/list`, solo admin, + `person/list`),
  collegamento account–persona (`person/update`), creazione e foto.
- **Ospiti**: «in arrivo»; la roadmap prevede accessi temporanei solo con
  credenziali verificabili e revocabili.
- **Condivisione**: export/import di configurazione con etichetta di ruolo
  (creator/admin/member) derivata da HA.

## 4. Principi (invarianti)

1. **Autenticazione = Home Assistant.** Domus non ha login proprio.
2. **Il principal è l'HA `user_id`** letto lato server dalla connessione o dal
   contesto del servizio. Mai Person id, device id, browser id, nome, email,
   entità `person.*` o `localStorage`.
3. **Domus restringe, non eleva.**
   `effettivo(utente, azione) = permesso_HA ∧ capability_Domus`. Mai OR.
4. **Il frontend non è un'autorità.** Nascondere route, pulsanti, card e voci è
   UX; ogni azione sensibile si verifica nel backend Domus o in HA.
5. **Nessun confused deputy.** Il backend Domus non esegue mai, per conto di un
   utente, un'operazione che HA negherebbe a quell'utente. Le azioni sulle
   entità si eseguono con il contesto dell'utente, oppure con un controllo
   esplicito `check_entity` come fa oggi Irrigazione. Chiamate interne
   (`user is None`) solo per automatismi già autorizzati.
6. **Fail closed** sulle funzioni sensibili, con un recupero amministrativo
   documentato. Mai «in caso di errore tutti admin».
7. **Feature code chiede capability, non ruoli**: `can('energy.manage')`, mai
   `role === 'admin'`.

## 5. User, Person, Device

| | HA User | Person | Device |
| --- | --- | --- | --- |
| Ruolo | Principal di sicurezza | Identità domestica | Contesto fisico |
| Id | `user.id` | id interno di `person.*` | `client_id` locale (Alimentazione), nessuno per le preferenze |
| Usato per | Assignment, enforcement | Nome, foto, presenza, destinatari notifiche | Preferenze locali, policy di ricarica |
| Mai usato per | — | Autorizzazione | Autorizzazione |

Casi di associazione (quelli che HA permette davvero):

| Caso | Comportamento |
| --- | --- |
| A. User + Person collegata | Policy sul `user_id`; la UI mostra nome e foto della persona. |
| B. User senza Person | Policy sul `user_id`; la UI mostra nome e login dell'account. Profile disponibile (account domestico). |
| C. Person senza User | Nessuna policy: non può accedere. Resta destinataria di notifiche se ha dispositivi. |
| D. Admin HA | Ruolo predefinito `admin`; tiene sempre `access.manage` (§ 9). |
| E. Utente HA normale | Ruolo predefinito `member` (= comportamento di oggi). |
| F. Account di sistema / disattivato | Nessun accesso Domus (`require_household_account`), nessun assignment. |
| G. Più persone con lo stesso `user_id` | HA non lo impedisce del tutto: la risoluzione restituisce `ambiguous` e la UI lo mostra. La policy resta per utente e non cambia. |

Il device non diventa mai un'identità. Un tablet in Kiosk usato da tutta la casa
è un contesto UX. Se serve un limite reale, il pannello va loggato con un
**account HA dedicato** con ruolo `wall_panel` e, per la sicurezza vera, utente
HA di sola lettura dove basta.

## 6. Trust boundary e livelli di enforcement

```
Browser (non fidato) ──bridge/WS/REST──▶ Home Assistant (autorità) ──▶ backend Domus (autorità sui comandi Domus)
```

| Livello | Cosa | Natura |
| --- | --- | --- |
| 1. Visibilità UI | Nascondere voci, card, pulsanti | UX |
| 2. Accesso route | Schermata «non disponibile» per un indirizzo digitato | UX |
| 3. Guardie azioni frontend | `can()` prima di inviare; `callHaApi` | Defense in depth |
| 4. Backend Domus | `require_capability` sui comandi `domusos/*` e servizi `domusos.*` | **Autorità** sui comandi Domus |
| 5. Home Assistant | Admin, gruppi, `check_entity`, servizi admin | **Autorità** su tutto il resto, e limite superiore |

## 7. Modello

### Capability

- **Convenzione**: `dominio.azione`, due segmenti, minuscole con `_`.
  - Verbi: `view`, `control`, `manage`, più pochi specifici
    (`export`, `restore`, `reset`, `restart`, `run`).
  - Il dominio è un'area che l'utente riconosce.
  - Esempi: `energy.view`, `security.control`, `backup.restore`.
- **Granularità** per dominio e funzione, né admin/non-admin né un permesso per
  pulsante. Registro completo in [capability](access-control-capabilities.md).
- **Registro centrale versionato**, nel backend, con: id, dominio, descrizione,
  rischio (`low`/`medium`/`high`/`critical`), `requires_ha_admin`, natura
  dell'enforcement (`domus` / `ha_native` / `local`), ruoli predefiniti. Il
  frontend riceve solo l'elenco effettivo dell'utente (stringhe).

### Ruoli

- **V1: solo ruoli di sistema**, definiti nel codice e quindi versionati con
  l'integrazione: `admin` (Amministratore), `member` (Membro), `restricted`
  (Accesso limitato), `wall_panel` (Pannello). `locked` è interno e non si
  assegna.
- `wall_panel` è un ruolo per l'account HA di un pannello dedicato; il Kiosk
  resta una modalità del browser. I due si combinano, non si sostituiscono.
- `guest` arriva solo con credenziali HA temporanee e revocabili, come dice la
  roadmap.
- **Ruoli personalizzati**: V2, se servono, nello stesso store.
- **Owner**: nessun ruolo Domus a parte. È il flag `is_owner` di HA, mostrato
  come etichetta. Anche l'owner passa da HA ∧ Domus.
- Un ruolo può contenere capability con `requires_ha_admin`. Per un utente non
  admin restano negate (HA lo farebbe comunque) e la UI le mostra come
  «richiede amministratore Home Assistant».

### Assignment

- `user_id → role_id + grants`, **un solo ruolo per utente in V1**.
- **Grant personali**: capability aggiunte a un singolo account, solo se il
  registro le dichiara `user_grantable`. In V1 sono `access.control`
  (serrature, cancelli, garage, porte) e `security.control` (antifurto).
  Capability effettive = ruolo ∪ grant validi. Un grant non concedibile o
  sconosciuto rende lo store corrotto, mai filtrato.
- Ruoli multipli
  creerebbero problemi di semantica (unione, priorità) senza un bisogno
  concreto. Se in futuro servissero: sola unione, mai deny.
- **Solo ALLOW, nessun deny esplicito in V1**: restringere vuol dire non
  concedere.
- **Utente senza assignment**:
  - admin HA → `admin`;
  - utente HA normale → `member`, che equivale a ciò che può fare oggi.
  - L'attivazione non rompe nessuna casa e non concede nulla che HA non conceda
    già. «Nuovi utenti partono limitati» può diventare un'opzione (Q2).

### Regola di valutazione

```
authorize(user, capability, resource?):
  user mancante, di sistema o disattivato        → DENY
  store non affidabile (§ 10)                     → solo capability del ruolo "locked" (+ access.manage agli admin HA)
  capability.requires_ha_admin e non user.is_admin → DENY
  capability ∉ ruolo(user) ∪ grant(user)           → DENY (access.manage è sempre concessa agli admin HA)
  resource è un'entità → HA user.permissions.check_entity(resource, policy) deve essere vero
  → ALLOW
```

Per i comandi nativi HA il frontend applica la stessa regola come UX, e HA
decide comunque.

## 8. Dove avviene l'enforcement

**Backend** (futuro modulo `custom_components/domusos/access/`):

- `can(user, capability) -> bool` e `authorize(...)` che lancia `AccessDenied`
  con un codice stabile (`access_denied`) e la capability mancante;
- decoratore `require_capability("energy.view")` per i comandi WebSocket,
  accanto a `websocket_api.require_admin` dove serve ancora;
- `authorize_service_call(call, capability)` per i servizi
  (`call.context.user_id`), così il percorso servizio non è più aperto del
  percorso WebSocket;
- nuovi comandi `domusos/access/get_self` (ruolo, capability effettive,
  revisione), `domusos/access/subscribe` (push al cambio), e per l'admin
  `list`, `assign`, `get_audit`.

**Domus non espone endpoint HTTP propri** (solo file statici), quindi non esiste
un REST equivalente da proteggere. Ogni nuovo endpoint dovrà usare la stessa
primitiva.

**Frontend**:

- un `can()` economico (lookup in un `Set`) alimentato da `get_self`;
- sostituisce `DashboardCapability`, con mappatura in [capability](access-control-capabilities.md);
- guardie su route e azioni;
- nessun motore di policy nel Boot: arrivano solo stringhe.

**Pipeline di un'azione**:

```
richiesta → principal (HA, lato server) → capability Domus → permesso HA → azione
```

## 9. Bootstrap, ultimo admin, recupero

- **Bootstrap.** Nessun «primo admin diventa owner».
  - Finché lo store non esiste vale il default del § 7: admin HA → `admin`,
    altri → `member`.
  - Il primo salvataggio da Persone e accessi crea lo store.
  - Nessun passaggio di onboarding obbligatorio, nessuna finestra in cui nessuno
    può amministrare.
- **Lockout impossibile per costruzione.**
  - `access.manage` richiede l'admin HA ed è **sempre** concesso a ogni admin HA,
    qualunque sia il suo ruolo Domus.
  - HA garantisce un owner admin, quindi esiste sempre qualcuno che può
    amministrare.
  - Abbassare il ruolo Domus di un admin HA (es. un account admin usato su un
    pannello) limita la sua UI, ma non gli toglie il recupero.
  - È onesto: un admin HA può comunque modificare HA e i file `.storage`. Domus
    non può essere una barriera contro di lui.
- **Altri vincoli.** I ruoli di sistema non si cancellano. Assegnare un ruolo
  inesistente è rifiutato. Con i ruoli personalizzati (V2), un ruolo assegnato
  non si può eliminare.
- **Recupero.**
  - Comando WebSocket `domusos/access/reset_policy`, solo per l'admin HA
    attivo della connessione: mette da parte lo store e torna al default. Non
    è un servizio HA, quindi automazioni e script non lo raggiungono (D28).
  - Lo stesso dalla pagina Persone e accessi quando lo store è illeggibile.
  - In ultima istanza, eliminare `.storage/domusos.access.v1` a HA fermo
    (documentato).
  - Mai via `localStorage`.

## 10. Policy store

- **Dove**: `Store` di HA `domusos.access.v1` nel backend, come gli store
  esistenti. Scritture atomiche gestite da HA. Mai autorità solo nel browser.
- **Schema proposto** (da confermare in P2.1):

```json
{
  "schema": "domusos-access-policy",
  "version": 1,
  "revision": 42,
  "updated_at": "2026-10-20T12:00:00Z",
  "assignments": {
    "<ha_user_id>": { "role": "restricted", "assigned_at": "…", "assigned_by": "<ha_user_id>" }
  },
  "audit": [ { "at": "…", "by": "<ha_user_id>", "event": "assignment_changed", "user_id": "…", "from": "member", "to": "restricted" } ]
}
```

- **Privacy**: solo id. Nome, email e foto arrivano da HA e dal Profile al
  momento della visualizzazione, mai copiati.
- **Concorrenza**: `expected_revision` su ogni scrittura (come Energy e
  Irrigazione), conflitto esplicito se è cambiato.
- **Stati** (modello di Alimentazione):

| Stato | Causa | Comportamento |
| --- | --- | --- |
| `absent` | Mai creato | Default del § 7 (nessuna restrizione nuova) |
| `ready` | Valido | Policy applicata |
| `corrupt` | JSON non valido, campi errati | File in quarantena (`.corrupt.<ts>`), issue di riparazione HA. Non admin → ruolo `locked` (solo viste e Profile). Admin HA → `locked` + `access.manage` per il recupero (D23). |
| `unsupported` | `version` più nuova | Come `corrupt`, senza toccare il file (rollback dell'integrazione) |
| `migration_failed` | Migrazione non riuscita | Come `corrupt`; l'originale resta |

`locked` è un ruolo interno, mai assegnabile: il pavimento sicuro quando la
policy non si può leggere.

- **Migrazioni**: funzioni pure `vN → vN+1` con test, eseguite al caricamento e
  scritte solo se riescono. Nessuna migrazione iniziale: lo store nasce v1.

## 11. Aggiornamenti dal vivo, revisione, cache

- Ogni scrittura incrementa `revision`.
  - Il backend notifica gli iscritti a `domusos/access/subscribe` con
    `{revision, role, capabilities}` dell'utente.
  - Una tab con revisione vecchia si aggiorna.
- Il backend valuta **a ogni richiesta** con `connection.user` vivo.
  - HA invalida `is_admin` e i permessi quando cambiano i gruppi
    (`User.invalidate_cache`), quindi un downgrade vale subito.
  - Un utente rimosso non ha più sessione; HA emette `user_removed`, che il
    manager userà per ripulire l'assignment.
- La cache del frontend serve per la UX. Fallback: la rilettura di 15 s già
  presente per `auth/current_user`. Non è mai un'autorità.

## 12. Strategie per area

| Area | Strategia |
| --- | --- |
| **Route** | Ogni route ha una capability `*.view` ([route](access-control-capabilities.md#route)). Indirizzo diretto non autorizzato → schermata «Non disponibile per il tuo account» nella shell; nessun redirect silenzioso. |
| **Azioni** | Native HA: guardia UX + HA decide. Domus: `require_capability` nel backend. |
| **Profile** | `profile.manage` = solo il proprio profilo; i comandi Profile non accettano un utente bersaglio. Separato da `people.manage` e `access.manage`. Concesso a ogni ruolo con account domestico, tranne `wall_panel`. |
| **Impostazioni Dispositivo** | Aspetto, lingua, screensaver, kiosk sono locali al browser: `device.manage` decide solo se la UI li offre (un pannello `wall_panel` non esce dal Kiosk dalla UI). Non è sicurezza: chi ha il browser può cambiare `localStorage`. Alimentazione resta backend: admin HA + `device_power.manage`. |
| **Impostazioni Casa** | `dashboard.edit`, `house.manage`, `security.manage`, `people.manage`, `waste.manage`: tutte richiedono admin HA perché scrivono in `set_system_data`, nei registri o in `person/*`. |
| **Impostazioni Sistema** | `system.manage` (connessione, dispositivi, entità), `system.view` (pagina Sistema), `backup.export`, `backup.restore`, `dashboard.reset`, `ha.restart`: admin HA, rischio alto o critico. |
| **Energy** | Mini-app autonoma: `energy.view` (get_state/get_history, oggi aperti → da proteggere nel backend), `energy.manage` (oggi admin). Le impostazioni restano nell'app. |
| **Irrigazione** | Mini-app autonoma: `irrigation.view`, `irrigation.control` (zone, pausa; resta anche `check_entity`), `irrigation.manage`. Servizi `domusos.*` con lo stesso controllo. |
| **Kiosk** | Device mode, non sicurezza. Nasconde la UI; l'Access Control decide l'autorità. Pannello con limiti reali = account HA dedicato con ruolo `wall_panel` + Kiosk. |
| **Notifiche** | Il destinatario resta la Person (id interno). Il principal resta l'HA User. Chi sceglie i destinatari (`list_recipients`) resta admin. |

## 13. Domus Lab e Domus Intelligence (futuro)

- **Domus Lab**: un modulo personalizzato non ha un percorso privilegiato.
  Dichiara le capability che usa ed esegue le azioni con la stessa pipeline e
  lo stesso utente. Custom UI → stessa autorizzazione.
- **Domus Intelligence**:
  - le letture rispettano le capability `*.view` dell'utente;
  - le azioni passano da `authorize()` con l'utente che ha chiesto, non con il
    sistema;
  - «Chiedi a Domus di aprire la serratura» senza `access.control` → DENY;
    «disarma l'allarme» senza `security.control` → DENY.
  - `DomusAction` (`core/actions.py`) dovrà portare l'id dell'utente richiedente
    e la capability: oggi ha `safety_policy` e `requesting_decision_id`, ma non
    il principal.
  - Le azioni automatiche (`user is None`) restano limitate a ciò che un admin ha
    configurato.

## 14. Audit

- **V1**, persistente nello store, limitato (ultimi 200):
  - creazione e modifica di assignment;
  - reset e recupero;
  - cambio di stato dello store.
- **V1**, in memoria con `DomusAuditService` esistente (500 voci): accessi negati
  ai comandi Domus sensibili (`high`/`critical`).
- **Futuro**: azioni sensibili riuscite, export.

## 15. UX dei permessi

| Caso | Comportamento |
| --- | --- |
| Funzione non disponibile all'account | Nascosta (voce, card, route nel menu) |
| Azione visibile in contesto ma non permessa (es. card serratura in una stanza) | Mostrata **disabilitata** con il motivo («Il tuo account non può aprire serrature») |
| Indirizzo diretto non autorizzato | Schermata «Non disponibile per il tuo account», con ritorno a Home |
| Permesso revocato a pagina aperta | Al push di revisione: la pagina si chiude con un avviso; azioni in corso rifiutate |
| Deny del backend Domus (`access_denied`) | Avviso localizzato, la UI si riallinea con `get_self` |
| Deny di HA (`unauthorized`) | Avviso «Home Assistant non consente questa azione al tuo account», nessun retry |

Autorizzazione ≠ sicurezza d'uso: conferme, frasi di conferma, passkey locale,
codici allarme e rate limit restano dove sono, anche per chi è autorizzato.

## 16. Ambito future

- **Resource scope (V2)**: `lights.control` limitato ad aree o piani (registri
  HA), entità, app.
  - Valido come sicurezza solo per i comandi Domus.
  - Per i nativi HA filtra la UI.
  - Lo schema V1 lascia spazio: assignment come oggetto, non come stringa.
- **Multi-house**: l'integrazione è `single_config_entry`, una casa per HA. Lo
  store vive nell'istanza HA: nessuno schema globale da riprogettare.
- **Premium**: l'enforcement non dipende da licenze. Un eventuale gating
  commerciale è un livello separato e non tocca la correttezza.
- **Prestazioni**:
  - registro e valutazione nel backend, O(1) per richiesta;
  - frontend con un `Set` di stringhe;
  - niente nel Boot oltre a quello.

## 17. Rollout

1. **Default = comportamento di oggi**: admin HA → `admin`, altri → `member`.
2. **Shadow**: il backend calcola ALLOW/DENY senza bloccare e conta le
   differenze nelle diagnostiche. Serve a dimostrare che il default coincide con
   oggi, come il shadow mode del Grid Engine.
3. **Flag di enforcement** nello store (`enforcement: "shadow" | "enforced"`),
   modificabile solo da admin HA. Passa a `enforced` per default solo dopo la
   validazione.
4. Kiosk, Profile, automazioni HA e notifiche non cambiano percorso.

## 18. Strategia di test (futura)

| Livello | Cosa |
| --- | --- |
| Unit policy engine | Default, ruoli, `requires_ha_admin`, `locked`, stati dello store, migrazioni |
| Backend enforcement | Ogni comando `domusos/*` e servizio `domusos.*` dichiara una capability (test che fallisce se un comando non ne ha) |
| Contratto identità | Il principal arriva solo da `connection.user` / `call.context`; payload con `user_id` rifiutato |
| Integrazione WS | Comandi chiamati direttamente, senza la UI |
| Frontend | Route, voci e azioni nascoste o disabilitate secondo `can()` |
| E2E | Account admin, member, restricted, wall_panel |

I cinque test di sicurezza obbligatori sono nel
[threat model](access-control-threat-model.md#test-di-sicurezza-obbligatori).

## 19. Roadmap

| Fase | Contenuto |
| --- | --- |
| **P2.1** ✓ | Registro capability (backend, versionato) + ruoli di sistema + grant personali + store `domusos.access.v1` con stati, quarantena, revisione + `domusos/access/get_self` + recupero `domusos/access/reset_policy` (WebSocket, P2.1.2). Nessun enforcement. [Fondamento](access-control-foundation.md). |
| **P2.2** ✓ | Motore centrale (`authorize`, `can`, `require_capability`, `authorize_action`), adattatori WebSocket e servizi, registro delle 38 superfici backend, contratto S8. Nessun enforcement. [Autorizzazione](access-control-authorization.md). |
| **P2.3** ✓ | Shadow authorization su tutte le 36 superfici backend osservabili, confronto con l'esito reale, contatori in memoria senza identità, diagnostica admin (`get_shadow_diagnostics`, `reset_shadow_diagnostics`). Nessun enforcement. [Shadow](access-control-shadow.md). L'audit V1 delle decisioni resta fuori: lo shadow non è un audit (D41). |
| **P2.4** ✓ | Frontend: profilo da `get_self` (anche nel bridge, solo quello), `can()`, tabella unica delle route, guardia e «Non disponibile», navigazione e Impostazioni filtrate, controlli di allarme, serrature e ingressi nascosti senza capability, «Torna in Home Assistant» con `ha_frontend.open`, `DashboardCapability` decisa da Access Control. Solo esperienza d'uso. [Frontend](access-control-frontend.md). |
| **P2.4.1** ✓ | Persone e accessi minima, **prima** dell'enforcement: Impostazioni › Persone e accessi › Ruoli e permessi. Un admin HA attivo assegna a un account il ruolo (`admin`, `member`, `restricted`, `wall_panel`) e i grant `access.control` / `security.control`, con `expected_revision`, conflitto senza sovrascrittura e audit; ripristino della policy con conferma. Comandi `list_accounts`, `set_assignment`, `remove_assignment` (43 superfici); bridge `access_admin_v1`. Esci per ogni account (Q12), offline fail closed (Q13). Nessun enforcement nuovo. [Persone e accessi](access-control-people-access.md). |
| **P2.5A** ✓ | Design dell'enforcement e chiusura di Q10: due percorsi (utente, contesto HA non attribuito), `allow_unattributed_ha_context` per azione con default falso, solo i cinque servizi dell'Irrigazione, nessun principal sintetico, rollout per dominio. Nessun comportamento cambia. [Enforcement](access-control-enforcement.md). |
| **P2.5B** ✓ (validata su Linux, run 39794988320) | Regola Q10 nel motore e negli adattatori, `allow_unattributed_ha_context` sui cinque servizi dell'Irrigazione, motivo `allowed_unattributed_ha_context`, `rules_version: 2` nella diagnostica, Q14 e Q15 chiuse; ancora shadow. [Enforcement](access-control-enforcement.md#16-p25b-cosa-è-stato-implementato). |
| **P2.5C** ✓ | QA shadow reale in casa con la regola Q10 (1.6.0-dev.20261022.2, 23 ottobre 2026): 15 chiamate di servizio da automazione, tutte `shadow_allow` con `allowed_unattributed_ha_context`; 10 WebSocket admin `allowed`; `would_block` 0, nessun mismatch né errore di shadow. [Enforcement](access-control-enforcement.md#18-validazione-reale-in-casa-p25c). |
| **P2.5D.1** ✓ (validata su Linux, run 39929518474, e in casa il 23 ottobre 2026: non admin rifiutato con `enforced_deny`) | Primo enforcement reale: i quattro comandi dell'Alimentazione (`device_power.manage`), `enforced` nel registro, una decisione per diagnostica e rifiuto, `access_denied` senza eseguire l'handler, audit dei rifiuti, diagnostica `partial` e `enforced_deny`, `rules_version: 3`. Gli altri domini restano shadow. [Enforcement](access-control-enforcement.md#19-p25d1-alimentazione-enforced). |
| **P2.5D.1.1A** ✓ | Design del pannello a parete condiviso: dispositivo, utente, sessione e ruolo separati; sessione base e sessione personale temporanea; nessuna autenticazione dalla scelta del profilo; «accesso completo alla casa» ≠ amministratore. Fasi 1.1B–1.1E da fare. [Pannello condiviso](shared-wall-panel-identity.md). |
| **P2.5D** | Enforcement sui comandi Domus, un dominio alla volta (Alimentazione, Raccolta rifiuti, Energy, Profile, Irrigazione WebSocket, Irrigazione servizi) + i 5 test di sicurezza. |
| **P2.6** | Persone e accessi completa: ospiti, pannelli dedicati, messaggio onesto sui limiti nativi HA dove si agisce. Ruoli per utente e recupero sono arrivati in P2.4.1. |
| **P2.7** | Resource scope (aree/piani), ruoli personalizzati se confermati. |

## 20. Decisioni

| Id | Decisione |
| --- | --- |
| D1 | Principal = HA `user_id` letto lato server (`connection.user`, `call.context.user_id`). |
| D2 | Person = identità domestica (presenza, profilo, notifiche, foto), mai principal. |
| D3 | Effettivo = permesso HA ∧ capability Domus. Domus non eleva mai. |
| D4 | Device = contesto UX locale, mai identità. Kiosk non è sicurezza. |
| D5 | Il frontend non è autorità; enforcement nel backend Domus per i comandi Domus, in HA per i nativi. |
| D6 | Per i comandi nativi HA, Domus Access Control è una regola della casa, non una barriera: va scritto nella UI. |
| D7 | Capability `dominio.azione`, registro chiuso nel backend, tipo distinto dalle capability dei dispositivi del Core. |
| D8 | V1: ruoli di sistema, un ruolo per utente, solo ALLOW. |
| D9 | Default senza assignment: admin HA → `admin`, altri → `member` (= oggi). |
| D10 | `access.manage` richiede admin HA ed è sempre concesso agli admin HA: niente lockout, niente bootstrap speciale. |
| D11 | Store backend `domusos.access.v1` con revisione, quarantena, stati; non leggibile → `locked` per i non admin, mai fail open. |
| D12 | Recupero = comando WebSocket admin `domusos/access/reset_policy` (D28) + pagina in P2.6; mai `localStorage`. |
| D13 | Rollout: default identico a oggi → shadow → enforcement con flag. |
| D14 | Nessun confused deputy: il backend agisce con il contesto o il controllo `check_entity` dell'utente. |
| D15 | Notifiche: destinatario Person, principal User; invariato. |
| D16 | (rivede Q4) `access.control` = accesso fisico (serrature, porte, cancelli, garage); `security.control` = solo antifurto. Due capability separate. |
| D17 | `member` non include `access.control` né `security.control`: arrivano solo da un grant personale. |
| D18 | Assignment = ruolo + grant personali; capability effettive = ruolo ∪ grant validi. |
| D19 | `ha_frontend.open` (comando «Torna a Home Assistant») è solo UX: `admin` sì, `member`/`restricted`/`wall_panel` no. Nasconderlo non impedisce di aprire HA. |
| D20 | In V1 solo `access.control` e `security.control` sono `user_grantable`. |
| D21 | `access.manage` non è concedibile, richiede l'admin HA ed è sempre disponibile agli admin HA. |
| D22 | (rivede Q6) `wall_panel` include `energy.view`, non `energy.manage`; `restricted` non vede l'energia. |
| D23 | (rivede la tabella del § 10) Store non affidabile: anche l'admin HA scende a `locked` + `access.manage`, non ad `admin`. Recupera senza ottenere altro per sorpresa. |
| D24 | Reset = store `absent` (default), file precedenti spostati accanto e mai cancellati, audit nel `DomusAuditService`; mai «tutti admin». |
| D25 | `get_self` restituisce anche `user_id`, perché il client verifichi che la risposta sia dell'account mostrato; non è mai un input. |
| D26 | `domusos/access/subscribe` rimandato a P2.3/P2.4: in P2.1 non esistono scritture da client, quindi niente da notificare. |
| D27 | (rafforza D6) Persone e accessi dichiarerà che le autorizzazioni Domus valgono dentro Domus e che Home Assistant mantiene i propri permessi. |
| D28 | **Approvata e implementata (P2.1.2)**: il reset della policy richiede l'admin HA attivo della connessione WebSocket (`connection.user`) e non è disponibile ad automazioni e script. Il servizio `domusos.reset_access_policy` è stato rimosso. Una credenziale admin usata da uno strumento esterno agisce come quell'admin: è il perimetro di HA, non un aggiramento. |
| D29 | (P2.2) L'autorizzazione è centralizzata in `access/authorization.py`: le funzioni chiedono `can`/`authorize`/`require_capability`, mai `is_admin`, ruoli o liste di capability. |
| D30 | Eccezione = deny: qualsiasi errore nel motore o negli adattatori è un deny `internal_error`, mai un allow; `can` restituisce `False`. |
| D31 | Ogni comando WebSocket `domusos/*` e servizio `domusos.*` è dichiarato in `access/actions.py` con la capability richiesta (e solo capability `domus`). |
| D32 | Una superficie backend registrata senza dichiarazione fa fallire i contratti (S8), sia dal sorgente sia dalle registrazioni reali di HA. |
| D33 | Le uniche eccezioni a «una capability per azione» sono nominate e motivate: `get_self` (`authenticated_bootstrap`) e `reset_policy` (`recovery`, `access.manage`). |
| D34 | Un servizio chiamato senza utente produce una decisione deny `no_principal`; non viene applicata in P2.2, e la regola per P2.5 dipende dalle misure di P2.3 (Q10). Precisata da D61–D65. |
| D35 | Nessun principal di sistema, di automazione o «fidato» in V1. |
| D36 | Nuova capability `waste.view` (bassa, `domus`) per `waste_collection/get_config` e `preview`, in tutti i ruoli, come oggi (Q9, chiusa). |
| D37 | (P2.3) Lo shadow non blocca: la decisione viene calcolata e contata, la richiesta corre identica (stessa risposta, stessi errori, stesse eccezioni). Un deny shadow non è un deny reale. |
| D38 | Le statistiche shadow sono solo in memoria: niente Store, file, recorder o audit; si azzerano al riavvio di HA, non alla ricarica dell'integrazione. |
| D39 | Diagnostica limitata: contatori su dimensioni chiuse (azione, origine, principal presente, ruolo, motivo, esito, confronto), tetto rigido di 2048 chiavi, al massimo 50 campioni recenti di differenze. |
| D40 | Nessun dato personale nella diagnostica: niente `user_id`, nome, persona, token, payload o stato delle entità; si conta *cosa* verrebbe bloccato, non *chi*. |
| D41 | Lo shadow non scrive nel `DomusAuditService`: è osservabilità, non audit di sicurezza. |
| D42 | Le protezioni di oggi restano: `require_admin`, `check_entity`, il solo profilo proprio, il controllo admin del reset. Lo shadow riguarda solo il nuovo motore. |
| D43 | `reset_policy` resta enforced (P2.1.2) ed è esente dallo shadow, come `get_self` (bootstrap) e la diagnostica stessa; le esenzioni sono nel contratto, con il motivo. |
| D44 | Le statistiche si riferiscono a una sola policy: una nuova finestra si apre all'avvio, al reset manuale e a ogni cambio di stato o revisione della policy. |
| D45 | La diagnostica shadow è un comando WebSocket per l'admin HA attivo (`access.manage`), protetto direttamente come il reset; nessun principal di sistema (D35) e Q10 decisa sui dati. |
| D46 | (P2.4) Il frontend legge ruolo e capability solo da `domusos/access/get_self`, in memoria, una volta per account e connessione; nessun polling. È esperienza d'uso, non un limite di sicurezza. |
| D47 | Una sola tabella delle route (`navigation/routeAccess.ts`): ogni route ha una capability o un'esenzione motivata; guardia, navigazione e Impostazioni la leggono. Contratto come S8. |
| D48 | Fail closed: in caricamento, in errore o senza Access Control non si concede nulla; nessuna UI privilegiata compare per un istante; un cambio di account invalida il profilo nello stesso render. |
| D49 | Le voci non concesse sono nascoste; un'informazione resta visibile senza il suo comando; un'azione autorizzata ma non disponibile resta disabilitata. |
| D50 | `DashboardCapability` resta come nome legacy, decisa dal profilo (`LEGACY_CAPABILITY_MAP`); niente `isAdmin` come capability, niente controlli sul ruolo nel codice delle funzioni. |
| D51 | Il bridge del pannello inoltra solo `get_self` di Access Control; `reset_policy` e la diagnostica shadow restano fuori finché una pagina non le usa. Aggiornata da D59. |
| D52 | Persone e accessi minima (ruolo e grant) prima dell'enforcement P2.5 (P2.4.1). **Fatta.** |
| D53 | (P2.4.1) Solo un admin HA attivo assegna ruoli e grant: `require_admin` di HA più `access.manage` sul principal della connessione, nello stesso handler. Nessuna delega a un non admin (D21). |
| D54 | In V1 si assegnano solo i ruoli `admin`, `member`, `restricted`, `wall_panel` e i grant `access.control`, `security.control`. `locked` non è assegnabile; a un `admin` i grant non vengono salvati. |
| D55 | Nessun deny esplicito, ruolo personalizzato o resource scope in V1: un account ha il suo ruolo più i grant, nient'altro. |
| D56 | Ogni scrittura porta `expected_revision`; un conflitto non sovrascrive mai, la UI lo dice e ricarica dal backend scartando la bozza. «Ripristina ruolo predefinito» rimuove l'assegnazione invece di scrivere il default. |
| D57 | Il ripristino della policy resta `domusos/access/reset_policy` (P2.1.2), ora raggiungibile da Ruoli e permessi con conferma esplicita, anche da un admin `locked`. |
| D58 | Chi agisce e cosa possiede non vengono mai dal messaggio: schema chiuso, `assigned_by`/`assigned_at` scritti dal server, bersaglio letto da HA (esistente, attivo, non di sistema). Ogni cambio è un record nel `DomusAuditService`, con soli id. |
| D59 | Il bridge del pannello inoltra anche `list_accounts`, `set_assignment`, `remove_assignment` e `reset_policy` (capability `access_admin_v1`) con un validatore a chiavi esatte; i comandi girano sulla connessione `hass` dell'utente del pannello, mai con un'identità host. La diagnostica shadow resta fuori. |
| D60 | Ogni account autenticato può uscire da Home Assistant da Impostazioni (Q12). Offline, Domus resta fail closed con riprova, riconnessione e logout raggiungibili (Q13). |
| D61 | (P2.5A, Q10) Due percorsi di autorizzazione: l'utente (`connection.user`, `context.user_id`) e il contesto HA non attribuito. Nessun principal sintetico, nessun ruolo di sistema o di automazione (rafforza D35). |
| D62 | Se c'è un utente, decide solo l'ACL dell'utente: un suo deny non ricade mai sul percorso senza utente, anche con un `parent_id` (nessun downgrade). Le WebSocket non hanno percorso senza utente. |
| D63 | `parent_id` è un segnale di provenienza, mai authority: rende solo idonea una chiamata senza utente per le azioni che lo ammettono. Aggiorna la regola dello shadow «il `parent_id` non decide nulla». |
| D64 | Il percorso senza utente è opt-in per azione nel registro: `allow_unattributed_ha_context`, booleano, default falso, solo superfici `service` con capability `domus` non admin. In V1 è vero esattamente per i cinque servizi dell'Irrigazione; mai per amministrazione, recovery, bootstrap, diagnostica, `access.*` o capability critiche. |
| D65 | Senza utente e senza `parent_id`, o con un contesto malformato: deny `no_principal`. |
| D66 | Un'esecuzione HA non attribuita è autorità della casa, non delega di un utente. Un'automazione innescata da un utente vale come decisione della casa; nessuna euristica per ricostruire chi l'ha innescata. |
| D67 | Un solo motivo nuovo, `allowed_unattributed_ha_context`, per gli allow del percorso senza utente; la decisione non ha `principal_id` né ruolo. I deny restano `no_principal`, distinti dall'origine. |
| D68 | La regola sta nel motore (`authorize_unattributed_action`, puro) e nell'adattatore dei servizi; nessun controllo su `parent_id` negli handler. La classificazione del contesto è una sola per decisione e diagnostica. |
| D69 | L'enforcement si accende per superficie nel registro (`enforced`, default falso), con un contratto che elenca le superfici enforced; nessun interruttore a runtime né da interfaccia; rollback = versione precedente (Q15). |
| D70 | P2.5 in quattro passi: A design, B regola Q10 in shadow, C QA reale in casa, D enforcement per dominio dal meno rischioso; letture e scritture di un dominio insieme. |
| D71 | Una volta enforced, security > availability: ogni errore di autorizzazione è un deny (WebSocket `access_denied`, servizi `Unauthorized`); audit dei deny applicati, nessun audit per chiamata degli allow senza utente, mai un attore inventato. |
| D72 | Lo shadow resta come diagnostica dell'enforcement con una sola decisione per richiesta; dopo P2.5B `would_block` si riferisce alle regole nuove e la diagnostica dichiara la versione delle regole. |
| D73 | (P2.5B, Q14) Uno store non affidabile (`corrupt`, `unsupported`, `migration_failed`) blocca anche il contesto HA non attribuito: deny `locked`, senza eccezioni per l'Irrigazione. `absent` resta affidabile, con i ruoli predefiniti. Il recupero resta `reset_policy`. |
| D75 | (P2.5D.1) L'enforcement sta nell'instrumentation, guidato da `ActionContract.enforced`: una sola decisione per richiesta serve a diagnostica e rifiuto; il rifiuto non dipende dai contatori; un'azione enforced esente o un servizio enforced fanno fallire la registrazione invece di restare aperti. |
| D76 | (P2.5D.1) Un rifiuto applicato risponde `access_denied` prima di `require_admin` (che resta), non esegue l'handler, è una voce di audit `access.enforcement` con soli id e codici; nella diagnostica è `enforced_deny`, non un mismatch. |
| D77 | (P2.5D.1) La diagnostica dice la verità sull'enforcement parziale: `mode` `shadow` / `partial` / `enforced`, `enforced` vero se qualcosa è rifiutato davvero, `enforced_actions` e `by_action[*].enforced`. |
| D78 | (P2.5D.1.1A, Q16) Dispositivo ≠ utente ≠ sessione ≠ ruolo. Il pannello a parete è prima di tutto una modalità del dispositivo; il ruolo `wall_panel` è il ruolo dell'account tecnico di base del tablet e non identifica chi lo usa. |
| D79 | (Q21) La configurazione privilegiata del dispositivo (Alimentazione, modalità pannello, timeout della sessione personale, Kiosk del pannello) richiede un'autorità da amministratore; l'account del pannello non riceve `device_power.manage` né altre capability da admin perché gira su quel tablet. |
| D80 | Sul tablet condiviso toccare una persona non autentica; persona, presenza, tracker e prossimità non sono mai autorità; Domus non memorizza password di HA né usa un PIN come loro sostituto; niente `adminMode`, `setActiveRole` o impersonificazione. |
| D81 | (Q18, principio) Una sessione personale nasce solo da un'autenticazione vera di HA e produce un vero `user_id`; più token salvati sul tablet (opzione C) e un PIN di Domus come identità (opzione D) sono esclusi in V1; la direzione è una seconda connessione HA solo in memoria e revocata alla fine (opzione B), da validare con uno spike. |
| D82 | (Q20) Le sessioni personali sul pannello sono temporanee: timeout, Esci, Blocca, Screensaver, ricarica, riavvio o connessione persa le terminano (bloccare = terminare) e riportano alla base; una sessione con capability di amministrazione ha un tetto non disattivabile. |
| D83 | (Q17) Accesso completo alla casa ≠ Amministratore: una persona può usare tutte le funzioni domestiche senza `access.manage`, recupero, persone o sistema; in V1 l'amministrazione richiede sempre un admin HA. |
| D84 | (Q22) Il ruolo `wall_panel` resta (KEEP) come ruolo dell'account tecnico di base, con le capability di oggi; un'eventuale rinomina sarà solo dell'interfaccia. |
| D74 | (P2.5B, Q15) Nessun interruttore a runtime che riporti allo shadow un sistema enforced: niente interfaccia, variabile d'ambiente, servizio, WebSocket, impostazione o flag nascosto. Il rollback è il deploy della versione precedente; il rollout passa da metadati statici per azione e da versioni. |

## 21. Domande aperte

| Id | Domanda | Proposta |
| --- | --- | --- |
| Q1 | Nomi e contenuto dei ruoli | **Deciso in P2.1**: Amministratore, Membro, Accesso limitato, Pannello |
| Q2 | Un nuovo utente HA parte `member` o `restricted`? | **Deciso**: `member` (default calcolato) |
| Q3 | `access.manage` delegabile a un non admin? | **Deciso**: no (D21) |
| Q4 | Cancelli e garage | **Deciso**: `access.control`, separato dall'allarme (D16) |
| Q5 | La UI dice che i limiti valgono solo dentro Domus? | **Deciso**: sì (D27) |
| Q6 | `energy.view` per `restricted` e `wall_panel` | **Deciso**: `restricted` no, `wall_panel` sì (D22) |
| Q7 | Ospiti: si aspetta il supporto HA a credenziali temporanee, o un account HA dedicato con ruolo `guest`? | Account dedicato, dopo P2.6 |
| Q8 | Il reset della policy deve essere una richiesta diretta di un admin HA attivo, mai un'automazione o uno script (D28 proposta). Un servizio HA non può garantirlo: le automazioni chiamano senza `user_id` (e `async_register_admin_service` le lascia passare); uno script avviato da un admin chiama con il suo stesso `Context`, indistinguibile da una chiamata diretta ([limite verificato](access-control-foundation.md#perché-non-un-servizio-audit-p211)). | **Chiusa: opzione B** (D28). Servizio rimosso, comando WebSocket `domusos/access/reset_policy` legato a `connection.user`. |
| Q9 | `waste.view` (calendario della Raccolta rifiuti, nella card rapida) va lasciata anche a `restricted` e `wall_panel`? | **Chiusa (approvata)**: `waste.view` resta ad `admin`, `member`, `restricted` e `wall_panel`. È un'informazione domestica di sola lettura, usata anche dalla card rapida della Raccolta rifiuti (D36). Comportamento invariato. |
| Q11 | `/settings/attention` (Centro attenzione): resta `dashboard.edit` come oggi o diventa una preferenza del dispositivo (`device.manage`)? | **Aperta / rimandata**: resta `dashboard.edit`; nessuna capability nuova solo per chiuderla |
| Q12 | Fuori dal pannello di HA, il logout di un member su desktop era in Connessioni (`system.manage`): va reso un'esenzione (la propria sessione) o basta quello del drawer mobile? | **Chiusa (P2.4.1)**: Esci in Impostazioni per ogni account autenticato, con conferma (D60) |
| Q13 | Senza connessione a Home Assistant le pagine protette mostrano «Home Assistant non collegato» invece del proprio stato «non collegato», e Impostazioni non elenca voci: va bene così (fail closed) o certe pagine del browser (Aspetto, Lingua, Connessioni) devono restare aperte offline? | **Chiusa per V1**: fail closed; restano riprova, riconnessione, logout e il recupero minimo (D60) |
| Q10 | In P2.5, cosa fare dei servizi chiamati senza utente (automazioni di Irrigazione)? Il deny `no_principal` le romperebbe | **Chiusa (P2.5A)** sull'evidenza reale del 22 ottobre 2026 (`start_irrigation_zone`: 3 chiamate senza utente con parent, 1 riuscita che sarebbe stata bloccata). Utente presente → ACL utente; senza utente con parent → solo azioni opt-in (i cinque servizi dell'Irrigazione); senza parent → deny. Nessun principal sintetico (D61–D66, [enforcement](access-control-enforcement.md)) |
| Q14 | Con lo store non affidabile, il percorso senza utente resta aperto per i servizi opt-in? | **Chiusa (P2.5B)**: no. `corrupt`, `unsupported` e `migration_failed` bloccano anche il contesto HA non attribuito (deny `locked`), senza eccezioni per l'Irrigazione; il recupero resta `reset_policy` (D73, [enforcement](access-control-enforcement.md#15-domande-nate-dal-design)) |
| Q15 | Serve un interruttore d'emergenza per tornare allo shadow senza reinstallare? | **Chiusa per V1**: no, nessun interruttore a runtime in nessuna forma; il rollback è la versione precedente; il rollout passa da metadati statici e versioni (D74) |
| Q16 | Il pannello a parete è un ruolo o una modalità del dispositivo? | **Chiusa (P2.5D.1.1A)**: prima di tutto una modalità del dispositivo; `wall_panel` resta il ruolo dell'account tecnico di base e non identifica la persona (D78, [pannello condiviso](shared-wall-panel-identity.md)) |
| Q17 | «Accesso completo» significa amministratore? | **Chiusa**: no. Accesso completo alla casa ≠ Amministratore (D83) |
| Q18 | Come si autentica una persona sul tablet condiviso? | **Aperta**: principio chiuso (autenticazione vera di HA, mai la scelta del profilo, D81); meccanismo da uno spike sull'opzione B (seconda connessione HA in memoria) nel pannello di HA, standalone e app Companion |
| Q19 | Identità della sessione base del pannello | **Aperta**. Proposta: un account HA tecnico per tablet, non admin, ruolo `wall_panel`, creato a mano in HA; uno condiviso solo con un unico tablet |
| Q20 | Le sessioni personali sul pannello scadono? | **Chiusa**: sono temporanee e tornano alla base a timeout o uscita; le sessioni admin non restano mai aperte a tempo indefinito; i valori sono configurabili (D82) |
| Q21 | Chi configura il dispositivo pannello? | **Chiusa**: serve un'autorità da amministratore; l'account del pannello non ottiene `device_power.manage` né altre capability da admin (D79) |
| Q22 | Futuro del ruolo `wall_panel` | **Chiusa per V1**: KEEP come ruolo tecnico di base (D84) |
| Q23 | Come presentare l'accesso completo alla casa? | **Aperta**. Proposta: ruolo di sistema `resident` (Membro più `access.control` e `security.control`) mostrato come «Accesso alla casa: Completo», separato da «Amministrazione: Gestisce Domus»; nell'immediato correggere la descrizione del ruolo Amministratore per chi non è admin HA |
