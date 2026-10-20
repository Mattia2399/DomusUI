# Domus Access Control — architettura (P2.0)

Progetto di Domus Access Control prima di qualsiasi implementazione. Questo
documento non introduce comportamento: descrive cosa esiste oggi, cosa Domus
può davvero garantire e come costruirlo. Base `f5eb98d` (`main`, con Power,
Screensaver, Kiosk e il ciclo performance), branch
`feature/access-control-architecture`.

Documenti collegati:

- [threat model](access-control-threat-model.md);
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
  l'integrazione: `admin`, `member`, `restricted`, `wall_panel`. Nomi da
  validare lato prodotto (domanda aperta Q1).
- `guest` arriva solo con credenziali HA temporanee e revocabili, come dice la
  roadmap.
- **Ruoli personalizzati**: V2, se servono, nello stesso store.
- **Owner**: nessun ruolo Domus a parte. È il flag `is_owner` di HA, mostrato
  come etichetta. Anche l'owner passa da HA ∧ Domus.
- Un ruolo può contenere capability con `requires_ha_admin`. Per un utente non
  admin restano negate (HA lo farebbe comunque) e la UI le mostra come
  «richiede amministratore Home Assistant».

### Assignment

- `user_id → role_id`, **un solo ruolo per utente in V1**. Ruoli multipli
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
  store non affidabile (§ 10)                     → solo capability del ruolo "locked", tranne admin HA
  capability.requires_ha_admin e non user.is_admin → DENY
  capability ∉ ruolo(user)                         → DENY
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
  - Servizio HA solo admin `domusos.reset_access_policy`
    (`async_register_admin_service`): mette in quarantena lo store e torna al
    default.
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
| `corrupt` | JSON non valido, campi errati | File in quarantena (`.corrupt.<ts>`), issue di riparazione HA. Non admin → ruolo `locked` (solo viste e Profile). Admin HA → `admin` + recupero. |
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
  - «Chiedi a Domus di aprire la serratura» senza `security.control` → DENY.
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
| **P2.1** | Registro capability (backend, versionato) + ruoli di sistema + store `domusos.access.v1` con stati, quarantena, revisione + `domusos/access/get_self`. Nessun enforcement. |
| **P2.2** | Primitive backend `can`/`authorize`/`require_capability`/`authorize_service_call`; test di contratto che ogni comando dichiari una capability. |
| **P2.3** | Shadow authorization + diagnostiche (differenze rispetto a oggi) + audit V1. |
| **P2.4** | Frontend: `can()` da `get_self`, migrazione di `DashboardCapability`, route guard e schermata «Non disponibile». |
| **P2.5** | Enforcement sui comandi Domus (Energy view, Irrigazione, Raccolta rifiuti, Profile, Alimentazione) + i 5 test di sicurezza. |
| **P2.6** | Persone e accessi: ruoli per utente, recupero, messaggio onesto sui limiti nativi HA. |
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
| D12 | Recupero = servizio HA admin `domusos.reset_access_policy` + pagina; mai `localStorage`. |
| D13 | Rollout: default identico a oggi → shadow → enforcement con flag. |
| D14 | Nessun confused deputy: il backend agisce con il contesto o il controllo `check_entity` dell'utente. |
| D15 | Notifiche: destinatario Person, principal User; invariato. |

## 21. Domande aperte

| Id | Domanda | Proposta |
| --- | --- | --- |
| Q1 | Nomi e contenuto dei ruoli di sistema (`admin`, `member`, `restricted`, `wall_panel`): bastano? «Bambino» è un nome di prodotto per `restricted`? | Quattro ruoli, nomi in UI da decidere |
| Q2 | Un nuovo utente HA parte `member` (compatibile) o `restricted` (più prudente)? | `member` di default, opzione per la casa |
| Q3 | `access.manage` delegabile a un non admin (es. un genitore non admin)? | No in V1 |
| Q4 | Cancelli e garage (`cover` con device class `gate`/`garage`) contano come `security.control`? | Sì |
| Q5 | La UI dice esplicitamente che i limiti valgono solo dentro Domus (D6)? | Sì, in Persone e accessi |
| Q6 | `energy.view` va negato a `restricted`? | Sì per `restricted` e `wall_panel` |
| Q7 | Ospiti: si aspetta il supporto HA a credenziali temporanee, o un account HA dedicato con ruolo `guest`? | Account dedicato, dopo P2.6 |
