# Domus Access Control — shadow authorization (P2.3)

Il motore di [P2.2](access-control-authorization.md) è collegato a tutte le
superfici backend di Domus, **in shadow**: per ogni richiesta calcola cosa
deciderebbe Access Control, poi lascia correre la richiesta esattamente come
prima e confronta la decisione con quello che è successo davvero.

**Un deny shadow non è un deny reale.** Nessuna richiesta viene bloccata,
nessuna risposta cambia, nessun errore viene trasformato. I controlli di oggi
(`require_admin`, `check_entity`, il solo profilo proprio, il controllo admin
del reset) restano dove sono.

Collegati: [architettura](access-control-architecture.md),
[autorizzazione](access-control-authorization.md),
[capability](access-control-capabilities.md),
[threat model](access-control-threat-model.md).

## Flusso

```
richiesta → contratto dal registro → principal (da HA) → decisione del motore
          → handler di oggi, invariato → esito reale → confronto → contatori
```

## Dove è collegato

`access/instrumentation.py` è l'unico punto che consegna le registrazioni a Home
Assistant:

- `register_websocket_commands(hass, WEBSOCKET_COMMANDS)`: ogni modulo registra
  così i propri comandi;
- `register_service(hass, "nome", handler, schema=...)`: così i cinque servizi
  di Irrigazione.

Il contratto si legge sempre dal registro: `_ws_command` del comando, o
`domusos.<servizio>`. Negli handler non c'è nessuna mappa azione → capability.
Un'azione esente o non dichiarata viene registrata così com'è (la seconda fa
già fallire S8).

**WebSocket.**
- Il wrapper sta sopra `require_admin` e `async_response`. La decisione si
  prende prima, in modo sincrono e senza I/O.
- L'handler riceve la stessa connessione dentro un osservatore. L'osservatore
  nota la prima risposta (`send_result`, `send_error`,
  `async_handle_exception`) e la inoltra identica; tutto il resto (`user`,
  `subscriptions`, `send_event`…) è quello della connessione vera.
- Un rifiuto sollevato prima dell'handler (`require_admin` → `Unauthorized`)
  viene notato e rilanciato con `raise`, senza cambiarlo.

**Servizi.**
- Il wrapper decide da `call.context` con `authorize_service_action`, poi esegue
  l'handler.
- Nota il successo o l'eccezione, che rilancia identica.
- Un servizio senza utente viene eseguito come oggi.

Una richiesta con schema non valido non arriva all'handler: HA la rifiuta prima
e non viene osservata.

### Copertura

| Modulo | Osservate |
| --- | --- |
| Energy | `get_state`, `get_history`, `get_profile`, `save_profile`, `discover` |
| Irrigazione (WebSocket) | `get_config`, `get_state`, `subscribe`, `save_config`, `prepare_legacy_removal`, `start_zone`, `stop_zone`, `pause`, `resume`, `stop_all` |
| Irrigazione (servizi) | `start_irrigation_zone`, `stop_irrigation_zone`, `pause_irrigation`, `resume_irrigation`, `stop_all_irrigation` |
| Alimentazione | `get_state`, `save_policy`, `bind_policy`, `delete_policy` |
| Profile | `get_self`, `save_self`, `discover_devices`, `add_device`, `remove_device`, `update_device`, `test_self`, `list_recipients` |
| Raccolta rifiuti | `get_config`, `preview`, `save_config`, `test_notification` |

In totale 36 superfici osservate: 31 WebSocket e 5 servizi.
`domusos/profile/get_self` è il profilo personale ed è osservato: non va confuso
con `domusos/access/get_self`.

### Esenzioni

Sono dichiarate nel contratto (`shadow_exemption`), con il motivo. Un test
impone che siano esattamente queste.

| Azione | Perché |
| --- | --- |
| `domusos/access/get_self` | Bootstrap: non chiede una capability, quindi non può mai diventare un deny futuro |
| `domusos/access/reset_policy` | È già protetto davvero da P2.1.2 (admin HA attivo); resta **enforced**, non diventa shadow |
| `domusos/access/get_shadow_diagnostics` | La diagnostica stessa: osservarla conterebbe chi legge in ciò che legge |
| `domusos/access/reset_shadow_diagnostics` | Sporcherebbe i contatori appena azzerati |

## Esito reale

| Esito | Quando |
| --- | --- |
| `success` | La prima risposta è `send_result`, o il servizio termina senza eccezioni |
| `deny` | Rifiuto di un controllo di oggi: `Unauthorized` di HA, o uno dei codici `unauthorized`, `permission_denied`, `access_denied`, `not_household_account`, `account_disabled` |
| `error` | Qualsiasi altro errore |

- Il contenuto della risposta non viene letto.
- I codici di rifiuto sono quelli delle classi di errore dei moduli; un
  contratto verifica che ogni classe `*Permission*`/`*Denied*`/`NotHousehold`/
  `Disabled` abbia un codice nell'elenco.

## Confronto

| Decisione shadow | Esito reale | Categoria | Significato |
| --- | --- | --- | --- |
| allow | success | `aligned_allow` | Nessun cambiamento con l'enforcement |
| deny | success | **`would_block`** | L'enforcement cambierebbe questa richiesta: il caso da studiare prima di P2.5 |
| allow | deny | `current_stricter` | Un controllo di oggi è più severo (admin HA, `check_entity`, solo profilo proprio) |
| deny | deny | `aligned_deny` | Già rifiutata oggi |
| qualsiasi | error | `current_error` | Errore della richiesta, separato |
| nessuna, o `internal_error` | qualsiasi | `shadow_error` | Il motore non ha potuto decidere |

### Errori dello shadow

- Il motore resta **fail-closed**, invariato: un errore interno è un deny
  `internal_error`. È il wrapper shadow a non applicarlo, e lo conta come
  `shadow_error`, non come `would_block`.
- Se fallisce l'osservazione stessa (contatori, wrapper), la richiesta corre
  intatta e viene contato `instrumentation_failures`.

## Cosa viene conservato

- **Solo in memoria.** Niente Store, file, recorder, `localStorage` o audit.
  Riavvio di HA → contatori a zero.
- **Contatori aggregati.** La chiave è (azione, origine, principal presente,
  ruolo, motivo, esito, confronto). Ogni dimensione è un insieme chiuso, quindi
  il numero di chiavi non cresce col traffico. Il limite rigido è di 2048
  chiavi; l'eccesso va in `dropped_overflow`.
- **Campioni recenti.** Al massimo le ultime 50 differenze (`would_block`,
  `current_stricter`, `shadow_error`). Ognuno ha ora, azione, capability,
  origine, principal presente, motivo, ruolo, esito e confronto.

**Mai** salvati: `user_id`, nome, email, avatar, persona, token, payload,
`service_data`, stati delle entità.

Lo `user_id` è nella decisione, ma `observe()` lo scarta prima di contare. Per
decidere serve sapere *cosa* verrebbe bloccato, con quale ruolo e se c'era un
principal, non *chi* era. Nessun dato diagnostico identifica una persona.

**Non è un audit di sicurezza.** I deny shadow non vanno nel
`DomusAuditService`, per non riempirlo.

## Finestre di osservazione

I numeri appartengono sempre a una sola policy (scelta A della specifica). Una
finestra si apre:
- all'avvio (`startup`);
- con un reset manuale (`manual_reset`);
- quando la policy cambia stato o revisione (`policy_changed`): per esempio una
  nuova assegnazione, un reset, uno store che diventa corrotto.

Regole:
- Una policy non in esecuzione (integrazione in ricarica, manager assente) non
  apre una finestra. Ricaricare l'integrazione non azzera nulla.
- Una richiesta decisa in una finestra e conclusa nella successiva non viene
  contata (`dropped_stale`).
- `pending` è la differenza tra richieste decise e richieste concluse: in corso,
  o una connessione chiusa prima della risposta.
- La diagnostica mostra a parte la policy attuale (`policy.state`,
  `policy.revision`) e quella della finestra.

## Diagnostica

| Comando | Cosa fa | Chi |
| --- | --- | --- |
| `domusos/access/get_shadow_diagnostics` | Legge la finestra corrente; sola lettura | admin HA attivo |
| `domusos/access/reset_shadow_diagnostics` | Apre una nuova finestra (solo memoria) e restituisce la diagnostica vuota | admin HA attivo |

- Sono nel registro delle azioni, con capability `access.manage` e modalità
  `capability` (non bootstrap), ed esenti dallo shadow.
- La protezione è diretta, come per il reset della policy:
  - `require_admin` di HA;
  - un principal valido (`identify`), quindi niente account di sistema e niente
    account disattivati.
- Ogni admin HA ha sempre `access.manage` (D21, D23); `member`, `restricted` e
  `wall_panel` ricevono `unauthorized`.
- Nessuno dei due tocca policy, ruoli, revisione o assegnazioni.

Risposta, in ordine stabile:

| Campo | Contenuto |
| --- | --- |
| `mode`, `enforced` | `"shadow"`, `false` |
| `session_started_at` | Avvio dei contatori (avvio di HA) |
| `window` | `started_at`, `reason`, stato e revisione della policy della finestra |
| `policy` | Stato e revisione attuali |
| `totals` | `evaluated`, `observed`, `pending`, le sei categorie, `instrumentation_failures`, `dropped_stale`, `dropped_overflow` |
| `by_action` | Una riga per ognuna delle 36 superfici, anche a zero, in ordine alfabetico: `total`, `shadow_allow`, `shadow_deny`, `outcomes`, `comparisons`, `reasons`, `roles` |
| `by_reason` | Totali per motivo |
| `services` | I dati per Q10 (sotto) |
| `recent_mismatches` | Fino a 50 campioni, dal più vecchio |
| `limits` | Limiti e chiavi usate |

La diagnostica si costruisce solo quando qualcuno la chiede.

## Dati per Q10

Q10, cioè come trattare in enforcement i servizi chiamati senza `user_id`,
**resta aperta**. Per ognuno dei 5 servizi di Irrigazione la diagnostica
raccoglie:

| Campo | Significato |
| --- | --- |
| `total` | Chiamate |
| `with_principal` / `without_principal` | Con o senza un account valido |
| `no_user_with_parent` | Senza `user_id`, con un `parent_id` nel contesto (tipicamente un'automazione o uno script avviato da essa) |
| `no_user_without_parent` | Senza `user_id` e senza parent |
| `shadow_allow` / `shadow_deny` | Decisione |
| `no_principal` | Deny `no_principal` |
| `current_success` / `current_deny` / `current_error` | Esito reale |
| `would_block` | Chiamate che l'enforcement bloccherebbe |

Regole di lettura:
- Il contatore si chiama `no_principal`, non «automazioni»: HA non prova che una
  chiamata senza utente venga da un'automazione.
- Il `parent_id` è solo diagnostica: non decide nulla, oggi né in futuro.
- Uno script avviato a mano eredita lo `user_id` di chi lo avvia: viene contato
  come chiamata con principal. Non ci sono euristiche per riconoscere gli
  script.
- Nessun principal di sistema, nessuna automazione fidata, nessun bypass (D35).

## Cosa lo shadow non vede

- Le azioni native di HA dal browser (luci, clima, tapparelle, `access.control`,
  `security.control`, `devices.control`): vanno dal browser a HA senza passare
  da Domus. Un grant personale di `access.control` non produce osservazioni
  backend.
- Le capability `local` (`ha_frontend.open`, `device.manage`, `backup.export`,
  `developer.use`): sono del frontend, P2.4.
- Le richieste con schema non valido.

## Prestazioni

Misurate su Windows, Python 3.13, HA 2026.2.3:

| Misura | Risultato |
| --- | --- |
| 100.000 osservazioni (decisione + conteggio, profilo già risolto) | 0,78 s, ~8 µs ciascuna |
| 100.000 osservazioni risolvendo ogni volta il profilo (come in produzione) | 1,32 s, ~13 µs ciascuna |
| 10.000 richieste WebSocket nel wrapper reale, rispetto all'handler senza shadow | ~29 µs in più per richiesta (connessione finta compresa) |
| Memoria dopo 100.000 osservazioni | 36 chiavi, 50 campioni, ~18 KiB |
| Costruzione della diagnostica | ~1,7 ms |

Nessun I/O, nessun task per richiesta, nessun lock: aggiornamenti sincroni nel
loop di HA.

## QA reale proposto

1. Installare la build sull'HA di casa.
2. Da admin, `domusos/access/reset_shadow_diagnostics`.
3. Usare Domus normalmente per qualche giorno, con:
   - account admin, member e pannello;
   - le automazioni di irrigazione esistenti.
4. Leggere `domusos/access/get_shadow_diagnostics`:
   - `totals.would_block` e `recent_mismatches`: cosa bloccherebbe
     l'enforcement;
   - `services`: quante chiamate senza utente, con o senza parent;
   - `current_stricter`: dove HA è già più severo.
5. Ogni `would_block` va spiegato prima di P2.5: o la policy è giusta, o va
   corretta la policy o il contratto.

## Test

| File | Cosa | Dove gira |
| --- | --- | --- |
| `tests_python/test_access_shadow.py` | Categorie di confronto, codici di rifiuto, nessuna identità nelle osservazioni e nella diagnostica, contatori, `pending`, dati Q10, reset, finestre al cambio di policy e non alla ricarica, campioni limitati a 50, tetto delle chiavi, dimensioni chiuse, righe per ogni azione osservata, determinismo, `locked` e default, costo | ovunque (43 test) |
| `tests_python/test_access_actions.py` | S8 con le due superfici nuove (35 + 5); registrazioni solo dall'instrumentation; ogni modulo con comandi passa da lì; esenzioni esatte e motivate; diagnostica protetta, non bootstrap; nessuna primitiva di enforcement negli handler; i moduli raggiungono Access Control solo dall'instrumentation; codici di rifiuto riconosciuti | ovunque (39 test) |
| `tests_python/test_access_shadow_ha.py` | Ogni superficie osservata è strumentata nelle registrazioni reali, gli schemi restano; risposta identica senza shadow; `would_block` con handler eseguito; rifiuti di oggi invariati (`require_admin`, `check_entity`); errori invariati; servizio senza utente eseguito (Q10); rifiuto di un servizio rilanciato identico; shadow rotto senza effetti; diagnostica solo admin, non contata, reset senza toccare la policy; `get_self` e reset fuori dallo shadow; nuova finestra al cambio di revisione | Linux con fixture HA (11 test) |
