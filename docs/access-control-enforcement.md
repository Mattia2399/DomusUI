# Domus Access Control — enforcement (design P2.5A, Q10 P2.5B, Alimentazione P2.5D.1)

Come Domus passerà dallo shadow (P2.3) a un backend che blocca davvero le
richieste, e dove passa la frontiera di fiducia per le esecuzioni di Home
Assistant senza utente (Q10). P2.5A è il design; **P2.5B** ha messo la regola
Q10 nel motore, ma solo nella decisione simulata dallo shadow: nessun
comportamento reale cambia. Ogni superficie osservata resta `mode = "shadow"`,
`enforced = false` (vedi [P2.5B](#16-p25b-cosa-è-stato-implementato)).

Collegati: [architettura](access-control-architecture.md),
[autorizzazione](access-control-authorization.md),
[shadow](access-control-shadow.md),
[capability](access-control-capabilities.md),
[Persone e accessi](access-control-people-access.md),
[threat model](access-control-threat-model.md),
[fondamento](access-control-foundation.md).

## 1. Cosa esiste oggi (audit del repository)

Base: `dce40f2` (`feature/access-control-people-access`), codice applicativo
P2.4.1 `3cf2eaa`, validato su Linux dalla run 39760657395 (HA 2025.1.0 /
Python 3.12.15: 1155 passati; HA 2026.2.3 / Python 3.13.16: 1189 passati).

| Pezzo | Dove | Stato |
| --- | --- | --- |
| Principal = utente HA (`user_id`) | `authorization.identify`, `manager.principal_from_user` | Solo account domestici attivi; niente account di sistema, disattivati o id malformati |
| Registro capability (34) e ruoli (`admin`, `member`, `restricted`, `wall_panel`, `locked`) | `models.py` | Versionato; `locked` è il pavimento di sicurezza |
| Grant personali | `models.py`, `administration.py` | Solo `access.control`, `security.control` |
| Policy store `domusos.access.v1` | `manager.py` | `absent`, `ready`, `corrupt`, `unsupported`, `migration_failed`; revisione; quarantena |
| Motore | `authorization.py` | `authorize`, `can`, `require_capability`, `authorize_action`; eccezione = deny |
| Adattatori HA | `adapters.py` | `authorize_user(_action)`, `authorize_service_call`, `authorize_service_action`; senza `user_id` → deny `no_principal` |
| Registro delle azioni | `actions.py` | 43 superfici (38 WebSocket + 5 servizi), contratto S8 |
| Shadow | `instrumentation.py`, `shadow.py` | 36 osservate (31 + 5), 7 esenzioni; origine del servizio calcolata da `_service_origin` solo come diagnostica |
| Già enforced oggi | `api.py` | `get_self` (account valido), `reset_policy` (admin HA attivo), diagnostica shadow e Persone e accessi (`require_admin` + `access.manage`) |
| Controlli HA esistenti | moduli | `require_admin`, `check_entity` (Irrigazione con utente), solo il proprio profilo |
| Frontend | P2.4 | `can()`, route, navigazione: **solo UX** |
| Bridge del pannello | P2.4/P2.4.1 | Inoltra `get_self` e i comandi di Persone e accessi sulla connessione dell'utente del pannello |
| Audit | `DomusAuditService` | Cambi di assegnazione e reset (P2.4.1); lo shadow non scrive audit (D41) |

Fatti verificati che il design usa:

- I cinque servizi dell'Irrigazione oggi, senza utente, eseguono senza alcun
  controllo: `check_entity` si applica solo se c'è un utente
  (`irrigation/manager.py`).
- Domus chiama dall'interno solo servizi nativi di HA (valvole, switch,
  `automation.turn_off`), mai i propri `domusos.*`: nessun flusso interno di
  Domus passa per il percorso senza utente.
- Script avviato da un utente: HA usa lo stesso `Context` del chiamante, quindi
  porta il suo `user_id` (audit P2.1.1, verificato su HA 2026.2).
- Automazione, anche avviata a mano: `Context(parent_id=…)` senza `user_id`
  (stesso audit).
- `AuthorizationDecision` sa già rappresentare un allow senza principal:
  `principal_id` e `role` sono opzionali.

## 2. Q10: l'evidenza reale

Raccolta in casa il 22 ottobre 2026 con `get_shadow_diagnostics`, integrazione
1.6.0-dev.20261022.1, per `domusos.start_irrigation_zone`:

| Campo | Valore |
| --- | --- |
| `total` | 3 |
| `with_principal` / `without_principal` | 0 / 3 |
| `no_user_with_parent` / `no_user_without_parent` | 3 / 0 |
| `shadow_deny`, `no_principal` | 3, 3 |
| `current_success` / `current_error` | 1 / 2 |
| `would_block` | 1 |

Il mismatch riuscito:

```text
origin: service_no_user_with_parent
principal_present: false
reason: no_principal
outcome: success
comparison: would_block
```

Applicare «nessun principal = deny» avrebbe bloccato un'automazione HA
legittima della casa. Le due chiamate in errore fallivano già oggi, per motivi
dell'Irrigazione, non di Access Control.

**Q10 è chiusa** (D61–D66). Non viene riaperta senza una nuova evidenza
concreta.

## 3. Due percorsi di autorizzazione

### A. Utente (c'è `context.user_id`, o è una connessione WebSocket)

```text
utente HA autenticato → user_id → ruolo + grant Domus → capability effettive
→ capability richiesta dall'azione → ALLOW / DENY
```

È il modello di sempre (P2.1–P2.2), invariato. È **autoritativo**: se l'utente
c'è, decide solo lui.

### B. Esecuzione HA non attribuita (`context.user_id` è `None`)

Nessun principal viene inventato. Si guarda solo se l'azione accetta un
contesto HA derivato da un altro contesto, e nient'altro.

**Nome scelto: «contesto HA non attribuito»** (*unattributed HA context*).
- «Non attribuito» dice ciò che sappiamo: nessun utente è legato alla chiamata.
- «Contesto HA» dice che è un `Context` di Home Assistant con un `parent_id`,
  cioè derivato da un altro evento interno di HA.
- Non lo chiamiamo «automazione»: HA non prova da dove venga una chiamata, e
  `automation_safe` prometterebbe un'origine che nessuno verifica.
- Non lo chiamiamo «interno» nel nome dei campi: un `parent_id` dice «derivato»,
  non «fidato».

Nel codice l'origine esiste già (`Origin.SERVICE_NO_USER_WITH_PARENT`); il
metadato e il motivo prendono lo stesso nome (sezioni 6 e 8).

### Perché non è un principal

- Non rappresenta una persona: non ha ruolo, grant, profilo né revisione propri.
- Un principal fittizio («system», «automation», «trusted») diventerebbe un
  account con capability che chiunque riesca a produrre quel contesto userebbe
  per tutte le azioni. D35 resta: nessun principal di sistema, di automazione o
  «fidato».

### `parent_id`: segnale, non authority

`context.parent_id` è l'id del contesto da cui HA ha derivato questo (l'evento
che ha fatto scattare un'automazione, per esempio). È provenienza nel grafo dei
contesti di HA.

- Non è un principal, né un account, né un ruolo, né un possessore di
  capability.
- Non è una prova crittografica: non dice chi, né perché.
- Serve solo a una cosa: rendere **idonea** una chiamata senza utente per le
  azioni che lo accettano esplicitamente. Non concede nulla da solo.
- Da ora la frase «il `parent_id` non decide nulla» dello shadow va letta così:
  non decide mai *chi* e non concede capability; restringe l'idoneità del
  percorso B (D63).

## 4. Albero di decisione (V1)

Per ogni richiesta a una superficie Domus dichiarata:

```text
azione non dichiarata nel registro ............................ DENY unknown_action
WebSocket
  connection.user → percorso A (nessuna eccezione) ............ ALLOW / DENY
Servizio
  context.user_id presente
    utente sconosciuto, di sistema, disattivato o id malformato  DENY invalid_principal / inactive_user
    altrimenti → percorso A, autoritativo ....................... ALLOW / DENY  (mai ripiego su B)
  context.user_id assente
    parent_id presente (stringa non vuota)
      E azione con allow_unattributed_ha_context = true
      E capability dell'azione nota
      E policy affidabile (absent, ready; Q14) ................... ALLOW allowed_unattributed_ha_context
    altrimenti .................................................. DENY no_principal
qualsiasi eccezione ............................................. DENY internal_error
```

Regole che l'albero fissa:

- **Precedenza dell'utente.** Con `user_id`, decide solo il percorso A.
- **Nessun downgrade.** Un deny del percorso A non ricade mai sul percorso B,
  anche se il contesto ha un `parent_id` (D62). Vietato:
  `utente senza capability → parent presente → allow come automazione`.
- **Nessun utente e nessun parent.** Sempre deny `no_principal` in V1.
- **Opt-in per azione.** Nessuna regola globale «senza utente + parent =
  allow».
- **Solo backend.** Il percorso B non si concede dal frontend, da Persone e
  accessi, dallo store o da un messaggio: esiste solo nel registro, nel codice.
- **Contesto malformato** (un `user_id` che non è una stringa, un `parent_id`
  vuoto o di tipo inatteso): conta come assente per B, deny per A. Fail closed.

### Casi concreti

| Chi chiama | `user_id` | `parent_id` | Percorso | Esito V1 per un servizio Irrigazione |
| --- | --- | --- | --- | --- |
| Member dall'interfaccia HA o da un client, con `irrigation.control` | member | — | A | ALLOW |
| Restricted o wall_panel, direttamente | sì | — | A | DENY `missing_capability` |
| Script avviato da un utente | utente | — | A | come l'utente |
| Automazione HA (anche avviata a mano) | — | sì | B | ALLOW (azione opt-in) |
| Integrazione che chiama con `Context()` vuoto | — | — | — | DENY `no_principal` |
| Programma esterno con un token | utente del token | — | A | come quell'utente |
| Supervisor / account di sistema | di sistema | — | A | DENY `invalid_principal` |

## 5. Autorità della casa (HOUSE-level)

```text
ACL utente      → ciò che una persona può comandare direttamente
Automazione HA  → comportamento autonomo che la casa ha configurato
```

Sono due domini di authority diversi.

- Un'automazione di HA è configurata da chi amministra HA. Quando apre
  l'irrigazione è una **decisione della casa**, non una richiesta di un membro.
  Domus non finge che appartenga a qualcuno: l'esito non ha attore.
- Il percorso B consente solo le azioni marcate. Non è una delega di permessi
  da un utente.

**Limite dichiarato: automazione innescata da un utente.** Un utente può far
scattare indirettamente un'automazione: preme un pulsante, cambia uno stato,
la avvia a mano. L'automazione gira con `user_id = None` e un `parent_id`.
Domus non può ricostruire in modo affidabile chi l'ha innescata: risalire i
`parent_id` porterebbe a euristiche fragili e a nessuna garanzia. Quindi:

- quella esecuzione vale come decisione della casa;
- chi può far scattare un'automazione la può usare, ma solo per ciò che
  l'automazione stessa fa, come configurata dall'amministratore;
- se una casa non lo vuole, la misura è nell'automazione (condizioni,
  permessi di HA), non in Domus.

Nessuna euristica viene introdotta per risolverlo (D66).

## 6. Metadato nel registro delle azioni

Il registro resta la fonte unica. P2.5B ha aggiunto un campo a `ActionContract`:

```python
@dataclass(frozen=True, slots=True)
class ActionContract:
    ...
    # A Home Assistant context without a user but derived from another one may run it (Q10).
    allow_unattributed_ha_context: bool = False
```

**Nome**: `allow_unattributed_ha_context`. Descrive ciò che sappiamo davvero (un
`Context` di HA senza utente, derivato da un altro) e non un'origine presunta.
Scartati: `automation_safe`, che promette un'origine non verificabile;
`allow_ha_internal_context`, perché «interno» suona come fiducia.

**Booleano, non enum.** In V1 esistono solo due contesti di esecuzione per un
servizio: utente o non attribuito con parent. Un enum o un insieme
`allowed_execution_contexts` (`USER`, `HA_UNATTRIBUTED`, `RECOVERY`,
`BOOTSTRAP`) duplicherebbe `auth_mode`, che descrive già bootstrap e recovery.
Se un giorno arriveranno Domus Intelligence o uno scheduler Domus, il campo
diventerà un insieme di contesti con una migrazione meccanica (ogni `True`
diventa `{HA_UNATTRIBUTED}`); oggi sarebbe un framework senza secondo caso.

**Default**: `False`, sempre. Un'azione nuova nasce chiusa al percorso B.

**Opt-in iniziale: esattamente i cinque servizi dell'Irrigazione**, con i nomi
reali del registro:

| Azione | Capability |
| --- | --- |
| `domusos.start_irrigation_zone` | `irrigation.control` |
| `domusos.stop_irrigation_zone` | `irrigation.control` |
| `domusos.pause_irrigation` | `irrigation.control` |
| `domusos.resume_irrigation` | `irrigation.control` |
| `domusos.stop_all_irrigation` | `irrigation.control` |

Invarianti di contratto, da far valere con test in P2.5B:

- `allow_unattributed_ha_context` è vero esattamente per quei cinque id;
- solo per superfici `service`, `auth_mode = capability`, capability `domus`
  nota e non `requires_ha_admin`;
- mai per `get_self`, `reset_policy`, la diagnostica shadow, `list_accounts`,
  `set_assignment`, `remove_assignment`, né per qualsiasi capability
  `access.*` o di rischio `critical`;
- nessuna WebSocket: una WebSocket ha sempre una connessione autenticata, e
  senza principal è deny senza eccezioni.

La capability resta dichiarata anche per il percorso B: dice quanto è sensibile
l'azione, non che il contesto «possiede» `irrigation.control`.

## 7. Dove sta la logica

Un solo punto centrale, mai negli handler. Vietato, in ogni modulo:

```python
if call.context.parent_id:
    execute()
```

Implementato in P2.5B:

- **`authorization.py`** (puro, senza HA): una funzione nuova,
  `authorize_unattributed_action(action, *, has_parent, policy_state, policy_revision, contracts=None)`.
  Applica l'albero della sezione 4 per la parte senza utente e restituisce
  sempre una `AuthorizationDecision`; eccezione = deny.
- **`adapters.py`**: `authorize_service_action` legge il `Context` una volta.
  Con `user_id` usa il percorso A come oggi; senza `user_id` chiama la funzione
  nuova. Nessun altro adattatore la usa: `authorize_user_action` (WebSocket)
  resta senza percorso B.
- **Classificazione del contesto**: `service_origin` e `has_parent_context`
  stanno negli adattatori; l'instrumentation usa la stessa funzione, così
  decisione e diagnostica leggono lo stesso fatto nello stesso modo. Un
  contratto sul sorgente verifica che nessun altro modulo legga `parent_id`.

## 8. Decisione, motivi, audit e diagnostica

**Decisione per un allow del percorso B**:

```text
allowed = True
reason = allowed_unattributed_ha_context
action = domusos.start_irrigation_zone
capability = irrigation.control
principal_id = None
role = None
policy_state, policy_revision = quelli della policy corrente
```

Mai `role = system` né un principal sintetico.

**Motivi.** Un solo motivo nuovo: `allowed_unattributed_ha_context`, per gli
allow del percorso B. I deny restano `no_principal`: con e senza parent si
distinguono già dall'origine (`service_no_user_with_parent` /
`service_no_user_without_parent`), quindi un secondo motivo non aggiungerebbe
informazione e romperebbe i confronti con P2.3.

**Audit** (da P2.5D, quando un deny diventa reale):

- deny applicati: una voce nel `DomusAuditService` con azione, capability,
  motivo, origine, stato e revisione della policy, più `principal_id` solo se
  c'è un principal;
- allow del percorso B: niente audit per chiamata. Sono comportamento normale
  della casa, e l'Irrigazione registra già le sue esecuzioni; restano
  conteggiati nella diagnostica;
- mai `actor = system`: senza principal la voce non ha attore, ha l'origine.

**Diagnostica.** Le dimensioni chiuse di P2.3 bastano: dalla chiave (origine,
principal presente, esito della decisione, motivo) si ricavano senza contatori
nuovi:

| Categoria | Da |
| --- | --- |
| `user_allow` / `user_deny` | principal presente, allow / deny |
| `unattributed_allow` | `by_action[*].reasons.allowed_unattributed_ha_context` |
| `unattributed_deny` | origine senza utente, motivo `no_principal` |
| `no_principal` | per motivo |

Per i servizi restano `with_principal`, `without_principal`,
`no_user_with_parent` e `no_user_without_parent`; `shadow_allow` conta ogni
allow, con o senza utente. In P2.5B nessun contatore nuovo: gli allow senza
utente si leggono dal motivo, per azione e in `by_reason`; il ruolo di queste
osservazioni è il `none` che esiste già.

**Privacy.** Nessun `context.id`, `parent_id`, payload, dato di entità o
utente viene conservato. Del `parent_id` si usa solo «presente / assente», al
momento della decisione.

## 9. Shadow dopo Q10

- P2.5B mette la regola Q10 nel motore. Lo stesso caso reale (start senza
  utente, con parent, riuscito) diventa `shadow_allow`,
  `allowed_unattributed_ha_context`, `aligned_allow`. **Non è più
  `would_block`: la policy è stata corretta, non il conteggio.** È atteso.
- Da P2.5B `would_block` significa «ciò che la policy corretta bloccherebbe».
  I numeri raccolti prima di P2.5B non si confrontano con quelli dopo: il
  riavvio di HA per l'aggiornamento apre comunque una finestra nuova (D38,
  D44). La diagnostica dichiara la versione delle regole
  (`rules_version: 2`, P2.5B), così un confronto sbagliato si vede.
- Con l'enforcement acceso lo shadow non sparisce: diventa la diagnostica
  dell'enforcement. Una sola decisione per richiesta serve a entrambi:
  - superficie non ancora enforced: la decisione viene contata e la richiesta
    corre come oggi (shadow);
  - superficie enforced: con allow la richiesta corre e viene contata; con deny
    la richiesta viene rifiutata prima dell'handler e contata come
    `enforced_deny`.
- `mode` diventa per superficie: `diagnostics.by_action[*].enforced` vero o
  falso, e `mode` globale `"shadow"`, `"partial"` o `"enforced"`. In P2.5A
  resta `"shadow"` / `false`.

## 10. Enforcement: modalità, risposte, guasti

**Modalità.** Per superficie, dichiarata nel registro
(`enforced: bool = False` su `ActionContract`, da P2.5D.1). Un contratto di
test elenca esattamente le superfici enforced a ogni passo. Nessun interruttore a runtime,
nessuna opzione da interfaccia o da store: un interruttore che spegne
l'enforcement sarebbe esso stesso un bypass globale (D69; la conferma è Q15).

**Risposte a un deny applicato:**

- WebSocket: errore `access_denied`, senza dettagli della policy. Il frontend
  lo conosce già (`PERMISSION_ERROR_CODES`, «Non disponibile»);
- servizio: `homeassistant.exceptions.Unauthorized`, come le protezioni native
  di HA; un'automazione che chiama un'azione non ammessa fallisce in modo
  visibile nel registro di HA, non in silenzio.

**Guasti: security > availability**, eccetto i percorsi di recupero già
progettati. Una volta enforced, sono deny e mai «prosegui»:

| Caso | Motivo |
| --- | --- |
| Manager di policy non caricato | `policy_unavailable` |
| Azione non dichiarata | `unknown_action` |
| Capability sconosciuta | `unknown_capability` |
| Principal non valido, di sistema, sconosciuto | `invalid_principal` |
| Principal disattivato | `inactive_user` |
| Store non affidabile (non admin) | `locked` |
| Errore interno | `internal_error` |
| Contesto senza utente non ammesso | `no_principal` |

**Store non affidabile** (`corrupt`, `unsupported`, `migration_failed`):

- non admin: `locked`, come oggi;
- admin HA: `locked` più `access.manage`: Persone e accessi e il ripristino
  restano raggiungibili; le funzioni da admin (Energy, Alimentazione, Raccolta
  rifiuti) no, finché la policy non viene ripristinata. È D23, non cambia;
- l'enforcement non scavalca il modello.

**Store `absent`**: non è un guasto. Valgono i default (admin HA →
Amministratore, gli altri → Membro), esattamente come oggi.

**Admin HA**: non è un bypass. Ha le capability del ruolo `admin` per la
policy; le uniche eccezioni sono recovery e gestione (`access.manage`), già
esplicite.

## 11. Cosa P2.5 non risolve

- **Azioni native di HA** dal browser (luci, clima, serrature, allarme,
  tapparelle…): restano soggette ai permessi di HA. Le restrizioni di Domus su
  quelle superfici sono esperienza d'uso e regola della casa (T1, D6).
- `access.control` governa l'interfaccia Domus di serrature, porte, cancelli e
  garage; `security.control` quella dell'allarme. Se il comando finale va
  diretto a HA, Domus non è una barriera assoluta e non lo promette.
- **Nessun proxy universale dei servizi**: fuori scope.
- **Frontend**: resta presentazione. Il backend non si fida mai di lui.

P2.5 applica davvero solo le superfici di proprietà di Domus: Energy,
Irrigazione (WebSocket e servizi), Profile, Alimentazione, Raccolta rifiuti.
L'amministrazione di Access Control è già enforced.

## 12. Futuro: Domus Intelligence, scheduler, scene

Un'azione autonoma di Domus Intelligence, uno scheduler Domus, una scena o un
job di sfondo **non** sono «contesto HA non attribuito» e non ereditano
`allow_unattributed_ha_context`. Ognuno avrà un proprio modello di autorità e
un proprio contesto di esecuzione, progettato quando esisterà (T27, T28).

## 13. Rollout

P2.5 si divide in quattro passi (D70):

| Passo | Contenuto | Comportamento |
| --- | --- | --- |
| **P2.5A** | Questo design | Invariato |
| **P2.5B** | `allow_unattributed_ha_context` nel registro, regola Q10 nel motore e negli adattatori, nuovo motivo, `rules_version` nella diagnostica, contratti e test della matrice. `enforced` arriva in P2.5D con il primo dominio che lo usa | Invariato: ancora shadow |
| **Validazione Linux** | Le suite HA su 2025.1 e 2026.2.3 | — |
| **P2.5C** | QA shadow reale in casa con la regola Q10 | Invariato |
| **P2.5D** | Enforcement acceso per dominio, un commit e una validazione per passo | Cambia |

**Cancello di P2.5C** (prima di accendere qualsiasi cosa):

- per i cinque servizi opt-in, ogni chiamata `no_user_with_parent` è
  `shadow_allow` con `allowed_unattributed_ha_context`;
- `would_block` = 0 per i domini da accendere, o ogni caso spiegato e accettato;
- account reali provati: admin, member, restricted, wall_panel, sul telefono e
  sul pannello;
- nessun `shadow_error` né `instrumentation_failures`.

**Ordine dei domini in P2.5D**, dal meno al più rischioso:

1. **Alimentazione**: solo admin già oggi (`require_admin`). Cambia solo per un
   admin `locked`.
2. **Raccolta rifiuti**: letture per tutti i ruoli tranne `locked`, scritture
   solo admin.
3. **Energy**: `restricted` e `locked` perdono le letture; il frontend le
   nasconde già.
4. **Profile**: `wall_panel` perde il proprio profilo; il frontend lo nasconde
   già.
5. **Irrigazione WebSocket**: `restricted` e `wall_panel` perdono i comandi.
6. **Irrigazione servizi**, con la regola Q10: per ultimi, perché toccano le
   automazioni della casa.

L'amministrazione di Access Control è già enforced e non è un passo.

**Letture e scritture insieme, per dominio.** Accendere prima le letture e poi
le scritture (o il contrario) lascerebbe pagine a metà: una scheda che si apre
ma non salva, o salva ciò che non mostra. Il frontend di P2.4 nasconde già per
capability, quindi accendere un dominio intero lo allinea al backend in un
passo. Il rischio si governa con l'ordine dei domini, non dentro un dominio.

**Rollback**: reinstallare la versione precedente dell'integrazione (lo zip
precedente resta nel backup) e riavviare HA. Lo store della policy non cambia
formato in P2.5, quindi tornare indietro non lo tocca.

## 14. Matrice dei test (P2.5B e P2.5D)

**Contesto utente**, per ogni superficie enforced:

| Caso | Atteso |
| --- | --- |
| Admin con la capability | ALLOW |
| Member con la capability | ALLOW |
| Member senza la capability | DENY `missing_capability` |
| Utente disattivato | DENY `inactive_user` |
| `user_id` di un utente che non esiste | DENY `invalid_principal` |
| Account di sistema | DENY `invalid_principal` |
| Store non affidabile, non admin | DENY `locked` |

**Contesto HA non attribuito**, per **ognuno** dei cinque servizi:

| Caso | Atteso |
| --- | --- |
| Senza utente, con parent, azione opt-in | ALLOW `allowed_unattributed_ha_context` |
| Senza utente, senza parent | DENY `no_principal` |
| Senza utente, `parent_id` vuoto o non stringa | DENY `no_principal` |

Più, con un'azione **non** opt-in (per esempio una WebSocket o un servizio di
test non marcato): senza utente con parent → DENY `no_principal`.

**Contesto misto**, per ognuno dei cinque servizi:

| Caso | Atteso |
| --- | --- |
| Utente con parent, con `irrigation.control` | ALLOW `allowed` (percorso A) |
| Utente con parent, **senza** `irrigation.control` (restricted, wall_panel) | DENY `missing_capability`: **mai** il percorso B |

**Altri casi**: azione sconosciuta → DENY `unknown_action`; registro con
`allow_unattributed_ha_context` su una superficie non ammessa → test di
contratto rosso; eccezione nel motore → DENY `internal_error`.

**Scenario reale (regressione)**: `ServiceCall` di
`domusos.start_irrigation_zone` con `context.user_id = None` e
`context.parent_id` presente:

- P2.5B (shadow): `shadow_allow`, `allowed_unattributed_ha_context`,
  `aligned_allow`, nessun `would_block`;
- P2.5D (enforced): la zona parte.

## 15. Domande nate dal design

| Id | Domanda | Proposta |
| --- | --- | --- |
| Q14 | Con lo store non affidabile (`corrupt`, `unsupported`, `migration_failed`), il percorso B resta aperto per i cinque servizi? Pro: l'opt-in è codice, non dati dello store, e il giardino non resta a secco. Contro: «policy non affidabile = pavimento minimo» vale per tutto, e il pavimento non contiene azioni senza utente | **Chiusa (P2.5B)**: no. Con store non affidabile il percorso B è deny `locked`, senza eccezioni per l'Irrigazione; il recupero resta `reset_policy` per l'admin HA. Security > availability (D73) |
| Q15 | Serve un interruttore d'emergenza per tornare allo shadow senza reinstallare? | **Chiusa per V1**: no. Nessun interruttore a runtime, da interfaccia, da variabile d'ambiente, servizio, WebSocket, impostazione o flag nascosto; il rollback è la versione precedente (D74) |

## 16. P2.5B: cosa è stato implementato

Ancora shadow: la decisione cambia, gli handler no. Un'automazione che avvia
una zona esegue come prima; lo shadow ora la conta come allow.

| Pezzo | Dove | Cosa |
| --- | --- | --- |
| Metadato | `actions.py` | `ActionContract.allow_unattributed_ha_context: bool = False`; vero esattamente per i cinque servizi dell'Irrigazione; `unattributed_contracts()` |
| Motivo | `authorization.py` | `DecisionReason.ALLOWED_UNATTRIBUTED_HA_CONTEXT`; `ALLOW_REASONS` = `allowed` e quello nuovo |
| Regola | `authorization.py` | `authorize_unattributed_action`: azione sconosciuta → `unknown_action`; senza parent, non servizio, non `capability` o senza opt-in → `no_principal`; senza manager → `policy_unavailable`; store non affidabile → `locked`; capability sconosciuta → `unknown_capability`; capability admin → `requires_ha_admin`; altrimenti allow senza principal e senza ruolo; eccezione → `internal_error` |
| Adattatore | `adapters.py` | `authorize_service_action`: senza `user_id` → regola Q10; con `user_id` → solo l'ACL dell'utente, mai la regola Q10. `service_origin` e `has_parent_context` sono l'unica classificazione |
| Shadow | `shadow.py`, `instrumentation.py` | `shadow_allow` conta ogni motivo di allow; `rules_version: 2` nella diagnostica; l'instrumentation usa `service_origin` |
| Versione delle regole | `authorization.py` | `AUTHORIZATION_RULES_VERSION = 2`, solo per la diagnostica, mai nello store |

Scelte fatte in P2.5B:

- **`absent` è affidabile**, come in tutto Access Control (`TRUSTED_STATES` =
  `absent`, `ready`): è uno stato valido, senza assegnazioni, con i ruoli
  predefiniti. Un'automazione della casa funziona prima che qualcuno abbia mai
  salvato un ruolo. Solo `corrupt`, `unsupported` e `migration_failed` sono non
  affidabili.
- **Store non affidabile → `locked`**, lo stesso motivo che riceve un account
  sul pavimento di sicurezza; un manager mancante → `policy_unavailable`.
- **Nessuna finestra nuova a mano**: una versione nuova delle regole richiede
  un riavvio di HA, che apre già una sessione e una finestra nuove (D38, D44).
  `rules_version` rende visibile con quali regole sono stati contati i numeri.
- **`enforced` non è stato aggiunto**: un campo che nessuno legge e un test
  «tutto falso» non proteggerebbero nulla. Arriva in P2.5D con il primo
  dominio acceso, insieme al codice che lo applica.
- **Gli adattatori per capability** (`authorize_service_call`,
  `require_service_capability`) non conoscono l'azione, quindi non hanno la
  regola Q10: senza utente restano `no_principal`. L'opt-in vive solo
  nell'azione.
- **Contesto malformato**: un `parent_id` vuoto conta come assente; un
  `user_id` che HA non conosce è `invalid_principal`, mai «nessun utente».

Test:

| File | Cosa | Dove |
| --- | --- | --- |
| `tests_python/test_access_unattributed.py` | Default falso, insieme esatto, solo servizi `domus` non admin, nessuna WebSocket, nessuna azione di gestione; albero di decisione per i cinque servizi; `absent` e `ready`; `corrupt`, `unsupported`, `migration_failed`; senza manager; parent non valido; azione non opt-in; WebSocket marcata a mano; gestione o admin marcati a mano; capability e azione sconosciute; errore; motivi; utente `restricted` mai lasciato passare; shadow e regressione del caso reale del 22 ottobre 2026; solo l'adattatore legge `parent_id` | ovunque (68 test) |
| `tests_python/test_access_authorization_ha.py` | `Context` reali di HA: automazione su ognuno dei cinque servizi; senza parent; parent vuoto; admin, member, restricted e wall_panel con e senza parent; utente sconosciuto; i tre stati non affidabili con il recupero dell'admin; `ready`; senza manager; servizio sconosciuto | Linux con fixture HA |
| `tests_python/test_access_shadow_ha.py` | Chiamate di servizio reali: il caso del 22 ottobre (riuscita e zona in errore), un restricted con parent, uno store non affidabile; gli handler eseguono sempre | Linux con fixture HA |

## 17. Validazione Linux (P2.5B)

I test con il fixture di Home Assistant non girano su Windows. Li ha eseguiti
GitHub Actions sul repository privato `archive`.

- **Come**: un branch temporaneo `ci/access-control-p25b-linux-validation`,
  uguale al codice validato più un solo commit che aggiungeva quel nome al
  trigger `push` di `irrigation-core.yml`. Il branch è stato eliminato dopo la
  run e il commit temporaneo non è nella storia del feature branch.
- **Codice validato**: `8963261`.

| Run | Commit | HA | Python | Test | Esito |
| --- | --- | --- | --- | --- | --- |
| 39794988320 | `8963261` | 2025.1.0 | 3.12.15 | 1242 passati | **verde** |
| 39794988320 | `8963261` | 2026.2.3 | 3.13.16 | 1276 passati | **verde** |

- Rispetto a P2.4.1 (run 39760657395: 1155 e 1189) entrambi i job hanno 87
  test in più: `test_access_unattributed` (68), `test_access_authorization_ha`
  (da 7 a 23), `test_access_shadow_ha` (da 11 a 14). Nessun test fallito,
  saltato o in errore di setup o teardown.
- **Job HA 2025.1**: `test_access_unattributed` (68),
  `test_access_authorization_ha` (23), `test_access_shadow_ha` (14),
  `test_access_authorization` (68), `test_access_shadow` (43),
  `test_access_actions` (39), `test_access_contract` (5), `test_access_models`
  (70), `test_access_manager` (39), `test_access_administration` (37),
  `test_access_people_ha` (16).
- **Job HA 2026.2.3**: tutta `tests_python`, comprese le stesse suite e
  `test_access_websocket` (16).
- **Registrazioni reali**, verificate in entrambe le versioni: 38 comandi
  WebSocket e 5 servizi, nessuna superficie non dichiarata; i cinque servizi
  dell'Irrigazione restano osservati, le esenzioni restano 7.
- L'API dei job di GitHub ha continuato a mostrarli «in coda» a run conclusa:
  la run è `completed` / `success` al primo tentativo, e il log di entrambi i
  job contiene i risultati e la chiusura senza errori.
- **HACS validation** fallisce su `archive` perché l'azione HACS valida solo
  repository pubblici: è un workflow separato.

## 18. Validazione reale in casa (P2.5C)

QA della regola Q10 sull'installazione reale, ancora in shadow. Nessun
codice è stato cambiato in P2.5C.

**Installazione**

| Voce | Valore |
| --- | --- |
| Pacchetto | `domusos.zip` = `domusos-p25c-shadow-test-871f184.zip` |
| Versione | `1.6.0-dev.20261022.2` (iniettata con `DOMUSOS_PACKAGE_VERSION`, nessun file modificato) |
| SHA-256 | `66a0200d58b9ba8267b485b9340b1071c37159824069bd89094b5445bcd64ae5` |
| Sorgente | `871f184` (codice applicativo `8963261`, poi solo documentazione) |
| Versione di Home Assistant | non riportata |
| Avvio | riuscito, nessun errore Domus nei registri di HA |

**Controllo iniziale** (2026-10-22, dopo l'installazione): `mode` `shadow`,
`enforced` `false`, `rules_version` 2, policy `ready` revisione 3, finestra
`startup` dalle 14:51:57 UTC, tutti i contatori a zero.

**Prima del test** HA è stato riavviato (sessione dalle 2026-10-22 19:13:02
UTC) e i ruoli sono stati cambiati per prova in Persone e accessi: revisione da
3 a 10, nuova finestra `policy_changed` dalle 2026-10-23 06:32:08 UTC. Tutti i
numeri qui sotto appartengono a quella sola finestra (`ready`, revisione 10).

**Test Q10.** Un'automazione HA senza trigger, «TEST P2.5C irrigazione»,
avviata a mano con «Esegui azioni» il 2026-10-23 alle 08:38:18 (ora italiana),
completata in 75,97 s, probabilmente eseguita due volte:

```text
start_irrigation_zone (zona-6 «Terrazzo», 1 min) → pausa → ripresa
→ stop_irrigation_zone → start_irrigation_zone → stop_all_irrigation
```

Nella stessa finestra hanno girato anche le automazioni dell'Irrigazione della
casa (3 avvii in più). Diagnostica dopo il test:

| Servizio | Totale | Senza utente, con parent | `shadow_allow` | `shadow_deny` | `no_principal` | Successo | Errore | `would_block` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `start_irrigation_zone` | 7 | 7 | 7 | 0 | 0 | 4 | 3 | 0 |
| `pause_irrigation` | 2 | 2 | 2 | 0 | 0 | 2 | 0 | 0 |
| `resume_irrigation` | 2 | 2 | 2 | 0 | 0 | 2 | 0 | 0 |
| `stop_irrigation_zone` | 2 | 2 | 2 | 0 | 0 | 2 | 0 | 0 |
| `stop_all_irrigation` | 2 | 2 | 2 | 0 | 0 | 2 | 0 | 0 |

- Motivo di tutte le 15 chiamate di servizio: `allowed_unattributed_ha_context`,
  ruolo `none` (nessun account), nessun principal.
- Le 10 richieste dall'interfaccia, tutte WebSocket da admin, sono passate dal
  percorso utente: `allowed`, ruolo `admin`, `aligned_allow`. Erano
  `irrigation/get_config` 4, `get_state` 2, `subscribe` 2, `resume` 1,
  `save_config` 1.
- Totali della finestra:
  - `evaluated` 25, `observed` 25, `pending` 0;
  - `aligned_allow` 22, `current_error` 3;
  - `would_block`, `current_stricter`, `aligned_deny` e `shadow_error`: 0;
  - `instrumentation_failures`, `dropped_stale` e `dropped_overflow`: 0;
  - `recent_mismatches` vuoto.
- I 3 `current_error` sono avvii fatti mentre l'irrigazione era bloccata:
  errori dell'Irrigazione, non di autorizzazione. Sono contati come
  `current_error` e mai come `would_block`.

**Prima e dopo**:

| | Prima (regole 1, P2.3) | Dopo (regole 2, P2.5B) |
| --- | --- | --- |
| Origine | `service_no_user_with_parent` | `service_no_user_with_parent` |
| Motivo | `no_principal` | `allowed_unattributed_ha_context` |
| Decisione shadow | deny | allow |
| Esito reale | success | success |
| Confronto | `would_block` | `aligned_allow` |

I numeri delle due regole non si sommano: si confronta il comportamento.

**Altri controlli**: Raccolta rifiuti, Energy e Impostazioni › Persone e
accessi › Ruoli e permessi si aprono senza errori. Nei registri di HA non ci
sono errori Domus, Access Control o shadow. Lo store reale è rimasto `ready`,
nessun reset della policy né della diagnostica. Gli account non admin
sono stati provati solo cambiando i ruoli (revisione 3 → 10); il dettaglio dei
ruoli non è stato riportato.

**Osservazione d'ambiente (aperta, non Access Control)**: come attuatore di
prova la zona usa `switch.asciugatrice`, la presa dell'asciugatrice. La presa
si spegne da sola dopo circa 3–37 secondi: nel registro di HA lo spegnimento
risulta «Via Interruttore», e tutte le 15 sessioni di oggi della storia
dell'Irrigazione finiscono con `actuator_closed_externally`, mai con
`deadline_reached`. Domus fa quello che deve: chiude la sessione quando
l'attuatore si spegne da fuori. Questa logica dell'Irrigazione non è cambiata
con Access Control. La scheda «Correlati» della presa non mostra automazioni;
la causa, un'automazione o un timer della presa, è da verificare più avanti.
Non incide sull'esito Q10: autorizzazione e classificazione sono corrette e gli
handler hanno eseguito.

**Esito: PASS.** La regola Q10 è confermata sulla casa reale:
- un'automazione HA senza utente che chiama i cinque servizi dell'Irrigazione è
  `shadow_allow` / `aligned_allow`;
- nessun `would_block`;
- i due percorsi, utente e contesto HA non attribuito, restano distinti;
- l'enforcement è rimasto spento per tutto il test.

## 19. P2.5D.1: Alimentazione enforced

Il primo dominio in cui una richiesta Domus viene rifiutata davvero.
Tutti gli altri restano solo osservati.

**Insieme enforced**, esattamente, nel registro:

| Azione | Capability |
| --- | --- |
| `domusos/device_power/get_state` | `device_power.manage` |
| `domusos/device_power/save_policy` | `device_power.manage` |
| `domusos/device_power/bind_policy` | `device_power.manage` |
| `domusos/device_power/delete_policy` | `device_power.manage` |

`device_power.manage` richiede un admin HA e non si concede con un grant: la
ha solo il ruolo `admin`. Nessuna capability nuova, nessun cambio di ruoli.

**Dove.** Nell'instrumentation dei comandi WebSocket, cioè nel punto da cui
ogni comando Domus è già registrato, guidato da `contract.enforced`:

```text
richiesta → una decisione (authorize_user_action)
  ├─ conteggiata nella diagnostica (se i contatori funzionano)
  ├─ azione non enforced → l'handler corre come prima (shadow)
  └─ azione enforced
       ├─ allow → l'handler corre, risposta invariata
       └─ qualsiasi altra cosa → handler mai eseguito,
          errore access_denied, voce di audit
```

- **Una sola decisione** per diagnostica e rifiuto: ciò che si conta è ciò che
  si applica.
- **Fail closed, indipendente dai contatori**: se la diagnostica non funziona,
  il rifiuto resta; se il motore solleva un'eccezione o non c'è il manager
  della policy, è un rifiuto.
- **Risposta**: `access_denied`, messaggio «Not allowed for this account in
  Domus», nessun dettaglio della policy. Domus decide **prima** di
  `require_admin`, che resta dietro (HA AND Domus): un non admin riceve ora
  `access_denied` invece di `unauthorized`. Il client dell'Alimentazione lo
  legge come `unauthorized`, lo stesso messaggio di prima.
- **Nessun effetto**: un rifiuto non legge, salva, collega o rimuove policy e
  non tocca nessuno switch.
- **Audit**: ogni rifiuto applicato è una voce nel `DomusAuditService`
  (`access.enforcement`, `request_denied`, con il motivo come esito). La voce
  contiene azione, capability, origine, `principal_id` se c'è, stato e
  revisione della policy; nessun payload, nessun nome. Se l'audit fallisce, il
  rifiuto resta. Gli allow non vengono registrati.
- **Difese nella registrazione**: un'azione `enforced` esente dallo shadow
  resterebbe senza wrapper, e un servizio `enforced` non avrebbe ancora un
  rifiuto. In entrambi i casi la registrazione fallisce invece di lasciare
  l'azione aperta, e i contratti di test lo impediscono prima.

**Diagnostica** (`rules_version: 3`):

| Campo | Valore |
| --- | --- |
| `mode` | `"shadow"` (nessuna enforced), `"partial"` (alcune), `"enforced"` (tutte quelle osservate). Ora `"partial"` |
| `enforced` | Se una richiesta può essere rifiutata davvero: ora `true` |
| `enforced_actions` | Le quattro azioni dell'Alimentazione, in ordine |
| `by_action[*].enforced` | Per azione |
| `enforced_deny` | Nuovo confronto: un rifiuto applicato, l'handler non è stato eseguito. Non è un mismatch e non entra in `recent_mismatches` |

Su un'azione enforced un allow riuscito è `aligned_allow`; su un'azione non
enforced i confronti restano quelli di P2.3 e P2.5B.

**Chi passa**:

| Chi | Esito |
| --- | --- |
| Admin HA, policy `absent` o `ready` | allow, l'handler corre |
| Member, restricted, wall_panel (anche con grant), utente di sola lettura | deny `requires_ha_admin` |
| Account di sistema | deny `invalid_principal` |
| Account disattivato | HA rifiuta il token; con una sessione aperta `inactive_user` |
| Admin con store `corrupt`, `unsupported`, `migration_failed` | deny `locked`; `reset_policy` resta, poi l'Alimentazione torna |
| Senza manager della policy | deny `policy_unavailable` |
| Errore del motore | deny `internal_error` |

**Ancora solo osservati**: Energy, Irrigazione (WebSocket e i cinque servizi
Q10), Profile, Raccolta rifiuti. L'amministrazione di Access Control era già
protetta e non cambia.

**Rollback**: la versione precedente dell'integrazione (Q15); nessun
interruttore.

**Test**:

| File | Cosa | Dove |
| --- | --- | --- |
| `tests_python/test_access_enforcement.py` | Default falso; insieme esatto; solo WebSocket `capability` osservate; ogni altro dominio non enforced; `device_power.manage` solo admin e non concedibile; nessuna lettura da ambiente; matrice per ruolo e stato dello store; senza principal, policy o identità valida; azione e capability sconosciute; errore; `enforced_deny` non è un mismatch; diagnostica | ovunque (47 test) |
| `tests_python/test_access_enforcement_ha.py` | Utenti e WebSocket veri: l'admin lavora come prima; member, restricted, wall_panel, sola lettura e account di sistema rifiutati su tutti e quattro i comandi senza effetti; `corrupt`, `unsupported`, `migration_failed` e ripristino; senza policy; errore del motore; diagnostica rotta; una sola decisione per richiesta; audit che fallisce senza aprire nulla; audit; diagnostica | Linux con fixture HA (13 test) |
| `tests_python/test_device_power_websocket.py` | Registra la policy come l'integrazione vera; i non admin ricevono `access_denied` | Linux con fixture HA |
| `src/services/devicePowerClient.test.ts` | `access_denied` letto come `unauthorized` | Vitest |
