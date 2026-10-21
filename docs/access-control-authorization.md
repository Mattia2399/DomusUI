# Domus Access Control — autorizzazione (P2.2)

Il motore centrale che decide se una richiesta è autorizzata, e il registro di
tutte le superfici backend di Domus. **Non è collegato a nessun comando**:
nessuna richiesta viene bloccata, nessun comportamento cambia. L'enforcement
arriva in P2.5, dopo le misure in shadow mode (P2.3).

Collegati: [architettura](access-control-architecture.md),
[fondamento P2.1](access-control-foundation.md),
[capability](access-control-capabilities.md),
[threat model](access-control-threat-model.md).

## Livelli

| Livello | Dove | Fase |
| --- | --- | --- |
| Identità: chi è l'utente | `connection.user` / `call.context.user_id` → `identify` | P2.1, rifinita in P2.2 |
| Policy: ruolo, grant, capability | `resolve_access_profile`, store | P2.1 |
| **Autorizzazione: può farlo?** | `access/authorization.py`, `access/actions.py`, `access/adapters.py` | **P2.2** |
| Enforcement: blocca davvero | gli handler dei comandi | P2.5 |

Le funzioni non chiedono mai `user.is_admin`, il ruolo o una lista di
capability. Chiedono al motore: `can`, `authorize`, `require_capability`.

## File

| File | Contenuto | Dipendenze |
| --- | --- | --- |
| `access/authorization.py` | `identify`, `authorize`, `can`, `require_capability`, `authorize_action`, `require_action`, `AuthorizationDecision`, `DecisionReason`, `AuthorizationDeniedError` | solo `models`, `actions` (Python puro) |
| `access/actions.py` | `ACTION_CONTRACTS`: ogni comando WebSocket e servizio Domus con la capability richiesta | solo `models` (Python puro) |
| `access/adapters.py` | `authorize_user`, `authorize_user_action`, `require_user_capability`, `authorize_service_call`, `require_service_capability` | Home Assistant (contesto, utenti) |

`manager.principal_from_user` usa ora `identify`: una sola regola d'identità per
`get_self`, `reset_policy` e il motore. È la stessa regola di P2.1: niente
account di sistema, niente disattivati, `user_id` ben formato.

## Primitive

```python
authorize(principal, profile, capability, *, action=None) -> AuthorizationDecision
can(principal, profile, capability) -> bool
require_capability(principal, profile, capability, *, action=None) -> AuthorizationDecision  # o AuthorizationDeniedError
authorize_action(principal, profile, action) -> AuthorizationDecision
```

- `principal` è un `Principal` già verificato e `profile` il suo
  `AccessProfile` risolto (P2.1). Il motore non legge payload, store o Home
  Assistant: è sincrono, deterministico e non scrive nulla.
- `can` è il caso semplice: `True` solo con una decisione `allowed`, `False` per
  qualsiasi cosa inattesa.
- `require_capability` usa la stessa valutazione. Se è un deny solleva
  `AuthorizationDeniedError`:
  - sottoclasse di `AccessDeniedError`, codice `access_denied`;
  - porta la decisione;
  - nessun testo per l'interfaccia, il messaggio è `"<reason>: <capability>"`.

Adattatori HA:

```python
authorize_user(manager, user, capability, *, action=None)             # WebSocket: user = connection.user
authorize_user_action(manager, user, action)
require_user_capability(manager, user, capability, *, action=None)
await authorize_service_call(hass, manager, call, capability, *, action=None)  # call.context.user_id
await require_service_capability(hass, manager, call, capability, *, action=None)
```

Il servizio risolve l'utente con `hass.auth.async_get_user(call.context.user_id)`:
- senza `user_id` → `no_principal`;
- utente sconosciuto → `invalid_principal`;
- errore di HA → `internal_error`.

## Valutazione

In ordine; la prima regola che si applica decide:

| # | Condizione | Esito |
| --- | --- | --- |
| 1 | Nessun principal | deny `no_principal` |
| 2 | Principal non valido (id malformato) | deny `invalid_principal` |
| 3 | Nessun profilo | deny `policy_unavailable` |
| 4 | Capability non nel registro | deny `unknown_capability` |
| 5 | Capability con `requires_ha_admin` e principal non admin HA | deny `requires_ha_admin`, anche se un profilo costruito male la contenesse |
| 6 | Capability nel profilo risolto | **allow** `allowed` |
| 7 | Ruolo `locked` | deny `locked` |
| 8 | Altrimenti | deny `missing_capability` |
| — | Qualsiasi eccezione | deny `internal_error`, mai allow |

L'admin HA **non è un bypass**:
- il suo profilo risolto contiene `access.manage` in più, e nient'altro;
- con lo store non affidabile ha `locked` più `access.manage`;
- quindi `access.manage` → allow, mentre `energy.manage` e `system.manage` →
  deny `locked`.

## Decisione

```json
{
  "allowed": false,
  "reason": "missing_capability",
  "capability": "access.control",
  "action": "domusos/…",
  "principal_id": "<ha_user_id>",
  "role": "member",
  "policy_state": "ready",
  "policy_revision": 4,
  "requires_ha_admin": false,
  "enforcement": "ha_native"
}
```

- Contiene solo id e codici. Niente nome, email, persona o foto; niente grant,
  capability o policy, né dell'utente né di altri.
- È pensata per P2.3 (shadow mode): permette di confrontare «cosa succede
  oggi» con «cosa direbbe il motore» per azione, capability, principal, ruolo e
  motivo.
- Non esiste nessuna API che chieda i permessi di un altro utente.

### Motivi

| Codice | Significato |
| --- | --- |
| `allowed` | Consentito |
| `missing_capability` | Account valido, capability assente dal ruolo e dai grant |
| `locked` | Policy non affidabile: l'account è sul pavimento sicuro |
| `no_principal` | Nessun utente (per esempio un servizio chiamato da un'automazione) |
| `invalid_principal` | Account di sistema, utente sconosciuto, id malformato |
| `inactive_user` | Account disattivato |
| `requires_ha_admin` | Home Assistant la riserva agli amministratori |
| `policy_unavailable` | Access Control non è attivo o non c'è un profilo |
| `unknown_capability` | Capability inesistente |
| `unknown_action` | Azione non dichiarata nel registro |
| `internal_error` | Errore inatteso: sempre deny |

## Registro delle azioni

`ACTION_CONTRACTS` dichiara **38 superfici**: 33 comandi WebSocket e 5 servizi.
Sono tutte quelle che l'integrazione registra.

- La lista viene letta dal sorgente nel test e confrontata con le registrazioni
  reali di HA (`hass.data["websocket_api"]`, `hass.services`).
- Domus non ha endpoint HTTP propri, dispatcher o altri entry point.

Campi di ogni contratto:
- `id`: il nome esterno;
- `surface`: `websocket` o `service`;
- `auth_mode`;
- `capability`;
- `ha_check`: cosa HA o il modulo controllano già oggi, e che resta;
- `rationale`: obbligatorio per i casi non `capability`.

Rischio, descrizione e `requires_ha_admin` si leggono dal registro delle
capability, non vengono ripetuti.

| Modalità | Uso | Azioni |
| --- | --- | --- |
| `capability` | La capability dell'azione decide | 36 |
| `authenticated_bootstrap` | Basta un account valido con una policy: è il modo in cui il client scopre le proprie capability | `domusos/access/get_self` |
| `recovery` | `access.manage`, che solo un admin HA possiede (sempre, anche `locked`) | `domusos/access/reset_policy` (resta anche il controllo diretto admin di P2.1.2) |

### Mappa

| Superficie | Capability | Controllo HA di oggi |
| --- | --- | --- |
| `domusos/access/get_self` | — (bootstrap) | account domestico |
| `domusos/access/reset_policy` | `access.manage` (recovery) | admin |
| `domusos/device_power/get_state`, `save_policy`, `bind_policy`, `delete_policy` | `device_power.manage` | admin |
| `domusos/energy/get_state`, `get_history` | `energy.view` | — (aperti a ogni utente oggi) |
| `domusos/energy/get_profile`, `save_profile`, `discover` | `energy.manage` | admin |
| `domusos/irrigation/get_config`, `get_state`, `subscribe` | `irrigation.view` | `check_entity` lettura (filtra) |
| `domusos/irrigation/save_config`, `prepare_legacy_removal` | `irrigation.manage` | admin |
| `domusos/irrigation/start_zone`, `stop_zone`, `pause`, `resume`, `stop_all` | `irrigation.control` | `check_entity` controllo |
| `domusos.start_irrigation_zone`, `stop_irrigation_zone`, `pause_irrigation`, `resume_irrigation`, `stop_all_irrigation` | `irrigation.control` | `check_entity` controllo; nessun controllo senza utente |
| `domusos/profile/get_self`, `save_self`, `discover_devices`, `add_device`, `remove_device`, `update_device`, `test_self` | `profile.manage` (solo il proprio) | account domestico |
| `domusos/profile/list_recipients` | `notifications.recipients` | admin |
| `domusos/waste_collection/get_config`, `preview` | `waste.view` (nuova) | — (aperti a ogni utente oggi) |
| `domusos/waste_collection/save_config`, `test_notification` | `waste.manage` | admin |

- **`waste.view`** è l'unica capability nuova: rischio basso, `domus`. I due
  comandi di lettura della Raccolta rifiuti non avevano una capability, e la
  card rapida della barra laterale li usa per chiunque. È nei ruoli `admin`,
  `member`, `restricted` e `wall_panel`, come oggi (D36, domanda aperta Q9).
- **Esclusi** dal registro, perché il backend Domus non li esegue:
  - le azioni native di HA dal browser, cioè le capability `ha_native`:
    `access.control`, `security.control`, `devices.control`, registri,
    `dashboard.edit`…;
  - le capability `local` (`ha_frontend.open`, `device.manage`,
    `backup.export`, `developer.use`). Non esiste un endpoint inventato per
    nascondere un pulsante.
- **Calendario**: il calendario di Domus è un'entità HA (`calendar.domus_*`), e
  i suoi servizi sono quelli nativi di HA.

## Servizi e automazioni (audit, nessuna decisione)

I cinque servizi di Irrigazione sono pensati anche per le automazioni:
`start_irrigation_zone` ha un `request_id` «per client esterni e automazioni».

- Un'automazione li chiama **senza `user_id`**.
- Oggi `_service_user` restituisce `None` e il manager tratta `None` come
  chiamata interna: niente `check_entity`, comando eseguito.
- Con il motore la decisione sarebbe deny `no_principal`.
- Applicarla così romperebbe le automazioni di irrigazione esistenti.

Per questo:
- P2.2 non lo applica;
- non esiste un «principal di sistema» o «automazione fidata» (D35);
- P2.3 misurerà in shadow mode quante chiamate senza utente arrivano davvero;
- la regola per P2.5 va decisa sui dati (domanda aperta Q10).

I comandi WebSocket non sono raggiungibili dalle automazioni.

## Cosa non c'è ancora

- Nessun handler chiama il motore: un contratto lo verifica.
- Nessun log delle decisioni, nessun evento, nessun `subscribe`: tutto P2.3.
- Nessuna modifica al frontend: `can()` TypeScript, guard, «Torna a Home
  Assistant» restano per P2.4.
- Nessun resource scope (P2.7), nessun ruolo personalizzato, nessun ospite.

## Test

| File | Cosa | Dove gira |
| --- | --- | --- |
| `tests_python/test_access_authorization.py` | Matrice ruoli × capability, grant, `locked`, admin `locked`, admin senza bypass, profilo costruito male, capability sconosciuta, nessun principal o profilo, eccezione = deny, `require`, decisione senza dati personali, determinismo, `identify`, azioni, bootstrap, recovery, azione non dichiarata | ovunque (68 test) |
| `tests_python/test_access_actions.py` | S8 dal sorgente; superficie nuova non dichiarata scoperta; nessun'altra forma di registrazione; mappa esatta; nessun duplicato; capability esistenti e `domus`; superfici e nomi; solo due eccezioni motivate; controlli HA registrati; `ha_native`/`local` senza azioni; nessun modulo usa ancora il motore | ovunque (34 test) |
| `tests_python/test_access_authorization_ha.py` | Registrazioni reali di HA = registro (S8); adattatore WebSocket con utenti HA veri; account di sistema e disattivati; policy assente o rotta; servizio con e senza utente, utente sconosciuto, HA in errore; nessuna scrittura né cambio di revisione | Linux con fixture HA (7 test) |

## Validazione Linux

I test con il fixture di Home Assistant non girano su Windows (manca `fcntl`).
Li ha eseguiti GitHub Actions sul repository privato `archive`, con lo stesso
metodo di P2.1.2.

- **Come**: un branch temporaneo `ci/access-control-p22-linux-validation`,
  uguale al codice validato più un solo commit che aggiungeva quel nome al
  trigger `push` di `irrigation-core.yml`. Il branch è stato eliminato dopo la
  run e il commit temporaneo non è nella storia del feature branch.
- **Codice validato**: `731d277`.

| Run | Job | HA | Python | Test | Esito |
| --- | --- | --- | --- | --- | --- |
| 39578757178 | backend | 2025.1.0 | 3.12.15 | 1040 passati | **verde** |
| 39578757178 | backend | 2026.2.3 | 3.13.16 | 1074 passati | **verde** |

- **Job HA 2025.1**: `test_access_models` (70 test), `test_access_manager` (37),
  `test_access_contract` (4), `test_access_authorization` (68),
  `test_access_actions` (34), `test_access_authorization_ha` (7).
- **Job HA 2026.2.3**: tutta `tests_python`, comprese le stesse suite e
  `test_access_websocket` (16).
- **Registro**: `test_access_authorization_ha` ha confrontato le registrazioni
  reali di HA con il registro, in entrambe le versioni: 33 comandi WebSocket e
  5 servizi, nessuna superficie non dichiarata.
- **Nessun fallimento**, nessun test saltato.
- **HACS validation** fallisce su `archive` perché l'azione HACS valida solo
  repository pubblici. È un workflow separato: non blocca né sostituisce il job
  backend.
